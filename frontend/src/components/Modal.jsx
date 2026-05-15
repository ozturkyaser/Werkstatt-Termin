export default function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
         onClick={onClose}>
      <div className="min-h-full flex items-start justify-center p-4">
        <div
          className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} my-8`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold text-lg">{title}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">
              ×
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
