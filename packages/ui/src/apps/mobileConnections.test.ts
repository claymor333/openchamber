import { describe, expect, mock, spyOn, test } from 'bun:test';

import { createMobilePasswordOperationTracker, loadMobileConnections, migrateLegacyInlineTokenRecords, reprobeActiveConnection, upsertMobileConnection, validateMobileConnectionSession, type MobileRelayConfig } from './mobileConnections';
import { getRuntimeApiBaseUrl, getRuntimeEndpointRevision, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import * as relayTunnelClientModule from '@/lib/relay/tunnel-client';
import { adoptRelayTunnel, getActiveRelayDescriptor } from '@/lib/relay/runtime-tunnel';
import { getRuntimeBearerTokenSync } from '@/lib/runtime-auth';
import type { RelayTunnelClient } from '@/lib/relay/tunnel-client';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

const createLocalStorageStub = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
};

const installTestWindow = (native = false) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { protocol: 'https:' },
      Capacitor: { isNativePlatform: () => native },
      localStorage: createLocalStorageStub(),
    }),
  });
};

const restoreGlobals = () => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
};

const STORAGE_KEY = 'openchamber.mobile.connections.v1';

const testRelay: MobileRelayConfig = {
  relayUrl: 'wss://relay.example/tunnel',
  serverId: 'srv_test123',
  hostEncPubJwk: { kty: 'EC', crv: 'P-256', x: 'eHhY', y: 'eVlZ' },
};

