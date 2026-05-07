export default function Placeholder({ title }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <p className="text-4xl mb-3">🚧</p>
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm mt-1">Em desenvolvimento</p>
    </div>
  );
}
