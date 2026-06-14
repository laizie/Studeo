import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  src: string;
  onClose: () => void;
}

/** Full-screen preview of a note image. Opened by double-clicking an image in the editor;
    closes on backdrop click, the close button, or Escape. */
export default function ImageLightbox({ src, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
