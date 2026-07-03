import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

const STEPS = ['Semester', 'Courses', 'Class times', 'Finish'];

interface Props {
  /** 1-based index of the active step. */
  current: number;
}

/** Horizontal progress rail across the top of the wizard. */
export default function StepIndicator({ current }: Props) {
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-3">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  done && 'bg-accent text-accent-ink',
                  active && 'bg-accent text-accent-ink ring-4 ring-accent/20',
                  !done && !active && 'bg-surface-hi text-muted',
                )}
              >
                {done ? <Check size={13} /> : step}
              </span>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  active ? 'font-medium text-ink' : 'text-muted',
                )}
              >
                {label}
              </span>
            </div>
            {step < STEPS.length && <span className="h-px w-4 bg-line sm:w-8" />}
          </li>
        );
      })}
    </ol>
  );
}
