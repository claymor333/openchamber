import React from 'react';
import { act } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';

import { MobileFileEditorHost } from './MobileFileEditor';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useUIStore } from '@/stores/useUIStore';
import { resolveZoneActiveTab, zoneOfMode } from '@/lib/workspace/zones';

const SYNC_SDK = OpenCode.make({ baseUrl: 'http://opencode.test', fetch: async () => Response.json([]) });

const DraftCodeMirror: React.FC<{
  autoSaveEnabled: boolean;
  onSave: (content: string) => void;
  onView: (view: EditorView) => void;
}> = ({ autoSaveEnabled, onSave, onView }) => {
  const [editorHost, setEditorHost] = React.useState<HTMLDivElement | null>(null);
  const [draft, setDraft] = React.useState('base\n');
  React.useLayoutEffect(() => {
    if (!editorHost) return undefined;
    const view = new EditorView({
      state: EditorState.create({
        doc: 'base\n',
        extensions: [EditorView.updateListener.of((update) => {
          if (update.docChanged) setDraft(update.state.doc.toString());
        })],
      }),
      parent: editorHost,
    });
    onView(view);
    return () => view.destroy();
  }, [editorHost, onView]);
  React.useEffect(() => {
    if (!autoSaveEnabled || draft === 'base\n') return undefined;
    const timer = window.setTimeout(() => onSave(draft), 1500);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, draft, onSave]);
  return <div ref={setEditorHost} className="h-full min-h-0" />;
};

const createHostFixture = async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const originalFetch = globalThis.fetch;
  const globals = {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    location: dom.location,
    localStorage: dom.localStorage,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    Node: dom.Node,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    KeyboardEvent: dom.KeyboardEvent,
    MouseEvent: dom.MouseEvent,
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
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/session-warming') return Response.json({ revision: 0, enabled: false, minutes: 5, sessions: [] });
    if (url.pathname === '/api/fs/list') {
      return Response.json({ directory: '/repo', entries: [{ name: 'mobile.ts', path: '/repo/mobile.ts', isDirectory: false }] });
    }
    if (url.pathname.includes('/event')) {
      return new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    }
    return Response.json({});
  };
  const { createRoot } = await import('react-dom/client');
  const firstHost = document.createElement('div');
  const secondHost = document.createElement('div');
  const container = document.createElement('div');
  document.body.append(firstHost, secondHost, container);
  const root = createRoot(container);
  const viewRef = React.createRef<EditorView>();
  const writes: string[] = [];
  const onSave = (content: string) => { writes.push(content); };
  const onView = (view: EditorView) => { viewRef.current = view; };
  const render = async (
    host: HTMLElement | null,
    autoSaveEnabled: boolean,
    drawer: React.ReactNode = null,
    wrap?: (children: React.ReactNode) => React.ReactNode,
  ) => {
    await act(async () => {
      const children = (
        <>
          <MobileFileEditorHost host={host}>
            <DraftCodeMirror autoSaveEnabled={autoSaveEnabled} onSave={onSave} onView={onView} />
          </MobileFileEditorHost>
          {drawer}
        </>
      );
      root.render(wrap ? wrap(children) : children);
    });
  };
  return {
    dom,
    container,
    firstHost,
    secondHost,
    viewRef,
    writes,
    render,
    async destroy() {
      await act(async () => root.unmount());
      firstHost.remove();
      secondHost.remove();
      container.remove();
      globalThis.fetch = originalFetch;
      await dom.happyDOM.abort();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
};

const waitForEditor = async (container: HTMLElement) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const content = container.ownerDocument.querySelector<HTMLElement>('.cm-content[contenteditable="true"]');
    if (content) {
      const view = EditorView.findFromDOM(content);
      if (view) return { content, view };
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error('The CodeMirror editor did not mount');
};

const expectActiveSharedFile = (path: string) => {
  const state = useUIStore.getState();
  const panel = state.contextPanelByDirectory['/repo'];
  const zone = zoneOfMode(state.contextSurfaceZones, 'file');
  expect(panel ? resolveZoneActiveTab(panel, state.contextSurfaceZones, zone) : null)
    .toMatchObject({ mode: 'file', targetPath: path });
};

test('moving the mobile editor host preserves an autosave-disabled buffer, selection, and focus', async () => {
  const fixture = await createHostFixture();
  try {
    await fixture.render(fixture.firstHost, false);
    const { content, view } = await waitForEditor(fixture.container);
    await act(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: 'unsaved' }, selection: { anchor: 11 } });
      content.focus();
    });

    await fixture.render(fixture.secondHost, false);

    expect(fixture.secondHost.contains(content)).toBe(true);
    expect(fixture.firstHost.contains(content)).toBe(false);
    expect(fixture.viewRef.current).toBe(view);
    expect(view.state.doc.toString()).toBe('base\nunsaved');
    expect(view.state.selection.main.head).toBe(11);
    expect(document.activeElement).toBe(content);
    expect(fixture.writes).toHaveLength(0);
  } finally {
    await fixture.destroy();
  }
});

