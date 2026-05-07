import { NavLink, useLocation } from 'react-router-dom';
import { Users, Heart, BookHeart, Library, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const sections = [
  {
    label: 'Acervo',
    icon: Library,
    items: [
      { to: '/livros', label: 'Estante de Livros' },
    ]
  },
  {
    label: 'Registro Civil',
    icon: Users,
    items: [
      { to: '/nascimentos', label: 'Nascimentos' },
      { to: '/obitos',      label: 'Óbitos' },
      { to: '/casamentos',  label: 'Casamentos' },
    ]
  }
];

export default function Sidebar() {
  const [open, setOpen] = useState({ Acervo: true, 'Registro Civil': true });

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BookHeart className="w-6 h-6 text-blue-400" />
          <span className="text-white font-semibold text-base tracking-wide">Registro Civil</span>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {sections.map(sec => {
          const Icon = sec.icon;
          const isOpen = open[sec.label];
          return (
            <div key={sec.label} className="mb-1">
              <button
                onClick={() => setOpen(o => ({ ...o, [sec.label]: !o[sec.label] }))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{sec.label}</span>
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {isOpen && (
                <div className="ml-7 border-l border-white/10 pl-3 mt-0.5">
                  {sec.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `block py-2 px-3 text-sm rounded transition-colors my-0.5 ${
                          isActive
                            ? 'text-blue-400 bg-blue-900/30 font-medium'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-xs text-slate-500">IA Indexação v1.1</p>
      </div>
    </aside>
  );
}
