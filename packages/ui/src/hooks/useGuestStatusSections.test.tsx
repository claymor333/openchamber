import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { DedicatedMobileAppProvider, type MobileAppActions } from '@/apps/mobileAppContext';
import { RESOURCE_MONITOR_MOBILE_SOURCE_URL } from '@/lib/guests/mobile-support';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useGuestStatusSections } from './useGuestSurfaces';

const resourceMonitor = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'resource-monitor',
  name: 'Resource Monitor',
  icon: 'pulse',
  version: '1.4.1',
  source: 'git',
  origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
  service: { runtime: 'host', granted: true },
  capabilities: { requested: ['service'], granted: ['service'] },
  statusSource: { path: '/api/status', interval: 2_000 },
  ...overrides,
});

const actions = (sharedContextPanelsAvailable: boolean): MobileAppActions => ({
  sharedContextPanelsAvailable,
  openChanges: () => undefined,
  openFiles: () => undefined,
  openSettings: () => undefined,
  openSourceBoard: () => undefined,
});

test('mobile Work Status lists only the approved monitor source on the shared tablet panel', async () => {
  const dom = new Window({ url: 'http://status.test/?surface=mobile' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    MutationObserver: dom.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const runtimeKey = getRuntimeKey();
  const previousGuests = useGuestsStore.getState();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const Probe = () => <span>{useGuestStatusSections().map((guest) => guest.id).join(',')}</span>;
  const render = async (sharedContextPanelsAvailable: boolean) => act(async () => {
    root.render(
      <DedicatedMobileAppProvider actions={actions(sharedContextPanelsAvailable)}>
        <Probe />
      </DedicatedMobileAppProvider>,
    );
  });
  const replaceCatalog = async (guests: InstalledGuest[], key = runtimeKey) => act(async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(key);
    useGuestsStore.getState().replaceCatalog(guests, key);
  });

  try {
    Object.defineProperty(dom, '__OPENCHAMBER_SURFACE__', { configurable: true, writable: true, value: 'mobile' });
    await replaceCatalog([
      resourceMonitor({ id: 'other-guest', name: 'Other guest' }),
      resourceMonitor(),
    ]);
    await render(true);
    expect(container.textContent).toBe('resource-monitor');

    await render(false);
    expect(container.textContent).toBe('');
    await render(true);

    const unsupported = [
      resourceMonitor({ version: '1.4.0' }),
      resourceMonitor({ origin: { url: 'https://github.com/openchamber/openchamber-resource-monitor' } }),
      resourceMonitor({ capabilities: { requested: ['service'], granted: [] } }),
      resourceMonitor({ service: { runtime: 'host', granted: false } }),
      resourceMonitor({ enabled: false }),
      resourceMonitor({ statusSource: undefined, statusEntry: 'status/index.html' }),
    ];
    for (const guest of unsupported) {
      await replaceCatalog([guest]);
      expect(container.textContent).toBe('');
    }

    await replaceCatalog([resourceMonitor()]);
    expect(container.textContent).toBe('resource-monitor');
    await act(async () => useGuestsStore.setState({ status: 'loading' }));
    expect(container.textContent).toBe('');

    await replaceCatalog([resourceMonitor()], `${runtimeKey}:other`);
    expect(container.textContent).toBe('');

    Object.defineProperty(dom, '__OPENCHAMBER_SURFACE__', { configurable: true, writable: true, value: 'desktop' });
    Object.defineProperty(dom, '__VSCODE_CONFIG__', { configurable: true, writable: true, value: {} });
    await replaceCatalog([resourceMonitor({ id: 'desktop-status', name: 'Desktop status' })]);
    await render(false);
    expect(container.textContent).toBe('');

    Reflect.deleteProperty(dom, '__VSCODE_CONFIG__');
    await replaceCatalog([resourceMonitor({ id: 'desktop-status', name: 'Desktop status' })]);
    await render(false);
    expect(container.textContent).toBe('desktop-status');
  } finally {
    await act(async () => root.unmount());
    useGuestsStore.setState(previousGuests, true);
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
