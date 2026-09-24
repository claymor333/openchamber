import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { useWebNotificationStream } from './useWebNotificationStream';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import type { NotificationPayload } from '@/lib/api/types';
import { useUIStore } from '@/stores/useUIStore';
import { configureRuntimeUrlResolver } from '@/lib/runtime-url';
import { createWebNotificationsAPI } from '../../../web/src/api/notifications';

class EventStreamFixture {
  static instances: EventStreamFixture[] = [];
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private closed = false;

  constructor(readonly url: string, readonly signal: AbortSignal | null | undefined) {
    EventStreamFixture.instances.push(this);
    if (signal?.aborted) this.close();
    else signal?.addEventListener('abort', () => this.close(), { once: true });
  }

  createResponse(): Response {
    return new Response(new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        if (this.closed) controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  emit(properties: NotificationPayload | { title: number }) {
    if (this.closed) return;
    const envelope = JSON.stringify({ type: 'openchamber:notification', properties });
    this.controller?.enqueue(new TextEncoder().encode(`data: ${envelope}\n\n`));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller?.close();
    } catch {
      // The stream may already be closed by the abort signal.
    }
  }
}

const waitForEventStreamCount = async (count: number): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (EventStreamFixture.instances.length < count && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  if (EventStreamFixture.instances.length < count) throw new Error(`Expected ${count} event streams`);
};

const flushEventStream = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

// Real mounted hook and notification API, with only browser boundary fixtures.
test('shares one control stream, deduplicates main-stream delivery, and retires old runtimes', async () => {
  const dom = new Window({ url: 'http://notification.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const delivered: string[] = [];
  const originalFetch = globalThis.fetch;
  class NotificationFixture {
    static permission = 'granted';
    constructor(title: string) { delivered.push(title); }
  }
  const previousSettings = useUIStore.getState();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent,
    Notification: NotificationFixture,
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, 'http://notification.test').pathname !== '/api/openchamber/events') {
        return originalFetch(input, init);
      }
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return new EventStreamFixture(url, signal).createResponse();
    }, originalFetch),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  EventStreamFixture.instances = [];
  const notifications = createWebNotificationsAPI();
  Object.defineProperty(window, '__OPENCHAMBER_RUNTIME_APIS__', { value: { notifications }, configurable: true });
  useUIStore.setState({ nativeNotificationsEnabled: true, notificationMode: 'always' });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe({ enabled }: { enabled: boolean }) {
    useWebNotificationStream({ enabled });
    return null;
  }
  const unsubscribeControl = subscribeOpenchamberEvents(() => {});
  try {
    await act(async () => root.render(<Probe enabled={false} />));
    await waitForEventStreamCount(1);
    expect(EventStreamFixture.instances).toHaveLength(1);
    await act(async () => root.render(<Probe enabled />));
    expect(EventStreamFixture.instances).toHaveLength(1);
    const source = EventStreamFixture.instances[0];
    expect(source.url).toContain('/api/openchamber/events');
    const payload = { title: 'Done', body: 'Ready', sessionId: 'session-one', kind: 'complete', directory: '/repo' };
    await act(async () => {
      source.emit(payload);
      await flushEventStream();
      // The main event pipeline forwards these same identity fields to this API.
      await notifications.notifyAgentCompletion(payload);
    });
    expect(delivered).toEqual(['Done']);
    source.emit({ title: 123 });
    expect(delivered).toEqual(['Done']);

    useUIStore.setState({ nativeNotificationsEnabled: false });
    await act(async () => {
      source.emit({ ...payload, title: 'Disabled' });
      await flushEventStream();
    });
    expect(delivered).toEqual(['Done']);
    useUIStore.setState({ nativeNotificationsEnabled: true });

    configureRuntimeUrlResolver({ apiBaseUrl: 'http://other-runtime.test', realtimeBaseUrl: 'http://other-runtime.test' });
    window.dispatchEvent(new CustomEvent('openchamber:runtime-endpoint-changed'));
    expect(source.signal?.aborted).toBe(true);
    await waitForEventStreamCount(2);
    expect(EventStreamFixture.instances).toHaveLength(2);
    const next = EventStreamFixture.instances[1];
    expect(next.url).toContain('other-runtime.test');
    await act(async () => {
      source.emit({ ...payload, title: 'Stale' });
      next.emit({ ...payload, title: 'New runtime' });
      await flushEventStream();
    });
    expect(delivered).toEqual(['Done', 'New runtime']);

    await act(async () => root.render(<Probe enabled={false} />));
    await act(async () => {
      next.emit({ ...payload, title: 'Unmounted notification listener' });
      await flushEventStream();
    });
    expect(delivered).toEqual(['Done', 'New runtime']);
    expect(next.signal?.aborted).not.toBe(true); // Other control consumers still own it.
  } finally {
    await act(async () => root.unmount());
    unsubscribeControl();
    configureRuntimeUrlResolver({});
    useUIStore.setState({ nativeNotificationsEnabled: previousSettings.nativeNotificationsEnabled, notificationMode: previousSettings.notificationMode });
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    for (const stream of EventStreamFixture.instances) stream.close();
    await dom.happyDOM.close();
  }
});
