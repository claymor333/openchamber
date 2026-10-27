import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useChatSessionSelection } from './chatColumnSession';
import { useSelectionStore } from '@/sync/selection-store';
import type { BtwSelection } from '@/stores/useBtwStore';
import { getAgentDisplayName } from './mobileControlsUtils';
import { useAgentColors } from '@/hooks/useAgentColors';
import { isAutoModel } from '@/lib/routing/autoModel';
import { useI18n } from '@/lib/i18n';

interface MobileAgentButtonProps {
    onCycleAgent: () => void;
    onOpenAgentPanel: () => void;
    className?: string;
    selection?: BtwSelection | null;
}

const LONG_PRESS_MS = 500;

// NOTE: Use pointer events instead of onClick to keep soft keyboard open on mobile
export const MobileAgentButton: React.FC<MobileAgentButtonProps> = ({ onCycleAgent, onOpenAgentPanel, className, selection }) => {
    const { t } = useI18n();
    const getAgentColor = useAgentColors();
    const configAgentName = useConfigStore((state) => state.currentAgentName);
    const configProviderId = useConfigStore((state) => state.currentProviderId);
    const configModelId = useConfigStore((state) => state.currentModelId);
    const currentAgentName = selection ? selection.agent : configAgentName;
    const currentProviderId = selection ? selection.model?.providerId : configProviderId;
    const currentModelId = selection ? selection.model?.modelId : configModelId;
    const getVisibleAgents = useConfigStore((state) => state.getVisibleAgents);
    const currentSessionId = useChatSessionSelection().sessionId;
    const sessionAgentName = useSelectionStore((state) =>
        currentSessionId ? state.getSessionAgentSelection(currentSessionId) : null
    );

    const agents = getVisibleAgents();
    const uiAgentName = selection
        ? selection.agent
        : currentSessionId ? (sessionAgentName || currentAgentName) : currentAgentName;
    const agentLabel = selection && !uiAgentName
        ? t('chat.modelControls.selectAgent')
        : getAgentDisplayName(agents, uiAgentName);
    const agentColor = getAgentColor(uiAgentName);

    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressRef = React.useRef(false);

    const handlePointerDown = (event: React.PointerEvent) => {
        // Same pattern as PermissionAutoAcceptButton: block the focus transfer
        // iOS performs on touch so cycling the agent keeps the keyboard open.
        if (event.pointerType === 'touch') {
            event.preventDefault();
        }
        isLongPressRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            onOpenAgentPanel();
        }, LONG_PRESS_MS);
    };

    // Use onPointerUp (not onClick) to prevent focus transfer that closes mobile keyboard
    const handlePointerUp = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (!isLongPressRef.current) {
            onCycleAgent();
        }
    };

    const handlePointerLeave = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    // Under Auto the routing category names the agent, so the composer offers
    // no agent to pick — same as the desktop controls.
    if (isAutoModel(currentProviderId, currentModelId)) return null;

    return (
        <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp} // Don't use onClick - it closes mobile keyboard
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(
                'inline-flex h-[26px] min-h-0 min-w-0 items-stretch select-none',
                'rounded-lg',
                'typography-micro font-medium',
                'focus:outline-none hover:bg-[var(--interactive-hover)]',
                'touch-none',
                className
            )}
            style={{ color: agentColor.color }}
            title={agentLabel}
        >
            <span className="flex h-full w-full min-w-0 items-center">
                <span className="truncate">{agentLabel}</span>
            </span>
        </button>
    );
};
