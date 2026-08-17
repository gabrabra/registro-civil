import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, ChevronLeft, Play, Trash2, CheckCircle, XCircle,
  Loader2, AlertTriangle, FileText, Save, X, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import { livrosApi } from '../../api.js';
import { useBatch } from '../../context/BatchContext.jsx';
import TranscricaoPanel from '../../components/TranscricaoPanel.jsx';

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
  const cls = value === 'alta'
    ? 'bg-green-100 text-green-700'
    : value === 'media'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{value}</span>;
}

function RecordSubCard({ reg, regIndex, totalRegs, saved, saving, onEdit, onSave }) {
  return (
    <div className={`px-4 py-3 ${saved ? 'bg-green-50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500">
          Registro {regIndex + 1}{totalRegs > 1 ? ` de ${totalRegs}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <ConfBadge value={reg.confianca} />
          {saved
            ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Salvo</span>
            : (
              <>
                <button onClick={onEdit}
                  className="text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                  Editar
                </button>
                <button onClick={onSave} disabled={saving}
                  className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition-colors disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
        {[
          ['Nome',      reg.nome_completo || reg.nome_nascido],
          ['Mãe',       reg.nome_mae],
          ['Pai',       reg.nome_pai],
          ['Ano',       reg.ano],
          ['Termo',     reg.numero_termo],
          ['Data Nasc.',reg.data_nascimento],
          ['Município', reg.municipio],
          ['Estado',    reg.estado],
        ].map(([label, val]) => val != null && val !== '' ? (
          <div key={label}>
            <span className="text-xs text-slate-400">{label}: </span>
            <span className={`font-medium ${String(val).includes('ilegível') ? 'text-red-500' : 'text-slate-800'}`}>{val}</span>
          </div>
        ) : null)}
        {reg.confianca === 'baixa' && (
          <div className="col-span-full flex items-center gap-1 text-xs text-red-600 mt-1">
            <AlertTriangle className="w-3 h-3" /> Confiança baixa — verifique antes de salvar
          </div>
        )}
      </div>
    </div>
  );
}

function EditSubCard({ reg, onApply, onCancel }) {
  const [local, setLocal] = useState({ ...reg });
  function set(e) { setLocal(l => ({ ...l, [e.target.name]: e.target.value })); }
  const conf = local.confianca;
  const fieldCls = `text-sm w-full px-2 py-1.5 rounded border focus:outline-none ${
    conf === 'baixa' ? 'border-red-400 bg-red-50' :
    conf === 'media' ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
  }`;

  return (
    <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-blue-700">Editando registro</span>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onApply(local)}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded transition-colors">
            Aplicar
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Nome Completo',  'nome_completo',    'col-span-2'],
          ['Nome da Mãe',    'nome_mae',         'col-span-2'],
          ['Nome do Pai',    'nome_pai',         'col-span-2'],
          ['Ano',            'ano',              'col-span-1'],
          ['Livro',          'livro',            'col-span-1'],
          ['Folha',          'folha',            'col-span-1'],
          ['Nº Termo',       'numero_termo',     'col-span-1'],
          ['Data Nasc.',     'data_nascimento',  'col-span-1'],
          ['Município',      'municipio',        'col-span-1'],
          ['Estado',         'estado',           'col-span-1'],
        ].map(([label, name, span]) => (
          <div key={name} className={span}>
            <label className="text-xs text-slate-500 block mb-1">{label}</label>
            <input name={name} value={local[name] || ''} onChange={set} className={fieldCls} />
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

function ReviewCard({ item, itemIndex, onSaveRecord, onUpdateRecord, onUpdateTranscricao, savingKey }) {
  const [editingReg, setEditingReg] = useState(null);
  const registros   = item.extracted?.registros || [];
  const transcricao = item.extracted?.transcricao_completa || '';
  const savedCount  = item.savedRecords.filter(Boolean).length;
  const allSaved    = registros.length > 0 && savedCount === registros.length;

  // Cover page — no records to save; it defines the book for the pages after it
  if (item.capa?.detectada) {
    const l = item.capa.livro;
    return (
      <div className="rounded-xl border border-violet-300 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-violet-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-800 truncate">{item.file.name}</span>
          <span className="text-xs font-medium text-violet-700 ml-auto flex-shrink-0">Capa de livro</span>
        </div>
        <div className="px-4 py-3">
          {item.capa.vinculado ? (
            <p className="text-sm text-slate-700">
              Livro <strong>{l?.numero}</strong>{l?.cartorio ? ` — ${l.cartorio}` : ''}
              {l?.municipio ? ` (${l.municipio}/${l.estado || '?'})` : ''}{' '}
              <span className="text-violet-700">
                {item.capa.criado ? 'criado a partir desta capa' : 'já existia e foi reaproveitado'}
              </span>. As próximas páginas serão vinculadas a ele.
            </p>
          ) : (
            <p className="text-sm text-amber-700">{item.capa.aviso}</p>
          )}
        </div>
        {transcricao && (
          <div className="p-3 border-t border-slate-100">
            <TranscricaoPanel
              value={transcricao}
              onChange={text => onUpdateTranscricao(itemIndex, text)}
              defaultOpen={false}
            />
          </div>
        )}
      </div>
    );
  }

  if (registros.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{item.file.name}</span>
          <span className="text-xs text-slate-400 ml-2">
            {transcricao ? 'Transcrita, mas sem registros estruturados' : 'Nenhum registro encontrado'}
          </span>
        </div>
        {item.error && (
          <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">{item.error}</p>
        )}
        {/* No structured records, but the page text is still worth keeping */}
        {transcricao && (
          <div className="p-3">
            <TranscricaoPanel
              value={transcricao}
              onChange={text => onUpdateTranscricao(itemIndex, text)}
              defaultOpen={false}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${allSaved ? 'border-green-300' : 'border-slate-200'}`}>
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{item.file.name}</span>
        </div>
        <span className={`text-xs font-medium flex-shrink-0 ${allSaved ? 'text-green-600' : 'text-slate-500'}`}>
          {savedCount} de {registros.length} registro{registros.length !== 1 ? 's' : ''} salvo{savedCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Per-registro rows */}
      <div className="divide-y divide-slate-100">
        {registros.map((reg, ri) => (
          <div key={ri}>
            {editingReg === ri
              ? (
                <EditSubCard
                  reg={reg}
                  onApply={newData => { onUpdateRecord(itemIndex, ri, newData); setEditingReg(null); }}
                  onCancel={() => setEditingReg(null)}
                />
              ) : (
                <RecordSubCard
                  reg={reg}
                  regIndex={ri}
                  totalRegs={registros.length}
                  saved={item.savedRecords[ri]}
                  saving={savingKey === `${itemIndex}_${ri}`}
                  onEdit={() => setEditingReg(ri)}
                  onSave={() => onSaveRecord(itemIndex, ri)}
                />
              )}
          </div>
        ))}
      </div>

      {transcricao && (
        <div className="p-3 border-t border-slate-100 bg-slate-50/60">
          <TranscricaoPanel
            value={transcricao}
            onChange={text => onUpdateTranscricao(itemIndex, text)}
            defaultOpen={false}
          />
        </div>
      )}
    </div>
  );
}

export default function BatchImport() {
  const navigate = useNavigate();
  const {
    items, livroId, setLivroId, isRunning,
    addFiles, startProcessing, saveOneRecord, updateRecord, updateTranscricao, clearAll,
    waitingCount, doneCount, unsavedCount, total,
  } = useBatch();

  const [livros,    setLivros]    = useState([]);
  const [drag,      setDrag]      = useState(false);
  const [savingKey, setSavingKey] = useState(null); // `${itemIdx}_${regIdx}`
  const [toast,     setToast]     = useState(null);
  const fileInputRef = useRef();

  useEffect(() => { livrosApi.list().then(setLivros).catch(() => {}); }, []);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSaveRecord(itemIdx, regIdx) {
    const key = `${itemIdx}_${regIdx}`;
    setSavingKey(key);
    try {
      await saveOneRecord(itemIdx, regIdx);
      showToast('Registro salvo!', 'success');
    } catch (e) {
      showToast(`Erro ao salvar: ${e.message}`, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSaveAll() {
    let saved = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== 'done') continue;
      const registros = items[i].extracted?.registros || [];
      for (let j = 0; j < registros.length; j++) {
        if (!items[i].savedRecords[j]) {
          try { await saveOneRecord(i, j); saved++; } catch (_) {}
        }
      }
    }
    showToast(`${saved} registro${saved !== 1 ? 's' : ''} salvo${saved !== 1 ? 's' : ''}!`, 'success');
  }

  const done     = items.filter(it => it.status === 'done');
  const hasItems = items.length > 0;
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
        <button onClick={() => navigate('/nascimentos')}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
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
            <button onClick={clearAll} disabled={isRunning}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
              Limpar tudo
            </button>
          </div>

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
            {items.map((item, i) => {
              const regCount = item.extracted?.registros?.length ?? 0;
              const savedCount = item.savedRecords.filter(Boolean).length;
              return (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 ${item.status === 'processing' ? 'bg-blue-50' : ''}`}>
                  {/pdf/.test(item.file.type)
                    ? <FileText className="w-8 h-8 text-slate-300 flex-shrink-0" />
                    : <div className="w-8 h-8 rounded bg-slate-100 flex-shrink-0 overflow-hidden">
                        <img src={URL.createObjectURL(item.file)} alt="" className="w-full h-full object-cover" />
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{item.file.name}</p>
                    <p className="text-xs text-slate-400">{(item.file.size / 1024).toFixed(0)} KB
                      {regCount > 0 && <span className="ml-2 text-slate-500">{regCount} registro{regCount !== 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <StatusBadge status={item.status} error={item.error} />
                  {item.status === 'done' && regCount > 0 && savedCount === regCount && (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
              );
            })}
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
              {done.reduce((a, it) => a + it.savedRecords.filter(Boolean).length, 0)} de{' '}
              {done.reduce((a, it) => a + (it.extracted?.registros?.length || 0), 0)} registros salvos
            </span>
          </h2>
          <div className="space-y-3">
            {items.map((item, i) =>
              item.status === 'done' ? (
                <ReviewCard
                  key={item.id}
                  item={item}
                  itemIndex={i}
                  onSaveRecord={handleSaveRecord}
                  onUpdateRecord={updateRecord}
                  onUpdateTranscricao={updateTranscricao}
                  savingKey={savingKey}
                />
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
