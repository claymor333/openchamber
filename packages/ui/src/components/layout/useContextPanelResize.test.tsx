import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { ContextPanelResizeHandle } from './ContextPanelResizeHandle';
import { useContextPanelResize } from './useContextPanelResize';
import type { ContextZone } from '@/lib/workspace/zones';

type ResizeCommit = { directory: string; zone: ContextZone; size: number };

type ResizeHarnessProps = {
  commits: ResizeCommit[];
  zone?: ContextZone;
  touchTargets?: boolean;
  isRtl?: boolean;
  isOpen?: boolean;
  isExpanded?: boolean;
};

const ResizeHarness: React.FC<ResizeHarnessProps> = ({
  commits,
  zone = 'right',
  touchTargets = true,
  isRtl = false,
  isOpen = true,
  isExpanded = false,
}) => {
  const [size, setSize] = React.useState(500);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const handleRef = React.useRef<HTMLDivElement | null>(null);
  const otherSideRef = React.useRef(100);
  const isVertical = zone === 'bottom';
  const sizeVariable = isVertical ? '--oc-context-panel-height' : '--oc-context-panel-width';
  const clampSizeForDrag = React.useCallback((next: number, available: number | null) => {
    const max = available === null ? 580 : Math.max(320, available - 320);
    return Math.min(max, Math.max(320, Math.round(next)));
  }, []);
  const commit = React.useCallback((directory: string, committedZone: ContextZone, nextSize: number) => {
    commits.push({ directory, zone: committedZone, size: nextSize });
    setSize(nextSize);
  }, [commits]);
  const resize = useContextPanelResize({
    zone,
    touchTargets,
    isOpen,
    isExpanded,
    isVertical,
    isTreeOnly: false,
    directoryKey: '/test-project',
    size,
    sizeVariable,
    panelRef,
    handleRef,
    otherSideRef,
    clampSizeForDrag,
    setContextZoneSize: commit,
    setContextEditorTreeWidth: (nextSize) => commit('/test-project', zone, nextSize),
    isRtl,
  });

  return (
    <div
      data-workspace-row
      style={{ display: 'flex', flexDirection: isVertical ? 'column' : 'row', position: 'relative' }}
      ref={(element) => {
        if (!element) return;
        Object.defineProperty(element, 'clientWidth', { configurable: true, value: 1000 });
        Object.defineProperty(element, 'clientHeight', { configurable: true, value: 900 });
      }}
    >
      <div
        data-resize-chat=""
        style={{ flex: '1 1 0%', minWidth: 0, minHeight: 0 }}
      />
      <aside
        ref={(element) => { panelRef.current = element; }}
        data-resize-slot=""
        style={{
          [sizeVariable]: `${size}px`,
          ...(isVertical ? { height: `min(var(${sizeVariable}), 100%)` } : { width: `min(var(${sizeVariable}), 100%)` }),
          flexShrink: 0,
          transitionDuration: resize.isImmediateResize ? '0ms' : '200ms',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          data-resize-card=""
          style={{
            flex: '0 0 auto',
            ...(isVertical ? { height: `var(${sizeVariable})` } : { width: `var(${sizeVariable})` }),
          }}
        />
        <div data-resize-body="" style={{ flex: '1 1 0%', minWidth: 0, minHeight: 0 }} />
        <ContextPanelResizeHandle
          ref={handleRef}
          zone={zone}
          touchTargets={touchTargets}
          active={isOpen && !isExpanded}
          ariaLabel="Resize panel"
          onPointerDown={resize.onPointerDown}
        />
      </aside>
      <output data-size="">{size}</output>
      <output data-resizing="">{String(resize.isResizing)}</output>
      <output data-immediate-resize="">{String(resize.isImmediateResize)}</output>
    </div>
  );
};

describe('useContextPanelResize', () => {
  let win: Window;
  let container: HTMLElement;
  let root: Root | null;
  let renderKey = 0;
  let restoreGlobals: () => void;

  const render = async (props: ResizeHarnessProps) => {
    renderKey += 1;
    await act(async () => root?.render(<ResizeHarness key={renderKey} {...props} />));
  };

  const rerender = async (props: ResizeHarnessProps) => {
    await act(async () => root?.render(<ResizeHarness key={renderKey} {...props} />));
  };

  const pointerEvent = (type: string, pointerId: number, clientX: number, clientY = 100) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: 'touch' },
      clientX: { value: clientX },
      clientY: { value: clientY },
    });
    return event;
  };

  const dispatch = async (target: EventTarget, type: string, pointerId: number, x: number, y = 100) => {
    await act(async () => target.dispatchEvent(pointerEvent(type, pointerId, x, y)));
  };

  const addPointerCapture = (handle: HTMLElement) => {
    const captured = new Set<number>();
    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value: (pointerId: number) => captured.add(pointerId) },
      hasPointerCapture: { configurable: true, value: (pointerId: number) => captured.has(pointerId) },
      releasePointerCapture: { configurable: true, value: (pointerId: number) => captured.delete(pointerId) },
    });
    return captured;
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
    if (root) await act(async () => root?.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('live hybrid drag resizes the actual slot on each move and commits once on cancel', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits });
    const handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    const captured = addPointerCapture(handle!);
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');
    const card = container.querySelector<HTMLElement>('[data-resize-card]');
    const body = container.querySelector<HTMLElement>('[data-resize-body]');
    const chat = container.querySelector<HTMLElement>('[data-resize-chat]');
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');

    await dispatch(handle!, 'pointerdown', 7, 100);
    expect(captured.has(7)).toBe(true);
    expect(container.querySelector('[data-resizing]')?.textContent).toBe('true');
    expect(panel?.style.transitionDuration).toBe('0ms');

    await dispatch(window, 'pointermove', 7, 60);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('540px');
    expect(commits).toHaveLength(0);
    await dispatch(window, 'pointermove', 7, 40);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('560px');
    expect(commits).toHaveLength(0);
    await dispatch(window, 'pointermove', 7, 70);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('530px');
    expect(commits).toHaveLength(0);

    // The content remains a flex child of the live-sized slot; it is never
    // assigned a starting width while the drag is active.
    expect(body?.style.width).toBe('');
    expect(body?.style.flex).toBe('1 1 0%');
    expect(chat?.style.flex).toBe('1 1 0%');
    expect(card?.style.transform).toBe('');
    expect(handle?.style.transform).toBe('');
    expect(container.querySelector('[data-context-resize-placeholder]')).toBeNull();

    await dispatch(window, 'pointercancel', 7, 70);
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 530 }]);
    expect(container.querySelector('[data-size]')?.textContent).toBe('530');
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('530px');
    expect(captured.has(7)).toBe(false);
    expect(panel?.style.transitionDuration).toBe('200ms');
    expect(container.querySelector('[data-resizing]')?.textContent).toBe('false');
    expect(document.documentElement.style.cursor).toBe('');
  });

  test('a no-op hybrid gesture releases capture without writing the owner store', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits });
    const handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    const captured = addPointerCapture(handle!);
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');

    await dispatch(handle!, 'pointerdown', 8, 100);
    await dispatch(window, 'pointerup', 8, 100);

    expect(commits).toHaveLength(0);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
    expect(captured.has(8)).toBe(false);
  });

  test('a no-op desktop gesture leaves the deferred size and owner store untouched', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits, touchTargets: false });
    const handle = container.querySelector('[data-context-resize-handle="right"]');
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');

    await dispatch(handle!, 'pointerdown', 18, 100);
    await dispatch(window, 'pointerup', 18, 100);

    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
    expect(commits).toHaveLength(0);
  });

  test('a vertical touch on a side handle changes no size and writes no preference', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits, zone: 'left' });
    const handle = container.querySelector('[data-context-resize-handle="left"]');
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');

    await dispatch(handle!, 'pointerdown', 21, 100, 100);
    await dispatch(window, 'pointermove', 21, 100, 145);
    await dispatch(window, 'pointerup', 21, 100, 145);

    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
    expect(commits).toHaveLength(0);
    expect(document.documentElement.style.cursor).toBe('');
  });

  test('desktop keeps the deferred 100ms follow and commits only on pointer release', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits, touchTargets: false });
    const handle = container.querySelector('[data-context-resize-handle="right"]');
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');

    await dispatch(handle!, 'pointerdown', 3, 100);
    await dispatch(window, 'pointermove', 3, 60);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
    expect(panel?.style.transitionDuration).toBe('200ms');
    expect(commits).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('540px');
    expect(commits).toHaveLength(0);
    await dispatch(window, 'pointerup', 3, 60);
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 540 }]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('540px');
  });

  test('desktop restores the starting slot size when a deferred follow becomes a no-op', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits, touchTargets: false });
    const handle = container.querySelector('[data-context-resize-handle="right"]');
    const panel = container.querySelector<HTMLElement>('[data-resize-slot]');

    await dispatch(handle!, 'pointerdown', 4, 100);
    await dispatch(window, 'pointermove', 4, 60);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('540px');

    await dispatch(window, 'pointermove', 4, 100);
    await dispatch(window, 'pointerup', 4, 100);
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
    expect(commits).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(panel?.style.getPropertyValue('--oc-context-panel-width')).toBe('500px');
  });

  test('release, blur, close and unmount finish a live drag once', async () => {
    const commits: ResizeCommit[] = [];
    await render({ commits });
    let handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    await dispatch(handle!, 'pointerdown', 9, 100);
    await dispatch(window, 'pointermove', 9, 80);
    await dispatch(window, 'pointerup', 9, 80);
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 520 }]);
    expect(document.documentElement.style.cursor).toBe('');

    commits.length = 0;
    await render({ commits });
    handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    const blurCapture = addPointerCapture(handle!);
    await dispatch(handle!, 'pointerdown', 10, 100);
    await dispatch(window, 'pointermove', 10, 70);
    await dispatch(window, 'blur', 10, 70);
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 530 }]);
    expect(blurCapture.has(10)).toBe(false);
    expect(document.documentElement.style.cursor).toBe('');

    commits.length = 0;
    await render({ commits });
    handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    await dispatch(handle!, 'pointerdown', 11, 100);
    await dispatch(window, 'pointermove', 11, 60);
    await rerender({ commits, isOpen: false });
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 540 }]);
    expect(container.querySelector('[data-context-resize-handle]')).toBeNull();
    expect(document.documentElement.style.cursor).toBe('');

    commits.length = 0;
    await render({ commits });
    handle = container.querySelector<HTMLElement>('[data-context-resize-handle="right"]');
    const unmountCapture = addPointerCapture(handle!);
    await dispatch(handle!, 'pointerdown', 12, 100);
    await dispatch(window, 'pointermove', 12, 60);
    await act(async () => root?.unmount());
    root = null;
    expect(commits).toEqual([{ directory: '/test-project', zone: 'right', size: 540 }]);
    expect(unmountCapture.has(12)).toBe(false);
    expect(document.documentElement.style.cursor).toBe('');
  });

  test('the actual slot follows each move in all zones and RTL directions', async () => {
    const cases: Array<{ zone: ContextZone; isRtl: boolean; x: number; y: number }> = [
      { zone: 'left', isRtl: false, x: 140, y: 100 },
      { zone: 'right', isRtl: false, x: 60, y: 100 },
      { zone: 'bottom', isRtl: false, x: 100, y: 60 },
      { zone: 'left', isRtl: true, x: 60, y: 100 },
      { zone: 'right', isRtl: true, x: 140, y: 100 },
      { zone: 'bottom', isRtl: true, x: 100, y: 60 },
    ];

    for (const [index, input] of cases.entries()) {
      const commits: ResizeCommit[] = [];
      await render({ commits, touchTargets: true, zone: input.zone, isRtl: input.isRtl });
      const handle = container.querySelector<HTMLElement>(`[data-context-resize-handle="${input.zone}"]`);
      const panel = container.querySelector<HTMLElement>('[data-resize-slot]');
      const variable = input.zone === 'bottom' ? '--oc-context-panel-height' : '--oc-context-panel-width';
      await dispatch(handle!, 'pointerdown', 20 + index, 100, 100);
      await dispatch(window, 'pointermove', 20 + index, input.x, input.y);
      expect(panel?.style.getPropertyValue(variable)).toBe('540px');
      expect(commits).toHaveLength(0);
      await dispatch(window, 'pointerup', 20 + index, input.x, input.y);
      expect(commits).toEqual([{ directory: '/test-project', zone: input.zone, size: 540 }]);
      expect(panel?.style.getPropertyValue(variable)).toBe('540px');
    }
  });
});
