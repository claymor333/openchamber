import React from 'react';

import { cn } from '@/lib/utils';
import type { ContextZone } from '@/lib/workspace/zones';
import { getContextPanelResizeHandleClassName } from './contextPanelResize';

type ContextPanelResizeHandleProps = {
  zone: ContextZone;
  touchTargets: boolean;
  active: boolean;
  ariaLabel: string;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
};

export const ContextPanelResizeHandle = React.forwardRef<HTMLDivElement, ContextPanelResizeHandleProps>((
  { zone, touchTargets, active, ariaLabel, onPointerDown },
  ref,
) => {
  if (!active) return null;

  return (
    <div
      ref={ref}
      data-context-resize-handle={zone}
      className={cn(getContextPanelResizeHandleClassName(zone, touchTargets))}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={zone === 'bottom' ? 'horizontal' : 'vertical'}
      aria-label={ariaLabel}
    >
      {touchTargets ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute bg-border',
            zone === 'bottom'
              ? 'inset-x-0 top-[20px] h-px'
              : 'inset-y-0 inset-s-[20px] w-px',
          )}
        />
      ) : null}
    </div>
  );
});

ContextPanelResizeHandle.displayName = 'ContextPanelResizeHandle';
