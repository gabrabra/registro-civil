import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ChevronLeft, Play, Trash2, CheckCircle, XCircle, Loader2, AlertTriangle, FileText, Save, X, BookOpen } from 'lucide-react';
import { livrosApi } from '../../api.js';
import { useBatch } from '../../context/BatchContext.jsx';

function StatusBadge({ status, error }) {
  if (status === 'waiting' || status === 'queued')
    return <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Aguardando</span>;
  if (status === 'processing')
    return <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processando...</span>;
  if (status === 'done')
    return <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Concluído</span>;
  if (status === 'error')
    return <span className="text-xs text-red-600 flex items-center gap-1" title={error}><XCircle className="w-3 h-3" /> Erro</span>;
}

function ConfBadge({ value }) {
  if (!value) return null;
  const cls = value === 'alta' ? 'bg-green-100 text-green-700' : value === 'media' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{value}</span>;
}

function ReviewCard({ item, index, onUpdate, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(item.extracted || {});
  const d    = item.extracted || {};
  const conf = d.confianca;

  function set(e) { setLocal(l => ({ ...l, [e.target.name]: e.target.value })); }

  function fieldCls() {
    const base = 'text-sm w-full px-2 py-1.5 rounded border focus:outline-none';
    if (conf === 'baixa') return `${base} border-red-400 bg-red-50`;
    if (conf === 'media') return `${base} border-amber-400 bg-amber-50`;
    return `${base} border-slate-300`;
  }

  if (!editing) return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${item.saved ? 'border-green-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{item.file.name}</span>
          {item.saved && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ConfBadge value={conf} />
          {!item.saved && (
            <>
              <button onClick={() => { setLocal(d); setEditing(true); }} className="text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Editar</button>
              <button onClick={() => onSave(index, d)} disabled={saving}
                className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        {[
          ['Nome', d.nome_completo || d.nome_nascido],
          ['Mãe', d.nome_mae], ['Pai', d.nome_pai],
          ['Ano', d.ano], ['Termo', d.numero_termo],
          ['Data Nasc.', d.data_nascimento],
          ['Município', d.municipio], ['Estado', d.estado],
        ].map(([label, val]) => val ? (
          <div key={label}>
            <span className="text-xs text-slate-400">{label}: </span>
            <span className={`font-medium ${String(val).includes('ilegível') ? 'text-red-500' : 'text-slate-800'}`}>{val}</span>
          </div>
        ) : null)}
        {conf === 'baixa' && (
          <div className="col-span-full flex items-center gap-1 text-xs text-red-600 mt-1">
            <AlertTriangle className="w-3 h-3" /> Confiança baixa — verifique os campos antes de salvar
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-blue-300 bg-white shadow-md">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <span className="text-sm font-medium text-blue-800">{item.file.name} — Editando</span>
        <button onClick={() => { onUpdate(index, local); setEditing(false); }}
          className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded transition-colors">
          Aplicar
        </button>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Nome Completo', 'nome_completo', 'col-span-2'],
          ['Nome da Mãe',   'nome_mae',      'col-span-2'],
          ['Nome do Pai',   'nome_pai',      'col-span-2'],
          ['Ano',           'ano',           'col-span-1'],
          ['Livro',         'livro',         'col-span-1'],
          ['Folha',         'folha',         'col-span-1'],
          ['Nº Termo',      'numero_termo',  'col-span-1'],
          ['Data Nasc.',    'data_nascimento','col-span-1'],
          ['Município',     'municipio',     'col-span-1'],
          ['Estado',        'estado',        'col-span-1'],
        ].map(([label, name, span]) => (
          <div key={name} className={span}>
            <label className="text-xs text-slate-500 block mb-1">{label}</label>
            <input name={name} value={local[name] || ''} onChange={set} className={fieldCls()} />
          </div>
        ))}
        <div className="col-span-full">
          <label className="text-xs text-slate-500 block mb-1">Observações</label>
          <textarea name="observacoes" rows={2} value={local.observacoes || ''} onChange={set}
            className="border-slate-300 text-sm w-full px-2 py-1.5 rounded border focus:outline-none" />
        </div>
      </div>
    </div>
  );
}

export default function BatchImport() {
  const navigate = useNavigate();
  const {
    items, livroId, setLivroId, isRunning,
    addFiles, startProcessing, saveOne, updateItem, clearAll,
    waitingCount, doneCount, unsavedCount, total,
  } = useBatch();

  const [livros,     setLivros]     = useState([]);
  const [drag,       setDrag]       = useState(false);
  const [savingIdx,  setSavingIdx]  = useState(null);
  const [toast,      setToast]      = useState(null);
  const fileInputRef = useRef();

  useEffect(() => { livrosApi.list().then(setLivros).catch(() => {}); }, []);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSaveOne(index, data) {
    setSavingIdx(index);
    try {
      await saveOne(index, data);
      showToast('Registro salvo!', 'success');
    } catch (e) {
      showToast(`Erro ao salvar: ${e.message}`, 'error');
    } finally {
      setSavingIdx(null);
    }
  }

  async function handleSaveAll() {
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done' && !items[i].saved) {
        try { await saveOne(i, items[i].extracted); } catch (_) {}
      }
    }
    showToast(`${unsavedCount} registros salvos!`, 'success');
  }

  const done     = items.filter(it => it.status === 'done');
  const hasItems = items.length > 0;

  // Progress percentage
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
          toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/nascimentos')} className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Importar em Lote</h1>
          <p className="text-sm text-slate-500">Processamento continua mesmo ao navegar para outras páginas</p>
        </div>
      </div>

      {/* Vincular a livro */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-4 flex items-center gap-3">
        <BookOpen className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-600 mb-1">Vincular todos os registros a um livro</label>
          <select
            value={livroId}
            onChange={e => setLivroId(e.target.value)}
            disabled={isRunning}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white disabled:bg-slate-50"
          >
            <option value="">— Sem vínculo com livro —</option>
            {livros.map(l => (
              <option key={l.id} value={l.id}>
                Livro {l.numero}{l.cartorio ? ` — ${l.cartorio.slice(0, 50)}` : ''}{l.municipio ? ` (${l.municipio}/${l.estado})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-5 ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
        }`}
      >
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden"
          onChange={e => addFiles(e.target.files)} />
        <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-base font-medium text-slate-600">Arraste vários arquivos aqui</p>
        <p className="text-sm text-slate-400 mt-1">ou clique para selecionar múltiplos arquivos</p>
        <p className="text-xs text-slate-300 mt-2">JPG, PNG, TIFF, WEBP, PDF — até 50 MB cada</p>
      </div>

      {/* Queue */}
      {hasItems && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-5">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                Fila ({total} arquivo{total !== 1 ? 's' : ''})
              </span>
              {doneCount > 0 && (
                <span className="text-xs text-green-600 font-medium">{doneCount} concluído{doneCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button onClick={clearAll} disabled={isRunning} className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
              Limpar tudo
            </button>
          </div>

          {/* Progress bar */}
          {isRunning && (
            <div className="px-4 py-2 border-b border-slate-100">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Processando em segundo plano...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {items.map((item, i) => (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${item.status === 'processing' ? 'bg-blue-50' : ''}`}>
                {/pdf/.test(item.file.type)
                  ? <FileText className="w-8 h-8 text-slate-300 flex-shrink-0" />
                  : <div className="w-8 h-8 rounded bg-slate-100 flex-shrink-0 overflow-hidden">
                      <img src={URL.createObjectURL(item.file)} alt="" className="w-full h-full object-cover" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{item.file.name}</p>
                  <p className="text-xs text-slate-400">{(item.file.size / 1024).toFixed(0)} KB</p>
                </div>
                <StatusBadge status={item.status} error={item.error} />
                {!isRunning && (item.status === 'waiting') && (
                  <button onClick={() => {/* remove handled by clearAll */}} className="text-slate-300 hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      {hasItems && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={startProcessing}
            disabled={isRunning || waitingCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium transition-colors"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Processando...' : `Processar com IA (${waitingCount})`}
          </button>
          {unsavedCount > 0 && !isRunning && (
            <button onClick={handleSaveAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Save className="w-4 h-4" />
              Salvar Todos ({unsavedCount})
            </button>
          )}
        </div>
      )}

      {/* Review */}
      {done.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">
            Revisar e Salvar
            <span className="ml-2 text-sm font-normal text-slate-500">
              {done.filter(it => it.saved).length} de {done.length} salvos
            </span>
          </h2>
          <div className="space-y-3">
            {items.map((item, i) =>
              item.status === 'done' ? (
                <ReviewCard key={item.id} item={item} index={i}
                  onUpdate={updateItem} onSave={handleSaveOne} saving={savingIdx === i} />
              ) : null
            )}
          </div>
        </div>
      )}

      {!hasItems && (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm">Nenhum arquivo adicionado ainda.</p>
          <p className="text-xs mt-1">Arraste arquivos para a área acima.</p>
        </div>
      )}
    </div>
  );
}
