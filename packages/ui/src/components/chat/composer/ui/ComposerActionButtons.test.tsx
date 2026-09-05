// The send button's in-flight contract: while a message is dispatching it swaps
// the send icon for a spinner, disables the button, and announces the "sending"
// state to assistive tech. Uses renderToStaticMarkup + I18nProvider (Bun's test
// runner provides no DOM by default; the send control needs none).

import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nProvider } from '@/lib/i18n';
import { ComposerActionButtons } from './ComposerActionButtons';

type SendButtonProps = Parameters<typeof ComposerActionButtons>[0];

const renderButtons = (overrides: Partial<SendButtonProps> = {}): string =>
    renderToStaticMarkup(
        React.createElement(
            I18nProvider,
            null,
            React.createElement(ComposerActionButtons, {
                isMobile: false,
                footerIconButtonClass: 'footer-icon',
                sendIconSizeClass: 'size-5',
                stopIconSizeClass: 'size-5',
                canSend: true,
                isSending: false,
                canAbort: false,
                hasContent: true,
                currentSessionId: 's1',
                newSessionDraftOpen: false,
                onPrimaryAction: () => {},
                onQueueMessage: () => {},
                onAbort: () => {},
                ...overrides,
            }),
        ),
    );

describe('ComposerActionButtons send state', () => {
    test('idle: "Send message" aria-label, enabled, send icon, no spinner', () => {
        const markup = renderButtons();
        expect(markup).toContain('aria-label="Send message"');
        expect(markup).not.toContain('disabled=""');
        expect(markup).toContain('href="#oc-send-plane-2"');
        expect(markup).not.toContain('href="#oc-loader-4"');
        expect(markup).not.toContain('animate-spin');
    });

    test('sending: spinner replaces the send icon, button disabled, "Sending message" aria-label', () => {
        const markup = renderButtons({ isSending: true });
        expect(markup).toContain('aria-label="Sending message"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('href="#oc-loader-4"');
        expect(markup).toContain('animate-spin');
        expect(markup).not.toContain('href="#oc-send-plane-2"');
    });

    test('cannot send: button disabled even when idle', () => {
        const markup = renderButtons({ canSend: false });
        expect(markup).toContain('disabled=""');
        expect(markup).not.toContain('animate-spin');
    });

    test('sending on mobile keeps the spinner, disabled state, and sends via click handler', () => {
        const markup = renderButtons({ isMobile: true, isSending: true });
        expect(markup).toContain('type="button"');
        expect(markup).toContain('aria-label="Sending message"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('href="#oc-loader-4"');
    });
});
