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

const writeFrame = (payload: unknown): void => {
  const controller = pendingControllers[pendingControllers.length - 1];
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
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
});
