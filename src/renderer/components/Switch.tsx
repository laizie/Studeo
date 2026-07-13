import { cn } from '../lib/utils';

/**
 * The app's one switch. Two sizes, because switches appear in two places with
 * genuinely different density — `md` for a Settings row (a decision you make
 * deliberately), `sm` inside a toolbar filter chip (a view you flick on and off).
 * Anything else about them is identical.
 *
 * The `tone` is what the switch turns *on*, so it stays honest about which data
 * it governs: amber for app state (the study plan), task violet for tasks. Both
 * are already meaningful colors elsewhere — this is the Color-Is-Data rule, not
 * decoration.
 *
 * This is a presentational track+knob only. It renders no button of its own, so
 * a caller can either wrap it in a `role="switch"` button (a labeled filter chip)
 * or hand it the switch role itself (a Settings row).
 */
interface Props {
  checked: boolean;
  size?: 'sm' | 'md';
  tone?: 'accent' | 'task';
}

export default function Switch({ checked, size = 'md', tone = 'accent' }: Props) {
  const sm = size === 'sm';
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200',
        sm ? 'h-4 w-7' : 'h-5 w-9',
        // The off track has to contrast with whatever it sits on: bg-surface
        // would vanish against a surface card in the dark/warm themes.
        checked
          ? (tone === 'task' ? 'bg-task' : 'bg-accent')
          : 'bg-stone-300 dark:bg-inset',
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
          sm ? 'h-3 w-3' : 'h-4 w-4',
          checked
            ? (sm ? 'translate-x-3.5' : 'translate-x-[18px]')
            : 'translate-x-0.5',
        )}
      />
    </span>
  );
}
