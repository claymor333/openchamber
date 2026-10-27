import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider } from '@/sync/sync-context';
import { DedicatedMobileAppProvider, type MobileAppActions } from './mobileAppContext';
import { MobileHeader, MobileWorkStatusToggle } from './MobileHeader';

const actions = (sharedContextPanelsAvailable: boolean): MobileAppActions => ({
  sharedContextPanelsAvailable,
  openChanges: () => undefined,
  openFiles: () => undefined,
  openSettings: () => undefined,
  openSourceBoard: () => undefined,
});

const headerSdk = OpenCode.make({
  baseUrl: 'http://mobile-header.test',
  fetch: () => new Promise<Response>(() => undefined),
});

describe('mobile work-status toggle', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  let savedPreference: boolean;
  let savedFits: boolean;
  let savedOverlayOpen: boolean;
  let savedRunOverviewKey: string | null;
  let savedSessionId: string | null;
  let savedSessionDirectory: string | null;
  let savedCurrentDirectory: string;

  const render = async (sharedContextPanelsAvailable: boolean) => {
    await act(async () => root.render(
      <TooltipProvider>
        <DedicatedMobileAppProvider actions={actions(sharedContextPanelsAvailable)}>
          <I18nProvider><MobileWorkStatusToggle /></I18nProvider>
        </DedicatedMobileAppProvider>
      </TooltipProvider>,
    ));
  };

  const renderHeader = async (sharedContextPanelsAvailable: boolean) => {
    await act(async () => root.render(
      <TooltipProvider>
        <DedicatedMobileAppProvider actions={actions(sharedContextPanelsAvailable)}>
          <SyncProvider sdk={headerSdk} directory="/mobile-header-test">
            <I18nProvider>
              <MobileHeader onOpenSessions={() => undefined} onOpenWorkspace={() => undefined} />
            </I18nProvider>
          </SyncProvider>
        </DedicatedMobileAppProvider>
      </TooltipProvider>,
    ));
  };

  const button = () => container.querySelector<HTMLButtonElement>('[data-work-status-toggle]');
  const metadataButton = () => [...container.querySelectorAll<HTMLButtonElement>('.oc-mobile-header button')]
    .find((candidate) => candidate.querySelector('svg[role="progressbar"]')) ?? null;
  const sessionSwitcherButton = () => container.querySelector<HTMLButtonElement>('.oc-mobile-header button[aria-haspopup="dialog"]');
  const workspaceButton = () => [...container.querySelectorAll<HTMLButtonElement>('.oc-mobile-header button')]
    .find((candidate) => candidate.querySelector('use')?.getAttribute('href') === '#oc-pencil-ruler-2') ?? null;

  beforeEach(() => {
    savedPreference = useUIStore.getState().workStatusPanelEnabled;
    savedFits = useUIStore.getState().workStatusPanelFits;
    savedOverlayOpen = useUIStore.getState().workStatusOverlayOpen;
    savedRunOverviewKey = useUIStore.getState().runOverviewKey;
    savedSessionId = useSessionUIStore.getState().currentSessionId;
    savedSessionDirectory = savedSessionId ? useSessionUIStore.getState().getDirectoryForSession(savedSessionId) : null;
    savedCurrentDirectory = useDirectoryStore.getState().currentDirectory;
    useUIStore.setState({ workStatusPanelEnabled: true, workStatusPanelFits: false, workStatusOverlayOpen: false, runOverviewKey: null });
    useSessionUIStore.getState().setCurrentSession(null);
    useDirectoryStore.setState({ currentDirectory: '/mobile-header-test' });

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
      HTMLIFrameElement: win.HTMLIFrameElement,
      localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win),
      ResizeObserver: win.ResizeObserver,
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
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
    useUIStore.setState({
      workStatusPanelEnabled: savedPreference,
      workStatusPanelFits: savedFits,
      workStatusOverlayOpen: savedOverlayOpen,
      runOverviewKey: savedRunOverviewKey,
    });
    useSessionUIStore.getState().setCurrentSession(savedSessionId, savedSessionDirectory);
    useDirectoryStore.setState({ currentDirectory: savedCurrentDirectory });
  });

  test('is tablet-only and toggles overlay visibility without changing the saved preference', async () => {
    await render(false);
    expect(button()).toBeNull();

    await render(true);
    const toggle = button();
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(useUIStore.getState().workStatusOverlayOpen).toBe(true);
    expect(useUIStore.getState().workStatusPanelEnabled).toBe(true);
    expect(button()?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => button()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(useUIStore.getState().workStatusOverlayOpen).toBe(false);
    expect(useUIStore.getState().workStatusPanelEnabled).toBe(true);
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
  });

  test('toggles the stored preference when the inline panel fits', async () => {
    useUIStore.setState({ workStatusPanelFits: true });
    await render(true);
    expect(button()?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => button()?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(useUIStore.getState().workStatusPanelEnabled).toBe(false);
    expect(useUIStore.getState().workStatusOverlayOpen).toBe(false);
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
  });

  test('unmounts the metadata donut in hybrid mode and does not restore an open popover on rotation back', async () => {
    await renderHeader(false);
    const trigger = metadataButton();
    expect(trigger).not.toBeNull();
    expect(sessionSwitcherButton()).not.toBeNull();
    expect(workspaceButton()).not.toBeNull();

    await act(async () => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await renderHeader(true);
    expect(metadataButton()).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(button()).not.toBeNull();
    expect(sessionSwitcherButton()).not.toBeNull();
    expect(workspaceButton()).not.toBeNull();

    await renderHeader(false);
    expect(metadataButton()?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(button()).toBeNull();
    expect(sessionSwitcherButton()).not.toBeNull();
    expect(workspaceButton()).not.toBeNull();

    await act(async () => useUIStore.setState({ runOverviewKey: 'run-overview-test' }));
    expect(metadataButton()).toBeNull();
    await act(async () => useUIStore.setState({ runOverviewKey: null }));
    expect(metadataButton()?.getAttribute('aria-expanded')).toBe('false');
  });

  test('keeps the recent-session popover open for inside pointers and closes it on an outside pointer', async () => {
    await renderHeader(true);
    const trigger = sessionSwitcherButton();
    expect(trigger).not.toBeNull();

    await act(async () => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const popover = container.querySelector('[role="dialog"]');
    expect(popover).not.toBeNull();
    expect(popover?.parentElement?.classList.contains('z-40')).toBe(true);

    await act(async () => popover?.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });
});
