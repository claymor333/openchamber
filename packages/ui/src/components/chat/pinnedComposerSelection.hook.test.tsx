import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OpenCode } from '@opencode/client';
import { opencodeClient } from '@/lib/opencode/client';
import type { Message, Part, Session } from '@/lib/opencode/model';
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID } from '@/lib/routing/autoModel';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionWarmingStore } from '@/stores/useSessionWarmingStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider, useDirectoryStore } from '@/sync/sync-context';
import { installHookTestDom } from '@/components/session/sidebar/test-utils/testDom';
import { usePinnedComposerSelection } from './pinnedComposerSelection';

const MAIN_DIRECTORY = '/workspace';
const CHILD_DIRECTORY = '/workspace/child';
const CROSS_DIRECTORY = '/workspace/other-child';
const MAIN_SESSION_ID = 'parent-main-session';
const HISTORY_SESSION_ID = 'pinned-history-session';
const MANUAL_SESSION_ID = 'pinned-manual-session';
const AUTO_SESSION_ID = 'pinned-auto-session';
const CROSS_SESSION_ID = 'pinned-cross-directory-session';
const MAIN_PROVIDER_ID = 'parent-provider';
const MAIN_MODEL_ID = 'parent-model';

const createSdk = () => OpenCode.make({
    baseUrl: 'https://pinned-selection.test',
    fetch: async (request) => {
        const path = new URL(request instanceof Request ? request.url : request.toString()).pathname;
        if (path.endsWith('/event')) {
            return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } });
        }
        const body = path.endsWith('/location')
            ? { directory: MAIN_DIRECTORY, project: { id: 'project', directory: MAIN_DIRECTORY, canonical: MAIN_DIRECTORY } }
            : path.endsWith('/session/active') ? {}
                : { data: [] };
        return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    },
});

const makeSession = ({
    id,
    directory,
    model,
    agent,
}: {
    id: string;
    directory: string;
    model?: Session['model'];
    agent?: string;
}): Session => {
  const session: Session = {
    id,
    projectID: 'project',
    directory,
    title: id,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
  };
  if (model) session.model = model;
  if (agent) session.agent = agent;
  return session;
};

const makeAssistantReply = ({
    id,
    sessionID,
    providerID,
    modelID,
    variant,
    agent,
}: {
    id: string;
    sessionID: string;
    providerID: string;
    modelID: string;
    variant?: string;
    agent: string;
}): Message => ({
    id,
    sessionID,
    role: 'assistant',
    time: { created: 10 },
    agent,
    providerID,
    modelID,
    variant,
    tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
});

const makeTextPart = (messageID: string, sessionID: string): Part => ({
    id: `part-${messageID}`,
    sessionID,
    messageID,
    type: 'text',
    text: 'reply',
});

