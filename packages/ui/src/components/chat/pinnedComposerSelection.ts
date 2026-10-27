import React from 'react';
import type { Message, Session } from '@/lib/opencode/model';
import {
    areModelChoicesEqual,
    extractAssistantModelChoice,
    type UserModelChoice,
} from '@/lib/messages/userModelChoice';
import type { BtwSelection } from '@/stores/useBtwStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSession, useSessionMessagesSelector } from '@/sync/sync-context';
import type { State } from '@/sync/types';

type ModelSelection = NonNullable<BtwSelection['model']>;

const sameModel = (left: ModelSelection | null, right: ModelSelection | null): boolean => Boolean(
    left && right && left.providerId === right.providerId && left.modelId === right.modelId,
);

const selectLatestReplyModelChoice = (messages: Message[], state: State): UserModelChoice | null => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role !== 'assistant') continue;
        const parts = state.part[message.id];
        if (!Array.isArray(parts) || parts.length === 0) return null;
        return extractAssistantModelChoice(message);
    }
    return null;
};

/**
 * What a pinned composer sends with: the picks saved for its session first,
 * then the session record, which is what OpenCode 2 runs the next prompt on.
 * When the record has no model yet, the last assistant reply supplies the
 * model actually used. An effort follows only the model it came from.
 */
export const resolvePinnedComposerSelection = ({ savedAgent, savedModel, savedVariant, record, latestReplyChoice }: {
    savedAgent: string | null;
    savedModel: ModelSelection | null;
    savedVariant: string | null | undefined;
    record: Pick<Session, 'agent' | 'model'> | undefined;
    latestReplyChoice: UserModelChoice | null;
}): BtwSelection => {
    const recordModel = record?.model?.providerID && record.model.id
        ? { providerId: record.model.providerID, modelId: record.model.id }
        : null;
    const historyProviderId = latestReplyChoice?.providerID?.trim();
    const historyModelId = latestReplyChoice?.modelID?.trim();
    const historyModel = historyProviderId && historyModelId
        ? { providerId: historyProviderId, modelId: historyModelId }
        : null;
    const model = savedModel ?? recordModel ?? historyModel;
    const variant = savedVariant !== undefined
        ? savedVariant
        : sameModel(model, recordModel)
            ? record?.model?.variant?.trim() || undefined
            : sameModel(model, historyModel)
                ? latestReplyChoice?.variant?.trim() || undefined
                : undefined;
    return {
        agent: savedAgent ?? (record?.agent?.trim() || latestReplyChoice?.agent || undefined),
        model,
        variant,
    };
};

/**
 * The model, agent and effort a pinned column's composer (a chat open in the
 * side panel) sends with. The app-wide current model belongs to the main
 * chat, so a pinned composer keeps its own: what was picked in it, saved for
 * its session the way the `/btw` composer saves its picks, otherwise what the
 * session record names, and the last assistant reply only when the record has
 * no model yet. Null outside a pinned column.
 */
export const usePinnedComposerSelection = ({ enabled, sessionId, directory }: {
    enabled: boolean;
    sessionId: string | null;
    directory: string | null;
}): BtwSelection | null => {
    const key = enabled ? sessionId : null;
    const record = useSession(key ?? undefined, directory ?? undefined);
    const savedAgent = useSelectionStore((state) => (key ? state.sessionAgentSelections.get(key) ?? null : null));
    const savedModel = useSelectionStore((state) => (key ? state.sessionModelSelections.get(key) ?? null : null));
    const needsHistoryChoice = Boolean(key && !savedModel && !(record?.model?.providerID && record.model.id));
    const latestReplyChoice = useSessionMessagesSelector(
        needsHistoryChoice ? key ?? '' : '',
        directory ?? undefined,
        selectLatestReplyModelChoice,
        areModelChoicesEqual,
        true,
    );
    const base = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant: undefined, record, latestReplyChoice });
    const savedVariant = useSelectionStore((state) => (key && base.agent && base.model
        ? state.getAgentModelVariantForSession(key, base.agent, base.model.providerId, base.model.modelId)
        : undefined));
    const { agent, model, variant } = resolvePinnedComposerSelection({ savedAgent, savedModel, savedVariant, record, latestReplyChoice });
    const providerId = model?.providerId;
    const modelId = model?.modelId;
    return React.useMemo(() => {
        if (!key) return null;
        return {
            agent,
            model: providerId && modelId ? { providerId, modelId } : null,
            variant,
        };
    }, [agent, key, modelId, providerId, variant]);
};
