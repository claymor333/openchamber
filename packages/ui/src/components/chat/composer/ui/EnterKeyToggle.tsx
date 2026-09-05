/**
 * Composer Enter-key toggle: switches between "Enter sends" and "Shift+Enter
 * sends" (and the inverse newline behavior). Replaces the old settings-page
 * "Enter sends with a keyboard attached" checkbox, which tried to infer the
 * input source and got GBoard's hardware-keyboard strip wrong. This is a plain
 * user choice, shown where it matters — next to the composer's send controls.
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type EnterKeyToggleProps = {
    footerIconButtonClass: string;
    iconSizeClass: string;
    enterToSend: boolean;
    onToggle: () => void;
};

export const EnterKeyToggle = React.memo(function EnterKeyToggle(props: EnterKeyToggleProps) {
    const { footerIconButtonClass, iconSizeClass, enterToSend, onToggle } = props;
    const { t } = useI18n();
    const label = t(enterToSend
        ? 'chat.chatInput.actions.enterToSend'
        : 'chat.chatInput.actions.shiftEnterToSend');

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        footerIconButtonClass,
                        'rounded-md',
                        enterToSend
                            ? 'text-primary'
                            : 'text-foreground hover:bg-[var(--interactive-hover)]/40'
                    )}
                    onMouseDown={(event) => {
                        event.preventDefault();
                    }}
                    onPointerDownCapture={(event) => {
                        if (event.pointerType === 'touch') {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }}
                    onClick={onToggle}
                    aria-label={label}
                    aria-pressed={enterToSend}
                >
                    <Icon name="corner-down-left" className={cn(iconSizeClass)} />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
                {label}
            </TooltipContent>
        </Tooltip>
    );
});