describe('mobile connection storage', () => {
  test('native LAN metadata keeps both instances and their secure-token flags', async () => {
    try {
      installTestWindow(true);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
        {
          id: 'native-a', label: 'Server A', lastUsedAt: 10, hasToken: true,
          candidates: [{ kind: 'direct', url: 'http://192.168.1.10:2606' }],
        },
      ]));
      await upsertMobileConnection({
        label: 'Server B',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.20:2606' }],
      });

      const reloaded = await loadMobileConnections();
      expect(reloaded).toHaveLength(2);
      expect(reloaded.find((connection) => connection.id === 'native-a')).toMatchObject({
        label: 'Server A', hasToken: true,
        candidates: [{ kind: 'direct', url: 'http://192.168.1.10:2606' }],
      });
      expect(reloaded.find((connection) => connection.label === 'Server B')?.id).not.toBe('native-a');
      expect(reloaded.every((connection) => connection.clientToken === undefined)).toBe(true);
    } finally {
      restoreGlobals();
    }
  });

  test('LAN servers keep separate identities and credentials after re-pairing and reload', async () => {
    try {
      installTestWindow();
      const first = await upsertMobileConnection({
        label: 'Server A',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.10:2606' }],
        clientToken: 'token-a',
      });
      const firstId = first[0]?.id;
      const second = await upsertMobileConnection({
        label: 'Server B',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.20:2606' }],
        clientToken: 'token-b',
      });
      expect(second).toHaveLength(2);
      const secondId = second[0]?.id;
      expect(secondId).not.toBe(firstId);

      await upsertMobileConnection({
        label: 'Server A paired again',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.10:2606/' }],
        clientToken: 'token-a-new',
      });

      const reloaded = await loadMobileConnections();
      expect(reloaded).toHaveLength(2);
      expect(reloaded.find((connection) => connection.id === firstId)).toMatchObject({
        label: 'Server A paired again', clientToken: 'token-a-new',
      });
      expect(reloaded.find((connection) => connection.id === secondId)).toMatchObject({
        label: 'Server B', clientToken: 'token-b',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.20:2606' }],
      });
    } finally {
      restoreGlobals();
    }
  });

  test('adding a LAN server preserves a legacy saved LAN server', async () => {
    try {
      installTestWindow();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: 'legacy-a', label: 'Server A', url: 'http://192.168.1.10:2606', lastUsedAt: 10, clientToken: 'token-a' },
      ]));
      await upsertMobileConnection({
        label: 'Server B',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.20:2606' }],
        clientToken: 'token-b',
      });

      const reloaded = await loadMobileConnections();
      expect(reloaded).toHaveLength(2);
      expect(reloaded.find((connection) => connection.id === 'legacy-a')).toMatchObject({
        label: 'Server A', clientToken: 'token-a',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.10:2606' }],
      });
    } finally {
      restoreGlobals();
    }
  });

  test('relay servers stay distinct and re-pair by server identity when the LAN address changes', async () => {
    try {
      installTestWindow();
      const first = await upsertMobileConnection({
        label: 'Server A',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.10:2606' },
          { kind: 'relay', relay: testRelay },
        ],
        clientToken: 'token-a',
      });
      const firstId = first[0]?.id;
      const secondRelay = { ...testRelay, serverId: 'srv_second' };
      const second = await upsertMobileConnection({
        label: 'Server B',
        candidates: [{ kind: 'relay', relay: secondRelay }],
        clientToken: 'token-b',
      });
      const secondId = second[0]?.id;
      expect(second).toHaveLength(2);
      expect(secondId).not.toBe(firstId);

      await upsertMobileConnection({
        label: 'Server A paired again',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.30:2606' },
          { kind: 'relay', relay: testRelay },
        ],
        clientToken: 'token-a-new',
      });

      const reloaded = await loadMobileConnections();
      expect(reloaded).toHaveLength(2);
      expect(reloaded.find((connection) => connection.id === firstId)).toMatchObject({
        label: 'Server A paired again', clientToken: 'token-a-new',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.30:2606' },
          { kind: 'relay', relay: testRelay },
        ],
      });
      expect(reloaded.find((connection) => connection.id === secondId)).toMatchObject({
        label: 'Server B', clientToken: 'token-b',
        candidates: [{ kind: 'relay', relay: secondRelay }],
      });
    } finally {
      restoreGlobals();
    }
  });

  test('cancellation invalidates an in-flight password completion', async () => {
    const tracker = createMobilePasswordOperationTracker();
    const operation = tracker.begin();
    let resolveLogin: () => void = () => {
      throw new Error('Login was not started');
    };
    let switchedRuntime = false;
    const completion = new Promise<void>((resolve) => { resolveLogin = resolve; }).then(() => {
      if (tracker.isCurrent(operation)) switchedRuntime = true;
    });

    tracker.cancel();
    resolveLogin();
    await completion;

    expect(switchedRuntime).toBe(false);
  });

  test('removes inline tokens only after each secure migration succeeds', async () => {
    const result = await migrateLegacyInlineTokenRecords([
      { id: 'ok', url: 'http://ok.example', clientToken: 'token-ok' },
      { id: 'failed', url: 'http://failed.example', clientToken: 'token-failed' },
    ], async (url) => url.includes('ok.example'));

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.records[0]).toEqual({ id: 'ok', url: 'http://ok.example', hasToken: true });
    expect(result.records[1]).toEqual({ id: 'failed', url: 'http://failed.example', clientToken: 'token-failed' });
  });

  test('entries persisted before candidates migrate to a single direct candidate', async () => {
    try {
      installTestWindow();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: 'a', label: 'Home', url: 'http://192.168.1.10:2606', lastUsedAt: 10, clientToken: 'tok-a' },
        { id: 'b', label: 'Work', url: 'http://work.example', lastUsedAt: 5 },
      ]));

      const connections = await loadMobileConnections();
      expect(connections).toHaveLength(2);
      const home = connections.find((c) => c.id === 'a')!;
      expect(home.candidates).toEqual([{ kind: 'direct', url: 'http://192.168.1.10:2606' }]);
      expect(home.clientToken).toBe('tok-a');
    } finally {
      restoreGlobals();
    }
  });

  test('a relay device round-trips its candidate + token', async () => {
    try {
      installTestWindow();

      await upsertMobileConnection({
        label: 'My Desktop',
        candidates: [{ kind: 'relay', relay: testRelay }],
        clientToken: 'oc_client_secret',
      });

      const connections = await loadMobileConnections();
      expect(connections).toHaveLength(1);
      const saved = connections[0]!;
      expect(saved.candidates).toEqual([{ kind: 'relay', relay: testRelay }]);
      // Web surface: token stays inline like direct connections.
      expect(saved.clientToken).toBe('oc_client_secret');

      // Persisted metadata carries only the three transport fields — no grant/token.
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as Array<Record<string, unknown>>;
      const rawCandidate = (raw[0]?.candidates as Array<Record<string, unknown>>)[0];
      expect(rawCandidate.kind).toBe('relay');
      expect(Object.keys(rawCandidate.relay as object).sort()).toEqual(['hostEncPubJwk', 'relayUrl', 'serverId']);
    } finally {
      restoreGlobals();
    }
  });

  test('a multi-transport device persists all candidates in order (LAN then relay)', async () => {
    try {
      installTestWindow();
      await upsertMobileConnection({
        label: 'Both',
        candidates: [{ kind: 'direct', url: 'http://192.168.1.5:2606' }, { kind: 'relay', relay: testRelay }],
        clientToken: 'tok',
      });

      const connections = await loadMobileConnections();
      expect(connections[0]?.candidates.map((c) => c.kind)).toEqual(['direct', 'relay']);
    } finally {
      restoreGlobals();
    }
  });

  test('a legacy relay entry with malformed transport config is dropped, direct entries survive', async () => {
    try {
      installTestWindow();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { id: 'bad', label: 'Broken', lastUsedAt: 20, mode: 'relay', relay: { relayUrl: 'wss://relay.example' } },
        { id: 'ok', label: 'Home', url: 'http://192.168.1.10:2606', lastUsedAt: 10 },
      ]));

      const connections = await loadMobileConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]?.id).toBe('ok');
      expect(connections[0]?.candidates[0]?.kind).toBe('direct');
    } finally {
      restoreGlobals();
    }
  });

  test('relay and direct devices dedupe independently by candidate identity', async () => {
    try {
      installTestWindow();
      await upsertMobileConnection({ label: 'Direct', candidates: [{ kind: 'direct', url: 'http://host.example' }] });
      await upsertMobileConnection({ label: 'Relay', candidates: [{ kind: 'relay', relay: testRelay }] });
      await upsertMobileConnection({ label: 'Relay renamed', candidates: [{ kind: 'relay', relay: testRelay }] });

      const connections = await loadMobileConnections();
      expect(connections).toHaveLength(2);
      const relayEntries = connections.filter((c) => c.candidates.some((x) => x.kind === 'relay'));
      expect(relayEntries).toHaveLength(1);
      expect(relayEntries[0]?.label).toBe('Relay renamed');
    } finally {
      restoreGlobals();
    }
  });

  test('relay identities stay distinct when LAN candidates overlap', async () => {
    try {
      installTestWindow();
      const sharedLanUrl = 'http://192.168.1.40:2606';
      const otherRelay = { ...testRelay, serverId: 'srv_second' };
      await upsertMobileConnection({
        label: 'Server A',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: testRelay },
        ],
        clientToken: 'token-a',
      });
      await upsertMobileConnection({
        label: 'Server B',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: otherRelay },
        ],
        clientToken: 'token-b',
      });

      const saved = await loadMobileConnections();
      expect(saved).toHaveLength(2);
      expect(saved.find((connection) => connection.label === 'Server A')).toMatchObject({
        clientToken: 'token-a',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: testRelay },
        ],
      });
      expect(saved.find((connection) => connection.label === 'Server B')).toMatchObject({
        clientToken: 'token-b',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: otherRelay },
        ],
      });
    } finally {
      restoreGlobals();
    }
  });
});

