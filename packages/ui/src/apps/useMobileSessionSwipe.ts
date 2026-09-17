import React from 'react';

import { notifySessionSwipeReady } from './mobileHaptics';
import {
  beginMobileSessionSwipeGesture,
  finishMobileSessionSwipeGesture,
  MOBILE_SESSION_SWIPE_REBOUND_MS,
  MOBILE_SESSION_SWIPE_SLOP_PX,
  MOBILE_SESSION_SWIPE_THRESHOLD_PX,
  type MobileSessionSwipeDirection,
  type MobileSessionSwipeGestureState,
  type MobileSessionSwipeModel,
  type MobileSessionSwipeTarget,
  INITIAL_MOBILE_SESSION_SWIPE_GESTURE,
  updateMobileSessionSwipeGesture,
  shouldNotifyMobileSessionSwipeReady,
  ownsMobileSessionSwipePointerCapture,
} from './mobileSessionSwipe';

export type MobileSessionSwipeHookOptions = {
  model: MobileSessionSwipeModel;
  runtimeKey: string;
  disabled?: boolean;
  onClosePopovers?: () => void;
  onGestureActiveChange?: (active: boolean) => void;
  onCommit?: (
    target: MobileSessionSwipeTarget,
    capturedModel: MobileSessionSwipeModel,
    direction: MobileSessionSwipeDirection,
  ) => void;
};

export type MobileSessionSwipeHookResult = {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  surfaceProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (event: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  };
  isDragging: boolean;
  readyToCommit: boolean;
  thresholdCrossed: boolean;
  direction: MobileSessionSwipeDirection | null;
  previewTarget: MobileSessionSwipeTarget | null;
  boundary: boolean;
  unknownBoundary: boolean;
};

