import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { processApi, nascimentosApi } from '../api.js';

const BatchCtx = createContext(null);

export function BatchProvider({ children }) {
  const [items,     setItems]     = useState([]); // {id,file,status,extracted,savedRecords,error}
  const [livroId,   setLivroId]   = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const processingRef = useRef(false);

  const itemsRef  = useRef(items);
  const livroIdRef = useRef(livroId);
  useEffect(() => { itemsRef.current  = items;   }, [items]);
  useEffect(() => { livroIdRef.current = livroId; }, [livroId]);

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

    processApi.file(item.file, livroIdRef.current || null)
      .then(data => {
        const registros = Array.isArray(data.registros) ? data.registros : [];
        const hasAiError = data.ai_error && registros.length === 0;
        setItems(prev => prev.map((it, i) =>
          i === nextIdx ? {
            ...it,
            status: hasAiError ? 'error' : 'done',
            extracted: data,
            savedRecords: Array(registros.length).fill(false),
            error: hasAiError
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
      livro_id:        livroIdRef.current || null,
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

  function clearAll() {
    if (isRunning) return;
    setItems([]);
    setLivroId('');
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
      items, livroId, setLivroId, isRunning,
      addFiles, startProcessing, saveOneRecord, updateRecord, clearAll,
      waitingCount, queuedCount, doneCount, unsavedCount,
      total: items.length,
    }}>
      {children}
    </BatchCtx.Provider>
  );
}

export const useBatch = () => useContext(BatchCtx);
