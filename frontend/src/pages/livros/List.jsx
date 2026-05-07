import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, MapPin, Calendar, Hash, FileText, ChevronRight, Search, Pencil, Loader2 } from 'lucide-react';
import { livrosApi } from '../../api.js';

const PALETTE = [
  { border: 'border-l-blue-500',    bg: 'bg-blue-500',    light: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800'    },
  { border: 'border-l-emerald-500', bg: 'bg-emerald-500', light: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800' },
  { border: 'border-l-violet-500',  bg: 'bg-violet-500',  light: 'bg-violet-50',  badge: 'bg-violet-100 text-violet-800'  },
  { border: 'border-l-amber-500',   bg: 'bg-amber-500',   light: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800'   },
  { border: 'border-l-rose-500',    bg: 'bg-rose-500',    light: 'bg-rose-50',    badge: 'bg-rose-100 text-rose-800'    },
  { border: 'border-l-cyan-500',    bg: 'bg-cyan-500',    light: 'bg-cyan-50',    badge: 'bg-cyan-100 text-cyan-800'    },
  { border: 'border-l-teal-500',    bg: 'bg-teal-500',    light: 'bg-teal-50',    badge: 'bg-teal-100 text-teal-800'    },
  { border: 'border-l-orange-500',  bg: 'bg-orange-500',  light: 'bg-orange-50',  badge: 'bg-orange-100 text-orange-800' },
];

function color(id) { return PALETTE[id % PALETTE.length]; }

function fmt(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
}

function ProgressBar({ done, total, bg }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{done} de {total} digitalizados</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${bg}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LivroCard({ livro, idx }) {
  const navigate = useNavigate();
  const c = color(idx);
  const digitalizados = livro.total_digitalizados ?? 0;
  const total         = livro.total_esperado ?? null;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${c.border} shadow-sm hover:shadow-md transition-shadow flex flex-col`}>
      {/* Header */}
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold tracking-wider ${c.badge}`}>
            LIVRO {livro.numero}
          </div>
          {livro.estado && (
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
              {livro.municipio ? `${livro.municipio}/${livro.estado}` : livro.estado}
            </span>
          )}
        </div>

        {livro.cartorio && (
          <p className="text-sm font-medium text-slate-800 leading-snug mb-3 line-clamp-2">
            {livro.cartorio}
          </p>
        )}

        <div className="space-y-1.5 text-xs text-slate-500">
          {(livro.termo_inicio || livro.termo_fim) && (
            <div className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Termos {livro.termo_inicio ?? '?'} a {livro.termo_fim ?? '?'}</span>
            </div>
          )}
          {(livro.data_inicio || livro.data_fim) && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{fmt(livro.data_inicio) ?? '?'} – {fmt(livro.data_fim) ?? '?'}</span>
            </div>
          )}
          {livro.cnpj && (
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-mono">{livro.cnpj}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pb-4">
        {total
          ? <ProgressBar done={digitalizados} total={total} bg={c.bg} />
          : (
            <p className="text-xs text-slate-400">
              {digitalizados} {digitalizados === 1 ? 'registro' : 'registros'} digitalizado{digitalizados !== 1 ? 's' : ''}
            </p>
          )
        }
      </div>

      {/* Footer actions */}
      <div className="border-t border-slate-100 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => navigate(`/nascimentos?livro_id=${livro.id}&livro_nome=${encodeURIComponent('Livro ' + livro.numero)}`)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Ver Registros
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => navigate(`/livros/${livro.id}/editar`)}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Editar livro"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function LivrosList() {
  const navigate = useNavigate();
  const [livros,  setLivros]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    livrosApi.list()
      .then(setLivros)
      .finally(() => setLoading(false));
  }, []);

  const filtered = livros.filter(l => {
    const q = search.toLowerCase();
    return !q ||
      l.numero?.toLowerCase().includes(q) ||
      l.cartorio?.toLowerCase().includes(q) ||
      l.municipio?.toLowerCase().includes(q) ||
      l.estado?.toLowerCase().includes(q);
  });

  // Stats
  const totalRegistros    = livros.reduce((s, l) => s + (l.total_digitalizados ?? 0), 0);
  const totalEsperados    = livros.reduce((s, l) => s + (l.total_esperado ?? 0), 0);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Estante de Livros</h1>
          <p className="text-sm text-slate-500 mt-0.5">Acervo de registros de nascimento por livro</p>
        </div>
        <button
          onClick={() => navigate('/livros/novo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Livro
        </button>
      </div>

      {/* Stats bar */}
      {!loading && livros.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Livros cadastrados', value: livros.length },
            { label: 'Registros digitalizados', value: totalRegistros.toLocaleString('pt-BR') },
            { label: 'Total esperado', value: totalEsperados > 0 ? totalEsperados.toLocaleString('pt-BR') : '—' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por número, cartório, município..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-white"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
          <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {search ? 'Nenhum livro encontrado' : 'Nenhum livro cadastrado ainda'}
          </p>
          {!search && (
            <button
              onClick={() => navigate('/livros/novo')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Cadastrar primeiro livro
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l, i) => (
            <LivroCard key={l.id} livro={l} idx={i} />
          ))}
        </div>
      )}
    </div>
  );
}
