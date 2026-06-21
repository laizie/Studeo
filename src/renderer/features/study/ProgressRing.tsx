import { PHASE_COLORS, type Phase } from '../../store/useTimerStore';

// The countdown ring, shared by the Study page timer card and Focus Mode. The
// `size` prop lets Focus Mode render a larger, calmer ring than the card.
const RADIUS        = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  phase: Phase;
  timeLeft: number;
  totalSecs: number;
  /** Rendered width/height in px. The 200×200 viewBox scales to fit. */
  size?: number;
  className?: string;
}

export default function ProgressRing({ phase, timeLeft, totalSecs, size = 200, className }: Props) {
  const progress = totalSecs > 0 ? timeLeft / totalSecs : 1;
  const offset   = CIRCUMFERENCE * (1 - progress);
  const color    = PHASE_COLORS[phase];

  return (
    <svg
      viewBox="0 0 200 200"
      className={className ?? '-rotate-90'}
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke="currentColor" strokeWidth={7}
        className="text-stone-100 dark:text-line"
      />
      <circle cx={100} cy={100} r={RADIUS}
        fill="none" stroke={color} strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s linear, stroke 0.3s ease' }}
      />
    </svg>
  );
}
