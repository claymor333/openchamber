import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

class MockEventStream {
  static instances: MockEventStream[] = [];

  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private closed = false;

  constructor(public readonly signal: AbortSignal | null | undefined) {
    MockEventStream.instances.push(this);
  }

  start(controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.controller = controller;
    if (this.signal?.aborted) this.close();
    else this.signal?.addEventListener('abort', () => this.close(), { once: true });
  }

  emit(data: string, lineEnding = '\n'): void {
    if (this.closed) return;
    this.controller?.enqueue(new TextEncoder().encode(`data: ${data}${lineEnding}${lineEnding}`));
  }

  emitChunks(chunks: string[]): void {
    if (this.closed) return;
    for (const chunk of chunks) this.controller?.enqueue(new TextEncoder().encode(chunk));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller?.close();
    } catch {
      // The stream may already be closed by the abort signal.
    }
  }
}

const originalFetch = globalThis.fetch;

const waitForStream = async (): Promise<MockEventStream> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stream = MockEventStream.instances[0];
    if (stream) return stream;
    await Promise.resolve();
  }
  throw new Error('Event stream was not opened');
};

const waitForStreamCount = async (count: number): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (MockEventStream.instances.length < count && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  if (MockEventStream.instances.length < count) throw new Error(`Expected ${count} event streams`);
};

