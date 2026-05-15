import { useEffect, useRef, useState } from 'react';

// Einfaches Canvas-Signaturfeld. Gibt per onChange(dataUrl|null) die aktuelle Unterschrift zurück.
export default function SignaturePad({ onChange, height = 180 }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // Retina-Skalierung
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    // Weißer Hintergrund, damit PNG kein schwarzes Feld ist
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, height);
  }, [height]);

  function pos(evt) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = evt.touches?.[0];
    const x = (touch ? touch.clientX : evt.clientX) - rect.left;
    const y = (touch ? touch.clientY : evt.clientY) - rect.top;
    return { x, y };
  }

  function handleStart(e) {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pos(e);
    setEmpty(false);
  }
  function handleMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }
  function handleEnd() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      const data = canvasRef.current.toDataURL('image/png');
      onChange?.(data);
    } catch { /* ignore */ }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, height);
    setEmpty(true);
    onChange?.(null);
  }

  return (
    <div>
      <div className="border-2 border-dashed border-slate-300 rounded-lg bg-white"
           style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, display: 'block', borderRadius: '0.5rem' }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span>{empty ? '✍️ Bitte mit Finger oder Maus unterschreiben' : 'Unterschrift erfasst'}</span>
        <button type="button" className="text-red-600 hover:underline" onClick={clear}>
          Zurücksetzen
        </button>
      </div>
    </div>
  );
}
