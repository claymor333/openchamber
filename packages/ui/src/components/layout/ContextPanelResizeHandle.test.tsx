import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { ContextPanelResizeHandle } from './ContextPanelResizeHandle';
import { getContextPanelResizeDelta, getContextPanelResizeHandleClassName } from './contextPanelResize';

describe('ContextPanelResizeHandle', () => {
  let win: Window;
  let container: HTMLElement;
  let root: Root;
  let restoreGlobals: () => void;

  const render = async (
    zone: 'left' | 'right' | 'bottom',
    touchTargets: boolean,
    active = true,
  ) => {
    await act(async () => root.render(
      <ContextPanelResizeHandle
        zone={zone}
        touchTargets={touchTargets}
        active={active}
        ariaLabel="Resize panel"
        onPointerDown={() => undefined}
      />,
    ));
  };

  beforeEach(() => {
    win = new Window({ url: 'http://localhost' });
    const values = {
      window: win,
      document: win.document,
      navigator: win.navigator,
      Node: win.Node,
      Element: win.Element,
      HTMLElement: win.HTMLElement,
      Event: win.Event,
      MouseEvent: win.MouseEvent,
      getComputedStyle: win.getComputedStyle.bind(win),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    restoreGlobals = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('keeps desktop handles compact and touch targets 40 CSS pixels wide', () => {
    expect(getContextPanelResizeHandleClassName('left', false)).toContain('w-2');
    expect(getContextPanelResizeHandleClassName('right', false)).toContain('w-2');
    expect(getContextPanelResizeHandleClassName('bottom', false)).toContain('h-2');
    expect(getContextPanelResizeHandleClassName('left', false)).not.toContain('touch-none');

    const leftTouchClass = getContextPanelResizeHandleClassName('left', true);
    const rightTouchClass = getContextPanelResizeHandleClassName('right', true);
    const bottomTouchClass = getContextPanelResizeHandleClassName('bottom', true);
    expect(leftTouchClass).toContain('-inset-e-[20px]');
    expect(rightTouchClass).toContain('-inset-s-[20px]');
    expect(bottomTouchClass).toContain('-top-[20px]');
    for (const className of [leftTouchClass, rightTouchClass]) {
      expect(className).toContain('w-[40px]');
      expect(className).toContain('touch-none');
      expect(className).toContain('z-50');
    }
    expect(bottomTouchClass).toContain('h-[40px]');
    expect(bottomTouchClass).toContain('touch-none');
    expect(bottomTouchClass).toContain('z-50');
  });

  test('shows a one-pixel divider centered on the visible edge', async () => {
    await render('right', true);
    const handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    const divider = handle?.firstElementChild as HTMLElement | null;
    expect(handle?.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle?.getAttribute('role')).toBe('separator');
    expect(divider?.className).toContain('inset-s-[20px]');
    expect(divider?.className).toContain('w-px');

    await render('bottom', true);
    const horizontalDivider = container.querySelector<HTMLElement>('[data-context-resize-handle="bottom"]')?.firstElementChild as HTMLElement | null;
    expect(horizontalDivider?.className).toContain('top-[20px]');
    expect(horizontalDivider?.className).toContain('h-px');
  });

  test('does not leave a separator hit target while the zone is closed or expanded', async () => {
    await render('left', true, false);
    expect(container.querySelector('[data-context-resize-handle]')).toBeNull();
  });

  test('grows toward chat in both directions and mirrors horizontal signs in RTL', () => {
    expect(getContextPanelResizeDelta('left', false, 100, 140)).toBe(40);
    expect(getContextPanelResizeDelta('right', false, 100, 60)).toBe(40);
    expect(getContextPanelResizeDelta('bottom', false, 100, 60)).toBe(40);
    expect(getContextPanelResizeDelta('left', true, 100, 60)).toBe(40);
    expect(getContextPanelResizeDelta('right', true, 100, 140)).toBe(40);
    expect(getContextPanelResizeDelta('bottom', true, 100, 60)).toBe(40);
    expect(getContextPanelResizeDelta('left', false, 100, 60)).toBe(-40);
  });
});
