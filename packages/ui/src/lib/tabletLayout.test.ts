import { afterEach, describe, expect, test } from 'bun:test';

import { readTabletLayout, type TabletLayout } from './device';

// No module mocking here on purpose: mock.module is process-global and would
// leak into every other test file. Outside a Capacitor shell isIPadApp() is
// already false, so a bare viewport stub isolates the geometry rules.
const originalWindow = globalThis.window;

const setViewport = (width: number, height: number) => {
  (globalThis as { window?: unknown }).window = {
    innerWidth: width,
    innerHeight: height,
    // isIPadApp() reaches for the Capacitor markers; a plain web location
    // keeps it on its `false` path without mocking the module.
    location: { protocol: 'https:', search: '' },
  };
};

// The native mobile surface (Capacitor) with the OSK up: the WebView viewport
// collapses (adjustResize) while the physical screen keeps its real size. The
// explicit surface override flips isMobileSurfaceRuntime() without needing a
// real Capacitor shell, and screen.* supplies the keyboard-stable anchor.
const setMobileSurfaceWithKeyboard = (viewportWidth: number, viewportHeight: number, screenWidth: number, screenHeight: number) => {
  (globalThis as { window?: unknown }).window = {
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    screen: { width: screenWidth, height: screenHeight },
    location: { protocol: 'capacitor:', search: '' },
    __OPENCHAMBER_SURFACE__: 'mobile',
  };
};

const withViewport = (width: number, height: number): TabletLayout => {
  setViewport(width, height);
  return readTabletLayout();
};

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('readTabletLayout', () => {
  test('a phone stays a phone in both orientations', () => {
    expect(withViewport(390, 844).enabled).toBe(false);
    // The long side alone must never qualify — this is the case a plain
    // width threshold gets wrong.
    expect(withViewport(844, 390).enabled).toBe(false);
  });

  test('a tablet qualifies in both orientations', () => {
    expect(withViewport(834, 1194).enabled).toBe(true);
    expect(withViewport(1194, 834).enabled).toBe(true);
  });

  test('side panels need real width, so a tablet in portrait keeps the drawer', () => {
    expect(withViewport(834, 1194).roomyForPanels).toBe(false);
    expect(withViewport(1194, 834).roomyForPanels).toBe(true);
  });

  test('an unfolded foldable is a tablet but never roomy enough for panels', () => {
    // Book foldables are near-square: the long side is barely wider than a
    // tablet's short one, so both orientations keep the portrait layout.
    expect(withViewport(690, 840)).toEqual({ enabled: true, roomyForPanels: false });
    expect(withViewport(840, 690)).toEqual({ enabled: true, roomyForPanels: false });
  });

  test('folding shut drops back to the phone layout', () => {
    expect(withViewport(370, 900).enabled).toBe(false);
  });

  test('a tablet keeps the tablet size class while the OSK shrinks the viewport', () => {
    // Landscape tablet, keyboard up: the viewport collapses to ~350px tall,
    // but the physical screen short side is 800px. The size class must not
    // flip to phone, or the layout switch dismisses the keyboard and the
    // height restore re-flips — the keyboard flicker loop.
    setMobileSurfaceWithKeyboard(1280, 350, 1280, 800);
    expect(readTabletLayout()).toEqual({ enabled: true, roomyForPanels: true });
  });

  test('a portrait tablet with the OSK up stays portrait, not landscape-hybrid', () => {
    // Portrait tablet, keyboard up: the shrunken viewport is wider than tall
    // (768 > 470), which a window-dims orientation check would misread as
    // landscape and flip hybrid mode on while typing. The screen orientation
    // keeps roomyForPanels off.
    setMobileSurfaceWithKeyboard(768, 470, 768, 1024);
    expect(readTabletLayout()).toEqual({ enabled: true, roomyForPanels: false });
  });
});
