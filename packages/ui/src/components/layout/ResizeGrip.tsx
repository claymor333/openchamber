import React from 'react';

import { cn } from '@/lib/utils';

/** How long the pill stays visible after the pointer lifts. */
const HIDE_DELAY_MS = 1600;

/**
 * Tap-to-reveal drag grip for window borders.
 *
 * Hidden at rest. On tap it expands from the center of the border into a
 * themed capsule that overhangs both adjacent panes, with three grip bars (a
 * hamburger, rotated for the border's orientation) as the grab affordance —
 * matching the reference grip on the Catppuccin theme. The reveal springs in
 * with a slight overshoot; while a drag is active the bars breathe gently to
 * signal the live gesture. It stays up for the duration of the drag and
 * lingers briefly after release before hiding again, so a tap that reveals the
 * handle doesn't blink it away.
 *
 * Pairs with the full-height resize separator: the separator owns the gesture
 * and the widened touch hit-area (the ::before in index.css), this renders the
 * affordance. Uses the theme's surface + border + muted-foreground tokens so it
 * reads correctly in Catppuccin and every other theme.
 */
export const ResizeGrip: React.FC<{
  /** True while a drag is in progress — keeps the pill up + pulses the bars. */
  active?: boolean;
  /** Orientation of the separator this grip sits on. Defaults to `vertical`. */
  orientation?: 'vertical' | 'horizontal';
  /** Extra positioning classes. */
  className?: string;
}> = ({ active = false, orientation = 'vertical', className }) => {
  const isVertical = orientation === 'vertical';
  const [linger, setLinger] = React.useState(false);

  React.useEffect(() => {
    if (active) {
      setLinger(true);
      return;
    }
    // Not dragging: keep showing briefly, then hide.
    const timer = setTimeout(() => setLinger(false), HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const show = active || linger;

  // Three grip bars. For a vertical border the capsule is tall and the bars run
  // horizontally (a hamburger); for a horizontal border the capsule is wide and
  // the bars run vertically.
  const bars = [0, 1, 2];

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full border border-border/80 bg-popover/80 shadow-md',
          'transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          isVertical ? 'h-14 w-9 flex-col gap-[6px]' : 'h-9 w-14 gap-[6px]',
          show ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
        )}
      >
        {bars.map((i) => (
          <span
            key={i}
            className={cn(
              'block rounded-full bg-muted-foreground/80',
              isVertical ? 'h-[3px] w-6' : 'h-6 w-[3px]',
              active && 'animate-oc-grip-breathe',
            )}
          />
        ))}
      </div>
    </div>
  );
};
