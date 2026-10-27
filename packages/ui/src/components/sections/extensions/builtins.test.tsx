import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { I18nProvider } from '@/lib/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { clearRuntimeAuthCredentialProvider, clearRuntimeUrlAuthToken } from '@/lib/runtime-auth';
import { getSettingsSaveState, reportSettingsSaveState } from '@/lib/persistence';
import { useGuestOauthStore } from '@/lib/guests/oauth-store';
import { RESOURCE_MONITOR_MOBILE_SOURCE_URL } from '@/lib/guests/mobile-support';
import { ExtensionsPage } from './ExtensionsPage';
import { IntegrationsPage } from '../integrations/IntegrationsPage';

const builtIn: InstalledGuest = {
  id: 'openchamber-builtin-sdk-demo', name: 'SDK Demo', icon: 'apps', entry: 'panel/index.html', source: 'bundled', enabled: true, version: '1.23.2',
  capabilities: { requested: ['files', 'sessions', 'network'], granted: ['files', 'sessions', 'network'] },
  integration: { name: 'SDK Demo', description: 'GitHub', auth: 'token' },
};
const installed: InstalledGuest = { ...builtIn, id: 'third-party', name: 'Third-party', source: 'git', origin: { url: 'git@github.com:acme/third-party.git' }, integration: { name: 'Third-party', description: 'GitHub', auth: 'token' } };
// What a newer server can send: a capability this build does not know.
const newer = { ...installed, id: 'newer-ext', name: 'Newer', capabilities: { requested: ['telepathy'], granted: [] } };
const resourceMonitor: InstalledGuest = {
  ...installed,
  id: 'resource-monitor',
  name: 'Resource Monitor',
  icon: 'pulse',
  version: '1.4.1',
  origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
};
const withUpdate = (version: string): InstalledGuest => ({ ...resourceMonitor, update: { version } });
const originalRuntimeKey = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();