const clearTransform = (surface: HTMLElement | null, animate: boolean): void => {
  if (!surface) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  surface.style.transition = animate && !reducedMotion
    ? `transform ${MOBILE_SESSION_SWIPE_REBOUND_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
    : 'none';
  surface.style.transform = 'translate3d(0, 0, 0)';
  if (!animate || reducedMotion) {
    surface.style.transition = '';
  }
};

const applyTransform = (surface: HTMLElement | null, displacementX: number): void => {
  if (!surface) return;
  const bounded = Math.sign(displacementX) * Math.min(
    Math.abs(displacementX),
    MOBILE_SESSION_SWIPE_THRESHOLD_PX + MOBILE_SESSION_SWIPE_SLOP_PX * 4,
  );
  if (surface.style.transition !== 'none') surface.style.transition = 'none';
  surface.style.transform = `translate3d(${bounded}px, 0, 0)`;
};

export const useMobileSessionSwipe = (
  options: MobileSessionSwipeHookOptions,
): MobileSessionSwipeHookResult => {
  const { disabled = false, model, onClosePopovers, onCommit, onGestureActiveChange, runtimeKey } = options;
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const stateRef = React.useRef<MobileSessionSwipeGestureState>(INITIAL_MOBILE_SESSION_SWIPE_GESTURE);
  const capturedModelRef = React.useRef<MobileSessionSwipeModel | null>(null);
  const currentModelRef = React.useRef(model);
  currentModelRef.current = model;
  const candidateRef = React.useRef<MobileSessionSwipeTarget | null>(null);
  const reboundTimerRef = React.useRef<number | null>(null);
  const pendingMoveRef = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const moveFrameRef = React.useRef<number | null>(null);
  const capturedTargetCacheRef = React.useRef(new Map<MobileSessionSwipeDirection, MobileSessionSwipeTarget | null>());
  const buttonSourceRef = React.useRef(false);
  const dragActiveRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);
  const [renderState, setRenderState] = React.useState<MobileSessionSwipeGestureState>(INITIAL_MOBILE_SESSION_SWIPE_GESTURE);
  const [previewTarget, setPreviewTarget] = React.useState<MobileSessionSwipeTarget | null>(null);

  const clearReboundTimer = React.useCallback(() => {
    if (reboundTimerRef.current !== null) {
      window.clearTimeout(reboundTimerRef.current);
      reboundTimerRef.current = null;
    }
  }, []);

  const finishGesture = React.useCallback((animate: boolean) => {
    clearReboundTimer();
    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    pendingMoveRef.current = null;
    const surface = surfaceRef.current;
    stateRef.current = INITIAL_MOBILE_SESSION_SWIPE_GESTURE;
    buttonSourceRef.current = false;
    dragActiveRef.current = false;
    suppressClickRef.current = false;
    capturedModelRef.current = null;
    candidateRef.current = null;
    setPreviewTarget(null);
    setRenderState(INITIAL_MOBILE_SESSION_SWIPE_GESTURE);
    onGestureActiveChange?.(false);
    if (!animate) return clearTransform(surface, false);
    clearTransform(surface, true);
    reboundTimerRef.current = window.setTimeout(() => {
      reboundTimerRef.current = null;
      clearTransform(surface, false);
    }, MOBILE_SESSION_SWIPE_REBOUND_MS);
  }, [clearReboundTimer, onGestureActiveChange]);

  const cancelGesture = React.useCallback(() => {
    if (stateRef.current.phase === 'idle') return;
    finishGesture(true);
  }, [finishGesture]);

  React.useEffect(() => () => {
    clearReboundTimer();
    if (moveFrameRef.current !== null) window.cancelAnimationFrame(moveFrameRef.current);
    pendingMoveRef.current = null;
    clearTransform(surfaceRef.current, false);
    onGestureActiveChange?.(false);
  }, [clearReboundTimer, onGestureActiveChange]);

  React.useEffect(() => {
    const cancel = () => cancelGesture();
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') cancel();
    };
    window.addEventListener('pagehide', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cancelGesture]);

  React.useEffect(() => {
    if (stateRef.current.phase === 'idle') return;
    const capturedModel = capturedModelRef.current;
    if (!capturedModel || capturedModel.runtimeKey !== runtimeKey) {
      cancelGesture();
      return;
    }
    const currentModel = currentModelRef.current;
    if (capturedModel.revision === currentModel.revision) return;
    const capturedScope = capturedModel.currentRootSessionId
      ? capturedModel.scopeForTarget(capturedModel.currentRootSessionId)
      : null;
    const currentScope = currentModel.currentRootSessionId
      ? currentModel.scopeForTarget(currentModel.currentRootSessionId)
      : null;
    if (capturedModel.currentRootSessionId !== currentModel.currentRootSessionId
      || !currentScope
      || currentScope.completeness !== 'ready'
      || capturedScope?.identity.folderScopeKey !== currentScope.identity.folderScopeKey) {
      cancelGesture();
    }
  }, [cancelGesture, model.currentRootSessionId, model.revision, runtimeKey]);

  React.useEffect(() => {
    if (disabled) cancelGesture();
  }, [cancelGesture, disabled]);

  const resolveCapturedTarget = React.useCallback((direction: MobileSessionSwipeDirection): MobileSessionSwipeTarget | null => {
    const capturedModel = capturedModelRef.current;
    if (!capturedModel) return null;
    const cached = capturedTargetCacheRef.current;
    if (cached.has(direction)) return cached.get(direction) ?? null;
    const target = capturedModel.resolveTarget(direction);
    cached.set(direction, target);
    return target;
  }, []);

  const update = React.useCallback((pointerId: number, clientX: number, clientY: number) => {
    const state = stateRef.current;
    const capturedModel = capturedModelRef.current;
    if (!capturedModel || state.pointerId !== pointerId) return;
    const next = updateMobileSessionSwipeGesture(
      state,
      clientX,
      clientY,
      (direction) => resolveCapturedTarget(direction) !== null,
    );
    stateRef.current = next;
    if (next.phase !== 'tracking') applyTransform(surfaceRef.current, next.displacementX);

    const candidate = next.direction ? resolveCapturedTarget(next.direction) : null;
    if (candidate?.id !== candidateRef.current?.id) {
      candidateRef.current = candidate;
      setPreviewTarget(candidate);
    }
    if (next.phase === 'cancelled') {
      cancelGesture();
      return;
    }

    if (shouldNotifyMobileSessionSwipeReady(state, next)) {
      stateRef.current = { ...next, hapticSent: true };
      setRenderState({ ...next, hapticSent: true });
      notifySessionSwipeReady();
      return;
    }
    if (next.phase !== state.phase
      || next.readyToCommit !== state.readyToCommit
      || next.thresholdCrossed !== state.thresholdCrossed
      || next.direction !== state.direction) {
      setRenderState(next);
    }
  }, [cancelGesture, resolveCapturedTarget]);

  const isDragRegionEvent = (event: React.PointerEvent<HTMLElement>): boolean => (
    event.target instanceof Element
      && Boolean(event.target.closest('[data-mobile-header-drag-region="true"]'))
  );

  const beginGesture = React.useCallback((event: React.PointerEvent<HTMLElement>, fromButton: boolean) => {
    if (disabled || !event.isPrimary || event.button !== 0 || stateRef.current.phase !== 'idle') {
      if (stateRef.current.phase !== 'idle') cancelGesture();
      return;
    }
    buttonSourceRef.current = fromButton;
    dragActiveRef.current = !fromButton;
    if (!fromButton) {
      onGestureActiveChange?.(true);
      onClosePopovers?.();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    capturedModelRef.current = model;
    capturedTargetCacheRef.current.clear();
    stateRef.current = beginMobileSessionSwipeGesture(event.pointerId, event.clientX, event.clientY);
    candidateRef.current = null;
    setPreviewTarget(null);
    setRenderState(stateRef.current);
  }, [cancelGesture, disabled, model, onClosePopovers, onGestureActiveChange]);

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isDragRegionEvent(event)) {
      if (stateRef.current.phase === 'idle') beginGesture(event, false);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    beginGesture(event, Boolean(target?.closest('button')));
  }, [beginGesture]);

  const promoteButtonGesture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = stateRef.current;
    if (!buttonSourceRef.current || dragActiveRef.current || state.phase !== 'tracking' || state.pointerId !== event.pointerId) return;
    const displacementX = event.clientX - state.startX;
    const displacementY = event.clientY - state.startY;
    if (Math.abs(displacementX) <= MOBILE_SESSION_SWIPE_SLOP_PX
      || Math.abs(displacementX) <= Math.abs(displacementY)) return;
    dragActiveRef.current = true;
    suppressClickRef.current = true;
    onGestureActiveChange?.(true);
    onClosePopovers?.();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [onClosePopovers, onGestureActiveChange]);

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = stateRef.current;
    if (!capturedModelRef.current || state.phase === 'idle' || state.pointerId !== event.pointerId) return;
    promoteButtonGesture(event);
    pendingMoveRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    if (moveFrameRef.current !== null) return;
    moveFrameRef.current = window.requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending) update(pending.pointerId, pending.x, pending.y);
    });
  }, [promoteButtonGesture, update]);

  const onPointerUp = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = stateRef.current;
    const capturedModel = capturedModelRef.current;
    if (!capturedModel || state.pointerId !== event.pointerId) return;
    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending && pending.pointerId === event.pointerId) {
      update(pending.pointerId, pending.x, pending.y);
    }
    if (stateRef.current.phase !== 'idle') update(event.pointerId, event.clientX, event.clientY);
    const finalState = stateRef.current;
    if (finalState.phase === 'idle') return;
    const target = candidateRef.current;
    const direction = finalState.direction;
    if (finalState.readyToCommit && target && direction) {
      stateRef.current = finishMobileSessionSwipeGesture(finalState);
      setRenderState(stateRef.current);
      onGestureActiveChange?.(false);
      clearTransform(surfaceRef.current, false);
      onCommit?.(target, capturedModel, direction);
      stateRef.current = INITIAL_MOBILE_SESSION_SWIPE_GESTURE;
      capturedModelRef.current = null;
      candidateRef.current = null;
      setPreviewTarget(null);
      setRenderState(INITIAL_MOBILE_SESSION_SWIPE_GESTURE);
      return;
    }
    finishGesture(true);
  }, [finishGesture, onCommit, onGestureActiveChange, update]);

  const onPointerCancel = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (stateRef.current.pointerId !== event.pointerId) return;
    const shouldClosePopover = buttonSourceRef.current;
    cancelGesture();
    if (shouldClosePopover) onClosePopovers?.();
  }, [cancelGesture, onClosePopovers]);
  const onLostPointerCapture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Buttons implicitly capture a touch pointer. Their capture is released
    // when a drag leaves the button, and that bubbled event must not cancel the
    // header gesture before the header takes capture for itself.
    if (!ownsMobileSessionSwipePointerCapture(event.target, event.currentTarget)) return;
    cancelGesture();
  }, [cancelGesture]);
  const onClickCapture = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    surfaceRef,
    surfaceProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onClickCapture,
    },
    isDragging: renderState.phase !== 'idle',
    readyToCommit: renderState.readyToCommit,
    thresholdCrossed: renderState.thresholdCrossed,
    direction: renderState.direction,
    previewTarget,
    boundary: renderState.direction !== null && !renderState.readyToCommit,
    unknownBoundary: renderState.direction !== null
      && Boolean(capturedModelRef.current?.directionState(renderState.direction) === 'unknown'),
  };
};