describe('validateMobileConnectionSession', () => {
  test('accepts a reachable authenticated runtime', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Response.json({ ok: true });
      if (url.endsWith('/auth/session')) return Response.json({ authenticated: true, scope: 'client' });
      return new Response(null, { status: 404 });
    });
    try {
      installTestWindow();
      globalThis.fetch = fetchMock as typeof fetch;

      const result = await validateMobileConnectionSession({ url: 'https://runtime.example', clientToken: 'token' });
      expect(result).toBe(true);
    } finally {
      restoreGlobals();
    }
  });

  test('rejects unreachable runtimes', async () => {
    try {
      installTestWindow();
      globalThis.fetch = mock(async () => new Response(null, { status: 503 })) as typeof fetch;

      const result = await validateMobileConnectionSession({ url: 'https://runtime.example', clientToken: 'token' });
      expect(result).toBe(false);
    } finally {
      restoreGlobals();
    }
  });

  test('rejects invalid or unauthenticated sessions', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Response.json({ ok: true });
      return Response.json({ authenticated: false }, { status: 401 });
    });
    try {
      installTestWindow();
      globalThis.fetch = fetchMock as typeof fetch;

      const result = await validateMobileConnectionSession({ url: 'https://runtime.example', clientToken: 'expired' });
      expect(result).toBe(false);
    } finally {
      restoreGlobals();
    }
  });
});

