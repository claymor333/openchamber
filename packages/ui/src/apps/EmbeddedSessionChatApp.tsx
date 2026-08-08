import React from 'react';

import { ChatView } from '@/components/views/ChatView';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { OpenCodeUpdateToast } from '@/components/update/OpenCodeUpdateToast';
import { SyncAppEffects } from '@/apps/AppEffects';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import {
  getRuntimeApiBaseUrl,
  subscribeRuntimeEndpointChanged,
  switchRuntimeEndpoint,
} from '@/lib/runtime-switch';
import { opencodeClient } from '@/lib/opencode/client';
import { isVSCodeRuntime } from '@/lib/desktop';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import {
  readEmbeddedSessionChatConfig,
  requestEmbeddedSessionRuntimeBootstrap,
  type EmbeddedSessionChatConfig,
  type EmbeddedVisibilityPayload,
} from '@/components/layout/contextPanelEmbeddedChat';

const normalizeEmbeddedDirectory = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
};

const EmbeddedSessionChatContent: React.FC<{
  embeddedSessionChat: EmbeddedSessionChatConfig;
  isVSCodeRuntime: boolean;
  embeddedBackgroundWorkEnabled: boolean;
}> = ({ embeddedSessionChat, isVSCodeRuntime, embeddedBackgroundWorkEnabled }) => {
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const sync = useSync();
  const bootstrapKeyRef = React.useRef<string | null>(null);

  const expectedDirectory = normalizeEmbeddedDirectory(embeddedSessionChat.directory);
  const activeDirectory = normalizeEmbeddedDirectory(currentDirectory);

  React.useEffect(() => {
    if (isVSCodeRuntime) return;
    if (expectedDirectory && activeDirectory !== expectedDirectory) return;

    const bootstrapKey = `${expectedDirectory}\n${embeddedSessionChat.sessionId}`;
    // Skip if this session was already bootstrapped and a session is still
    // active — allows in-place navigation (e.g. "Open subtask") to change
    // currentSessionId without this effect forcing it back. Only re-bootstrap
    // when currentSessionId was cleared (store init, draft, delete/archive,
    // runtime-switch remount).
    if (bootstrapKeyRef.current === bootstrapKey && currentSessionId) {
      return;
    }

    bootstrapKeyRef.current = bootstrapKey;
    setCurrentSession(embeddedSessionChat.sessionId, embeddedSessionChat.directory);
    void sync.ensureSessionRenderable(embeddedSessionChat.sessionId, true);
  }, [
    activeDirectory,
    currentSessionId,
    embeddedSessionChat.directory,
    embeddedSessionChat.sessionId,
    expectedDirectory,
    isVSCodeRuntime,
    setCurrentSession,
    sync,
  ]);

  if (expectedDirectory && activeDirectory !== expectedDirectory) {
    return null;
  }

  return (
    <>
      <SyncAppEffects embeddedBackgroundWorkEnabled={embeddedBackgroundWorkEnabled} />
      <OpenCodeUpdateToast />
      <ChatView readOnly={embeddedSessionChat.readOnly} />
      <Toaster />
    </>
  );
};

/**
 * The embedded session-chat surface (`?ocPanel=session-chat`): a read-only
 * ChatView for a fixed session, used by the desktop context panel AND by the
 * native tablet's context panel (which reuses the desktop layout).
 *
 * The panel iframe on the mobile surface cannot rely on server-injected
 * runtime globals (unlike desktop), so it pulls its runtime endpoint from the
 * parent window via `requestEmbeddedSessionRuntimeBootstrap` and applies it
 * with `switchRuntimeEndpoint`. Desktop/web iframes skip that step — their
 * runtime is already resolvable — and behave exactly as before.
 *
 * `embeddedBackgroundWorkEnabled` is provided by the desktop App (which owns
 * the embedded-visibility state for its own background-work hooks); the mobile
 * path computes it from the parent's visibility messages itself.
 */
