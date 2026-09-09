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
    test('idle renders an enabled send button', () => {
        const markup = renderButtons();
        expect(markup).toContain('aria-label="Send message"');
        expect(markup).not.toContain('disabled=""');
        expect(markup).toContain('href="#oc-send-plane-2"');
        expect(markup).not.toContain('href="#oc-loader-4"');
    });

    test('sending renders a disabled spinner button', () => {
        const markup = renderButtons({ isSending: true });
        expect(markup).toContain('aria-label="Sending message"');
        expect(markup).toContain('disabled=""');
        expect(markup).toContain('href="#oc-loader-4"');
        expect(markup).toContain('animate-spin');
        expect(markup).not.toContain('href="#oc-send-plane-2"');
    });
});
