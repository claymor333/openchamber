import React from 'react';

import type { ContextZone } from '@/lib/workspace/zones';

import { getContextPanelResizeDelta } from './contextPanelResize';

const RESIZE_FOLLOW_INTERVAL_MS = 100;

type UseContextPanelResizeOptions = {
  zone: ContextZone;
  touchTargets: boolean;
  isOpen: boolean;
  isExpanded: boolean;
  isVertical: boolean;
  isTreeOnly: boolean;
  directoryKey: string;
  size: number;
  sizeVariable: string;
  panelRef: React.RefObject<HTMLElement | null>;
  handleRef: React.RefObject<HTMLElement | null>;
  otherSideRef: React.RefObject<number>;
  clampSizeForDrag: (size: number, available: number | null) => number;
  setContextZoneSize: (directory: string, zone: ContextZone, size: number) => void;
  setContextEditorTreeWidth: (size: number) => void;
  isRtl: boolean;
};

export const useContextPanelResize = ({
  zone,
  touchTargets,
  isOpen,
  isExpanded,
  isVertical,
  isTreeOnly,
  directoryKey,
  size,
  sizeVariable,
  panelRef,
  handleRef,
  otherSideRef,
  clampSizeForDrag,
  setContextZoneSize,
  setContextEditorTreeWidth,
  isRtl,
}: UseContextPanelResizeOptions) => {
  const [isResizing, setIsResizing] = React.useState(false);
  const startPointerRef = React.useRef(0);
  const startSizeRef = React.useRef(size);
  const resizingSizeRef = React.useRef<number | null>(null);
  const resizeAvailableSizeRef = React.useRef<number | null>(null);
  const resizeFollowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeResizePointerIDRef = React.useRef<number | null>(null);
  const activeResizeHandleRef = React.useRef<HTMLElement | null>(null);

  const applyFollowSize = React.useCallback(() => {
    resizeFollowTimerRef.current = null;
    const panel = panelRef.current;
    const next = resizingSizeRef.current;
    if (!panel || next === null) return;
    panel.style.setProperty(sizeVariable, `${next}px`);
  }, [panelRef, sizeVariable]);

  const finishResize = React.useCallback(() => {
    const pointerId = activeResizePointerIDRef.current;
    if (pointerId === null) return;

    const finalSize = clampSizeForDrag(resizingSizeRef.current ?? size, resizeAvailableSizeRef.current);
    // Restore the committed slot size after any deferred desktop follow, even
    // when the final gesture returns to its starting size.
    panelRef.current?.style.setProperty(sizeVariable, `${finalSize}px`);
    resizeAvailableSizeRef.current = null;
    resizingSizeRef.current = null;
    if (resizeFollowTimerRef.current !== null) {
      clearTimeout(resizeFollowTimerRef.current);
      resizeFollowTimerRef.current = null;
    }

    try {
      const activeHandle = activeResizeHandleRef.current ?? handleRef.current;
      if (activeHandle?.hasPointerCapture(pointerId)) {
        activeHandle.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may already have released capture after pointerup/cancel.
    }

    document.documentElement.style.cursor = '';
    const changed = finalSize !== startSizeRef.current;
    activeResizePointerIDRef.current = null;
    activeResizeHandleRef.current = null;
    if (changed) {
      if (isTreeOnly) {
        setContextEditorTreeWidth(finalSize);
      } else if (directoryKey) {
        setContextZoneSize(directoryKey, zone, finalSize);
      }
    }
    setIsResizing(false);
  }, [clampSizeForDrag, directoryKey, handleRef, isTreeOnly, panelRef, setContextEditorTreeWidth, setContextZoneSize, size, sizeVariable, zone]);

  React.useEffect(() => () => {
    if (resizeFollowTimerRef.current !== null) {
      clearTimeout(resizeFollowTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!touchTargets || !isResizing) return undefined;
    if (!isOpen || isExpanded || !directoryKey) {
      finishResize();
      return undefined;
    }

    // A layout handoff can detach the zone during a live drag. Commit its last
    // clamped size and restore the cursor before the zone tears down.
    return () => {
      if (activeResizePointerIDRef.current !== null) finishResize();
    };
  }, [directoryKey, finishResize, isExpanded, isOpen, isResizing, touchTargets]);

  const handleResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isOpen || isExpanded || !directoryKey) return;

    if (touchTargets) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is unavailable in a few embedded browser versions.
      }
    }
    activeResizePointerIDRef.current = event.pointerId;
    activeResizeHandleRef.current = event.currentTarget;
    startPointerRef.current = isVertical ? event.clientY : event.clientX;
    startSizeRef.current = size;
    resizingSizeRef.current = size;
    // Cache the available space once; pointermove performs no layout reads.
    const available = isVertical
      ? panelRef.current?.parentElement?.clientHeight
      : (panelRef.current?.closest<HTMLElement>('[data-workspace-row]')?.clientWidth ?? 0) - otherSideRef.current;
    resizeAvailableSizeRef.current = available && available > 0 ? available : null;
    document.documentElement.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    event.preventDefault();
    setIsResizing(true);
  }, [directoryKey, isExpanded, isOpen, isVertical, otherSideRef, panelRef, size, touchTargets]);

  React.useLayoutEffect(() => {
    if (!isResizing) return undefined;

    const handleMove = (event: PointerEvent) => {
      if (activeResizePointerIDRef.current !== event.pointerId) return;
      const pointer = isVertical ? event.clientY : event.clientX;
      const delta = getContextPanelResizeDelta(zone, isRtl, startPointerRef.current, pointer);
      const nextSize = clampSizeForDrag(startSizeRef.current + delta, resizeAvailableSizeRef.current);
      if (resizingSizeRef.current === nextSize) return;
      resizingSizeRef.current = nextSize;

      if (touchTargets) {
        // The outer panel owns the slot size. Updating it lets flex layout
        // reflow the chat, card and mounted surface on every pointermove.
        panelRef.current?.style.setProperty(sizeVariable, `${nextSize}px`);
        return;
      }

      // Desktop retains its deferred 100ms layout follow and transition.
      if (resizeFollowTimerRef.current === null) {
        resizeFollowTimerRef.current = setTimeout(applyFollowSize, RESIZE_FOLLOW_INTERVAL_MS);
      }
    };

    const handleUp = (event: PointerEvent) => {
      if (activeResizePointerIDRef.current !== event.pointerId) return;
      finishResize();
    };

    const handleWindowBlur = () => finishResize();

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [applyFollowSize, clampSizeForDrag, finishResize, isResizing, isRtl, isVertical, panelRef, sizeVariable, touchTargets, zone]);

  React.useEffect(() => {
    if (isResizing) return;
    document.documentElement.style.cursor = '';
  }, [isResizing]);

  return {
    isResizing,
    isImmediateResize: touchTargets && isResizing,
    onPointerDown: handleResizeStart,
  };
};
