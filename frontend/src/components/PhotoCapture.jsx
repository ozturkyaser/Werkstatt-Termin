import { useEffect, useRef, useState } from 'react';

// Nimmt ein Foto mit der Rück-Kamera auf (getUserMedia) oder erlaubt File-Upload als Fallback.
// onCapture(dataUrl) wird aufgerufen sobald ein Bild (neu oder alt) ausgewählt wurde.
export default function PhotoCapture({ onCapture, label = 'Foto aufnehmen' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [err, setErr] = useState(null);

  async function startCamera() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch (e) {
      setErr(e.message || 'Keine Kamera verfügbar – bitte Datei hochladen.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }

  useEffect(() => () => stopCamera(), []);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    setPhoto(data);
    onCapture?.(data);
    stopCamera();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result);
      onCapture?.(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    setPhoto(null);
    onCapture?.(null);
  }

  return (
    <div className="space-y-2">
      {!photo && !active && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={startCamera}>
            📷 {label}
          </button>
          <label className="btn-secondary cursor-pointer">
            📁 Datei wählen
            <input type="file" accept="image/*" capture="environment"
                   className="hidden" onChange={handleFile} />
          </label>
        </div>
      )}

      {err && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        ⚠ {err}
      </div>}

      {active && (
        <div className="space-y-2">
          <video ref={videoRef} className="w-full rounded-lg border bg-black" style={{ maxHeight: 360 }} playsInline muted />
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={snap}>📸 Auslösen</button>
            <button type="button" className="btn-secondary" onClick={stopCamera}>Abbrechen</button>
          </div>
        </div>
      )}

      {photo && (
        <div className="space-y-2">
          <img src={photo} alt="Foto" className="w-full rounded-lg border" style={{ maxHeight: 360, objectFit: 'contain' }} />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={reset}>🔄 Neu aufnehmen</button>
          </div>
        </div>
      )}
    </div>
  );
}
