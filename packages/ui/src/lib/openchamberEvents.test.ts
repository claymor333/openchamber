import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const requests: Array<{ url: string; init: RequestInit }> = [];
let pendingControllers: Array<ReadableStreamDefaultController<Uint8Array>> = [];

mock.module('./runtime-fetch', () => ({
  runtimeFetch: (url: string, init: RequestInit = {}) => {
    requests.push({ url, init });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        pendingControllers.push(controller);
      },
    });
    return Promise.resolve(new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));
  },
}));

mock.module('./runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: () => () => undefined,
}));

const writeFrame = (payload: unknown, lineEnding = '\n'): void => {
  const controller = pendingControllers[pendingControllers.length - 1];
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}${lineEnding}${lineEnding}`));
};

const dispatchFrame = async (payload: unknown): Promise<void> => {
  writeFrame(payload);
  await new Promise((resolve) => setTimeout(resolve, 10));
};

const closeStream = (): void => {
  pendingControllers[pendingControllers.length - 1]?.close();
};

describe('openchamber events', () => {
  beforeEach(() => {
    requests.length = 0;
    pendingControllers = [];
    globalThis.window = {} as Window & typeof globalThis;
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test('subscribes through runtimeFetch', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));

    await Promise.resolve();
    expect(requests.length).toBe(1);
    expect(requests[0].url).toBe('/api/openchamber/events');
    expect(requests[0].init.headers).toEqual({ Accept: 'text/event-stream' });
    unsubscribe();
    closeStream();
  });

  test('dispatches externally created session events', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    const unsubscribe = subscribeOpenchamberEvents(listener);

    writeFrame({
      type: 'openchamber:session-created',
      properties: {
        sessionId: 'ses_123',
        directory: '/repo/worktrees/research',
        projectId: 'project_1',
        createdAt: 123,
        promptDispatched: true,
        dispatchedAsCommand: false,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

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
    closeStream();
  });

  test('dispatches events framed with CRLF line endings', async () => {
    const { subscribeOpenchamberEvents } = await import('./openchamberEvents');
    const events: unknown[] = [];
    const unsubscribe = subscribeOpenchamberEvents((event) => events.push(event));

    writeFrame({
      type: 'openchamber:session-created',
      properties: { sessionId: 'ses_crlf', directory: '/repo/worktrees/research' },
    }, '\r\n');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).toContain('ses_crlf');
    unsubscribe();
    closeStream();
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
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://runtime.test');
      if (url.pathname === '/api/message-queue') reads += 1;
      return Response.json({ revision: 1, sessions: [] });
    }, originalFetch);
    const unsubscribe = subscribeMessageQueueSync(runtimeKey);
     try {
       await dispatchFrame({ type: 'openchamber:event-stream-ready', properties: {} });
      await useMessageQueueStore.getState().hydrate();
      expect(reads).toBe(1);
      const session = { sessionId: target.sessionId, directory: target.directory, sendingId: 'q1', items: [{ id: 'q1', content: 'queued', text: 'queued', createdAt: 1, attachments: [], sendConfig: { providerID: 'p', modelID: 'm' } }] };
       await dispatchFrame({ type: 'openchamber:message-queue.updated', properties: { revision: 2, session } });
      const key = getMessageQueueKey(target);
      expect(useMessageQueueStore.getState().queuedMessages[key]).toHaveLength(1);
       await dispatchFrame({ type: 'openchamber:message-queue.updated', properties: { revision: 3, session: { ...session, items: [], sendingId: null } } });
      expect(useMessageQueueStore.getState().queuedMessages[key]).toBeUndefined();
      expect(useMessageQueueStore.getState().sendingIds[key]).toBeUndefined();
      expect(reads).toBe(1);
       unsubscribe();
       writeFrame({ type: 'openchamber:message-queue.updated', properties: { revision: 4, session } });
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

     await dispatchFrame({
       type: 'openchamber:worktree-changed',
       properties: { directories: ['/repo', '/repo-linked'], at: 456 },
     });
     await dispatchFrame({
       type: 'openchamber:worktree-changed',
       properties: { directories: [], at: 789 },
     });

    expect(events).toEqual([
      { type: 'worktree-changed', directories: ['/repo', '/repo-linked'], changedAt: 456 },
    ]);
    unsubscribe();
  });
});
