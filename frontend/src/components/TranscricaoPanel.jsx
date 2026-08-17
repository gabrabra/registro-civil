import { useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

// Full-page transcription produced by the AI. Editable so the operator can fix
// misreadings before saving — the corrected text is what gets stored and searched.
export default function TranscricaoPanel({ value, onChange, defaultOpen = true }) {
  const [open,   setOpen]   = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const text  = value || '';
  const chars = text.length;
  const lines = text ? text.split('\n').length : 0;

  async function handleCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) { /* clipboard unavailable — nothing to do */ }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <ScrollText className="w-4 h-4 text-violet-500" />
        <h2 className="text-sm font-semibold text-slate-700 flex-1">
          Transcrição da Página
          {chars > 0 && (
            <span className="ml-2 font-normal text-xs text-slate-400">
              {lines} linha{lines === 1 ? '' : 's'} · {chars.toLocaleString('pt-BR')} caracteres
            </span>
          )}
        </h2>
        {chars > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleCopy}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCopy(e); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-white hover:border-slate-300 transition-colors"
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5">
          {chars > 0 ? (
            <>
              <textarea
                value={text}
                onChange={e => onChange(e.target.value)}
                rows={16}
                spellCheck={false}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm leading-relaxed font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors resize-y"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Texto integral lido pela IA. Corrija o que estiver errado — é isso que fica salvo e pesquisável.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
              Nenhuma transcrição ainda — processe um documento com a IA.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
