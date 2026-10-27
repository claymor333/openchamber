import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { useMobileWorkspaceActivity, type MobileWorkspaceActivity } from './mobileWorkspaceActivity';

test('workspace activity follows document visibility and Capacitor activity marker', async () => {
  const dom = new Window();
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    MutationObserver: dom.MutationObserver,
    Event: dom.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  dom.document.documentElement.classList.add('oc-native-app-active');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let activity: MobileWorkspaceActivity = {
    documentVisible: false,
    nativeAppActive: false,
    dialogOpen: false,
    workspaceSurfaceVisible: true,
  };
  let renders = 0;
  const Probe = () => {
    renders += 1;
    activity = useMobileWorkspaceActivity(true);
    return null;
  };
  const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  try {
    await act(async () => root.render(<Probe />));
    expect(activity).toEqual({
      documentVisible: true,
      nativeAppActive: true,
      dialogOpen: false,
      workspaceSurfaceVisible: true,
    });
    const initialActivity = activity;
    dom.document.documentElement.classList.add('unrelated-shell-class');
    await settle();
    expect(activity).toBe(initialActivity);
    expect(renders).toBe(1);

    await act(async () => dom.document.documentElement.classList.remove('oc-native-app-active'));
    await settle();
    expect(activity.nativeAppActive).toBe(false);
    expect(renders).toBe(2);

    await act(async () => dom.document.documentElement.classList.add('oc-native-app-active'));
    await settle();
    expect(activity.nativeAppActive).toBe(true);
    expect(renders).toBe(3);

    await act(async () => dom.document.documentElement.classList.add('oc-dialog-open'));
    await settle();
    expect(activity.dialogOpen).toBe(true);
    expect(renders).toBe(4);

    await act(async () => dom.document.documentElement.classList.remove('oc-dialog-open'));
    await settle();
    expect(activity.dialogOpen).toBe(false);
    expect(renders).toBe(5);

    Object.defineProperty(dom.document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => dom.document.dispatchEvent(new dom.Event('visibilitychange')));
    expect(activity.documentVisible).toBe(false);
    expect(renders).toBe(6);

    Object.defineProperty(dom.document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => dom.document.dispatchEvent(new dom.Event('visibilitychange')));
    expect(activity.documentVisible).toBe(true);
    expect(renders).toBe(7);
  } finally {
    await act(async () => root.unmount());
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
