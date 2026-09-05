import React, { act } from 'react';
import { Window } from 'happy-dom';
import { describe, expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';

import { I18nProvider } from '@/lib/i18n';

import { EnterKeyToggle } from './EnterKeyToggle';

const renderToggle = async () => {
    const win = new Window({ url: 'http://localhost' });
    const values = {
        window: win,
        document: win.document,
        navigator: win.navigator,
        localStorage: win.localStorage,
        Node: win.Node,
        Element: win.Element,
        HTMLElement: win.HTMLElement,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });

    const container = document.createElement('div');
    const root = createRoot(container);

    function Harness() {
        const [enterToSend, setEnterToSend] = React.useState(true);
        return (
            <EnterKeyToggle
                footerIconButtonClass="icon-button"
                iconSizeClass="icon-size"
                enterToSend={enterToSend}
                onToggle={() => setEnterToSend((value) => !value)}
            />
        );
    }

    try {
        await act(async () => root.render(<I18nProvider><Harness /></I18nProvider>));
        const button = container.querySelector<HTMLButtonElement>('button');
        expect(button?.getAttribute('aria-label')).toBe('Enter sends');
        expect(button?.getAttribute('aria-pressed')).toBe('true');

        await act(async () => button?.click());

        expect(button?.getAttribute('aria-label')).toBe('Shift+Enter sends');
        expect(button?.getAttribute('aria-pressed')).toBe('false');
    } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
        await win.happyDOM.close();
    }
};

describe('EnterKeyToggle', () => {
    test('updates its accessible state when toggled', async () => {
        await renderToggle();
    });
});
