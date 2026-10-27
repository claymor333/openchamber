import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';
import type { Root } from 'react-dom/client';

import { useUIStore } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { ZoneFitArbiter } from './ZoneFitArbiter';
import type { ZoneFitSidebar } from './zoneFitWatch';

const SYNC_SDK = OpenCode.make({
  baseUrl: 'http://opencode.test',
  fetch: async () => Response.json([]),
});

const renderArbiter = async (initialOpen: boolean, run: (controls: {
  root: Root;
  setEnabled: (enabled: boolean) => void;
  userSetSidebar: (open: boolean) => void;
  isSidebarOpen: () => boolean;
  closeRightZone: () => void;
}) => Promise<void>) => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    location: dom.location,
    localStorage: dom.localStorage,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    Node: dom.Node,
    Event: dom.Event,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  useUIStore.setState({ contextPanelByDirectory: {}, contextSurfaceZones: {} });
  useDirectoryStore.setState({ currentDirectory: '/repo' });
  useUIStore.getState().openContextSurface('/repo', 'terminal');

  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { SyncProvider } = await import('@/sync/sync-context');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let sidebarOpen = initialOpen;
  const userChangeListeners = new Set<() => void>();
  const sidebar: ZoneFitSidebar = {
    isOpen: () => sidebarOpen,
    width: () => 280,
    setOpen: (open) => { sidebarOpen = open; },
    subscribeToUserChanges: (listener) => {
      userChangeListeners.add(listener);
      return () => userChangeListeners.delete(listener);
    },
  };
  let setEnabled: (enabled: boolean) => void = () => {};
  const App = () => {
    const [enabled, setState] = React.useState(true);
    setEnabled = setState;
    return (
      <SyncProvider sdk={SYNC_SDK} directory="/repo">
        <I18nProvider>
          <div data-workspace-row ref={(element) => {
            if (element) Object.defineProperty(element, 'clientWidth', { configurable: true, value: 500 });
          }}>
            <ZoneFitArbiter sidebar={sidebar} enabled={enabled} />
          </div>
        </I18nProvider>
      </SyncProvider>
    );
  };
  const userSetSidebar = (open: boolean) => {
    userChangeListeners.forEach((listener) => listener());
    sidebarOpen = open;
  };

  try {
    await act(async () => root.render(<App />));
    await run({
      root,
      setEnabled,
      userSetSidebar,
      isSidebarOpen: () => sidebarOpen,
      closeRightZone: () => useUIStore.getState().closeContextZone('/repo', 'right'),
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
};

test('an automatic sidebar fold survives the drawer layout and restores when context zones close', async () => {
  await renderArbiter(true, async ({ setEnabled, isSidebarOpen, closeRightZone }) => {
    expect(isSidebarOpen()).toBe(false);
    await act(async () => setEnabled(false));
    await act(async () => closeRightZone());
    expect(isSidebarOpen()).toBe(false);

    await act(async () => setEnabled(true));
    expect(isSidebarOpen()).toBe(true);
  });
});

test('a manual sidebar close in the drawer layout prevents automatic restoration', async () => {
  await renderArbiter(true, async ({ setEnabled, userSetSidebar, isSidebarOpen, closeRightZone }) => {
    expect(isSidebarOpen()).toBe(false);
    await act(async () => setEnabled(false));
    await act(async () => userSetSidebar(true));
    await act(async () => userSetSidebar(false));
    await act(async () => closeRightZone());

    await act(async () => setEnabled(true));
    expect(isSidebarOpen()).toBe(false);
  });
});
