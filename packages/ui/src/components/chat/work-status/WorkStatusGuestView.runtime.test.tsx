import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { GuestStatusView } from '@openchamber/sdk';

import { toast } from '@/components/ui/toast';
import { I18nProvider } from '@/lib/i18n';
import type { GuestStatusControlBinding } from '@/lib/guests/status-controls';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { GuestStatusViewBody } from './WorkStatusGuestView';

const view: GuestStatusView = {
  rows: [{ kind: 'line', id: 'cpu', label: 'CPU', value: '25%' }],
  controls: [{ kind: 'button', id: 'refresh', label: 'Refresh' }],
};

const settle = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

test('status actions reject stale runtime callbacks and completions while the new desktop scope remains active', async () => {
  const dom = new Window({ url: 'http://runtime-a.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element,
    Node: dom.Node, Event: dom.Event, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom),
    localStorage: dom.localStorage, PointerEvent: dom.PointerEvent, MouseEvent: dom.MouseEvent, HTMLInputElement: dom.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const previousResolver = getRuntimeUrlResolver();
  const previousApiBase = Object.getOwnPropertyDescriptor(dom, '__OPENCHAMBER_API_BASE_URL__');
  const setRuntime = (host: string) => {
    Object.defineProperty(dom, '__OPENCHAMBER_API_BASE_URL__', { configurable: true, writable: true, value: host });
    configureRuntimeUrlResolver({ apiBaseUrl: host });
  };
  setRuntime('http://runtime-a.test');
  const runtimeAKey = getRuntimeKey();
  let holdNextPost = false;
  let heldPostStarted = false;
  let releaseHeldPost: (response: Response) => void = () => undefined;
  const requests: Array<{ host: string; method: string }> = [];
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    const request = JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : '{}')));
    requests.push({ host: new URL(target).host, method: request.method });
    if (!target.includes('/api/guests/monitor/service/request')) return Response.json({});
    if (request.method === 'POST' && holdNextPost) {
      holdNextPost = false;
      heldPostStarted = true;
      return new Promise<Response>((resolve) => { releaseHeldPost = resolve; });
    }
    return request.method === 'POST'
      ? Response.json({ status: 204, body: '' })
      : Response.json({ status: 200, body: JSON.stringify(view) });
  });
  const toastError = spyOn(toast, 'error');
  const bindings: Array<GuestStatusControlBinding | null> = [];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (interval: number) => act(async () => root.render(
    <I18nProvider>
      <GuestStatusViewBody
        guestId="monitor"
        source={{ path: '/status', interval }}
        directory="/repo"
        onStatusControls={(binding) => bindings.push(binding)}
      />
    </I18nProvider>,
  ));

  try {
    await render(60_000);
    await settle();
    const oldBinding = bindings.at(-1);
    if (!oldBinding) throw new Error('Initial status controls were not published');
    const oldDispatch = oldBinding.dispatch;

    setRuntime('http://runtime-b.test');
    expect(getRuntimeKey()).not.toBe(runtimeAKey);
    await render(61_000);
    await settle();
    const currentBinding = bindings.at(-1);
    if (!currentBinding) throw new Error('Status controls were not republished for the new runtime');
    const requestsBeforeStaleAction = requests.length;
    await act(async () => oldDispatch({ id: 'refresh' }));
    await settle();
    expect(requests).toHaveLength(requestsBeforeStaleAction);
    expect(toastError.mock.calls).toEqual([]);

    await act(async () => currentBinding.dispatch({ id: 'refresh' }));
    await settle();
    expect(requests.filter((request) => request.host === 'runtime-b.test' && request.method === 'POST')).toHaveLength(1);

    const pendingBinding = bindings.at(-1);
    if (!pendingBinding) throw new Error('Status controls disappeared after a valid action');
    holdNextPost = true;
    await act(async () => pendingBinding.dispatch({ id: 'refresh' }));
    await settle();
    if (!heldPostStarted) throw new Error('The pending action request did not start');

    setRuntime('http://runtime-c.test');
    await render(62_000);
    await settle();
    const runtimeCReads = requests.filter((request) => request.host === 'runtime-c.test' && request.method === 'GET').length;
    releaseHeldPost(Response.json({ error: 'DISABLED', message: 'The previous runtime disabled this service.' }, { status: 400 }));
    await settle();
    expect(toastError.mock.calls).toEqual([]);
    expect(requests.filter((request) => request.host === 'runtime-c.test' && request.method === 'GET')).toHaveLength(runtimeCReads);
    expect(requests.filter((request) => request.host === 'runtime-c.test' && request.method === 'POST')).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    fetch.mockRestore();
    toastError.mockRestore();
    setRuntimeUrlResolver(previousResolver);
    if (previousApiBase) Object.defineProperty(dom, '__OPENCHAMBER_API_BASE_URL__', previousApiBase);
    else Reflect.deleteProperty(dom, '__OPENCHAMBER_API_BASE_URL__');
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