describe('built-in extension settings', () => {
  let dom: Window;
  let root: Root;
  let container: HTMLElement;
  let catalog: InstalledGuest[];
  let unreadableRows: Array<typeof newer>;
  let requests: string[];
  let restoreFetch = () => {};
  const globals = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    const values = {
      window: dom, document: dom.document, navigator: dom.navigator,
      HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
      DocumentFragment: dom.DocumentFragment, MutationObserver: dom.MutationObserver,
      ResizeObserver: dom.ResizeObserver, MouseEvent: dom.MouseEvent, Event: dom.Event,
      CustomEvent: dom.CustomEvent, getComputedStyle: dom.getComputedStyle.bind(dom),
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(values)) {
      globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    catalog = [builtIn, installed];
    unreadableRows = [];
    requests = [];
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      requests.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/guests') return Response.json({ guests: [...catalog, ...unreadableRows] });
      if (init?.method === 'DELETE') {
        unreadableRows = unreadableRows.filter((row) => path !== `/api/guests/${row.id}`);
        return new Response(null, { status: 204 });
      }
      if (path === '/api/guests/updates/check') {
        const updates: Record<string, NonNullable<InstalledGuest['update']>> = {};
        for (const guest of catalog) {
          if (guest.update) updates[guest.id] = guest.update;
        }
        return Response.json({ updates });
      }
      if (path.endsWith('/update') && init?.method === 'POST') {
        const guestId = path.split('/').at(-2);
        const guest = catalog.find((candidate) => candidate.id === guestId);
        if (!guest) return Response.json({ error: 'not-found' }, { status: 404 });
        const updated = { ...guest, version: guest.update?.version ?? guest.version };
        delete updated.update;
        catalog = catalog.map((candidate) => candidate.id === guest.id ? updated : candidate);
        return Response.json(updated);
      }
      if (path.endsWith('/enabled')) {
        const payload = JSON.parse(String(init?.body));
        catalog = catalog.map((guest) => guest.id === builtIn.id ? { ...guest, enabled: payload.enabled } : guest);
        return Response.json({});
      }
      if (path.endsWith('/oauth/status')) return Response.json({ connected: false, account: '', hasClient: false, settings: {}, redirectUri: '' });
      if (path === '/api/git/identities') return Response.json([]);
      return Response.json({ connected: false, userName: '', userEmail: '', sshCommand: null });
    });
    restoreFetch = () => fetch.mockRestore();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntimeKey });
    await new Promise(resolve => setTimeout(resolve, 0));
    clearRuntimeAuthCredentialProvider();
    clearRuntimeUrlAuthToken();
    useGuestOauthStore.getState().resetForRuntimeSwitch();
    restoreFetch();
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    await dom.happyDOM.close();
    for (const [key, value] of globals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  });

  const render = async (page: React.ReactNode) => {
    await act(async () => { root.render(<I18nProvider><TooltipProvider>{page}</TooltipProvider></I18nProvider>); });
  };
  const button = (text: string, parent: ParentNode = container) => {
    const result = [...parent.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === text);
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
  };
  const card = (id: string) => container.querySelector<HTMLButtonElement>(`[data-settings-item="extensions.${id}"]`);
  const hasButton = (text: string) => [...container.querySelectorAll('button')]
    .some((entry) => entry.textContent?.trim() === text);
  const renderCatalog = async (guests: InstalledGuest[], key: string) => {
    catalog = guests;
    await act(async () => { useGuestsStore.getState().replaceCatalog(guests, getRuntimeKey()); });
    await render(<ExtensionsPage key={key} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  test('shows the built-in badge and enable/disable without removal or approval', async () => {
    await render(<ExtensionsPage />);
    const card = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('SDK Demo'));
    if (!card) throw new Error('Missing built-in card');
    expect(card.textContent).toContain('Built-in');
    // The card opens the extension's own screen.
    await act(async () => { card.click(); });
    expect([...container.querySelectorAll('button')].some((entry) => entry.textContent?.trim() === 'Remove')).toBe(false);
    expect(container.textContent).not.toContain('Review permissions');
    expect(container.textContent).not.toContain('Open source');
    await act(async () => { button('Disable').click(); });
    expect(button('Enable')).toBeTruthy();
    await act(async () => { button('Enable').click(); });
    expect(button('Disable')).toBeTruthy();
    expect(requests.some((entry) => entry.includes('/capabilities'))).toBe(false);
    expect(requests.some((entry) => entry.startsWith('DELETE'))).toBe(false);
  });

  test('an extension it cannot read keeps the others and can be removed', async () => {
    unreadableRows = [newer];
    await render(<ExtensionsPage />);
    expect(container.textContent).not.toContain('Could not load extensions');
    expect(container.textContent).toContain('SDK Demo');
    expect(container.textContent).toContain('Third-party');
    expect(container.textContent).toContain('Newer');
    expect(container.textContent).toContain('Can\'t load');
    const check = container.querySelector<HTMLButtonElement>('[data-settings-item="extensions.updates.check"]');
    expect(check?.disabled).toBe(false);
    const removeNewer = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Newer"]');
    if (!removeNewer) throw new Error('Missing remove button for the unreadable extension');
    await act(async () => { removeNewer.click(); });
    expect(requests).toContain('DELETE /api/guests/newer-ext');
    expect(container.textContent).not.toContain('Newer');
    expect(container.textContent).toContain('Third-party');
  });

  test('opens the Git source in the external browser', async () => {
    await render(<ExtensionsPage />);
    const trigger = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Third-party'));
    if (!trigger) throw new Error('Missing Git extension card');
    await act(async () => { trigger.click(); });
    const open = spyOn(window, 'open').mockImplementation(() => null);
    try {
      await act(async () => { button('Open source').click(); });
      expect(open.mock.calls).toEqual([['https://github.com/acme/third-party', '_blank', 'noopener,noreferrer']]);
    } finally {
      open.mockRestore();
    }
  });

  test('hides stale and equal Git update state in the grid and detail screen', async () => {
    for (const version of ['1.4.0', '1.4.1', '1.4.1+build.7']) {
      await renderCatalog([builtIn, installed, withUpdate(version)], version);
      const resourceMonitorCard = card(resourceMonitor.id);
      if (!resourceMonitorCard) throw new Error('Missing Resource Monitor card');
      expect(resourceMonitorCard.textContent).not.toContain('Update available');

      await act(async () => { resourceMonitorCard.click(); });
      expect(container.textContent).not.toContain('Update available');
      expect(hasButton('Update')).toBe(false);

      const back = container.querySelector<HTMLButtonElement>('button[aria-label="Back to extensions"]');
      if (!back) throw new Error('Missing Extensions back button');
      await act(async () => { back.click(); });
    }
    expect(requests).not.toContain('POST /api/guests/resource-monitor/update');
  });

  test('shows a newer Git update in the grid and runs it from the detail action', async () => {
    await renderCatalog([builtIn, installed, withUpdate('1.4.2')], 'newer-resource-monitor');
    const resourceMonitorCard = card(resourceMonitor.id);
    if (!resourceMonitorCard) throw new Error('Missing Resource Monitor card');
    expect(resourceMonitorCard.textContent).toContain('Update available');
    expect(resourceMonitorCard.textContent).toContain('1.4.2');

    await act(async () => { resourceMonitorCard.click(); });
    expect(container.textContent).toContain('Update available');
    expect(container.textContent).toContain('1.4.2');
    const updateButton = button('Update');
    await act(async () => {
      updateButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(requests).toContain('POST /api/guests/resource-monitor/update');
  });

  test('places its token card in Built-in integrations, not Extension accounts', async () => {
    await render(<IntegrationsPage />);
    const builtInSection = container.querySelector('[data-settings-item="integrations.first-party"]');
    const installedSection = container.querySelector('[data-settings-item="integrations.guests"]');
    expect(builtInSection?.textContent).toContain('SDK Demo');
    expect(installedSection?.textContent).toContain('Third-party');
    expect(installedSection?.textContent).not.toContain('SDK Demo');
    const trigger = [...(builtInSection?.querySelectorAll('button') ?? [])].find((entry) => entry.textContent?.includes('SDK Demo'));
    if (!trigger) throw new Error('Missing token integration card');
    await act(async () => { trigger.click(); });
    expect(builtInSection?.querySelector('input[type="password"]')).toBeTruthy();
    expect(builtInSection?.textContent).toContain('API token');
  });

  test('remounts the account form and clears the save indicator when switching instances', async () => {
    await render(<IntegrationsPage />);
    const trigger = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.includes('SDK Demo'));
    if (!trigger) throw new Error('Missing built-in account');
    await act(async () => { trigger.click(); });
    const previousInput = container.querySelector('input[type="password"]');
    expect(previousInput).toBeTruthy();
    await act(async () => {
      reportSettingsSaveState('saving');
      switchRuntimeEndpoint({ apiBaseUrl: 'https://next.example', runtimeKey: 'next' });
      useGuestOauthStore.getState().resetForRuntimeSwitch();
      useGuestsStore.getState().resetForRuntimeSwitch('next');
      useGuestsStore.getState().replaceCatalog(catalog, 'next');
    });
    expect(previousInput?.isConnected).toBe(false);
    expect(getSettingsSaveState()).toBe('idle');
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});
