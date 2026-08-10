import { describe, expect, test } from 'bun:test';

import { shouldNavigateSubtaskInPlace } from '../message/subtaskNavigation';

describe('shouldNavigateSubtaskInPlace', () => {
    test('realm that cannot host the panel always navigates in place', () => {
        expect(shouldNavigateSubtaskInPlace(false, true, true, false)).toBe(true);
        expect(shouldNavigateSubtaskInPlace(false, false, false, false)).toBe(true);
    });

    test('VSCode always navigates in place', () => {
        expect(shouldNavigateSubtaskInPlace(true, true, true, true)).toBe(true);
    });

    test('phone (mobile, not hybrid) navigates in place', () => {
        expect(shouldNavigateSubtaskInPlace(true, true, false, false)).toBe(true);
    });

    test('hybrid tablet opens the panel (not in place)', () => {
        expect(shouldNavigateSubtaskInPlace(true, true, true, false)).toBe(false);
    });

    test('desktop opens the panel', () => {
        expect(shouldNavigateSubtaskInPlace(true, false, false, false)).toBe(false);
    });
});
