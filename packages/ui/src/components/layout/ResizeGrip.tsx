import React from 'react';

import { cn } from '@/lib/utils';

/** How long the pill stays visible after the pointer lifts. */
const HIDE_DELAY_MS = 450;

/**
 * Tap-to-reveal drag grip for window borders.
 *
 * Hidden at rest. On tap it expands from the center of the border into a
 * thin themed capsule that overhangs both adjacent panes, with three subtle
 * grip bars (a hamburger, rotated for the border's orientation) as the grab
 * affordance. The reveal springs in with a slight overshoot; while a drag is
 * active the bars breathe gently. It stays up for the duration of the drag and
 * fades quickly after release so it never lingers over the session rows and
 * blocks a tap.
 *
 * Pairs with the full-height resize separator: the separator owns the gesture
 * and the widened touch hit-area (the ::before in index.css), this renders the
 * affordance. The pill itself is pointer-events-none — only the separator's
 * hit-area can intercept input, and a short linger keeps it from overlapping
 * session-row taps for long.
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
    // Not dragging: fade out quickly so the handle never lingers over content.
    const timer = setTimeout(() => setLinger(false), HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const show = active || linger;

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
          'flex items-center justify-center rounded-full border border-border/70 bg-background/85 shadow-md',
          'transition-[transform,opacity] duration-150 ease-out',
          isVertical ? 'h-9 w-6 flex-col gap-[5px]' : 'h-6 w-9 gap-[5px]',
          show ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        {bars.map((i) => (
          <span
            key={i}
            className={cn(
              'block rounded-full bg-muted-foreground/60',
              isVertical ? 'h-[2px] w-3' : 'h-3 w-[2px]',
              active && 'animate-oc-grip-breathe',
            )}
          />
        ))}
      </div>
    </div>
  );
};
