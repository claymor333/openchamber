import { afterAll, beforeEach, expect, spyOn, test } from 'bun:test';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { Agent, Session } from '@/lib/opencode/model';
import type { ChatColumnActions, ChatColumnSession } from '../chatColumnSession';

/**
 * A magic prompt command typed in the composer reads the prompts that apply
 * in the directory the send lands in: the session's worktree here. The
 * server decides which project owns it.
 */

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Text: browser.Text,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  HTMLFormElement: browser.HTMLFormElement,
  Range: browser.Range,
  Selection: browser.Selection,
  DocumentFragment: browser.DocumentFragment,
  Event: browser.Event,
  KeyboardEvent: browser.KeyboardEvent,
  MouseEvent: browser.MouseEvent,
  FocusEvent: browser.FocusEvent,
  InputEvent: browser.InputEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: browser.IntersectionObserver,
  matchMedia: browser.matchMedia.bind(browser),
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  customElements: browser.customElements,
  HTMLDivElement: browser.HTMLDivElement,
  HTMLSpanElement: browser.HTMLSpanElement,
  SVGElement: browser.SVGElement,
  ShadowRoot: browser.ShadowRoot,
  CSSStyleSheet: browser.CSSStyleSheet,
  DOMParser: browser.DOMParser,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const WORKTREE = '/elsewhere/feature';

let promptReads: URL[] = [];
let promptsStatus = 200;

spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://localhost/');
  if (url.pathname === '/api/magic-prompts') {
    promptReads.push(url);
    return Response.json(promptsStatus === 200
      ? { version: 1, overrides: { 'session.review.visible': 'Project review', 'session.review.instructions': 'Project review rules' } }
      : { error: 'Project prompts are invalid', code: 'project_prompts_invalid' }, { status: promptsStatus });
  }
  if (url.pathname.endsWith('/location')) {
    return Response.json({ directory: WORKTREE, project: { id: 'project', directory: WORKTREE, canonical: WORKTREE } });
  }
  if (url.pathname.endsWith('/session')) return Response.json({ data: [] });
  return Response.json({});
});

