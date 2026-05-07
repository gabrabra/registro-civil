import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { processApi, nascimentosApi } from '../api.js';

const BatchCtx = createContext(null);

export function BatchProvider({ children }) {
  const [items,     setItems]     = useState([]); // {id,file,status,extracted,saved,error}
  const [livroId,   setLivroId]   = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const processingRef = useRef(false);

  // Keep an up-to-date ref so the async callbacks can read current items
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Watch for queued items and process them one by one
  useEffect(() => {
    if (processingRef.current) return;
    const nextIdx = items.findIndex(it => it.status === 'queued');
    if (nextIdx === -1) {
      // No more queued — check if we were running
      if (isRunning && !items.some(it => it.status === 'queued' || it.status === 'processing')) {
        setIsRunning(false);
      }
      return;
    }

    const item = items[nextIdx];
    processingRef.current = true;

    setItems(prev => prev.map((it, i) => i === nextIdx ? { ...it, status: 'processing' } : it));

    processApi.file(item.file)
      .then(data => {
        setItems(prev => prev.map((it, i) =>
          i === nextIdx ? { ...it, status: 'done', extracted: data } : it
        ));
      })
      .catch(e => {
        setItems(prev => prev.map((it, i) =>
          i === nextIdx ? { ...it, status: 'error', error: e.message } : it
        ));
      })
      .finally(() => {
        processingRef.current = false;
        // Changing items will re-trigger this effect for the next queued item
      });
  }, [items, isRunning]);

  function addFiles(files) {
    const accepted = Array.from(files).filter(f =>
      /image\/(jpeg|png|webp|tiff)|application\/pdf/.test(f.type)
    );
    if (!accepted.length) return;
    setItems(prev => [
      ...prev,
      ...accepted.map(f => ({ id: `${Date.now()}_${Math.random()}`, file: f, status: 'waiting', extracted: null, saved: false, error: null }))
    ]);
  }

  function startProcessing() {
    // Mark all 'waiting' items as 'queued' to trigger the effect
    setItems(prev => prev.map(it => it.status === 'waiting' ? { ...it, status: 'queued' } : it));
    setIsRunning(true);
  }

  async function saveOne(idx, data) {
    const payload = {
      livro_id:        livroId || null,
      nome_completo:   data.nome_completo || data.nome_nascido || null,
      nome_mae:        data.nome_mae        || null,
      nome_pai:        data.nome_pai        || null,
      data_nascimento: data.data_nascimento || null,
      ano:             data.ano             || null,
      livro:           data.livro           || null,
      folha:           data.folha           || null,
      numero_termo:    data.numero_termo    || null,
      municipio:       data.municipio       || null,
      estado:          data.estado          || null,
      confianca:       data.confianca       || null,
      observacoes:     data.observacoes     || null,
      arquivo_path:    data.arquivo_path    || null,
      arquivo_nome:    data.arquivo_nome    || null,
      arquivo_tipo:    data.arquivo_tipo    || null,
    };
    await nascimentosApi.create(payload);
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, saved: true } : it));
  }

  function updateItem(idx, newData) {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, extracted: { ...it.extracted, ...newData } } : it
    ));
  }

  function clearAll() {
    if (isRunning) return; // don't clear while processing
    setItems([]);
    setLivroId('');
  }

  const waitingCount    = items.filter(it => it.status === 'waiting').length;
  const queuedCount     = items.filter(it => it.status === 'queued' || it.status === 'processing').length;
  const doneCount       = items.filter(it => it.status === 'done' || it.status === 'error').length;
  const unsavedCount    = items.filter(it => it.status === 'done' && !it.saved).length;

  return (
    <BatchCtx.Provider value={{
      items, livroId, setLivroId, isRunning,
      addFiles, startProcessing, saveOne, updateItem, clearAll,
      waitingCount, queuedCount, doneCount, unsavedCount,
      total: items.length,
    }}>
      {children}
    </BatchCtx.Provider>
  );
}

export const useBatch = () => useContext(BatchCtx);
