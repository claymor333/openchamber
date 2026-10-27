import { describe, expect, test } from 'bun:test';
import { resolvePinnedComposerSelection } from './pinnedComposerSelection';

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
            latestReplyChoice: null,
        })).toEqual({
            agent: 'plan',
            model: { providerId: 'openai', modelId: 'gpt' },
            variant: 'low',
        });
    });

    test('an effort saved as Default stays Default instead of the record\'s', () => {
        expect(resolvePinnedComposerSelection({ savedAgent: null, savedModel: null, savedVariant: null, record, latestReplyChoice: null }).variant).toBeNull();
    });

    test('uses the last assistant reply when the session record has no model', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: null,
            savedModel: null,
            savedVariant: undefined,
            record: { agent: 'record-agent' },
            latestReplyChoice: {
                id: 'reply-1',
                agent: 'reply-agent',
                providerID: 'openai',
                modelID: 'gpt',
                variant: 'high',
            },
        })).toEqual({
            agent: 'record-agent',
            model: { providerId: 'openai', modelId: 'gpt' },
            variant: 'high',
        });
    });

    test('does not carry an effort from a different selected model', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: null,
            savedModel: { providerId: 'openai', modelId: 'gpt' },
            savedVariant: undefined,
            record,
            latestReplyChoice: null,
        })).toEqual({
            agent: 'build',
            model: { providerId: 'openai', modelId: 'gpt' },
            variant: undefined,
        });
    });

    test('a session without a record, reply or picks has no model of its own', () => {
        expect(resolvePinnedComposerSelection({
            savedAgent: null,
            savedModel: null,
            savedVariant: undefined,
            record: undefined,
            latestReplyChoice: null,
        })).toEqual({
            agent: undefined,
            model: null,
            variant: undefined,
        });
    });
});
