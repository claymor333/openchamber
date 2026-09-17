import { isCapacitorApp } from '@/lib/platform';

/**
 * Device feedback for crossing the session-swipe threshold. Native haptics are
 * intentionally kept behind this adapter so a failed plugin import can never
 * block or delay navigation.
 */
export const notifySessionSwipeReady = (): void => {
  if (isCapacitorApp()) {
    void import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => undefined);
    return;
  }

  try {
    globalThis.navigator?.vibrate?.(10);
  } catch {
    // Unsupported browser implementations are best-effort no-ops.
  }
};
