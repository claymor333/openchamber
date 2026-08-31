import { describe, expect, test } from 'bun:test';

import {
    restoreDeferredEnterModifiers,
    shouldSubmitEnter,
    type EnterKeyPolicyInput,
    type EnterModifierState,
} from './keyboardPolicy';

const policy = (overrides: Partial<EnterKeyPolicyInput>): EnterKeyPolicyInput => ({
    isMobile: false,
    isDesktopExpanded: false,
    enterToSend: false,
    enterToSendConfigured: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
});

const enterPolicyCases: Array<[string, Partial<EnterKeyPolicyInput>, boolean]> = [
        ['mobile default Enter inserts a newline', { isMobile: true }, false],
        ['desktop default Enter sends', {}, true],
        ['desktop focus mode default Enter inserts a newline', { isDesktopExpanded: true }, false],
        ['configured enabled Enter sends on mobile', { isMobile: true, enterToSendConfigured: true, enterToSend: true }, true],
        ['configured enabled Shift+Enter inserts a newline', { enterToSendConfigured: true, enterToSend: true, shiftKey: true }, false],
        ['configured disabled Enter inserts a newline', { enterToSendConfigured: true, enterToSend: false }, false],
        ['configured disabled Shift+Enter sends', { enterToSendConfigured: true, enterToSend: false, shiftKey: true }, true],
        ['Ctrl+Enter always sends', { isMobile: true, isDesktopExpanded: true, shiftKey: true, ctrlKey: true }, true],
        ['Meta+Enter always sends', { isMobile: true, isDesktopExpanded: true, shiftKey: true, metaKey: true }, true],
];

describe('Enter key policy', () => {
    for (const [name, overrides, expected] of enterPolicyCases) {
        test(name, () => {
        expect(shouldSubmitEnter(policy(overrides))).toBe(expected);
        });
    }
});

const deferredModifierCases: Array<[string, EnterModifierState]> = [
        ['Shift', { shiftKey: true, ctrlKey: false, metaKey: false }],
        ['Ctrl', { shiftKey: false, ctrlKey: true, metaKey: false }],
        ['Meta', { shiftKey: false, ctrlKey: false, metaKey: true }],
        ['Shift+Ctrl+Meta', { shiftKey: true, ctrlKey: true, metaKey: true }],
];

describe('deferred Enter modifiers', () => {
    for (const [name, modifiers] of deferredModifierCases) {
        test(`preserves ${name}`, () => {
        const event = { shiftKey: false, ctrlKey: false, metaKey: false };

        restoreDeferredEnterModifiers(event, modifiers);

        expect(event).toEqual(modifiers);
        });
    }
});
