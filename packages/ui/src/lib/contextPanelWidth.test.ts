import { describe, expect, test } from 'bun:test';

import { resolveContextPanelWidth } from './contextPanelWidth';

describe('resolveContextPanelWidth', () => {
  test('embeddedWidth wins when provided', () => {
    expect(resolveContextPanelWidth({ embeddedWidth: 480, manualWidth: 300, widthFraction: 0.5, fallbackBase: 1000, clamp: (w) => w })).toBe(480);
  });

  test('manual width used when embeddedWidth absent', () => {
    expect(resolveContextPanelWidth({ embeddedWidth: undefined, manualWidth: 320, widthFraction: 0.5, fallbackBase: 1000, clamp: (w) => w })).toBe(320);
  });

  test('fraction fallback when neither embedded nor manual', () => {
    expect(resolveContextPanelWidth({ embeddedWidth: undefined, manualWidth: undefined, widthFraction: 0.5, fallbackBase: 1000, clamp: (w) => w })).toBe(500);
  });

  test('result passes through the clamp', () => {
    const clamp = (w: number) => Math.min(w, 400);
    expect(resolveContextPanelWidth({ embeddedWidth: undefined, manualWidth: undefined, widthFraction: 0.6, fallbackBase: 1000, clamp })).toBe(400);
  });
});