export const EmbeddedSessionChatApp: React.FC<{
  apis: RuntimeAPIs;
  embeddedBackgroundWorkEnabled?: boolean;
}> = ({ apis, embeddedBackgroundWorkEnabled }) => {
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);
  const [runtimeEndpointEpoch, setRuntimeEndpointEpoch] = React.useState(0);
  const [internalVisible, setInternalVisible] = React.useState(true);
  const [runtimeReady, setRuntimeReady] = React.useState<boolean>(() => Boolean(getRuntimeApiBaseUrl()));
  const embeddedSessionChat = React.useMemo(() => readEmbeddedSessionChatConfig(), []);
  const effectiveBackgroundWork = embeddedBackgroundWorkEnabled ?? internalVisible;
  const isVSCode = isVSCodeRuntime();

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  React.useEffect(() => {
    return subscribeRuntimeEndpointChanged(() => {
      setRuntimeEndpointEpoch((epoch) => epoch + 1);
    });
  }, []);

  // Configure the runtime from the parent when this surface cannot resolve one
  // on its own (mobile/tablet iframes). One-shot: an empty/missing bootstrap
  // leaves the default same-origin resolution untouched.
  React.useEffect(() => {
    if (runtimeReady) {
      return;
    }

    let cancelled = false;
    void requestEmbeddedSessionRuntimeBootstrap().then((bootstrap) => {
      if (cancelled || !bootstrap || !bootstrap.apiBaseUrl) {
        return;
      }

      switchRuntimeEndpoint({
        apiBaseUrl: bootstrap.apiBaseUrl,
        clientToken: bootstrap.clientToken || null,
        runtimeKey: bootstrap.relayHostId ? `host:${bootstrap.relayHostId}` : undefined,
        requestHeaders: bootstrap.runtimeHeaders,
        relay: bootstrap.relay,
      });
      // switchRuntimeEndpoint reconfigures the URL resolver; rebuild the SDK
      // client so the sync layer connects to the parent's server. The
      // runtime-endpoint-changed event above remounts SyncProvider with it.
      opencodeClient.reconnectToRuntimeBaseUrl();
      setRuntimeReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [runtimeReady]);

  // The mobile path owns the embedded-visibility state (the desktop App passes
  // its own value down instead).
  React.useEffect(() => {
    if (embeddedBackgroundWorkEnabled !== undefined || !embeddedSessionChat || typeof window === 'undefined') {
      return;
    }

    const applyVisibility = (payload?: EmbeddedVisibilityPayload) => {
      const nextVisible = payload?.visible === true;
      setInternalVisible(nextVisible);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as { type?: unknown; payload?: EmbeddedVisibilityPayload };
      if (data?.type !== 'openchamber:embedded-visibility') {
        return;
      }

      applyVisibility(data.payload);
    };

    const scopedWindow = window as unknown as {
      __openchamberSetEmbeddedVisibility?: (payload?: EmbeddedVisibilityPayload) => void;
    };

    scopedWindow.__openchamberSetEmbeddedVisibility = applyVisibility;
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (scopedWindow.__openchamberSetEmbeddedVisibility === applyVisibility) {
        delete scopedWindow.__openchamberSetEmbeddedVisibility;
      }
    };
  }, [embeddedBackgroundWorkEnabled, embeddedSessionChat]);

  React.useEffect(() => {
    if (!embeddedSessionChat?.directory || isVSCode) {
      return;
    }

    if (currentDirectory === embeddedSessionChat.directory) {
      return;
    }

    setDirectory(embeddedSessionChat.directory, { showOverlay: false });
  }, [currentDirectory, embeddedSessionChat, isVSCode, setDirectory]);

  if (!embeddedSessionChat) {
    return null;
  }

  return (
    <ErrorBoundary>
      <SyncProvider
        key={runtimeEndpointEpoch}
        sdk={opencodeClient.getSdkClient()}
        directory={currentDirectory || ''}
      >
        <RuntimeAPIProvider apis={apis}>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <div className="h-full text-foreground bg-background">
              <EmbeddedSessionChatContent
                embeddedSessionChat={embeddedSessionChat}
                isVSCodeRuntime={isVSCode}
                embeddedBackgroundWorkEnabled={effectiveBackgroundWork}
              />
            </div>
          </TooltipProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  );
};
