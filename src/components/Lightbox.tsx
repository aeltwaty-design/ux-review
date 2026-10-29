export function Lightbox({ src, cap, onClose }: { src: string; cap: string; onClose: () => void }) {
  return (
    <div className="lb" onClick={onClose} role="dialog" aria-modal="true">
      <img src={src} alt={cap} />
      {cap && <div className="cap">{cap}</div>}
    </div>
  );
}
