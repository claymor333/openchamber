import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OpenCode } from '@opencode/client';
import type { Message, Part, Session } from '@/lib/opencode/model';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { installHookTestDom } from '@/components/session/sidebar/test-utils/testDom';
import { resolvePinnedComposerSelection, usePinnedComposerSelection } from './pinnedComposerSelection';

const directory = '/pinned-selection-test';
const sessionId = 'child';
const mainSelection = {
    currentProviderId: 'main-provider',
    currentModelId: 'main-model',
    currentAgentName: 'main-agent',
    currentVariant: 'main-variant',
};
const childSession: Session = {
    id: sessionId,
    parentID: 'parent',
    projectID: 'project',
    directory,
    title: 'Child',
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 },
};
const otherSessionId = 'other-child';
const otherChildSession: Session = { ...childSession, id: otherSessionId, title: 'Other child' };
const reply: Message = {
    id: 'reply',
    sessionID: sessionId,
    role: 'assistant',
    time: { created: 2 },
    agent: 'plan',
    providerID: 'child-provider',
    modelID: 'child-model',
    variant: 'high',
};
const replyPart: Part = {
    id: 'reply-part',
    sessionID: sessionId,
    messageID: reply.id,
    type: 'text',
    text: 'Done',
};
const priorReply: Message = {
    ...reply,
    id: 'prior-reply',
    time: { created: 1 },
    agent: 'old-agent',
    providerID: 'main-provider',
    modelID: 'main-model',
    variant: 'low',
};
const priorReplyPart: Part = { ...replyPart, id: 'prior-reply-part', messageID: priorReply.id };
const lateReply: Message = {
    ...reply,
    id: 'late-reply',
    time: { created: 3 },
    agent: 'late-plan',
    providerID: 'late-provider',
    modelID: 'late-model',
};
const lateReplyPart: Part = { ...replyPart, id: 'late-reply-part', messageID: lateReply.id };
const otherReply: Message = {
    ...reply,
    id: 'other-reply',
    sessionID: otherSessionId,
    agent: 'build',
    providerID: 'other-provider',
    modelID: 'other-model',
    variant: 'low',
};
const otherReplyPart: Part = { ...replyPart, id: 'other-reply-part', messageID: otherReply.id, sessionID: otherSessionId };
const sdk = OpenCode.make({
    baseUrl: 'http://pinned-selection.test',
    fetch: () => new Promise<Response>(() => undefined),
});

let selection: ReturnType<typeof usePinnedComposerSelection> = null;
const SelectionProbe: React.FC<{ sessionId: string }> = ({ sessionId: activeSessionId }) => {
    selection = usePinnedComposerSelection({ enabled: true, sessionId: activeSessionId, directory });
    return null;
};

const record = {
    agent: 'build',
    model: { providerID: 'anthropic', id: 'claude', variant: 'high' },
};

describe('pinned composer selection', () => {
    test('follows the session record when nothing was picked in the composer', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: undefined, record, latestReplyChoice: null })).toEqual({
            agent: 'build',
            model: { providerId: 'anthropic', modelId: 'claude' },
            variant: 'high',
        });
    });

    test('a pick saved for the session wins over the record', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: 'plan',
            savedModel: { providerId: 'openai', modelId: 'gpt' },
            savedVariant: 'low',
            record,
            latestReplyChoice: { id: 'reply', agent: 'other', providerID: 'google', modelID: 'gemini', variant: 'high' },
        })).toEqual({
            agent: 'plan',
            model: { providerId: 'openai', modelId: 'gpt' },
            variant: 'low',
        });
    });

    test('uses the latest assistant choice when the session record has no model', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: null,
            savedModel: null,
            savedVariant: undefined,
            record: undefined,
            latestReplyChoice: { id: 'reply', agent: 'plan', providerID: 'google', modelID: 'gemini', variant: 'high' },
        })).toEqual({
            agent: 'plan',
            model: { providerId: 'google', modelId: 'gemini' },
            variant: 'high',
        });
    });

    test('keeps the session record model ahead of its older assistant history', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: null,
            savedModel: null,
            savedVariant: undefined,
            record: { agent: 'build', model: { providerID: 'anthropic', id: 'claude', variant: 'low' } },
            latestReplyChoice: { id: 'reply', agent: 'plan', providerID: 'google', modelID: 'gemini', variant: 'high' },
        })).toEqual({
            agent: 'build',
            model: { providerId: 'anthropic', modelId: 'claude' },
            variant: 'low',
        });
    });

    test('does not take the record effort from a different saved model', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: 'plan',
            savedModel: { providerId: 'openai', modelId: 'gpt' },
            savedVariant: undefined,
            record,
            latestReplyChoice: null,
        }).variant).toBeUndefined();
    });

    test('an effort saved as Default stays Default instead of the record\'s', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: null, record, latestReplyChoice: null }).variant).toBeNull();
    });

    test('a session without a record or picks has no model of its own', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: undefined, record: undefined, latestReplyChoice: null })).toEqual({
            agent: undefined,
            model: null,
            variant: undefined,
        });
    });
});

