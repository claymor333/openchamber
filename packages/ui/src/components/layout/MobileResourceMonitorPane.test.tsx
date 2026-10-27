import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenCode } from '@opencode/client';
import { Window as HappyWindow } from 'happy-dom';
import { hostMessageSchema } from '@openchamber/sdk/schemas';
import type { GuestMessage, HostMessage } from '@openchamber/sdk';

import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getDefaultTheme } from '@/lib/theme/themes';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { RESOURCE_MONITOR_MOBILE_FRAME_NAME, RESOURCE_MONITOR_MOBILE_SOURCE_URL } from '@/lib/guests/mobile-support';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { MobileResourceMonitorPane, type MobileResourceMonitorPaneProps } from './MobileResourceMonitorPane';

test('mobile Resource Monitor mounts only while visible and never requests snapshots after unmount or runtime switch', async () => {
  const dom = new HappyWindow({ url: 'http://guest.test', settings: { disableIframePageLoading: true } });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    localStorage: dom.localStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    Event: dom.Event,
    MessageEvent: dom.MessageEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const previousSurface = Object.getOwnPropertyDescriptor(dom, '__OPENCHAMBER_SURFACE__');
  Object.defineProperty(dom, '__OPENCHAMBER_SURFACE__', { configurable: true, value: 'mobile' });
  dom.document.documentElement.classList.add('oc-native-app-active');
  const requests: string[] = [];
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.includes('/frame-grant')) return Response.json({ grant: 'grant-test', expiresAt: Date.now() + 60_000 });
    if (target.includes('/auth/url-token')) return Response.json({ token: 'scoped-test', expiresAt: Date.now() + 60_000 });
    if (target.includes('/api/guests/resource-monitor/service/request')) {
      requests.push(target);
      return Response.json({ status: 200, body: '{"ok":true}' });
    }
    if (target.includes('/api/session-warming')) return Response.json({ revision: 0, enabled: false, minutes: 30, sessions: [] });
    if (target.includes('/event')) return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    if (target.includes('/session/active')) return Response.json({});
    if (target.includes('/location')) return Response.json({ directory: '/visible', project: { id: 'project', directory: '/visible', canonical: '/visible' } });
    return Response.json({ data: [] });
  });
  const sdk = OpenCode.make({ baseUrl: 'http://sync.test', fetch: async (request) => {
    const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
    if (path.endsWith('/event')) return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    const body = path.endsWith('/location')
      ? { directory: '/visible', project: { id: 'project', directory: '/visible', canonical: '/visible' } }
      : path.endsWith('/session/active') ? {}
      : { data: [] };
    return Response.json(body);
  } });
  const theme = getDefaultTheme(false);
  const themeContext: ThemeContextValue = {
    currentTheme: theme, availableThemes: [theme], customThemeIds: [], setTheme: () => {}, customThemesLoading: false,
    reloadCustomThemes: async () => {}, importTheme: async () => theme, deleteImportedTheme: async () => {},
    isSystemPreference: false, setSystemPreference: () => {}, themeMode: 'light', setThemeMode: () => {},
    lightThemeId: theme.metadata.id, darkThemeId: theme.metadata.id, setLightThemePreference: () => {}, setDarkThemePreference: () => {},
  };
  const guest: InstalledGuest = {
    id: 'resource-monitor',
    storageId: 'monitor-store',
    name: 'Resource Monitor',
    icon: 'pulse',
    version: '1.4.1',
    source: 'git',
    origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
    entry: 'panel/index.html',
    service: { runtime: 'host', granted: true },
    capabilities: { requested: ['service'], granted: ['service'] },
  };
  const runtimeKey = getRuntimeKey();
  await act(async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
    useGuestsStore.getState().replaceCatalog([guest], runtimeKey);
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const restores: Array<() => void> = [];
  const state: MobileResourceMonitorPaneProps = {
    workspaceOpen: true,
    surfaceVisible: true,
    tab: 'resource-monitor' as const,
    guestAvailable: true,
    documentVisible: true,
    nativeAppActive: true,
    isNativeApp: true,
    runtimeKey,
  };
  const tree = (overrides: Partial<typeof state> = {}, key = runtimeKey) => (
    <I18nProvider>
      <ThemeSystemContext.Provider value={themeContext}>
        <SyncProvider sdk={sdk} directory="/visible">
          <MobileResourceMonitorPane key={key} {...state} {...overrides} />
        </SyncProvider>
      </ThemeSystemContext.Provider>
    </I18nProvider>
  );
  const settle = async () => {
    for (let attempt = 0; attempt < 5; attempt++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  try {
    await act(async () => root.render(tree()));
    for (let attempt = 0; attempt < 100 && !container.querySelector('iframe'); attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const connectFrame = async () => {
      const frame = container.querySelector<HTMLIFrameElement>('iframe');
      if (!frame) throw new Error('Resource Monitor iframe did not mount');
      expect(frame.name).toBe(RESOURCE_MONITOR_MOBILE_FRAME_NAME);

      const guestWindow = new HappyWindow();
      restores.push(() => { void guestWindow.happyDOM.close(); });
      Object.defineProperty(frame, 'contentWindow', { configurable: true, value: guestWindow });
      const frameWindow = frame.contentWindow;
      if (!frameWindow) throw new Error('Guest window is missing');
      const received: HostMessage[] = [];
      const post = spyOn(frameWindow, 'postMessage').mockImplementation((message) => { received.push(hostMessageSchema.parse(message)); });
      restores.push(() => post.mockRestore());
      const dispatchGuestMessage = (source: Window, data: GuestMessage) => {
        const event = new dom.MessageEvent('message', { data });
        Object.defineProperty(event, 'source', { configurable: true, value: source });
        dom.dispatchEvent(event);
      };
      const send = async (message: GuestMessage) => {
        await act(async () => {
          dispatchGuestMessage(frameWindow, message);
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await settle();
      };
      await send({ channel: 'openchamber.sdk', v: 1, type: 'hello' });
      return { frameWindow, send, dispatchGuestMessage };
    };

    const firstFrame = await connectFrame();
    await firstFrame.send({
      channel: 'openchamber.sdk',
      v: 1,
      type: 'service-request',
      id: 'snapshot-1',
      payload: { method: 'GET', path: '/snapshot' },
    });
    expect(requests).toHaveLength(1);

    // A selected-tab change unmounts the iframe, rather than leaving its poller
    // alive beneath the drawer's visibility-hidden exit state.
    await act(async () => root.render(tree({ tab: 'changes' })));
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => {
      firstFrame.dispatchGuestMessage(firstFrame.frameWindow, {
        channel: 'openchamber.sdk', v: 1, type: 'service-request', id: 'stale-tab', payload: { method: 'GET', path: '/snapshot' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(requests).toHaveLength(1);

    // Closed, covered, browser-hidden, and native-inactive surfaces all refuse
    // to create a frame; changing runtime also keys away the old frame.
    for (const hidden of [
      { workspaceOpen: false },
      { surfaceVisible: false },
      { documentVisible: false },
      { nativeAppActive: false },
      { guestAvailable: false },
    ]) {
      await act(async () => root.render(tree({ ...hidden, tab: 'resource-monitor' })));
      expect(container.querySelector('iframe')).toBeNull();
    }

    // Reopening mounts a fresh frame and resumes sampling; backgrounding it
    // unmounts the frame without sending a stop request to the shared service.
    await act(async () => root.render(tree()));
    for (let attempt = 0; attempt < 100 && !container.querySelector('iframe'); attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const reopenedFrame = await connectFrame();
    await reopenedFrame.send({
      channel: 'openchamber.sdk',
      v: 1,
      type: 'service-request',
      id: 'snapshot-reopen',
      payload: { method: 'GET', path: '/snapshot' },
    });
    expect(requests).toHaveLength(2);

    await act(async () => root.render(tree({ nativeAppActive: false })));
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => {
      reopenedFrame.dispatchGuestMessage(reopenedFrame.frameWindow, {
        channel: 'openchamber.sdk', v: 1, type: 'service-request', id: 'backgrounded', payload: { method: 'GET', path: '/snapshot' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(requests).toHaveLength(2);

    await act(async () => root.render(tree()));
    for (let attempt = 0; attempt < 100 && !container.querySelector('iframe'); attempt++) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    const foregroundFrame = await connectFrame();
    await foregroundFrame.send({
      channel: 'openchamber.sdk',
      v: 1,
      type: 'service-request',
      id: 'snapshot-resume',
      payload: { method: 'GET', path: '/snapshot' },
    });
    expect(requests).toHaveLength(3);

    await act(async () => useGuestsStore.getState().resetForRuntimeSwitch('next-runtime'));
    await act(async () => root.render(tree({ guestAvailable: false }, 'next-runtime')));
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => {
      foregroundFrame.dispatchGuestMessage(foregroundFrame.frameWindow, {
        channel: 'openchamber.sdk', v: 1, type: 'service-request', id: 'stale-runtime', payload: { method: 'GET', path: '/snapshot' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(requests).toHaveLength(3);
  } finally {
    await act(async () => {
      root.unmount();
      useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
    });
    for (const restore of restores) restore();
    fetch.mockRestore();
    if (previousSurface) Object.defineProperty(dom, '__OPENCHAMBER_SURFACE__', previousSurface);
    else Reflect.deleteProperty(dom, '__OPENCHAMBER_SURFACE__');
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
