import { Trash2, X, Loader2 } from 'lucide-react';

// Action bar shown above a table once rows are selected.
export function BulkBar({ count, onClear, onDelete, removing, entidade = 'registro' }) {
  if (!count) return null;
  const plural = count !== 1;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 mb-3 rounded-lg border border-blue-200 bg-blue-50">
      <span className="text-sm font-medium text-blue-900">
        {count} {entidade}{plural ? 's' : ''} selecionado{plural ? 's' : ''}
      </span>

      <button
        type="button"
        onClick={onClear}
        disabled={removing}
        className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" /> Limpar seleção
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={removing}
        className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium transition-colors"
      >
        {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        {removing ? 'Excluindo...' : `Excluir ${count}`}
      </button>
    </div>
  );
}

// Header checkbox that reflects the all/some/none state of the page.
export function SelectAllCheckbox({ checked, indeterminate, onChange, disabled }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={el => { if (el) el.indeterminate = Boolean(indeterminate); }}
      onChange={onChange}
      disabled={disabled}
      aria-label="Selecionar todos desta página"
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer disabled:cursor-not-allowed"
    />
  );
}

export function RowCheckbox({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      aria-label={label}
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
    />
  );
}

export default BulkBar;
