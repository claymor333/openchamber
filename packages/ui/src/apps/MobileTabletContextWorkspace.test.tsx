import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { MobileTabletChatFrame } from './MobileTabletChatFrame';

test('the chat/composer keeps its mounted ancestry and focus as tablet chrome changes', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    location: dom.location,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    Node: dom.Node,
    Event: dom.Event,
    FocusEvent: dom.FocusEvent,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mounts = 0;
  const ChatComposer = () => {
    React.useEffect(() => {
      mounts += 1;
      return () => { mounts -= 1; };
    }, []);
    return <textarea aria-label="composer" defaultValue="unsaved prompt" />;
  };
  const render = async (enabled: boolean) => {
    await act(async () => {
      root.render(
        <MobileTabletChatFrame
          enabled={enabled}
          leftPanel={<aside aria-label="sessions" />}
          rightPanel={<aside aria-label="context" />}
          bottomPanel={<aside aria-label="bottom context" />}
          rail={<nav aria-label="context rail" />}
        >
          <ChatComposer />
        </MobileTabletChatFrame>,
      );
    });
  };

  try {
    await render(true);
    const composer = container.querySelector<HTMLTextAreaElement>('[aria-label="composer"]');
    if (!composer) throw new Error('Missing composer');
    composer.focus();
    expect(document.activeElement).toBe(composer);

    await render(false);
    await render(true);

    expect(container.querySelector('[aria-label="composer"]')).toBe(composer);
    expect(composer.value).toBe('unsaved prompt');
    expect(document.activeElement).toBe(composer);
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    await dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
