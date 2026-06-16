import { useRef, useState } from 'react';

const FIELD_CONFIG = [
  { key: 'nome_completo',   label: 'Nome completo',   color: '#3b82f6' },
  { key: 'nome_mae',        label: 'Mãe',             color: '#22c55e' },
  { key: 'nome_pai',        label: 'Pai',             color: '#a855f7' },
  { key: 'data_nascimento', label: 'Data nasc.',      color: '#f59e0b' },
  { key: 'numero_termo',    label: 'Nº termo',        color: '#ef4444' },
  { key: 'ano',             label: 'Ano',             color: '#06b6d4' },
  { key: 'livro',           label: 'Livro',           color: '#6366f1' },
];

// bbox coords are normalized 0-1000 → convert to % for SVG viewBox 0 0 1000 1000
export default function ImageViewer({ src, bbox }) {
  const [loaded, setLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const imgRef = useRef(null);
  const [hidden, setHidden] = useState({});

  function onLoad(e) {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
    setLoaded(true);
  }

  const hasBbox = bbox && Object.keys(bbox).length > 0;
  const activeFields = FIELD_CONFIG.filter(f => bbox?.[f.key]);

  return (
    <div className="space-y-3">
      {/* Legend */}
      {hasBbox && (
        <div className="flex flex-wrap gap-2">
          {activeFields.map(f => (
            <button
              key={f.key}
              onClick={() => setHidden(h => ({ ...h, [f.key]: !h[f.key] }))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${
                hidden[f.key] ? 'opacity-30' : 'opacity-100'
              }`}
              style={{ borderColor: f.color, color: f.color, background: `${f.color}15` }}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: f.color }}
              />
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Image + SVG overlay */}
      <div className="relative w-full overflow-hidden rounded-lg bg-slate-900">
        <img
          ref={imgRef}
          src={src}
          alt="Documento original"
          onLoad={onLoad}
          className="w-full h-auto block"
        />

        {loaded && hasBbox && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
            preserveAspectRatio="none"
          >
            {FIELD_CONFIG.map(f => {
              const coords = bbox[f.key];
              if (!coords || hidden[f.key]) return null;

              // coords are normalized 0-1000; scale to natural image pixels
              const scaleX = naturalSize.w / 1000;
              const scaleY = naturalSize.h / 1000;
              const x  = coords[0] * scaleX;
              const y  = coords[1] * scaleY;
              const w  = (coords[2] - coords[0]) * scaleX;
              const h  = (coords[3] - coords[1]) * scaleY;
              const fontSize = Math.max(naturalSize.h * 0.012, 10);

              return (
                <g key={f.key}>
                  {/* Highlight fill */}
                  <rect
                    x={x} y={y} width={w} height={h}
                    fill={`${f.color}30`}
                    stroke={f.color}
                    strokeWidth={Math.max(naturalSize.w * 0.002, 1.5)}
                    rx={naturalSize.w * 0.003}
                  />
                  {/* Label tag */}
                  <rect
                    x={x} y={y - fontSize * 1.4}
                    width={f.label.length * fontSize * 0.62 + 8}
                    height={fontSize * 1.4}
                    fill={f.color}
                    rx={naturalSize.w * 0.002}
                  />
                  <text
                    x={x + 4} y={y - fontSize * 0.3}
                    fill="white"
                    fontSize={fontSize}
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {f.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
