import React from 'react';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { RenderMobileHeader } from '@/apps/MobileHeader';

type ChatViewProps = {
    active?: boolean;
    /**
     * Controls message-history subscription independently of `active`.
     * Embedded session-chat panels keep this true so history stays visible
     * while composer focus / background work remain gated by visibility.
     */
    messagesEnabled?: boolean;
    readOnly?: boolean;
    initialAllowPromptingSubagentSessions?: boolean;
    renderMobileHeader?: RenderMobileHeader;
};

export const ChatView: React.FC<ChatViewProps> = ({
    active = true,
    messagesEnabled,
    readOnly = false,
    initialAllowPromptingSubagentSessions,
    renderMobileHeader,
}) => {
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);

    return (
        <ChatErrorBoundary sessionId={currentSessionId || undefined}>
            <ChatContainer
                active={active}
                messagesEnabled={messagesEnabled}
                readOnly={readOnly}
                initialAllowPromptingSubagentSessions={initialAllowPromptingSubagentSessions}
                renderMobileHeader={renderMobileHeader}
            />
        </ChatErrorBoundary>
    );
};
