import { afterEach, describe, expect, test } from 'bun:test';

import { notifySessionSwipeReady } from './mobileHaptics';

describe('mobile session swipe haptics', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  test('uses the browser vibration fallback without delaying the caller', () => {
    const durations: number[] = [];
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { vibrate: (duration: number) => durations.push(duration) },
    });

    notifySessionSwipeReady();

    expect(durations).toEqual([10]);
  });
});
