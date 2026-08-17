import { useState, useCallback, useMemo, useEffect } from 'react';

// Multi-select over the rows currently on screen, plus a bulk delete that
// reports partial failures instead of pretending everything worked.
export function useBulkSelection(rows, { remove, onDone }) {
  const [selected, setSelected] = useState(() => new Set());
  const [removing, setRemoving] = useState(false);

  const idsNaPagina = useMemo(() => (rows || []).map(r => r.id), [rows]);

  // Drop selections whose rows are gone (page change, search, deletion)
  useEffect(() => {
    setSelected(prev => {
      const visiveis = new Set(idsNaPagina);
      const next = new Set([...prev].filter(id => visiveis.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idsNaPagina]);

  const toggle = useCallback(id => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const todosMarcados = idsNaPagina.length > 0 && idsNaPagina.every(id => selected.has(id));
  const algunsMarcados = idsNaPagina.some(id => selected.has(id)) && !todosMarcados;

  const toggleTodos = useCallback(() => {
    setSelected(prev => {
      const todos = idsNaPagina.length > 0 && idsNaPagina.every(id => prev.has(id));
      return todos ? new Set() : new Set(idsNaPagina);
    });
  }, [idsNaPagina]);

  const limpar = useCallback(() => setSelected(new Set()), []);

  // Deletes sequentially so one failure doesn't abort the rest
  const removerSelecionados = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return null;
    setRemoving(true);
    let ok = 0;
    const falhas = [];
    try {
      for (const id of ids) {
        try { await remove(id); ok++; }
        catch (e) { falhas.push({ id, erro: e?.message || 'erro' }); }
      }
    } finally {
      setRemoving(false);
      setSelected(new Set());
      if (onDone) await onDone();
    }
    return { ok, falhas, total: ids.length };
  }, [selected, remove, onDone]);

  return {
    selected,
    count: selected.size,
    isSelected: id => selected.has(id),
    toggle,
    toggleTodos,
    todosMarcados,
    algunsMarcados,
    limpar,
    removerSelecionados,
    removing,
  };
}

export default useBulkSelection;
