import { describe, expect, test } from 'bun:test';

import {
    acquireSendAttempt,
    canRestoreSubmittedComposer,
    matchesSubmittedComposer,
    releaseSendAttempt,
} from './sendState';

describe('composer send state', () => {
    test('keeps the direct-send lock held across asynchronous preparation', async () => {
        const lock = { current: false };

        expect(acquireSendAttempt(lock)).toBe(true);
        await Promise.resolve();
        expect(acquireSendAttempt(lock)).toBe(false);

        releaseSendAttempt(lock);
        expect(acquireSendAttempt(lock)).toBe(true);
    });

    test('only clears the exact submitted draft after a successful send', () => {
        const submitted = {
            submittedText: 'original prompt',
            submittedDraftKey: 'runtime:/repo:session-1',
        };

        expect(matchesSubmittedComposer({ ...submitted, currentText: 'original prompt', currentDraftKey: submitted.submittedDraftKey })).toBe(true);
        expect(matchesSubmittedComposer({ ...submitted, currentText: 'new prompt', currentDraftKey: submitted.submittedDraftKey })).toBe(false);
        expect(matchesSubmittedComposer({ ...submitted, currentText: 'original prompt', currentDraftKey: 'runtime:/repo:session-2' })).toBe(false);
    });

    test('restores a cleared composer on failure without overwriting edits', () => {
        const submitted = {
            submittedText: 'original prompt',
            submittedDraftKey: 'runtime:/repo:session-1',
            currentDraftKey: 'runtime:/repo:session-1',
        };

        expect(canRestoreSubmittedComposer({ ...submitted, currentText: '', allowEmpty: true })).toBe(true);
        expect(canRestoreSubmittedComposer({ ...submitted, currentText: 'edited prompt', allowEmpty: true })).toBe(false);
        expect(canRestoreSubmittedComposer({ ...submitted, currentText: '', allowEmpty: false })).toBe(false);
    });

    test('restores into a newly materialized draft session when its composer is still empty', () => {
        const submitted = {
            submittedText: 'original prompt',
            submittedDraftKey: 'runtime:/repo:draft',
            currentDraftKey: 'runtime:/repo:materialized-session',
        };

        expect(canRestoreSubmittedComposer({
            ...submitted,
            currentText: '',
            allowEmpty: true,
            allowDraftIdentityChange: true,
        })).toBe(true);
        expect(canRestoreSubmittedComposer({
            ...submitted,
            currentText: 'new prompt',
            allowEmpty: true,
            allowDraftIdentityChange: true,
        })).toBe(false);
    });
});
