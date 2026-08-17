import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { processApi, nascimentosApi, livrosApi } from '../api.js';

// A cover only counts if it identifies the book; without a numero there is
// nothing to create or match against.
function capaUtil(dados) {
  return Boolean(dados && String(dados.numero || '').trim());
}

// Reuse an existing book when the cover names one we already have, so
// re-importing a book doesn't create duplicates.
function mesmoLivro(a, b) {
  const norm = v => String(v ?? '').trim().toLowerCase();
  if (norm(a.numero) !== norm(b.numero)) return false;
  // Municipality only disambiguates when both sides state it
  if (a.municipio && b.municipio) return norm(a.municipio) === norm(b.municipio);
  return true;
}

const BatchCtx = createContext(null);

export function BatchProvider({ children }) {
  const [items,     setItems]     = useState([]); // {id,file,status,extracted,savedRecords,error}
  const [livroId,   setLivroId]   = useState('');
  const [isRunning, setIsRunning] = useState(false);
  // Book detected from a cover page mid-batch; applies to every page after it
  const [livroAuto, setLivroAuto] = useState(null);
  const processingRef = useRef(false);

  const itemsRef   = useRef(items);
  const livroIdRef = useRef(livroId);
  const livroAutoRef = useRef(livroAuto);
  useEffect(() => { itemsRef.current    = items;     }, [items]);
  useEffect(() => { livroIdRef.current  = livroId;   }, [livroId]);
  useEffect(() => { livroAutoRef.current = livroAuto; }, [livroAuto]);

  // The book in force for the page being processed: a detected cover wins over
  // the manual pick, since it came from the pages themselves.
  const livroEmVigor = () => livroAutoRef.current?.id || livroIdRef.current || null;

  // Create the book the cover describes, or reuse a matching one.
  async function resolverLivroDaCapa(dados, capaInfo) {
    const existentes = await livrosApi.list().catch(() => []);
    const achado = (existentes || []).find(l => mesmoLivro(l, dados));
    if (achado) return { livro: achado, criado: false };

    const criado = await livrosApi.create({
      numero:       dados.numero,
      cartorio:     dados.cartorio  || null,
      cnpj:         dados.cnpj      || null,
      cns:          dados.cns       || null,
      termo_inicio: dados.termo_inicio ?? null,
      termo_fim:    dados.termo_fim    ?? null,
      data_inicio:  dados.data_inicio  || null,
      data_fim:     dados.data_fim     || null,
      municipio:    dados.municipio || null,
      estado:       dados.estado    || null,
      arquivo_capa_path: capaInfo?.arquivo_path || null,
      arquivo_capa_nome: capaInfo?.arquivo_nome || null,
      arquivo_capa_url:  capaInfo?.arquivo_url  || null,
    });
    return { livro: criado, criado: true };
  }

  useEffect(() => {
    if (processingRef.current) return;
    const nextIdx = items.findIndex(it => it.status === 'queued');
    if (nextIdx === -1) {
      if (isRunning && !items.some(it => it.status === 'queued' || it.status === 'processing')) {
        setIsRunning(false);
      }
      return;
    }

    const item = items[nextIdx];
    processingRef.current = true;

    setItems(prev => prev.map((it, i) => i === nextIdx ? { ...it, status: 'processing' } : it));

    processApi.file(item.file, livroEmVigor(), null, null, { detectarCapa: true })
      .then(async data => {
        const registros = Array.isArray(data.registros) ? data.registros : [];

        // Cover page: create or match the book, then bind the pages that follow
        if (data.eh_capa) {
          let capa = { detectada: true, vinculado: false, livro: null, aviso: null };
          if (capaUtil(data.dados_livro)) {
            try {
              const { livro, criado } = await resolverLivroDaCapa(data.dados_livro, data);
              setLivroAuto(livro);
              capa = { detectada: true, vinculado: true, livro, criado, aviso: null };
            } catch (err) {
              capa = { detectada: true, vinculado: false, livro: null, aviso: `Não foi possível criar o livro: ${err.message}` };
            }
          } else {
            capa.aviso = 'Capa reconhecida, mas sem número de livro legível — vincule manualmente.';
          }

          setItems(prev => prev.map((it, i) =>
            i === nextIdx ? { ...it, status: 'done', extracted: data, savedRecords: [], capa, error: null } : it
          ));
          return;
        }

        // A page that was transcribed is still a useful result even with zero
        // structured records — keep it reviewable instead of hiding it as an error
        const hasAiError = data.ai_error && registros.length === 0 && !data.transcricao_completa;
        setItems(prev => prev.map((it, i) =>
          i === nextIdx ? {
            ...it,
            status: hasAiError ? 'error' : 'done',
            extracted: data,
            savedRecords: Array(registros.length).fill(false),
            // Remember which book was in force when this page was read
            livroIdUsado: livroEmVigor(),
            error: data.ai_error
              ? (data.ai_error_detail || 'IA indisponível — pods falharam')
              : null,
          } : it
        ));
      })
      .catch(e => {
        setItems(prev => prev.map((it, i) =>
          i === nextIdx ? { ...it, status: 'error', error: e.message } : it
        ));
      })
      .finally(() => { processingRef.current = false; });
  }, [items, isRunning]);

  function addFiles(files) {
    const accepted = Array.from(files).filter(f =>
      /image\/(jpeg|png|webp|tiff)|application\/pdf/.test(f.type)
    );
    if (!accepted.length) return;
    setItems(prev => [
      ...prev,
      ...accepted.map(f => ({
        id: `${Date.now()}_${Math.random()}`,
        file: f,
        status: 'waiting',
        extracted: null,
        savedRecords: [],
        error: null,
      }))
    ]);
  }

  function startProcessing() {
    setItems(prev => prev.map(it => it.status === 'waiting' ? { ...it, status: 'queued' } : it));
    setIsRunning(true);
  }

  async function saveOneRecord(itemIdx, regIdx) {
    const item = itemsRef.current[itemIdx];
    const reg  = item.extracted.registros[regIdx];
    const payload = {
      // Prefer the book that was in force when this page was read, so pages
      // imported before a cover keep their own binding
      livro_id:        item.livroIdUsado || livroEmVigor(),
      nome_completo:   reg.nome_completo   || reg.nome_nascido || null,
      nome_mae:        reg.nome_mae        || null,
      nome_pai:        reg.nome_pai        || null,
      data_nascimento: reg.data_nascimento || null,
      ano:             reg.ano             || null,
      livro:           reg.livro           || null,
      folha:           reg.folha           || null,
      numero_termo:    reg.numero_termo    || null,
      municipio:       reg.municipio       || null,
      estado:          reg.estado          || null,
      confianca:       reg.confianca       || null,
      observacoes:     reg.observacoes     || null,
      // Every record on a page shares that page's transcription
      transcricao_completa: item.extracted.transcricao_completa || null,
      arquivo_path:    item.extracted.arquivo_path || null,
      arquivo_nome:    item.extracted.arquivo_nome || null,
      arquivo_tipo:    item.extracted.arquivo_tipo || null,
    };
    await nascimentosApi.create(payload);
    setItems(prev => prev.map((it, i) => {
      if (i !== itemIdx) return it;
      const savedRecords = [...it.savedRecords];
      savedRecords[regIdx] = true;
      return { ...it, savedRecords };
    }));
  }

  function updateRecord(itemIdx, regIdx, newData) {
    setItems(prev => prev.map((it, i) => {
      if (i !== itemIdx) return it;
      const registros = [...it.extracted.registros];
      registros[regIdx] = { ...registros[regIdx], ...newData };
      return { ...it, extracted: { ...it.extracted, registros } };
    }));
  }

  // Lets the operator correct a page's transcription before its records are saved
  function updateTranscricao(itemIdx, text) {
    setItems(prev => prev.map((it, i) =>
      i === itemIdx ? { ...it, extracted: { ...it.extracted, transcricao_completa: text } } : it
    ));
  }

  function clearAll() {
    if (isRunning) return;
    setItems([]);
    setLivroId('');
    setLivroAuto(null);
  }

  const waitingCount = items.filter(it => it.status === 'waiting').length;
  const queuedCount  = items.filter(it => it.status === 'queued' || it.status === 'processing').length;
  const doneCount    = items.filter(it => it.status === 'done' || it.status === 'error').length;
  const unsavedCount = items.reduce((acc, it) => {
    if (it.status !== 'done') return acc;
    return acc + it.savedRecords.filter(s => !s).length;
  }, 0);

  return (
    <BatchCtx.Provider value={{
      items, livroId, setLivroId, isRunning, livroAuto,
      addFiles, startProcessing, saveOneRecord, updateRecord, updateTranscricao, clearAll,
      waitingCount, queuedCount, doneCount, unsavedCount,
      total: items.length,
    }}>
      {children}
    </BatchCtx.Provider>
  );
}

export const useBatch = () => useContext(BatchCtx);
