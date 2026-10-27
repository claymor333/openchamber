import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

import { getRuntimeKey } from '@/lib/runtime-switch';
import { loadGuestCatalog } from './load-catalog';
import { useGuestsStore } from './store';

afterEach(() => useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey()));

describe('catalog request diagnostics', () => {
  test('retains HTTP failures and clears them on a successful retry', async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private proxy error', { status: 404 }));
    try {
      await loadGuestCatalog();
      expect(useGuestsStore.getState().status).toBe('error');
      expect(useGuestsStore.getState().failure).toEqual({ method: 'GET', path: '/api/guests', kind: 'http', status: 404 });
      fetch.mockResolvedValue(Response.json({ guests: [] }));
      await loadGuestCatalog();
      expect(useGuestsStore.getState().status).toBe('ready');
      expect(useGuestsStore.getState().failure).toBeNull();
    } finally { fetch.mockRestore(); }
  });

  test('distinguishes unexpected responses and network failures', async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Fallback</html>'));
    try {
      await loadGuestCatalog();
      expect(useGuestsStore.getState().failure).toEqual({ method: 'GET', path: '/api/guests', kind: 'invalid-response', status: 200 });
      fetch.mockRejectedValue(new Error('Private transport details'));
      await loadGuestCatalog();
      expect(useGuestsStore.getState().failure).toEqual({ method: 'GET', path: '/api/guests', kind: 'network' });
    } finally { fetch.mockRestore(); }
  });

  test('one row the UI cannot read leaves the rest of the catalog loaded', async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    const hello = { id: 'hello', name: 'Hello', icon: 'window', capabilities: { requested: [], granted: [] } };
    const newer = { ...hello, id: 'newer', name: 'Newer', capabilities: { requested: ['telepathy'], granted: [] } };
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ guests: [hello, newer] }));
    try {
      await loadGuestCatalog();
      const state = useGuestsStore.getState();
      expect(state.status).toBe('ready');
      expect(state.failure).toBeNull();
      expect(state.guests).toEqual([hello]);
      expect(state.unreadable).toEqual([{ id: 'newer', name: 'Newer', builtIn: false }]);
    } finally { fetch.mockRestore(); }
  });

  test('mobile loads only the curated Resource Monitor row and keeps a successful filtered catalog ready', async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const browserWindow = new Window();
    Object.defineProperty(browserWindow, '__OPENCHAMBER_SURFACE__', { configurable: true, writable: true, value: 'mobile' });
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: browserWindow });
    const resourceMonitor = {
      id: 'resource-monitor',
      name: 'Resource Monitor',
      icon: 'pulse',
      version: '1.4.1',
      service: { runtime: 'host', granted: true },
      capabilities: { requested: ['service'], granted: ['service'] },
    };
    const unrelated = {
      id: 'other-extension',
      name: 'Other extension',
      icon: 'apps',
      capabilities: { requested: [], granted: [] },
    };
    const newer = { ...unrelated, id: 'other-newer', capabilities: { requested: ['future'], granted: [] } };
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ guests: [resourceMonitor, unrelated, newer] }));
    try {
      await loadGuestCatalog();
      const state = useGuestsStore.getState();
      expect(state.status).toBe('ready');
      expect(state.failure).toBeNull();
      expect(state.guests.map((guest) => guest.id)).toEqual(['resource-monitor']);
      expect(state.unreadable).toEqual([]);
    } finally {
      fetch.mockRestore();
      await browserWindow.happyDOM.close();
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('late failures cannot contaminate the next runtime', async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(getRuntimeKey());
    let respond: ((response: Response) => void) | undefined;
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => { respond = resolve; }));
    try {
      const pending = loadGuestCatalog();
      await new Promise(resolve => setTimeout(resolve, 0));
      useGuestsStore.getState().resetForRuntimeSwitch('next-runtime');
      if (!respond) throw new Error('Expected a pending catalog request');
      respond(new Response('', { status: 500 }));
      await pending;
      expect(useGuestsStore.getState().status).toBe('idle');
      expect(useGuestsStore.getState().failure).toBeNull();
    } finally { fetch.mockRestore(); }
  });
});