describe('reprobeActiveConnection', () => {
  test('discards a delayed result after the user switches runtimes', async () => {
    let releaseHealth: () => void = () => { throw new Error('Health probe did not start'); };
    let healthStarted: () => void = () => { throw new Error('Health probe did not start'); };
    const started = new Promise<void>((resolve) => { healthStarted = resolve; });
    const healthGate = new Promise<void>((resolve) => { releaseHealth = resolve; });
    try {
      installTestWindow();
      await upsertMobileConnection({
        label: 'Old runtime',
        candidates: [{ kind: 'direct', url: 'https://old-candidate.example' }],
        clientToken: 'old-token',
      });
      const savedBeforeProbe = window.localStorage.getItem(STORAGE_KEY);
      switchRuntimeEndpoint({
        apiBaseUrl: 'https://old-active-transport.example',
        runtimeKey: 'https://old-candidate.example',
        clientToken: 'old-token',
      });
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/health')) {
          healthStarted();
          await healthGate;
          return Response.json({ ok: true });
        }
        if (url.endsWith('/auth/session')) {
          return Response.json({ authenticated: true, scope: 'client' });
        }
        return new Response(null, { status: 404 });
      });

      const reprobe = reprobeActiveConnection();
      await started;
      switchRuntimeEndpoint({ apiBaseUrl: 'https://new.example', runtimeKey: 'new-runtime' });
      releaseHealth();

      expect(await reprobe).toBe('stale');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(savedBeforeProbe);
      expect(getRuntimeKey()).toBe('new-runtime');
      expect(getRuntimeApiBaseUrl()).toBe('https://new.example');
    } finally {
      restoreGlobals();
    }
  });

  test('closes a relay probe that resolves after the user switches runtimes', async () => {
    let releaseSession: () => void = () => { throw new Error('Relay session probe did not start'); };
    let sessionStarted: () => void = () => { throw new Error('Relay session probe did not start'); };
    const started = new Promise<void>((resolve) => { sessionStarted = resolve; });
    const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    let closeCalls = 0;
    const tunnel: RelayTunnelClient = {
      async fetch() {
        sessionStarted();
        await sessionGate;
        return Response.json({ authenticated: true, scope: 'client' });
      },
      openWebSocket() {
        throw new Error('WebSocket is not used by this test');
      },
      probeLiveness: async () => undefined,
      getStatus: () => ({ state: 'connected' }),
      subscribeStatus: () => () => undefined,
      close: () => { closeCalls += 1; },
    };
    const originalCreateTunnel = relayTunnelClientModule.createRelayTunnelClient;
    const createTunnel = spyOn(relayTunnelClientModule, 'createRelayTunnelClient').mockReturnValue(tunnel);
    try {
      installTestWindow();
      globalThis.fetch = mock(async () => new Response(null, { status: 404 }));
      const oldRuntimeKey = `relay:${testRelay.serverId}@${testRelay.relayUrl}`;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{
        id: 'old-relay',
        label: 'Old relay',
        lastUsedAt: 1,
        hasToken: true,
        clientToken: 'old-token',
        candidates: [{ kind: 'relay', relay: testRelay }],
      }]));
      const savedBeforeProbe = window.localStorage.getItem(STORAGE_KEY);
      switchRuntimeEndpoint({
        apiBaseUrl: 'https://old-relay-virtual.example',
        runtimeKey: oldRuntimeKey,
        clientToken: 'old-token',
      });

      const reprobe = reprobeActiveConnection();
      await started;
      switchRuntimeEndpoint({ apiBaseUrl: 'https://new.example', runtimeKey: 'new-runtime' });
      releaseSession();

      expect(await reprobe).toBe('stale');
      expect(closeCalls).toBe(1);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(savedBeforeProbe);
      expect(getRuntimeKey()).toBe('new-runtime');
      expect(getRuntimeApiBaseUrl()).toBe('https://new.example');
    } finally {
      createTunnel.mockImplementation(originalCreateTunnel);
      restoreGlobals();
    }
  });

  test('rejects a delayed retry after the runtime endpoint changes', async () => {
    let fetchCalls = 0;
    const fetchMock: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response(null, { status: 503 });
    };
    try {
      installTestWindow();
      await upsertMobileConnection({
        label: 'Old runtime',
        candidates: [{ kind: 'direct', url: 'https://old-candidate.example' }],
      });
      switchRuntimeEndpoint({
        apiBaseUrl: 'https://old-candidate.example',
        runtimeKey: 'https://old-candidate.example',
      });
      globalThis.fetch = fetchMock;
      const startedRevision = getRuntimeEndpointRevision();
      const savedBeforeRetry = window.localStorage.getItem(STORAGE_KEY);
      const isCurrent = () => getRuntimeEndpointRevision() === startedRevision;

      expect(await reprobeActiveConnection({ isCurrent })).toBe('unreachable');
      const callsBeforeSwitch = fetchCalls;

      switchRuntimeEndpoint({ apiBaseUrl: 'https://new.example', runtimeKey: 'new-runtime' });
      expect(await reprobeActiveConnection({ isCurrent })).toBe('stale');

      expect(fetchCalls).toBe(callsBeforeSwitch);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(savedBeforeRetry);
      expect(getRuntimeKey()).toBe('new-runtime');
      expect(getRuntimeApiBaseUrl()).toBe('https://new.example');
    } finally {
      restoreGlobals();
    }
  });

  test('discards candidate refresh results after switching away from their connection', async () => {
    let releaseCandidates: () => void = () => { throw new Error('Candidate request did not start'); };
    let candidatesStarted: () => void = () => { throw new Error('Candidate request did not start'); };
    const candidateGate = new Promise<void>((resolve) => { releaseCandidates = resolve; });
    const candidateRequestStarted = new Promise<void>((resolve) => { candidatesStarted = resolve; });
    let oldRuntime: {
      apiBaseUrl: string;
      runtimeKey: string;
      clientToken: string;
      relay: ReturnType<typeof getActiveRelayDescriptor>;
    } | null = null;
    let tunnelCloseCalls = 0;
    const tunnel: RelayTunnelClient = {
      async fetch(input) {
        const path = String(input);
        if (path === '/auth/session') return Response.json({ authenticated: true, scope: 'client' });
        if (path === '/api/client-auth/connection/candidates') {
          candidatesStarted();
          await candidateGate;
          return Response.json({
            serverId: testRelay.serverId,
            candidates: [{ type: 'lan', url: 'http://192.168.1.40:2606' }],
          });
        }
        return Response.json({ ok: true });
      },
      openWebSocket() {
        throw new Error('WebSocket is not used by this test');
      },
      probeLiveness: async () => undefined,
      getStatus: () => ({ state: 'connected' }),
      subscribeStatus: () => () => undefined,
      close: () => { tunnelCloseCalls += 1; },
    };

    try {
      installTestWindow();
      oldRuntime = {
        apiBaseUrl: getRuntimeApiBaseUrl(),
        runtimeKey: getRuntimeKey(),
        clientToken: getRuntimeBearerTokenSync(),
        relay: getActiveRelayDescriptor(),
      };
      await upsertMobileConnection({
        id: 'refresh-source',
        label: 'Refresh source',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.10:2606' },
          { kind: 'relay', relay: testRelay },
        ],
        clientToken: 'old-token',
      });
      const savedBeforeRefresh = window.localStorage.getItem(STORAGE_KEY);
      const runtimeKey = `relay:${testRelay.serverId}@${testRelay.relayUrl}`;
      adoptRelayTunnel(testRelay, tunnel);
      switchRuntimeEndpoint({
        apiBaseUrl: 'https://old-relay-virtual.example',
        runtimeKey,
        clientToken: 'old-token',
        relay: testRelay,
      });

      expect(await reprobeActiveConnection()).toBe('unchanged');
      await candidateRequestStarted;

      switchRuntimeEndpoint({ apiBaseUrl: 'https://new-runtime.example', runtimeKey: 'new-runtime' });
      releaseCandidates();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(savedBeforeRefresh);
      expect(getRuntimeKey()).toBe('new-runtime');
      expect(getRuntimeApiBaseUrl()).toBe('https://new-runtime.example');
      expect(tunnelCloseCalls).toBe(1);
    } finally {
      if (oldRuntime) {
        switchRuntimeEndpoint({
          apiBaseUrl: oldRuntime.apiBaseUrl,
          runtimeKey: oldRuntime.runtimeKey,
          clientToken: oldRuntime.clientToken,
          relay: oldRuntime.relay,
        });
      }
      restoreGlobals();
    }
  }, 15_000);

  test('candidate refresh preserves edits and other devices with an overlapping LAN URL', async () => {
    const sharedLanUrl = 'http://192.168.1.40:2606';
    const otherRelay = { ...testRelay, serverId: 'srv_second' };
    let releaseCandidates: () => void = () => { throw new Error('Candidate request did not start'); };
    let candidatesStarted: () => void = () => { throw new Error('Candidate request did not start'); };
    const candidateGate = new Promise<void>((resolve) => { releaseCandidates = resolve; });
    const candidateRequestStarted = new Promise<void>((resolve) => { candidatesStarted = resolve; });
    let releaseHealth: () => void = () => { throw new Error('Refreshed-address probe did not start'); };
    let healthStarted: () => void = () => { throw new Error('Refreshed-address probe did not start'); };
    const healthGate = new Promise<void>((resolve) => { releaseHealth = resolve; });
    const healthRequestStarted = new Promise<void>((resolve) => { healthStarted = resolve; });
    let oldRuntime: {
      apiBaseUrl: string;
      runtimeKey: string;
      clientToken: string;
      relay: ReturnType<typeof getActiveRelayDescriptor>;
    } | null = null;
    let tunnelCloseCalls = 0;
    const tunnel: RelayTunnelClient = {
      async fetch(input) {
        const path = String(input);
        if (path === '/auth/session') return Response.json({ authenticated: true, scope: 'client' });
        if (path === '/api/client-auth/connection/candidates') {
          candidatesStarted();
          await candidateGate;
          return Response.json({
            serverId: testRelay.serverId,
            candidates: [{ type: 'lan', url: sharedLanUrl }],
          });
        }
        return new Response(null, { status: 404 });
      },
      openWebSocket() {
        throw new Error('WebSocket is not used by this test');
      },
      probeLiveness: async () => undefined,
      getStatus: () => ({ state: 'connected' }),
      subscribeStatus: () => () => undefined,
      close: () => { tunnelCloseCalls += 1; },
    };

    try {
      installTestWindow();
      oldRuntime = {
        apiBaseUrl: getRuntimeApiBaseUrl(),
        runtimeKey: getRuntimeKey(),
        clientToken: getRuntimeBearerTokenSync(),
        relay: getActiveRelayDescriptor(),
      };
      await upsertMobileConnection({
        id: 'refresh-source',
        label: 'Server A',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.10:2606' },
          { kind: 'relay', relay: testRelay },
        ],
        clientToken: 'token-a',
      });
      await upsertMobileConnection({
        id: 'shared-address-device',
        label: 'Server B',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: otherRelay },
        ],
        clientToken: 'token-b',
      });
      adoptRelayTunnel(testRelay, tunnel);
      switchRuntimeEndpoint({
        apiBaseUrl: 'https://old-relay-virtual.example',
        runtimeKey: `relay:${testRelay.serverId}@${testRelay.relayUrl}`,
        clientToken: 'token-a',
        relay: testRelay,
      });
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.startsWith(`${sharedLanUrl}/health`)) {
          healthStarted();
          await healthGate;
          return Response.json({ ok: true, serverId: testRelay.serverId });
        }
        if (url.endsWith('/auth/session')) return Response.json({ authenticated: true, scope: 'client' });
        return new Response(null, { status: 503 });
      };

      expect(await reprobeActiveConnection()).toBe('unchanged');
      await candidateRequestStarted;
      await upsertMobileConnection({
        id: 'refresh-source',
        label: 'Server A renamed during refresh',
        candidates: [
          { kind: 'direct', url: 'http://192.168.1.10:2606' },
          { kind: 'relay', relay: testRelay },
        ],
      });
      releaseCandidates();
      await healthRequestStarted;

      const committed = await loadMobileConnections();
      expect(committed).toHaveLength(2);
      expect(committed.find((connection) => connection.id === 'refresh-source')).toMatchObject({
        label: 'Server A renamed during refresh',
        clientToken: 'token-a',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: testRelay },
        ],
      });
      expect(committed.find((connection) => connection.id === 'shared-address-device')).toMatchObject({
        label: 'Server B',
        clientToken: 'token-b',
        candidates: [
          { kind: 'direct', url: sharedLanUrl },
          { kind: 'relay', relay: otherRelay },
        ],
      });

      switchRuntimeEndpoint({ apiBaseUrl: 'https://manual-switch.example', runtimeKey: 'manual-switch' });
      releaseHealth();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(getRuntimeKey()).toBe('manual-switch');
      expect(await loadMobileConnections()).toEqual(committed);
      expect(tunnelCloseCalls).toBe(1);
    } finally {
      if (oldRuntime) {
        switchRuntimeEndpoint({
          apiBaseUrl: oldRuntime.apiBaseUrl,
          runtimeKey: oldRuntime.runtimeKey,
          clientToken: oldRuntime.clientToken,
          relay: oldRuntime.relay,
        });
      }
      restoreGlobals();
    }
  }, 15_000);
});
