import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { COURSE_COLORS, DEFAULT_COURSE_COLOR } from '../../lib/colors';
import { useCreateCourse } from '../../lib/queries/useCourses';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Turns "Introduction to Computer Science" → "ICS"
function deriveAbbreviation(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-stone-300 rounded-lg ' +
  'focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent ' +
  'placeholder:text-stone-400';

export default function CreateCourseDialog({ isOpen, onClose }: Props) {
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  // Track whether user has manually edited abbreviation so we stop auto-deriving
  const [abbreviationEdited, setAbbreviationEdited] = useState(false);
  const [color, setColor] = useState(DEFAULT_COURSE_COLOR);
  const [building, setBuilding] = useState('');

  const createCourse = useCreateCourse();
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset all fields when dialog opens so it's always fresh
  useEffect(() => {
    if (isOpen) {
      setName('');
      setAbbreviation('');
      setAbbreviationEdited(false);
      setColor(DEFAULT_COURSE_COLOR);
      setBuilding('');
      // Small delay so the element is visible before we focus it
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  function handleNameChange(value: string) {
    setName(value);
    if (!abbreviationEdited) {
      setAbbreviation(deriveAbbreviation(value));
    }
  }

  function handleAbbreviationChange(value: string) {
    setAbbreviation(value.toUpperCase().slice(0, 8));
    setAbbreviationEdited(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    await createCourse.mutateAsync({
      name: name.trim(),
      abbreviation: abbreviation.trim() || deriveAbbreviation(name),
      color,
      building: building.trim() || undefined,
    });

    onClose();
  }

  if (!isOpen) return null;

  return (
    // Overlay — clicking the backdrop closes the dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30" />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-stone-800">New course</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Course name */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Course name
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Introduction to Computer Science"
              className={INPUT_CLASS}
              required
            />
          </div>

          {/* Abbreviation */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Abbreviation
              <span className="ml-1 text-stone-400 font-normal">(shown on cards)</span>
            </label>
            <input
              type="text"
              value={abbreviation}
              onChange={(e) => handleAbbreviationChange(e.target.value)}
              placeholder="e.g. CS101"
              className={INPUT_CLASS}
            />
          </div>

          {/* Color swatches */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map(({ value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    color === value
                      ? 'border-stone-500 scale-125'
                      : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: value }}
                  title={value}
                />
              ))}
            </div>
          </div>

          {/* Building (optional) */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Building
              <span className="ml-1 text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="e.g. Engineering Hall 204"
              className={INPUT_CLASS}
            />
          </div>

          {createCourse.isError && (
            <p className="text-sm text-red-600">
              Something went wrong — please try again.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createCourse.isPending}
              className="px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createCourse.isPending ? 'Creating…' : 'Create course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
