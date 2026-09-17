import { describe, expect, test } from 'bun:test';

import {
  beginMobileSessionSwipeGesture,
  finishMobileSessionSwipeGesture,
  MOBILE_SESSION_SWIPE_THRESHOLD_PX,
  updateMobileSessionSwipeGesture,
  shouldNotifyMobileSessionSwipeReady,
  ownsMobileSessionSwipePointerCapture,
} from './mobileSessionSwipe';

describe('mobile session swipe gesture state', () => {
  test('ignores implicit capture loss bubbling from a button', () => {
    const header = new EventTarget();
    const button = new EventTarget();

    expect(ownsMobileSessionSwipePointerCapture(header, header)).toBe(true);
    expect(ownsMobileSessionSwipePointerCapture(button, header)).toBe(false);
  });

  test('locks vertical movement out of the session gesture', () => {
    const started = beginMobileSessionSwipeGesture(1, 100, 100);
    const moved = updateMobileSessionSwipeGesture(started, 104, 130, () => true);

    expect(moved.phase).toBe('cancelled');
    expect(moved.thresholdCrossed).toBe(false);
    expect(moved.readyToCommit).toBe(false);
  });

  test('crosses the threshold only when the final direction has a target', () => {
    const started = beginMobileSessionSwipeGesture(1, 100, 100);
    const crossed = updateMobileSessionSwipeGesture(
      started,
      100 - MOBILE_SESSION_SWIPE_THRESHOLD_PX,
      100,
      (direction) => direction === 'next',
    );
    expect(crossed.direction).toBe('next');
    expect(crossed.thresholdCrossed).toBe(true);
    expect(crossed.readyToCommit).toBe(true);
    expect(shouldNotifyMobileSessionSwipeReady(started, crossed)).toBe(true);

    const reversed = updateMobileSessionSwipeGesture(
      crossed,
      100 + MOBILE_SESSION_SWIPE_THRESHOLD_PX,
      100,
      (direction) => direction === 'previous',
    );
    expect(reversed.direction).toBe('previous');
    expect(reversed.readyToCommit).toBe(true);
    expect(shouldNotifyMobileSessionSwipeReady(crossed, reversed)).toBe(false);
    expect(finishMobileSessionSwipeGesture(reversed).phase).toBe('committing');
  });

  test('a short release rebounds without committing', () => {
    const started = beginMobileSessionSwipeGesture(1, 100, 100);
    const moved = updateMobileSessionSwipeGesture(started, 130, 100, () => true);

    expect(finishMobileSessionSwipeGesture(moved).phase).toBe('rebounding');
  });
});
