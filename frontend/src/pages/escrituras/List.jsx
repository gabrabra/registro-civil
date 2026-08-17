import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Eye, Pencil, Trash2, FolderOpen, ChevronLeft, ChevronRight, X, BookOpen, ArrowLeft } from 'lucide-react';
import { escriturasApi } from '../../api.js';
import { useBulkSelection } from '../../components/useBulkSelection.js';
import { BulkBar, SelectAllCheckbox, RowCheckbox } from '../../components/BulkBar.jsx';

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

function ViewModal({ record, onClose }) {
  if (!record) return null;
  const isImage = record.arquivo_tipo?.includes('image');
  const fields = [
    ['Vendedor',          record.vendedor],
    ['CPF Vendedor',      record.cpf_vendedor],
    ['Comprador',         record.comprador],
    ['CPF Comprador',     record.cpf_comprador],
    ['Data da Escritura', record.data_escritura],
    ['Ano',               record.ano],
    ['Livro',             record.livro],
    ['Folha',             record.folha],
    ['Valor',             record.valor],
    ['Tabelião',          record.tabeliao],
    ['Cartório',          record.cartorio],
    ['Município',         record.municipio],
    ['Estado',            record.estado],
  ];
  const wideFields = ['Vendedor', 'Comprador', 'Descrição do Imóvel', 'Endereço do Imóvel'];
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[92vh] ${isImage ? 'max-w-5xl' : 'max-w-lg'}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-slate-800">Visualizar Escritura de Compra e Venda</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className={`flex flex-1 overflow-hidden ${isImage ? 'flex-row' : 'flex-col'}`}>
          {isImage && record.arquivo_url && (
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 border-r min-w-0">
              <img src={record.arquivo_url} alt="Documento" className="max-w-full object-contain rounded" />
            </div>
          )}
          <div className={`overflow-y-auto p-5 ${isImage ? 'w-80 flex-shrink-0' : 'flex-1'}`}>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(([label, val]) => val ? (
                <div key={label} className={wideFields.includes(label) ? 'col-span-2' : 'col-span-1'}>
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-slate-800 break-words">{val}</p>
                </div>
              ) : null)}
              {record.descricao_imovel && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-0.5">Descrição do Imóvel</p>
                  <p className="text-sm text-slate-700">{record.descricao_imovel}</p>
                </div>
              )}
              {record.endereco_imovel && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 mb-0.5">Endereço do Imóvel</p>
                  <p className="text-sm text-slate-700">{record.endereco_imovel}</p>
                </div>
              )}
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
            {!isImage && record.arquivo_url && (
              <div className="mt-4 pt-4 border-t">
                <a href={record.arquivo_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
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

export default function EscriturasList() {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const livroId   = searchParams.get('livro_id');
  const livroNome = searchParams.get('livro_nome');

  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [limit]                     = useState(10);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [toast,      setToast]      = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [deleting,   setDeleting]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, page, limit };
      if (livroId) params.livro_id = livroId;
      const data = await escriturasApi.list(params);
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

  const bulk = useBulkSelection(records, { remove: escriturasApi.remove, onDone: load });

  async function handleDelete(id) {
    if (!confirm('Confirma exclusão deste registro?')) return;
    setDeleting(id);
    try {
      await escriturasApi.remove(id);
      setToast({ msg: 'Registro excluído', type: 'success' });
      load();
    } catch {
      setToast({ msg: 'Erro ao excluir', type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  async function handleBulkDelete() {
    const n = bulk.count;
    if (!confirm(`Confirma exclusão de ${n} escritura${n !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return;
    const r = await bulk.removerSelecionados();
    if (!r) return;
    setToast(r.falhas.length
      ? { msg: `${r.ok} de ${r.total} excluída(s) — ${r.falhas.length} falhou(ram)`, type: 'error' }
      : { msg: `${r.ok} escritura${r.ok !== 1 ? 's' : ''} excluída${r.ok !== 1 ? 's' : ''}`, type: 'success' });
  }

  const totalPages = Math.ceil(total / limit);
  const novoUrl    = livroId ? `/escrituras-compra-venda/novo?livro_id=${livroId}` : '/escrituras-compra-venda/novo';

  return (
    <div className="max-w-7xl mx-auto">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {viewRecord && <ViewModal record={viewRecord} onClose={() => setViewRecord(null)} />}

      {livroId && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate('/livros')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Estante
          </button>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <BookOpen className="w-4 h-4 text-blue-500" />
            {livroNome ? decodeURIComponent(livroNome) : `Livro #${livroId}`}
          </div>
          <button onClick={() => setSearchParams({})} className="ml-auto text-xs text-slate-400 hover:text-slate-600 underline">
            Ver todos
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Escrituras de Compra e Venda</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate(novoUrl)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Novo Registro
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por vendedor, comprador, endereço, município..."
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

      <BulkBar
        count={bulk.count}
        onClear={bulk.limpar}
        onDelete={handleBulkDelete}
        removing={bulk.removing}
        entidade="escritura"
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3.5 w-10">
                  <SelectAllCheckbox
                    checked={bulk.todosMarcados}
                    indeterminate={bulk.algunsMarcados}
                    onChange={bulk.toggleTodos}
                    disabled={loading || records.length === 0}
                  />
                </th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Vendedor</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600">Comprador</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-24">Livro</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 w-20">Ano</th>
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600">Valor</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-600 w-32">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <p className="text-slate-400 text-sm">Nenhum registro encontrado</p>
                    {!search && (
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
                <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${bulk.isSelected(r.id) ? 'bg-blue-50/60' : (i % 2 === 0 ? '' : 'bg-slate-50/30')}`}>
                  <td className="px-4 py-3.5">
                    <RowCheckbox
                      checked={bulk.isSelected(r.id)}
                      onChange={() => bulk.toggle(r.id)}
                      label={`Selecionar escritura de ${r.vendedor || 'vendedor não informado'}`}
                    />
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-800">
                    {r.vendedor || <span className="text-slate-400 italic">Não informado</span>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{r.comprador || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.livro || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600">{r.ano || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-600 max-w-[200px] truncate">{r.valor || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.arquivo_url && (
                        <a href={r.arquivo_url} target="_blank" rel="noreferrer" title="Ver documento"
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <FolderOpen className="w-4 h-4" />
                        </a>
                      )}
                      <button title="Visualizar" onClick={() => setViewRecord(r)}
                        className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button title="Editar" onClick={() => navigate(`/escrituras-compra-venda/${r.id}/editar`)}
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