describe('pinned composer selection history', () => {
    let dom: ReturnType<typeof installHookTestDom>;
    let root: Root;
    let previousSurface: typeof window.__OPENCHAMBER_SURFACE__;
    let previousLocation: PropertyDescriptor | undefined;
    let restoreFetch: () => void;
    let previousConfig: Pick<ReturnType<typeof useConfigStore.getState>, 'currentProviderId' | 'currentModelId' | 'currentAgentName' | 'currentVariant'>;
    let previousSelections: Pick<ReturnType<typeof useSelectionStore.getState>, 'sessionModelSelections' | 'sessionAgentSelections' | 'sessionFollowedAgents' | 'sessionFollowedModels' | 'sessionAgentModelSelections' | 'agentModelVariantSelections'>;

    const publish = async (patch: { session?: Session[]; message?: Record<string, Message[]>; part?: Record<string, Part[]> }) => {
        const store = getSyncChildStores().getChild(directory);
        if (!store) throw new Error('Expected pinned session directory store');
        await act(async () => store.setState(patch));
    };

    beforeEach(() => {
        dom = installHookTestDom();
        previousSurface = window.__OPENCHAMBER_SURFACE__;
        window.__OPENCHAMBER_SURFACE__ = 'desktop';
        previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
        Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://localhost') });
        const fetchSpy = spyOn(globalThis, 'fetch');
        fetchSpy.mockImplementation(async (input) => {
            const url = input instanceof Request ? input.url : input.toString();
            const path = new URL(url, 'http://localhost').pathname;
            const body = path.endsWith('/session-warming')
                ? { revision: 0, enabled: false, minutes: 60, sessions: [] }
                : {};
            return new Response(JSON.stringify(body));
        });
        restoreFetch = () => fetchSpy.mockRestore();
        root = createRoot(dom.container);
        selection = null;
        const config = useConfigStore.getState();
        previousConfig = {
            currentProviderId: config.currentProviderId,
            currentModelId: config.currentModelId,
            currentAgentName: config.currentAgentName,
            currentVariant: config.currentVariant,
        };
        const saved = useSelectionStore.getState();
        previousSelections = {
            sessionModelSelections: saved.sessionModelSelections,
            sessionAgentSelections: saved.sessionAgentSelections,
            sessionFollowedAgents: saved.sessionFollowedAgents,
            sessionFollowedModels: saved.sessionFollowedModels,
            sessionAgentModelSelections: saved.sessionAgentModelSelections,
            agentModelVariantSelections: saved.agentModelVariantSelections,
        };
        useConfigStore.setState(mainSelection);
        useSelectionStore.setState({
            sessionModelSelections: new Map(),
            sessionAgentSelections: new Map(),
            sessionFollowedAgents: new Map(),
            sessionFollowedModels: new Map(),
            sessionAgentModelSelections: new Map(),
            agentModelVariantSelections: new Map(),
        });
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        restoreFetch();
        if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
        else Reflect.deleteProperty(globalThis, 'location');
        window.__OPENCHAMBER_SURFACE__ = previousSurface;
        useConfigStore.setState(previousConfig);
        useSelectionStore.setState(previousSelections);
        dom.restore();
    });

    test('waits for newest reply parts, isolates child switches and follows a later session record', async () => {
        await act(async () => root.render(React.createElement(SyncProvider, {
            sdk,
            directory: '',
            children: React.createElement(SelectionProbe, { sessionId }),
        })));

        await publish({ session: [childSession, otherChildSession], message: { [sessionId]: [] }, part: {} });
        expect(selection?.model).toBeNull();
        expect(useConfigStore.getState()).toMatchObject(mainSelection);

        await publish({
            message: { [sessionId]: [priorReply, reply] },
            part: { [priorReply.id]: [priorReplyPart] },
        });
        expect(selection?.model).toBeNull();

        await publish({
            part: { [priorReply.id]: [priorReplyPart], [reply.id]: [replyPart] },
        });

        expect(selection).toEqual({
            agent: 'plan',
            model: { providerId: 'child-provider', modelId: 'child-model' },
            variant: 'high',
        });
        expect(useConfigStore.getState()).toMatchObject(mainSelection);

        await act(async () => root.render(React.createElement(SyncProvider, {
            sdk,
            directory: '',
            children: React.createElement(SelectionProbe, { sessionId: otherSessionId }),
        })));
        expect(selection?.model).toBeNull();

        await publish({
            message: { [sessionId]: [priorReply, reply, lateReply] },
            part: { [priorReply.id]: [priorReplyPart], [reply.id]: [replyPart], [lateReply.id]: [lateReplyPart] },
        });
        expect(selection?.model).toBeNull();

        await publish({
            message: { [sessionId]: [priorReply, reply, lateReply], [otherSessionId]: [otherReply] },
            part: {
                [priorReply.id]: [priorReplyPart],
                [reply.id]: [replyPart],
                [lateReply.id]: [lateReplyPart],
                [otherReply.id]: [otherReplyPart],
            },
        });
        expect(selection).toEqual({
            agent: 'build',
            model: { providerId: 'other-provider', modelId: 'other-model' },
            variant: 'low',
        });

        await act(async () => root.render(React.createElement(SyncProvider, {
            sdk,
            directory: '',
            children: React.createElement(SelectionProbe, { sessionId }),
        })));
        expect(selection).toEqual({
            agent: 'late-plan',
            model: { providerId: 'late-provider', modelId: 'late-model' },
            variant: 'high',
        });
        expect(useConfigStore.getState()).toMatchObject(mainSelection);

        await publish({
            session: [{
                ...childSession,
                agent: 'record-agent',
                model: { providerID: 'record-provider', id: 'record-model', variant: 'medium' },
            }, otherChildSession],
        });
        expect(selection).toEqual({
            agent: 'record-agent',
            model: { providerId: 'record-provider', modelId: 'record-model' },
            variant: 'medium',
        });
        expect(useConfigStore.getState()).toMatchObject(mainSelection);
    });
});
