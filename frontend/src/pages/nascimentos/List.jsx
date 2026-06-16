import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Upload, Eye, Pencil, Trash2, FolderOpen, ChevronLeft, ChevronRight, X, BookOpen, ArrowLeft, ScanSearch, Loader2 } from 'lucide-react';
import { nascimentosApi } from '../../api.js';
import ImageViewer from '../../components/ImageViewer.jsx';

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${colors[type] || colors.info}`}>
      {msg}
      <button onClick={onClose}><X className="w-4 h-4" /></button>
    </div>
  );
}

function ConfidenceBadge({ value }) {
  if (!value) return null;
  const map = { alta: 'badge-alta', media: 'badge-media', baixa: 'badge-baixa' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[value] || 'bg-slate-100 text-slate-600'}`}>
      {value}
    </span>
  );
}

function FileModal({ record, onClose }) {
  if (!record) return null;
  const isPdf = record.arquivo_tipo?.includes('pdf');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <span className="font-medium text-slate-800">{record.arquivo_nome}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50">
          {isPdf
            ? <iframe src={record.arquivo_url} className="w-full h-[70vh]" title="PDF" />
            : <img src={record.arquivo_url} alt="Documento" className="max-w-full max-h-[70vh] object-contain rounded" />
          }
        </div>
      </div>
    </div>
  );
}

function ViewModal({ record: initialRecord, onClose }) {
  const [record,     setRecord]     = useState(initialRecord);
  const [localizing, setLocalizing] = useState(false);
  const [locError,   setLocError]   = useState(null);

  if (!record) return null;

  const isImage = record.arquivo_tipo && record.arquivo_tipo.includes('image');
  const hasBbox = record.campos_bbox && Object.keys(record.campos_bbox).length > 0;

  async function handleLocalizar() {
    setLocalizing(true);
    setLocError(null);
    try {
      const r = await nascimentosApi.localizar(record.id);
      setRecord(prev => ({ ...prev, campos_bbox: r.campos_bbox }));
    } catch (err) {
      setLocError(err?.response?.data?.error || err.message);
    } finally {
      setLocalizing(false);
    }
  }

  const fields = [
    ['Nome Completo',      record.nome_completo],
    ['Nome da Mãe',        record.nome_mae],
    ['Nome do Pai',        record.nome_pai],
    ['Data de Nascimento', record.data_nascimento],
    ['Ano',                record.ano],
    ['Livro',              record.livro],
    ['Folha',              record.folha],
    ['Nº do Termo',        record.numero_termo],
    ['Município',          record.municipio],
    ['Estado',             record.estado],
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[92vh] ${isImage ? 'max-w-5xl' : 'max-w-lg'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-slate-800">Visualizar Registro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className={`flex flex-1 overflow-hidden ${isImage ? 'flex-row' : 'flex-col'}`}>
          {/* Left: image viewer */}
          {isImage && record.arquivo_url && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 border-r min-w-0">
              <ImageViewer
                src={record.arquivo_url}
                bbox={record.campos_bbox}
              />

              {/* Localize button */}
              <div className="mt-3">
                {!hasBbox && !localizing && (
                  <button
                    onClick={handleLocalizar}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    <ScanSearch className="w-4 h-4" />
                    Destacar campos na imagem (IA)
                  </button>
                )}
                {localizing && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analisando imagem… pode levar 30–60s
                  </div>
                )}
                {hasBbox && !localizing && (
                  <button
                    onClick={handleLocalizar}
                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <ScanSearch className="w-3.5 h-3.5" />
                    Reanalisar posições
                  </button>
                )}
                {locError && <p className="text-xs text-red-500 mt-1">{locError}</p>}
              </div>
            </div>
          )}

          {/* Right: data fields */}
          <div className={`overflow-y-auto p-5 ${isImage ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(([label, val]) => val ? (
                <div key={label} className={label === 'Nome Completo' ? 'col-span-2' : 'col-span-1'}>
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-slate-800 break-words">{val}</p>
                </div>
              ) : null)}

              {record.observacoes && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-0.5">Observações</p>
                  <p className="text-sm text-slate-600">{record.observacoes}</p>
                </div>
              )}

              {record.confianca && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-0.5">Confiança da IA</p>
                  <ConfidenceBadge value={record.confianca} />
                </div>
              )}
            </div>

            {/* PDF fallback */}
            {!isImage && record.arquivo_url && (
              <div className="mt-4 pt-4 border-t">
                <a
                  href={record.arquivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <FolderOpen className="w-4 h-4" />
                  Abrir documento original
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NascimentosList() {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const livroId       = searchParams.get('livro_id');
  const livroNome     = searchParams.get('livro_nome');

  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [limit]                     = useState(10);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [toast,      setToast]      = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [fileRecord, setFileRecord] = useState(null);
  const [deleting,   setDeleting]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, page, limit };
      if (livroId) params.livro_id = livroId;
      const data = await nascimentosApi.list(params);
      setRecords(data.rows);
      setTotal(data.total);
    } catch {
      setToast({ msg: 'Erro ao carregar registros', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, page, limit, livroId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, livroId]);

  async function handleDelete(id) {
    if (!confirm('Confirma exclusão deste registro?')) return;
    setDeleting(id);
    try {
      await nascimentosApi.remove(id);
      setToast({ msg: 'Registro excluído', type: 'success' });
      load();
    } catch {
      setToast({ msg: 'Erro ao excluir', type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const novoUrl    = livroId ? `/nascimentos/novo?livro_id=${livroId}` : '/nascimentos/novo';

  return (
    <div className="max-w-7xl mx-auto">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {viewRecord && <ViewModal record={viewRecord} onClose={() => setViewRecord(null)} />}
      {fileRecord && <FileModal record={fileRecord} onClose={() => setFileRecord(null)} />}

      {/* Breadcrumb livro */}
      {livroId && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate('/livros')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Estante
          </button>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <BookOpen className="w-4 h-4 text-blue-500" />
            {livroNome ? decodeURIComponent(livroNome) : `Livro #${livroId}`}
          </div>
          <button
            onClick={() => setSearchParams({})}
            className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Ver todos os registros
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Registros de Nascimentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/nascimentos/lote')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importar em Lote
          </button>
          <button
            onClick={() => navigate(novoUrl)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Registro
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome, mãe, pai, termo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Nome</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-24">Livro</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-20">Folha</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-20">Ano</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-32">Termo</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 w-36">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <p className="text-slate-400 text-sm">Nenhum registro encontrado</p>
                    {search && <p className="text-slate-400 text-xs mt-1">Tente outro termo de busca</p>}
                    {!search && livroId && (
                      <button onClick={() => navigate(novoUrl)}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" />
                        Adicionar primeiro registro
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {records.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-5 py-3.5 font-medium text-slate-800">
                    {r.nome_completo || <span className="text-slate-400 italic">Não informado</span>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{r.livro || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.folha || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.ano || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.numero_termo || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.arquivo_url && (
                        <button title="Ver documento" onClick={() => setFileRecord({ ...r, arquivo_url: r.arquivo_url })}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      )}
                      <button title="Visualizar" onClick={() => setViewRecord(r)}
                        className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button title="Editar" onClick={() => navigate(`/nascimentos/${r.id}/editar`)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button title="Excluir" onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
                      p === page ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}>{p}</button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