const flushStream = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('openchamber events', () => {
  beforeEach(() => {
    MockEventStream.instances = [];
    Object.defineProperty(globalThis, 'window', {
      value: Object.assign(new EventTarget(), { location: new URL('http://runtime.test') }),
      configurable: true,
      writable: true,
    });
    globalThis.fetch = async (_input, init) => {
      const stream = new MockEventStream(init?.signal);
      const body = new ReadableStream<Uint8Array>({ start: (controller) => stream.start(controller) });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  });

  afterEach(() => {
    for (const stream of MockEventStream.instances) stream.close();
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'window');
  });

  test('does not open the server-only event stream in VS Code', async () => {
    Object.defineProperty(window, '__VSCODE_CONFIG__', {
      value: { workspaceFolder: 'C:/repo', workspaceFolders: [] },
      configurable: true,
    });
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const unsubscribe = subscribeOpenchamberEvents(() => undefined);
    try {
      expect(MockEventStream.instances).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  test('dispatches externally created session events', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));
    const source = await waitForStream();

    source.emit(JSON.stringify({
        type: 'openchamber:session-created',
        properties: {
          sessionId: 'ses_123',
          directory: '/repo/worktrees/research',
          projectId: 'project_1',
          createdAt: 123,
          promptDispatched: true,
          dispatchedAsCommand: false,
        },
      }));
    await flushStream();

    expect(events).toEqual([
      {
        type: 'session-created',
        sessionId: 'ses_123',
        directory: '/repo/worktrees/research',
        projectId: 'project_1',
        createdAt: 123,
        promptDispatched: true,
        dispatchedAsCommand: false,
      },
    ]);
    unsubscribe();
  });

  test('parses multi-line data when CRLF delimiters are split across chunks', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));
    const source = await waitForStream();
    const frame = [
      'data: {"type":"openchamber:worktree-changed",',
      'data: "properties":{"directories":["/split"],"at":321}}',
      '',
      '',
    ].join('\r\n');
    const firstLineCarriageReturn = frame.indexOf('\r');
    const separatorStart = frame.length - 4;
    const boundaries = [
      firstLineCarriageReturn + 1,
      firstLineCarriageReturn + 2,
      separatorStart + 1,
      separatorStart + 2,
      separatorStart + 3,
    ];
    const chunks: string[] = [];
    let start = 0;
    for (const boundary of boundaries) {
      chunks.push(frame.slice(start, boundary));
      start = boundary;
    }
    chunks.push(frame.slice(start));

    source.emitChunks(chunks);
    await flushStream();

    expect(events).toEqual([
      { type: 'worktree-changed', directories: ['/split'], changedAt: 321 },
    ]);
    unsubscribe();
  });

  test('aborts the failed reader before reconnecting when a listener throws', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const unsubscribe = subscribeOpenchamberEvents(() => {
      throw new Error('listener failed');
    });
    const source = await waitForStream();

    source.emit(JSON.stringify({ type: 'openchamber:event-stream-ready', properties: {} }));
    await flushStream();

    expect(source.signal?.aborted).toBe(true);
    await waitForStreamCount(2);
    expect(MockEventStream.instances[1]?.signal?.aborted).not.toBe(true);
    unsubscribe();
  });

  test('stops dispatching buffered frames as soon as the runtime changes', async () => {
    const { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } = await import('./runtime-switch');
    const { getRuntimeBearerTokenSync } = await import('./runtime-auth');
    const previousRuntime = {
      apiBaseUrl: getRuntimeApiBaseUrl(),
      runtimeKey: getRuntimeKey(),
      clientToken: getRuntimeBearerTokenSync(),
    };
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => {
      events.push(event);
      if (event.type === 'event-stream-ready') {
        switchRuntimeEndpoint({ apiBaseUrl: 'https://switched.test', runtimeKey: 'switched-runtime' });
      }
    });
    const source = await waitForStream();
    const readyFrame = JSON.stringify({ type: 'openchamber:event-stream-ready', properties: {} });
    const nextFrame = JSON.stringify({
      type: 'openchamber:worktree-changed',
      properties: { directories: ['/stale-runtime'], at: 123 },
    });

    try {
      source.emitChunks([`data: ${readyFrame}\n\ndata: ${nextFrame}\n\n`]);
      await flushStream();

      expect(events).toEqual([{ type: 'event-stream-ready' }]);
      expect(source.signal?.aborted).toBe(true);
      await waitForStreamCount(2);
    } finally {
      unsubscribe();
      switchRuntimeEndpoint(previousRuntime);
    }
  });

  test('a connected control SSE stream clears delivered queues without reconnecting or polling', async () => {
    const { subscribeMessageQueueSync } = await import('@/sync/message-queue-sync');
    const { getRuntimeKey } = await import('./runtime-switch');
    const { useMessageQueueStore, createMessageQueueTarget, getMessageQueueKey } = await import('@/stores/messageQueueStore');
    const runtimeKey = getRuntimeKey();
    const target = createMessageQueueTarget('session-sse', '/repo', runtimeKey);
    if (!target) throw new Error('Missing queue target');
    useMessageQueueStore.getState().resetForRuntimeSwitch(runtimeKey);
    useMessageQueueStore.setState({ queuedMessages: {}, sendingIds: {} });
    const originalFetch = globalThis.fetch;
    let reads = 0;
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
      if (url.pathname === '/api/openchamber/events') {
        const stream = new MockEventStream(init?.signal);
        const body = new ReadableStream<Uint8Array>({ start: (controller) => stream.start(controller) });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      if (url.pathname === '/api/message-queue') reads += 1;
      return Response.json({ revision: 1, sessions: [] });
    }, originalFetch);
    const unsubscribe = subscribeMessageQueueSync(runtimeKey);
    const source = await waitForStream();
    try {
      source.emit(JSON.stringify({ type: 'openchamber:event-stream-ready', properties: {} }));
      await flushStream();
      expect(reads).toBe(1);
      const session = { sessionId: target.sessionId, directory: target.directory, sendingId: 'q1', items: [{ id: 'q1', content: 'queued', text: 'queued', createdAt: 1, attachments: [], sendConfig: { providerID: 'p', modelID: 'm' } }] };
      source.emit(JSON.stringify({ type: 'openchamber:message-queue.updated', properties: { revision: 2, session } }));
      await flushStream();
      const key = getMessageQueueKey(target);
      expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1);
      source.emit(JSON.stringify({ type: 'openchamber:message-queue.updated', properties: { revision: 3, session: { ...session, items: [], sendingId: null } } }));
      await flushStream();
      expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined();
      expect(useMessageQueueStore.getState().sendingIds[key]).toBeUndefined();
      expect(reads).toBe(1);
      expect(MockEventStream.instances).toHaveLength(1);
      unsubscribe();
      source.emit(JSON.stringify({ type: 'openchamber:message-queue.updated', properties: { revision: 4, session } }));
      await flushStream();
      expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined();
    } finally {
      unsubscribe();
      globalThis.fetch = originalFetch;
    }
  });

  test('dispatches worktree topology changes', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));
    const source = await waitForStream();

    source.emit(JSON.stringify({
        type: 'openchamber:worktree-changed',
        properties: { directories: ['/repo', '/repo-linked'], at: 456 },
      }));
    source.emit(JSON.stringify({
        type: 'openchamber:worktree-changed',
        properties: { directories: [], at: 789 },
      }));
    await flushStream();

    expect(events).toEqual([
      { type: 'worktree-changed', directories: ['/repo', '/repo-linked'], changedAt: 456 },
    ]);
    unsubscribe();
  });

  test('dispatches an agent file-open request and drops one without a path', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));
    const source = await waitForStream();

    source.emit(JSON.stringify({
        type: 'openchamber:file-open-request',
        properties: { path: '/repo/out/report.csv', directory: '/repo', sessionId: null },
      }));
    source.emit(JSON.stringify({
        type: 'openchamber:file-open-request',
        properties: { directory: '/repo', sessionId: 'ses_1' },
      }));
    await flushStream();

    expect(events).toEqual([
      { type: 'file-open-request', path: '/repo/out/report.csv', directory: '/repo', sessionId: null },
    ]);
    unsubscribe();
  });

  test('dispatches validated notification events', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));
    const source = await waitForStream();

    source.emit(JSON.stringify({
      type: 'openchamber:notification',
      properties: { kind: 'agent-complete', sessionId: 'ses_1', title: 'Done' },
    }));
    source.emit(JSON.stringify({
      type: 'openchamber:notification',
      properties: { kind: 5 },
    }));
    await flushStream();

    expect(events).toEqual([
      { type: 'notification', payload: { kind: 'agent-complete', sessionId: 'ses_1', title: 'Done' } },
    ]);
    unsubscribe();
  });
});
