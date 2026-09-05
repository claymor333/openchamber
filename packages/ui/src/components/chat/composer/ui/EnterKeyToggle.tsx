/** Toggle whether Enter or Shift+Enter sends the composer message. */

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