// Vite-only module forms the composer's import graph reaches, loaded as the keystroke test does.
plugin({
  name: 'composer-magic-prompts-vite-modules',
  setup(build) {
    build.onLoad({ filter: /markdown-shiki\.worker\.ts\?worker&url$/ }, () => ({ contents: 'export default "";', loader: 'js' }));
    build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
      const directory = resolve(dirname(path), '../assets/provider-logos');
      const logos = Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => [
        `../assets/provider-logos/${name}`, pathToFileURL(resolve(directory, name)).href,
      ]));
      return { contents: readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`), loader: 'ts' };
    });
  },
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { EditorView } = await import('@codemirror/view');
const { I18nProvider } = await import('@/lib/i18n');
const { ThemeSystemProvider } = await import('@/contexts/ThemeSystemContext');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { ChatInput } = await import('../ChatInput');
const { ChatColumnActionsContext, ChatColumnSessionContext } = await import('../chatColumnSession');
const { SyncProvider } = await import('@/sync/sync-context');
const { getSyncChildStores } = await import('@/sync/sync-refs');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { useRoutingStore } = await import('@/stores/useRoutingStore');
const { useBtwStore } = await import('@/stores/useBtwStore');
const { createMessageQueueTarget, useMessageQueueStore } = await import('@/stores/messageQueueStore');
const { useSelectionStore } = await import('@/sync/selection-store');
const { useInputStore } = await import('@/sync/input-store');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { OpenCode } = await import('@opencode/client');

const sdk = OpenCode.make({
  baseUrl: 'https://sync.test',
  fetch: async (request) => {
    const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
    if (path.endsWith('/event')) {
      return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
    }
    const body = path.endsWith('/location')
      ? { directory: WORKTREE, project: { id: 'project', directory: WORKTREE, canonical: WORKTREE } }
      : path.endsWith('/session/active') ? {}
      : { data: [] };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  },
});

// SAFETY: The composer reads only the runtime descriptor and the source-control
// object's identity here; no runtime API method is invoked.
const runtimeAPIs = { runtime: { platform: 'web', isDesktop: false, isVSCode: false }, sourceControl: {} } as RuntimeAPIs;

type SentMessage = { content: string; synthetic: string[] };
let sent: SentMessage[] = [];

beforeEach(() => {
  promptReads = [];
  promptsStatus = 200;
  sent = [];
  useDirectoryStore.setState({ currentDirectory: WORKTREE });
  useSessionUIStore.setState({
    currentSessionId: 'ses_feature',
    currentSessionDirectory: WORKTREE,
    sendMessage: async (content, _providerID, _modelID, _agent, _attachments, _agentMention, additionalParts) => {
      sent.push({ content, synthetic: (additionalParts ?? []).filter((part) => part.synthetic).map((part) => part.text) });
    },
  });
  useConfigStore.setState({
    currentProviderId: 'provider',
    currentModelId: 'model',
    isConnected: true,
    hasEverConnected: true,
  });
});

afterAll(() => {
  browser.close();
});

const pinnedActions: ChatColumnActions = {
  pinned: true,
  openSession: () => undefined,
  openTimelineDialog: () => undefined,
  focusInput: () => undefined,
};

type QueueAdd = ReturnType<typeof useMessageQueueStore.getState>['addToQueue'];
type QueueTarget = Parameters<QueueAdd>[0];
type QueueInput = Parameters<QueueAdd>[1];

const captureComposerStoreState = () => {
  const config = useConfigStore.getState();
  const selection = useSelectionStore.getState();
  const sessionUI = useSessionUIStore.getState();
  const btw = useBtwStore.getState();
  const queue = useMessageQueueStore.getState();
  const input = useInputStore.getState();
  return () => {
    useConfigStore.setState(config, true);
    useSelectionStore.setState(selection, true);
    useSessionUIStore.setState(sessionUI, true);
    useBtwStore.setState(btw, true);
    useMessageQueueStore.setState(queue, true);
    useInputStore.setState(input, true);
  };
};

type MountedComposer = {
  container: HTMLDivElement;
  view: InstanceType<typeof EditorView> | null;
  form: HTMLFormElement;
  unmount: () => Promise<void>;
};

type MountedComposerWithEditor = Omit<MountedComposer, 'view'> & { view: InstanceType<typeof EditorView> };

function mountComposer(column: ChatColumnSession, options: { allowCollapsed: true }): Promise<MountedComposer>;
function mountComposer(column?: ChatColumnSession): Promise<MountedComposerWithEditor>;
async function mountComposer(column?: ChatColumnSession, options?: { allowCollapsed?: boolean }): Promise<MountedComposer> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <RuntimeAPIContext.Provider value={runtimeAPIs}>
          <ThemeSystemProvider>
            <I18nProvider>
              <SyncProvider sdk={sdk} directory={WORKTREE}>
                {column ? (
                  <ChatColumnActionsContext.Provider value={pinnedActions}>
                    <ChatColumnSessionContext.Provider value={column}>
                      <ChatInput />
                    </ChatColumnSessionContext.Provider>
                  </ChatColumnActionsContext.Provider>
                ) : <ChatInput />}
              </SyncProvider>
            </I18nProvider>
          </ThemeSystemProvider>
        </RuntimeAPIContext.Provider>,
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    const content = container.querySelector<HTMLElement>('.cm-content');
    const view = content ? EditorView.findFromDOM(content) : null;
    const form = container.querySelector('form');
    if ((!view && !options?.allowCollapsed) || !form) throw new Error('The composer did not mount');
    let mounted = true;
    return {
      container,
      view,
      form,
      unmount: async () => {
        if (!mounted) return;
        mounted = false;
        await act(async () => root.unmount());
        container.remove();
      },
    };
  } catch (error) {
    await act(async () => root.unmount());
    container.remove();
    throw error;
  }
}

const typeIntoComposer = async (view: InstanceType<typeof EditorView>, text: string) => {
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.type' });
  });
};

const submitComposerForm = async (form: HTMLFormElement) => {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
};

const clickQueueAction = async (container: HTMLElement) => {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Queue message"]');
  if (!button) throw new Error('The busy composer did not render its queue action');
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
};

/** Mounts the composer, types `text`, submits it and returns the editor text afterwards. */
const submitInComposer = async (text: string): Promise<string> => {
  const composer = await mountComposer();
  try {
    await typeIntoComposer(composer.view, text);
    await submitComposerForm(composer.form);
    return composer.view.state.doc.toString();
  } finally {
    await composer.unmount();
  }
};

const testAgent = (name: string): Agent => ({
  id: name,
  name,
  displayName: name,
  mode: 'primary',
  hidden: false,
  request: { settings: {}, headers: {}, body: {} },
  permissions: [],
});

const testSession = (id: string): Session => ({
  id,
  projectID: 'project',
  directory: WORKTREE,
  title: id,
  time: { created: 1, updated: 1 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});

const setMainSelection = (sessionId = 'ses_main') => {
  useSessionUIStore.setState({ currentSessionId: sessionId, currentSessionDirectory: WORKTREE });
  useConfigStore.setState({
    currentProviderId: 'main-provider',
    currentModelId: 'main-model',
    currentAgentName: 'main-agent',
    currentVariant: 'main-effort',
    currentVariantSelection: { override: 'main-effort', inherited: 'main-default' },
    agents: [testAgent('build'), testAgent('main-agent')],
    agentsLoaded: true,
    providersLoaded: true,
    isConnected: true,
    hasEverConnected: true,
  });
  useMessageQueueStore.getState().setFollowUpBehavior('queue');
};

const seedSessionActivity = async (sessionId: string, busy = true) => {
  const store = getSyncChildStores().ensureChild(WORKTREE, { bootstrap: false });
  await act(async () => {
    store.setState({
      session: [testSession(sessionId)],
      session_status: busy ? { [sessionId]: { type: 'busy' } } : {},
    });
  });
  return store;
};

const savePinnedChoice = (sessionId: string, variant: string | null) => {
  const selection = useSelectionStore.getState();
  selection.saveSessionAgentSelection(sessionId, 'build');
  selection.saveSessionModelSelection(sessionId, 'child-provider', 'child-model');
  selection.saveAgentModelVariantForSession(sessionId, 'build', 'child-provider', 'child-model', variant);
};

test("sends the command with the prompts that apply in the session's directory", async () => {
  await submitInComposer('/workspace-review');

  expect(promptReads.map((url) => url.searchParams.get('sessionDirectory'))).toEqual([WORKTREE]);
  expect(sent).toHaveLength(1);
  expect(sent[0].content).toBe('Project review');
  expect(sent[0].synthetic).toContain('Project review rules');
});

test('a failed prompt read sends nothing and gives the text back', async () => {
  promptsStatus = 409;

  const remaining = await submitInComposer('/workspace-review');

  expect(promptReads).toHaveLength(1);
  expect(sent).toEqual([]);
  expect(remaining).toBe('/workspace-review');
});

// The draft fields the composer routes a first send by.
type DraftTarget = { target: 'chat' | 'project'; directoryOverride: string | null; preparedChatDirectory?: string };

const promptDirectoryForDraft = async (draft: DraftTarget): Promise<string | null> => {
  useSessionUIStore.setState({
    currentSessionId: null,
    currentSessionDirectory: null,
    newSessionDraft: { draftId: 7, open: true, parentID: null, ...draft },
  });

  await submitInComposer('/workspace-review');

  expect(promptReads).toHaveLength(1);
  return promptReads[0].searchParams.get('sessionDirectory');
};

test('a new chat, which has no folder yet, reads the global prompts', async () => {
  expect(await promptDirectoryForDraft({ target: 'chat', directoryOverride: null, preparedChatDirectory: '/chats/today' })).toBeNull();
});

test('a project draft reads the prompts of the folder it opens in', async () => {
  expect(await promptDirectoryForDraft({ target: 'project', directoryOverride: '/repo' })).toBe('/repo');
});

test('a pinned queue waits for its own model while leaving local commands available', async () => {
  const restoreStores = captureComposerStoreState();
  const childSessionId = 'ses_pinned_queue_unresolved';
  const queueCalls: Array<{ target: QueueTarget; message: QueueInput }> = [];
  const queueSpy = spyOn(useMessageQueueStore.getState(), 'addToQueue').mockImplementation(async (target, message) => {
    queueCalls.push({ target, message });
  });
  let composer: Awaited<ReturnType<typeof mountComposer>> | null = null;
  try {
    setMainSelection();
    composer = await mountComposer({ sessionId: childSessionId, directory: WORKTREE });
    const childStore = await seedSessionActivity(childSessionId);
    const queueTarget = createMessageQueueTarget(childSessionId, WORKTREE);
    expect(childStore.getState().session_status[childSessionId]?.type).toBe('busy');
    expect(queueTarget).not.toBeNull();
    if (!queueTarget) throw new Error('The pinned queue target did not resolve');

    const pendingContext = [{ text: 'Keep this side-chat context', synthetic: true }];
    useInputStore.getState().setPendingSyntheticParts(pendingContext, childSessionId);
    await typeIntoComposer(composer.view, 'wait for the child model');
    await clickQueueAction(composer.container);

    expect(queueCalls).toHaveLength(0);
    expect(useMessageQueueStore.getState().getQueueForTarget(queueTarget)).toEqual([]);
    expect(composer.view.state.doc.toString()).toBe('wait for the child model');
    expect(useInputStore.getState().getPendingSyntheticParts(childSessionId)).toEqual(pendingContext);
    expect(useSessionUIStore.getState().currentSessionId).toBe('ses_main');
    expect(useConfigStore.getState().currentProviderId).toBe('main-provider');
    expect(useConfigStore.getState().currentModelId).toBe('main-model');

    await typeIntoComposer(composer.view, '/btw');
    await clickQueueAction(composer.container);

    expect(useBtwStore.getState().byParent[childSessionId]?.pending).toBe(true);
    expect(queueCalls).toHaveLength(0);
    expect(sent).toEqual([]);
  } finally {
    queueSpy.mockRestore();
    if (composer) await composer.unmount();
    restoreStores();
  }
});

test('a resolved pinned queue captures its child model, agent and effort', async () => {
  const restoreStores = captureComposerStoreState();
  const childSessionId = 'ses_pinned_queue_resolved';
  const queueCalls: Array<{ target: QueueTarget; message: QueueInput }> = [];
  const queueSpy = spyOn(useMessageQueueStore.getState(), 'addToQueue').mockImplementation(async (target, message) => {
    queueCalls.push({ target, message });
  });
  let composer: Awaited<ReturnType<typeof mountComposer>> | null = null;
  try {
    setMainSelection();
    savePinnedChoice(childSessionId, 'child-effort');
    composer = await mountComposer({ sessionId: childSessionId, directory: WORKTREE });
    const childStore = await seedSessionActivity(childSessionId);
    expect(childStore.getState().session_status[childSessionId]?.type).toBe('busy');

    await typeIntoComposer(composer.view, 'queue with the child selection');
    await clickQueueAction(composer.container);

    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0]?.target.sessionId).toBe(childSessionId);
    expect(queueCalls[0]?.message).toMatchObject({
      content: 'queue with the child selection',
      sendConfig: {
        providerID: 'child-provider',
        modelID: 'child-model',
        agent: 'build',
        variant: 'child-effort',
      },
    });
    expect(composer.view.state.doc.toString()).toBe('');
    expect(useSessionUIStore.getState().currentSessionId).toBe('ses_main');
    expect(useConfigStore.getState().currentProviderId).toBe('main-provider');
    expect(useConfigStore.getState().currentModelId).toBe('main-model');
    expect(sent).toEqual([]);
  } finally {
    queueSpy.mockRestore();
    if (composer) await composer.unmount();
    restoreStores();
  }
});

test('main queueing keeps the main model configuration', async () => {
  const restoreStores = captureComposerStoreState();
  const mainSessionId = 'ses_main_queue_unchanged';
  const queueCalls: Array<{ target: QueueTarget; message: QueueInput }> = [];
  const queueSpy = spyOn(useMessageQueueStore.getState(), 'addToQueue').mockImplementation(async (target, message) => {
    queueCalls.push({ target, message });
  });
  let composer: Awaited<ReturnType<typeof mountComposer>> | null = null;
  try {
    setMainSelection(mainSessionId);
    composer = await mountComposer();
    await seedSessionActivity(mainSessionId);

    await typeIntoComposer(composer.view, 'keep the normal main queue path');
    await clickQueueAction(composer.container);

    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0]?.target.sessionId).toBe(mainSessionId);
    expect(queueCalls[0]?.message.sendConfig).toEqual({
      providerID: 'main-provider',
      modelID: 'main-model',
      agent: 'main-agent',
      variant: 'main-effort',
    });
  } finally {
    queueSpy.mockRestore();
    if (composer) await composer.unmount();
    restoreStores();
  }
});

const expectPinnedBtwEffort = async (variant: string | null) => {
  const restoreStores = captureComposerStoreState();
  const childSessionId = variant === null ? 'ses_pinned_btw_default' : 'ses_pinned_btw_variant';
  const btwSessionId = `btw-pending:${childSessionId}`;
  let composer: Awaited<ReturnType<typeof mountComposer>> | null = null;
  try {
    setMainSelection();
    savePinnedChoice(childSessionId, variant);
    useBtwStore.getState().setPanelState(childSessionId, { pending: true, collapsed: false });
    composer = await mountComposer({ sessionId: childSessionId, directory: WORKTREE });
    await seedSessionActivity(childSessionId, false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    const selection = useSelectionStore.getState();
    expect(selection.getSessionModelSelection(btwSessionId)).toEqual({ providerId: 'child-provider', modelId: 'child-model' });
    expect(selection.getSessionAgentSelection(btwSessionId)).toBe('build');
    expect(selection.getAgentModelVariantForSession(btwSessionId, 'build', 'child-provider', 'child-model')).toBe(variant);
    expect(useConfigStore.getState().currentProviderId).toBe('main-provider');
    expect(useConfigStore.getState().currentModelId).toBe('main-model');
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('main-effort');
    expect(sent).toEqual([]);
  } finally {
    if (composer) await composer.unmount();
    restoreStores();
  }
};

test('a pending BTW fork inherits the pinned model effort', async () => {
  await expectPinnedBtwEffort('child-effort');
});

test('a pending BTW fork preserves the pinned explicit Default effort', async () => {
  await expectPinnedBtwEffort(null);
});

test('mobile pinned controls follow and update only their child session selection', async () => {
  const restoreStores = captureComposerStoreState();
  const uiSnapshot = useUIStore.getState();
  const routingSnapshot = useRoutingStore.getState();
  const viewportSnapshot = { width: browser.innerWidth, height: browser.innerHeight };
  const mainSessionId = 'ses_mobile_main_selection';
  const childSessionId = 'ses_mobile_pinned_subagent';
  const childDirectory = '/workspace/mobile-child';
  let composer: MountedComposer | null = null;
  let restoreChildStore: (() => void) | undefined;

  try {
    browser.innerWidth = 390;
    browser.innerHeight = 844;
    setMainSelection(mainSessionId);
    useUIStore.setState({ isMobile: true, isExpandedInput: false });
    useRoutingStore.setState({ available: true, autoReady: true, loaded: true });
    useConfigStore.setState({
      currentProviderId: 'main-provider',
      currentModelId: 'main-model',
      currentAgentName: 'main-agent',
      currentVariant: 'main-effort',
      currentVariantSelection: { override: 'main-effort', inherited: 'main-default' },
      providers: [
        {
          id: 'main-provider',
          name: 'OpenAI',
          activation: 'auto',
          package: 'test',
          models: [{
            id: 'main-model',
            name: 'GPT-6.1 Sol',
            modelID: 'main-model',
            providerID: 'main-provider',
            capabilities: { tools: true, input: ['text'], output: ['text'] },
            cost: [],
            time: { released: 0 },
            status: 'active',
            enabled: true,
            limit: { context: 128_000, output: 8_192 },
            variants: [{ id: 'medium', settings: {} }],
          }],
        },
        {
          id: 'child-provider',
          name: 'Anthropic',
          activation: 'auto',
          package: 'test',
          models: [
            {
              id: 'child-model',
              name: 'Claude Haiku 5.5',
              modelID: 'child-model',
              providerID: 'child-provider',
              capabilities: { tools: true, input: ['text'], output: ['text'] },
              cost: [],
              time: { released: 0 },
              status: 'active',
              enabled: true,
              limit: { context: 200_000, output: 8_192 },
              variants: [{ id: 'low', settings: {} }, { id: 'high', settings: {} }],
            },
            {
              id: 'child-alt-model',
              name: 'Claude Sonnet 5',
              modelID: 'child-alt-model',
              providerID: 'child-provider',
              capabilities: { tools: true, input: ['text'], output: ['text'] },
              cost: [],
              time: { released: 0 },
              status: 'active',
              enabled: true,
              limit: { context: 200_000, output: 8_192 },
              variants: [{ id: 'low', settings: {} }, { id: 'high', settings: {} }],
            },
          ],
        },
      ],
      agents: [
        testAgent('build'),
        testAgent('main-agent'),
        testAgent('child-agent'),
        testAgent('alternate-child-agent'),
      ],
      providersLoaded: true,
      agentsLoaded: true,
    });
    const mainSelection = useSelectionStore.getState();
    mainSelection.saveSessionModelSelection(mainSessionId, 'main-provider', 'main-model');
    mainSelection.saveSessionAgentSelection(mainSessionId, 'main-agent');
    mainSelection.saveAgentModelVariantForSession(mainSessionId, 'main-agent', 'main-provider', 'main-model', 'main-effort');

    composer = await mountComposer({ sessionId: childSessionId, directory: childDirectory }, { allowCollapsed: true });
    const childStore = getSyncChildStores().ensureChild(childDirectory, { bootstrap: false });
    const childStoreSnapshot = childStore.getState();
    restoreChildStore = () => childStore.setState(childStoreSnapshot, true);
    const childWithoutSelection = { ...testSession(childSessionId), directory: childDirectory };
    await act(async () => childStore.setState({ session: [childWithoutSelection] }));

    const findButton = (root: ParentNode, label: string) => {
      const button = Array.from(root.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
      if (!button) throw new Error(`Could not find button containing "${label}"`);
      return button;
    };
    const findMobileModelButton = (title: string) => {
      const button = composer?.container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      if (!button) throw new Error(`Could not find mobile model button titled "${title}"`);
      return button;
    };
    const findMobileAgentButton = (title: string) => {
      const button = composer?.container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      if (!button) throw new Error(`Could not find mobile agent button titled "${title}"`);
      return button;
    };
    const openModelPicker = async (modelTitle: string) => {
      await act(async () => findMobileModelButton(modelTitle).click());
      const dialog = document.getElementById('mobile-overlay-root')?.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) throw new Error('The mobile model picker did not open');
      return dialog;
    };
    const openAgentPicker = async (agentTitle: string) => {
      const button = findMobileAgentButton(agentTitle);
      await act(async () => {
        button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 550));
        button.dispatchEvent(new Event('pointerup', { bubbles: true }));
      });
      const dialog = document.getElementById('mobile-overlay-root')?.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) throw new Error('The mobile agent picker did not open');
      return dialog;
    };

    expect(composer.container.querySelector('[data-mobile-composer-pill]')).not.toBeNull();
    expect(findMobileModelButton('Select model').title).toBe('Select model');
    expect(findMobileAgentButton('Select agent').title).toBe('Select agent');

    await act(async () => {
      childStore.setState({
        session: [{
          ...childWithoutSelection,
          agent: 'child-agent',
          model: { providerID: 'child-provider', id: 'child-model', variant: 'high' },
        }],
      });
    });
    expect(findMobileModelButton('Claude Haiku 5.5').title).toBe('Claude Haiku 5.5');
    expect(findMobileAgentButton('Child-agent').title).toBe('Child-agent');

    const expandButton = composer.container.querySelector<HTMLButtonElement>('[data-composer-morph-prompt]');
    if (!expandButton) throw new Error('The collapsed composer prompt was not mounted');
    await act(async () => {
      expandButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(composer.container.querySelector('[data-mobile-composer-pill]')).toBeNull();
    expect(findMobileModelButton('Claude Haiku 5.5').title).toBe('Claude Haiku 5.5');
    expect(findMobileAgentButton('Child-agent').title).toBe('Child-agent');

    const modelDialog = await openModelPicker('Claude Haiku 5.5');
    const selectedChildModel = Array.from(modelDialog.querySelectorAll('div')).find((element) => (
      element.className.includes('bg-interactive-selection/15')
      && element.textContent?.includes('Claude Haiku 5.5')
    ));
    expect(selectedChildModel).toBeDefined();
    const highEffortDisclosure = Array.from(modelDialog.querySelectorAll('button')).find((button) => (
      button.getAttribute('aria-expanded') === 'false' && button.textContent?.trim() === 'High'
    ));
    if (!highEffortDisclosure) throw new Error('The child model effort controls were not rendered');
    await act(async () => highEffortDisclosure.click());
    const selectedHighEffort = Array.from(modelDialog.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]')).find((button) => (
      button.textContent?.trim() === 'High'
    ));
    expect(selectedHighEffort).toBeDefined();
    const lowEffort = Array.from(modelDialog.querySelectorAll('button')).find((button) => (
      button.getAttribute('aria-pressed') === 'false' && button.textContent?.trim() === 'Low'
    ));
    if (!lowEffort) throw new Error('The child model low-effort option was not rendered');
    await act(async () => lowEffort.click());
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      childSessionId, 'child-agent', 'child-provider', 'child-model',
    )).toBe('low');

    const secondModelDialog = await openModelPicker('Claude Haiku 5.5');
    await act(async () => findButton(secondModelDialog, 'Claude Sonnet 5').click());
    expect(useSelectionStore.getState().getSessionModelSelection(childSessionId)).toEqual({
      providerId: 'child-provider',
      modelId: 'child-alt-model',
    });

    const defaultEffortDialog = await openModelPicker('Claude Sonnet 5');
    const defaultEffortDisclosure = Array.from(defaultEffortDialog.querySelectorAll('button')).find((button) => (
      button.getAttribute('aria-expanded') === 'false' && button.textContent?.trim() === 'Default'
    ));
    if (!defaultEffortDisclosure) throw new Error('The child model Default effort control was not rendered');
    await act(async () => defaultEffortDisclosure.click());
    const selectedDefaultEffort = Array.from(defaultEffortDialog.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]')).find((button) => (
      button.textContent?.trim() === 'Default'
    ));
    if (!selectedDefaultEffort) throw new Error('The child model Default effort was not selected');
    await act(async () => selectedDefaultEffort.click());
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      childSessionId, 'child-agent', 'child-provider', 'child-alt-model',
    )).toBeNull();

    const collapsedPrompt = composer.container.querySelector<HTMLButtonElement>('[data-composer-morph-prompt]');
    if (collapsedPrompt) await act(async () => collapsedPrompt.click());
    const editorContent = composer.container.querySelector<HTMLElement>('.cm-content');
    if (!editorContent) throw new Error('The expanded mobile composer editor was not mounted');
    const editorView = EditorView.findFromDOM(editorContent);
    if (!editorView) throw new Error('The expanded mobile composer editor could not be resolved');
    await act(async () => editorView.focus());
    const agentDialog = await openAgentPicker('Child-agent');
    const selectedChildAgent = findButton(agentDialog, 'child-agent');
    expect(selectedChildAgent.className).toContain('bg-interactive-selection');
    await act(async () => findButton(agentDialog, 'alternate-child-agent').click());
    expect(document.getElementById('mobile-overlay-root')?.querySelector('[role="dialog"]')).toBeNull();
    expect(findMobileAgentButton('Alternate-child-agent').title).toBe('Alternate-child-agent');
    expect(useSelectionStore.getState().getSessionAgentSelection(childSessionId)).toBe('alternate-child-agent');

    const autoDialog = await openModelPicker('Claude Sonnet 5');
    await act(async () => findButton(autoDialog, 'Auto').click());
    const { AUTO_MODEL_ID, AUTO_PROVIDER_ID } = await import('@/lib/routing/autoModel');
    expect(useSelectionStore.getState().getSessionModelSelection(childSessionId)).toEqual({
      providerId: AUTO_PROVIDER_ID,
      modelId: AUTO_MODEL_ID,
    });
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      childSessionId, 'alternate-child-agent', AUTO_PROVIDER_ID, AUTO_MODEL_ID,
    )).toBeNull();

    expect(useConfigStore.getState().currentProviderId).toBe('main-provider');
    expect(useConfigStore.getState().currentModelId).toBe('main-model');
    expect(useConfigStore.getState().currentAgentName).toBe('main-agent');
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('main-effort');
    expect(useSelectionStore.getState().getSessionModelSelection(mainSessionId)).toEqual({
      providerId: 'main-provider',
      modelId: 'main-model',
    });
    expect(useSelectionStore.getState().getSessionAgentSelection(mainSessionId)).toBe('main-agent');
    expect(useSelectionStore.getState().getAgentModelVariantForSession(
      mainSessionId, 'main-agent', 'main-provider', 'main-model',
    )).toBe('main-effort');
    expect(sent).toEqual([]);
  } finally {
    if (composer) await composer.unmount();
    restoreChildStore?.();
    browser.innerWidth = viewportSnapshot.width;
    browser.innerHeight = viewportSnapshot.height;
    browser.dispatchEvent(new browser.Event('resize'));
    useUIStore.setState(uiSnapshot, true);
    useRoutingStore.setState(routingSnapshot, true);
    restoreStores();
  }
});
