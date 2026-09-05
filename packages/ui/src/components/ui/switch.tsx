import * as React from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';

import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';

type SwitchProps = React.ComponentPropsWithoutRef<typeof BaseSwitch.Root> & {
  loading?: boolean;
};

const Switch = React.forwardRef<
  HTMLButtonElement,
  SwitchProps
>(({ className, loading = false, ...props }, ref) => (
  <BaseSwitch.Root
    className={cn(
      'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-[var(--interactive-border)]',
      className
    )}
    style={{ width: '36px', height: '20px', minWidth: '36px', minHeight: '20px' }}
    {...props}
    aria-busy={loading || undefined}
    onClick={(event) => {
      if (props.disabled || props.readOnly) return;
      // Drive the toggle from the source of truth instead of Base UI's hidden
      // checkbox: Base UI flips it by dispatching a synthetic
      // PointerEvent('click'), which does not activate a React-controlled
      // checkbox in the WebView Chromium used on the tablets, so the switch
      // never toggles on touch. mergeProps runs handlers right-to-left and this
      // one sits right of Base UI's internal click, so prevent the internal
      // dispatch from running too — no double toggle where it would work.
      (props.onCheckedChange as ((checked: boolean) => void) | undefined)?.(!props.checked);
      event.preventDefault();
      (event as unknown as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
    }}
    ref={ref}
  >
    <BaseSwitch.Thumb
      className={cn(
        'pointer-events-none flex items-center justify-center rounded-full bg-background shadow-none ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0',
        loading && 'bg-status-warning text-background',
      )}
      style={{ width: '16px', height: '16px', minWidth: '16px', minHeight: '16px' }}
    >
      {loading ? <Icon name="loader" className="size-3 animate-spin" /> : null}
    </BaseSwitch.Thumb>
  </BaseSwitch.Root>
));
Switch.displayName = 'Switch';

export { Switch };