describe('pinned composer selection hook', () => {
    let dom: ReturnType<typeof installHookTestDom>;
    let root: Root;
    let restoreSpies: Array<() => void>;
    let previousSurface: typeof window.__OPENCHAMBER_SURFACE__;
    let configSnapshot: ReturnType<typeof useConfigStore.getState>;
    let selectionSnapshot: ReturnType<typeof useSelectionStore.getState>;
    let sessionUiSnapshot: ReturnType<typeof useSessionUIStore.getState>;
    let warmingSnapshot: ReturnType<typeof useSessionWarmingStore.getState>;

    beforeEach(() => {
        dom = installHookTestDom();
        previousSurface = window.__OPENCHAMBER_SURFACE__;
        window.__OPENCHAMBER_SURFACE__ = 'desktop';

        const spies = [
            spyOn(opencodeClient, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home' }),
            spyOn(opencodeClient, 'getFilesystemHome').mockResolvedValue('/home'),
            spyOn(opencodeClient, 'getLocation').mockResolvedValue({
                directory: MAIN_DIRECTORY,
                project: { id: 'project', directory: MAIN_DIRECTORY, canonical: MAIN_DIRECTORY },
            }),
            spyOn(opencodeClient, 'getConfig').mockResolvedValue({}),
            spyOn(opencodeClient, 'listProjects').mockResolvedValue([]),
        ];
        restoreSpies = spies.map((spy) => () => spy.mockRestore());

        configSnapshot = useConfigStore.getState();
        selectionSnapshot = useSelectionStore.getState();
        sessionUiSnapshot = useSessionUIStore.getState();
        warmingSnapshot = useSessionWarmingStore.getState();
        useSessionWarmingStore.setState({ refresh: async () => undefined });
        useConfigStore.setState({ currentProviderId: MAIN_PROVIDER_ID, currentModelId: MAIN_MODEL_ID });
        useSessionUIStore.setState({
            currentSessionId: MAIN_SESSION_ID,
            currentSessionDirectory: MAIN_DIRECTORY,
        });

        root = createRoot(dom.container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        useConfigStore.setState(configSnapshot, true);
        useSelectionStore.setState(selectionSnapshot, true);
        useSessionUIStore.setState(sessionUiSnapshot, true);
        useSessionWarmingStore.setState(warmingSnapshot, true);
        restoreSpies.forEach((restore) => restore());
        window.__OPENCHAMBER_SURFACE__ = previousSurface;
        dom.restore();
    });

    test('uses child history until its own model arrives, and follows child changes without touching the main chat', async () => {
        const sdk = createSdk();
        let selection: ReturnType<typeof usePinnedComposerSelection> = null;
        let directoryStore: ReturnType<typeof useDirectoryStore> | undefined;
        const getSelection = () => selection;
        const getDirectoryStore = () => directoryStore;

        const Probe = ({ sessionId, directory }: { sessionId: string; directory: string }) => {
            directoryStore = useDirectoryStore(directory, { bootstrap: false });
            selection = usePinnedComposerSelection({ enabled: true, sessionId, directory });
            return null;
        };
        const Host = ({ visible, sessionId, directory }: { visible: boolean; sessionId: string; directory: string }) =>
            React.createElement(SyncProvider, {
                sdk,
                directory: MAIN_DIRECTORY,
                children: visible ? React.createElement(Probe, { sessionId, directory }) : null,
            });
        const render = async (visible: boolean, sessionId: string, directory: string) => {
            await act(async () => root.render(React.createElement(Host, { visible, sessionId, directory })));
        };

        const historySession = makeSession({ id: HISTORY_SESSION_ID, directory: CHILD_DIRECTORY, agent: 'record-agent' });
        await render(true, HISTORY_SESSION_ID, CHILD_DIRECTORY);
        expect(getSelection()).toEqual({ agent: undefined, model: null, variant: undefined });

        const firstDirectoryStore = getDirectoryStore();
        if (!firstDirectoryStore) throw new Error('Pinned directory store was not mounted');
        await act(async () => firstDirectoryStore.setState({ session: [historySession] }));
        expect(getSelection()).toEqual({ agent: 'record-agent', model: null, variant: undefined });

        const reply = makeAssistantReply({
            id: 'pinned-history-reply',
            sessionID: HISTORY_SESSION_ID,
            providerID: 'history-provider',
            modelID: 'history-model',
            variant: 'high',
            agent: 'history-agent',
        });
        await act(async () => firstDirectoryStore.setState({
            message: { [HISTORY_SESSION_ID]: [reply] },
            part: { [reply.id]: [makeTextPart(reply.id, HISTORY_SESSION_ID)] },
        }));
        expect(getSelection()).toEqual({
            agent: 'record-agent',
            model: { providerId: 'history-provider', modelId: 'history-model' },
            variant: 'high',
        });

        useConfigStore.setState({ providers: [], providersLoaded: false, agentsLoaded: false });
        expect(getSelection()?.model).toEqual({ providerId: 'history-provider', modelId: 'history-model' });
        useConfigStore.setState({ providersLoaded: true, agentsLoaded: true });
        expect(getSelection()?.model).toEqual({ providerId: 'history-provider', modelId: 'history-model' });

        const authoritativeSession = makeSession({
            id: HISTORY_SESSION_ID,
            directory: CHILD_DIRECTORY,
            model: { providerID: 'session-provider', id: 'session-model', variant: 'low' },
            agent: 'session-agent',
        });
        await act(async () => firstDirectoryStore.setState({ session: [authoritativeSession] }));
        expect(getSelection()).toEqual({
            agent: 'session-agent',
            model: { providerId: 'session-provider', modelId: 'session-model' },
            variant: 'low',
        });

        const manualModel = { providerId: 'manual-provider', modelId: 'manual-model' };
        const selectionStore = useSelectionStore.getState();
        selectionStore.saveSessionModelSelection(MANUAL_SESSION_ID, manualModel.providerId, manualModel.modelId);
        selectionStore.saveSessionAgentSelection(MANUAL_SESSION_ID, 'manual-agent');
        selectionStore.saveAgentModelVariantForSession(
            MANUAL_SESSION_ID,
            'manual-agent',
            manualModel.providerId,
            manualModel.modelId,
            'medium',
        );
        selectionStore.saveSessionModelSelection(AUTO_SESSION_ID, AUTO_PROVIDER_ID, AUTO_MODEL_ID);
        const lastUsedProviderAfterPicks = useSelectionStore.getState().lastUsedProvider;

        const manualSession = makeSession({
            id: MANUAL_SESSION_ID,
            directory: CHILD_DIRECTORY,
            model: { providerID: 'record-provider', id: 'record-model', variant: 'high' },
            agent: 'record-agent',
        });
        const autoSession = makeSession({
            id: AUTO_SESSION_ID,
            directory: CHILD_DIRECTORY,
            model: { providerID: 'record-provider', id: 'record-model', variant: 'high' },
            agent: 'auto-agent',
        });
        await act(async () => firstDirectoryStore.setState({ session: [authoritativeSession, manualSession, autoSession] }));

        await render(true, MANUAL_SESSION_ID, CHILD_DIRECTORY);
        expect(getSelection()).toEqual({ agent: 'manual-agent', model: manualModel, variant: 'medium' });

        await render(true, AUTO_SESSION_ID, CHILD_DIRECTORY);
        expect(getSelection()).toEqual({
            agent: 'auto-agent',
            model: { providerId: AUTO_PROVIDER_ID, modelId: AUTO_MODEL_ID },
            variant: undefined,
        });

        await render(true, CROSS_SESSION_ID, CROSS_DIRECTORY);
        expect(getSelection()).toEqual({ agent: undefined, model: null, variant: undefined });
        const crossDirectoryStore = getDirectoryStore();
        if (!crossDirectoryStore) throw new Error('Cross-directory pinned store was not mounted');
        const crossSession = makeSession({
            id: CROSS_SESSION_ID,
            directory: CROSS_DIRECTORY,
            model: { providerID: 'cross-provider', id: 'cross-model', variant: 'low' },
            agent: 'cross-agent',
        });
        await act(async () => crossDirectoryStore.setState({ session: [crossSession] }));
        expect(getSelection()).toEqual({
            agent: 'cross-agent',
            model: { providerId: 'cross-provider', modelId: 'cross-model' },
            variant: 'low',
        });

        await render(false, CROSS_SESSION_ID, CROSS_DIRECTORY);
        await render(true, CROSS_SESSION_ID, CROSS_DIRECTORY);
        expect(getSelection()).toEqual({
            agent: 'cross-agent',
            model: { providerId: 'cross-provider', modelId: 'cross-model' },
            variant: 'low',
        });

        expect(useConfigStore.getState().currentProviderId).toBe(MAIN_PROVIDER_ID);
        expect(useConfigStore.getState().currentModelId).toBe(MAIN_MODEL_ID);
        expect(useSessionUIStore.getState().currentSessionId).toBe(MAIN_SESSION_ID);
        expect(useSessionUIStore.getState().currentSessionDirectory).toBe(MAIN_DIRECTORY);
        expect(useSelectionStore.getState().sessionModelSelections.has(HISTORY_SESSION_ID)).toBe(false);
        expect(useSelectionStore.getState().lastUsedProvider).toEqual(lastUsedProviderAfterPicks);
    });
});