test('moving the mobile editor host does not cancel its pending autosave', async () => {
  const fixture = await createHostFixture();
  try {
    await fixture.render(fixture.firstHost, true);
    const { view } = await waitForEditor(fixture.container);
    await act(async () => view.dispatch({ changes: { from: view.state.doc.length, insert: ' autosaved' } }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));

    await fixture.render(fixture.secondHost, true);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));

    expect(fixture.viewRef.current).toBe(view);
    expect(fixture.writes).toEqual(['base\n autosaved']);
  } finally {
    await fixture.destroy();
  }
});

test('a selected mobile file updates the shared tab before its editor host moves', async () => {
  const fixture = await createHostFixture();
  try {
    useDirectoryStore.setState({ currentDirectory: '/repo' });
    useFilesViewTabsStore.setState({ byRoot: {}, runtimeSnapshots: {} });
    useUIStore.setState({ contextPanelByDirectory: {}, contextSurfaceZones: {} });
    useUIStore.getState().openContextFile('/repo', '/repo/old.ts');
    useUIStore.getState().setPendingFileFocusPath(null);

    const { I18nProvider } = await import('@/lib/i18n');
    const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
    const { SyncProvider } = await import('@/sync/sync-context');
    const { createWebAPIs } = await import('../../../web/src/api/index');
    const { MobileFilesSurface } = await import('./MobileFilesSurface');
    const apis = createWebAPIs();
    apis.files.listDirectory = async (path) => ({
      directory: path,
      entries: [{ name: 'mobile.ts', path: '/repo/mobile.ts', isDirectory: false }],
    });
    let mobileEditorHost: HTMLDivElement | null = null;
    const drawer = (
      <MobileFilesSurface
        visible
        sharedEditor
        onEditorHostChange={(host) => { mobileEditorHost = host; }}
        onOpenFile={(path) => useUIStore.getState().openContextFile('/repo', path)}
      />
    );
    const wrap = (children: React.ReactNode) => (
      <SyncProvider sdk={SYNC_SDK} directory="/repo">
        <I18nProvider>
          <RuntimeAPIContext.Provider value={apis}>{children}</RuntimeAPIContext.Provider>
        </I18nProvider>
      </SyncProvider>
    );
    await fixture.render(null, false, drawer, wrap);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 40)));
    const fileButton = [...fixture.container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('mobile.ts'));
    if (!fileButton) throw new Error(`The mobile file list did not load: ${fixture.container.textContent}`);
    await act(async () => fileButton.click());

    expectActiveSharedFile('/repo/mobile.ts');
    expect(useFilesViewTabsStore.getState().byRoot['/repo']?.selectedPath).toBe('/repo/mobile.ts');
    if (!mobileEditorHost) throw new Error('The drawer did not provide an editor host');

    await fixture.render(mobileEditorHost, false, drawer, wrap);
    const { content, view } = await waitForEditor(fixture.container);
    await fixture.render(fixture.secondHost, false, null, wrap);

    expect(fixture.secondHost.contains(content)).toBe(true);
    expect(fixture.viewRef.current).toBe(view);
    expectActiveSharedFile('/repo/mobile.ts');
  } finally {
    await fixture.destroy();
  }
});
