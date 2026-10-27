import type { ContextZone } from '@/lib/workspace/zones';

const DESKTOP_HANDLE_CLASSES = {
  right: 'absolute bottom-2 inset-s-1 top-0 z-50 w-2 cursor-col-resize',
  left: 'absolute bottom-2 inset-e-1 top-0 z-50 w-2 cursor-col-resize',
  bottom: 'absolute inset-x-0 top-1 z-50 h-2 cursor-row-resize',
} satisfies Record<ContextZone, string>;

const TOUCH_HANDLE_CLASSES = {
  right: 'absolute -inset-s-[20px] bottom-0 top-0 z-50 w-[40px] cursor-col-resize touch-none',
  left: 'absolute -inset-e-[20px] bottom-0 top-0 z-50 w-[40px] cursor-col-resize touch-none',
  bottom: 'absolute -top-[20px] inset-x-0 z-50 h-[40px] cursor-row-resize touch-none',
} satisfies Record<ContextZone, string>;

export const getContextPanelResizeHandleClassName = (zone: ContextZone, touchTargets: boolean): string => (
  touchTargets ? TOUCH_HANDLE_CLASSES[zone] : DESKTOP_HANDLE_CLASSES[zone]
);

/** Positive deltas grow a zone toward the chat; logical sides mirror in RTL. */
export const getContextPanelResizeDelta = (
  zone: ContextZone,
  isRtl: boolean,
  start: number,
  current: number,
): number => {
  const towardChat = zone === 'left' ? current - start : start - current;
  return zone !== 'bottom' && isRtl ? -towardChat : towardChat;
};
