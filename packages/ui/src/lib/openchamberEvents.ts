import { runtimeFetch } from './runtime-fetch';
import { subscribeRuntimeEndpointChanged } from './runtime-switch';
import { isVSCodeRuntime } from './desktop';
import { messageQueueUpdatedEventSchema, type MessageQueueUpdatedEvent } from '@/stores/messageQueueStore';
import { z } from 'zod';

type ScheduledTaskRanEvent = {
  type: 'scheduled-task-ran';
  projectId: string;
  taskId: string;
  ranAt: number;
  status: 'running' | 'success' | 'error';
  sessionId?: string;
};

type SessionCreatedEvent = {
  type: 'session-created';
  sessionId: string;
  directory: string;
  projectId?: string;
  createdAt: number;
  promptDispatched: boolean;
  dispatchedAsCommand: boolean;
};

/**
 * The set of linked worktrees of one repository changed: created or removed by
 * this server, by an agent, or from a terminal. `directories` are the
 * directories inside that repository the server has seen requests for, so a
 * listener can map them onto its registered projects and refresh only those.
 */
type WorktreeChangedEvent = {
  type: 'worktree-changed';
  directories: string[];
  changedAt: number;
};

/**
 * One in-app browser action requested by the agent tool. Broadcast to every
 * connected client; only the one owning a browser view answers.
 */
type BrowserControlRequestEvent = {
  type: 'browser-control-request';
  requestId: string;
  action: string;
  parameters: Record<string, unknown>;
};

/**
 * The agent changed what it remembers. Carries only which store moved, not the
 * entries: listeners re-read from the server, so the event cannot go stale
 * between being sent and being handled.
 */
type AgentMemoryChangedEvent = {
  type: 'agent-memory-changed';
  scope: 'global' | 'project';
  projectId?: string;
};

/**
 * The extension chosen as browser provider can no longer serve (paused,
 * removed, or approval withdrawn), so the server put the in-app browser back.
 * The setting is already written; listeners update the store and tell the user.
 */
const browserProviderResetSchema = z.object({
  guestId: z.string().min(1),
  guestName: z.string().min(1),
});
type BrowserProviderResetEvent = { type: 'browser-provider-reset' } & z.infer<typeof browserProviderResetSchema>;

/** Jev routing events; each carries what the routing store needs and nothing the UI must re-derive. */
const routingUpdatedSchema = z.object({
  available: z.boolean(),
  autoReady: z.boolean(),
  tokenPresent: z.boolean(),
});

const routingDecisionSchema = z.object({
  sessionId: z.string().min(1),
  at: z.number(),
  category: z.string().nullable(),
  confidence: z.number(),
  reason: z.enum(['routed', 'low-confidence', 'unknown-category', 'error', 'not-ready']),
  providerID: z.string().optional(),
  modelID: z.string().optional(),
  variant: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  error: z.string().optional(),
});

const routingPermissionHeldSchema = z.object({
  permissionId: z.string().min(1),
  sessionId: z.string().min(1),
  score: z.number(),
  kind: z.string().nullable(),
});

const routingSafetySkippedSchema = z.object({
  permissionId: z.string().min(1),
  sessionId: z.string().min(1),
  error: z.string(),
});

type RoutingUpdatedEvent = { type: 'routing-updated' } & z.infer<typeof routingUpdatedSchema>;
type RoutingDecisionEvent = { type: 'routing-decision'; decision: z.infer<typeof routingDecisionSchema> };
type RoutingPermissionHeldEvent = { type: 'routing-permission-held' } & z.infer<typeof routingPermissionHeldSchema>;
type RoutingSafetySkippedEvent = { type: 'routing-safety-skipped' } & z.infer<typeof routingSafetySkippedSchema>;

type OpenChamberEvent =
  | { type: 'event-stream-ready' }
  | RoutingUpdatedEvent
  | RoutingDecisionEvent
  | RoutingPermissionHeldEvent
  | RoutingSafetySkippedEvent
  | MessageQueueUpdatedEvent
  | ScheduledTaskRanEvent
  | SessionCreatedEvent
  | WorktreeChangedEvent
  | BrowserControlRequestEvent
  | BrowserProviderResetEvent
  | AgentMemoryChangedEvent;
type Listener = (event: OpenChamberEvent) => void;

const worktreeChangedPropertiesSchema = z.object({
  directories: z.array(z.string().min(1)).min(1),
  at: z.number().optional(),
});

let streamAbort: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let runtimeChangeUnsubscribe: (() => void) | null = null;
const listeners = new Set<Listener>();

const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

const clearHeartbeatTimer = () => {
  if (!heartbeatTimer) {
    return;
  }
  clearTimeout(heartbeatTimer);
  heartbeatTimer = null;
};

const scheduleReconnect = () => {
  if (reconnectTimer || listeners.size === 0) {
    return;
  }
  const delay = Math.min(1_000 * Math.pow(2, Math.min(reconnectAttempt, 5)), MAX_RECONNECT_DELAY_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connect();
  }, delay);
};

const cleanupSource = () => {
  clearHeartbeatTimer();
  if (streamAbort) {
    streamAbort.abort();
  }
  streamAbort = null;
};

const resetHeartbeatTimer = () => {
  clearHeartbeatTimer();
  if (listeners.size === 0) {
    return;
  }
  heartbeatTimer = setTimeout(() => {
    cleanupSource();
    scheduleReconnect();
  }, HEARTBEAT_TIMEOUT_MS);
};

const parseEnvelope = (raw: string): { type: string; properties: unknown } | null => {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const type = typeof parsed?.type === 'string' ? parsed.type : '';
    const properties = parsed?.properties;
    if (!type) {
      return null;
    }
    return { type, properties };
  } catch {
    return null;
  }
};

const getEventProperties = (properties: unknown): Record<string, unknown> | null => {
  if (!properties || typeof properties !== 'object') {
    return null;
  }
  return properties as Record<string, unknown>;
};

const dispatchFromEnvelope = (envelope: { type: string; properties: unknown }) => {
  if (envelope.type === 'openchamber:event-stream-ready') {
    reconnectAttempt = 0;
    for (const listener of listeners) listener({ type: 'event-stream-ready' });
    return;
  }

  if (envelope.type === 'openchamber:message-queue.updated') {
    const parsed = messageQueueUpdatedEventSchema.safeParse(envelope);
    if (parsed.success) {
      for (const listener of listeners) listener(parsed.data);
    }
    return;
  }

  if (envelope.type === 'openchamber:heartbeat') {
    return;
  }

  if (envelope.type === 'openchamber:routing.updated') {
    const parsed = routingUpdatedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'routing-updated', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:routing.decision') {
    const parsed = routingDecisionSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'routing-decision', decision: parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:routing.permission-held') {
    const parsed = routingPermissionHeldSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'routing-permission-held', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:routing.safety-skipped') {
    const parsed = routingSafetySkippedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'routing-safety-skipped', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:browser-provider-reset') {
    const parsed = browserProviderResetSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'browser-provider-reset', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:agent-memory-changed') {
    const properties = getEventProperties(envelope.properties);
    const scope = properties?.scope === 'project' ? 'project' : 'global';
    const nextEvent: AgentMemoryChangedEvent = {
      type: 'agent-memory-changed',
      scope,
      ...(typeof properties?.projectId === 'string' && properties.projectId.length > 0
        ? { projectId: properties.projectId }
        : {}),
    };
    for (const listener of listeners) {
      listener(nextEvent);
    }
    return;
  }

  if (envelope.type === 'openchamber:session-created') {
    const properties = getEventProperties(envelope.properties);
    const sessionId = typeof properties?.sessionId === 'string' ? properties.sessionId : '';
    const directory = typeof properties?.directory === 'string' ? properties.directory : '';
    if (!sessionId || !directory) {
      return;
    }

    const nextEvent: SessionCreatedEvent = {
      type: 'session-created',
      sessionId,
      directory,
      createdAt: typeof properties?.createdAt === 'number' ? properties.createdAt : Date.now(),
      promptDispatched: properties?.promptDispatched === true,
      dispatchedAsCommand: properties?.dispatchedAsCommand === true,
      ...(typeof properties?.projectId === 'string' && properties.projectId.length > 0
        ? { projectId: properties.projectId }
        : {}),
    };
    for (const listener of listeners) {
      listener(nextEvent);
    }
    return;
  }

  if (envelope.type === 'openchamber:worktree-changed') {
    const parsed = worktreeChangedPropertiesSchema.safeParse(envelope.properties);
    if (!parsed.success) return;
    const nextEvent: WorktreeChangedEvent = {
      type: 'worktree-changed',
      directories: parsed.data.directories,
      changedAt: parsed.data.at ?? Date.now(),
    };
    for (const listener of listeners) listener(nextEvent);
    return;
  }

  if (envelope.type === 'openchamber:browser-control-request') {
    const properties = getEventProperties(envelope.properties);
    const requestId = typeof properties?.requestId === 'string' ? properties.requestId : '';
    const action = typeof properties?.action === 'string' ? properties.action : '';
    if (!requestId || !action) {
      return;
    }

    const rawParameters = properties?.parameters;
    const nextEvent: BrowserControlRequestEvent = {
      type: 'browser-control-request',
      requestId,
      action,
      parameters: rawParameters && typeof rawParameters === 'object' && !Array.isArray(rawParameters)
        ? rawParameters as Record<string, unknown>
        : {},
    };
    for (const listener of listeners) {
      listener(nextEvent);
    }
    return;
  }

  if (envelope.type !== 'openchamber:scheduled-task-ran') {
    return;
  }

  const properties = getEventProperties(envelope.properties);
  const projectId = typeof properties?.projectId === 'string' ? properties.projectId : '';
  const taskId = typeof properties?.taskId === 'string' ? properties.taskId : '';
  const ranAt = typeof properties?.ranAt === 'number' ? properties.ranAt : Date.now();
  const rawStatus = properties?.status;
  const status = rawStatus === 'running' || rawStatus === 'error' ? rawStatus : 'success';
  if (!projectId || !taskId) {
    return;
  }

  const nextEvent: ScheduledTaskRanEvent = {
    type: 'scheduled-task-ran',
    projectId,
    taskId,
    ranAt,
    status,
    ...(typeof properties?.sessionId === 'string' && properties.sessionId.length > 0
      ? { sessionId: properties.sessionId }
      : {}),
  };
  for (const listener of listeners) {
    listener(nextEvent);
  }
};

const connect = () => {
  if (typeof window === 'undefined' || listeners.size === 0) {
    return;
  }

  if (streamAbort) {
    return;
  }

  cleanupSource();

  const canControlBrowser = typeof window !== 'undefined' && Boolean(window.__OPENCHAMBER_ELECTRON__);
  const controller = new AbortController();
  streamAbort = controller;

  void readStream(controller.signal, canControlBrowser);
};

const readStream = async (signal: AbortSignal, canControlBrowser: boolean): Promise<void> => {
  try {
    const response = await runtimeFetch('/api/openchamber/events', {
      headers: { Accept: 'text/event-stream' },
      query: canControlBrowser ? { browser: '1' } : undefined,
      signal,
    });

    if (signal.aborted) {
      return;
    }

    if (!response.ok || !response.body) {
      if (streamAbort?.signal === signal) {
        streamAbort = null;
      }
      scheduleReconnect();
      return;
    }

    resetHeartbeatTimer();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal.aborted) {
          return;
        }
        if (done) {
          break;
        }

        resetHeartbeatTimer();
        buffer += decoder.decode(value, { stream: true });

        let frameEnd;
        while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          const envelope = parseSseFrame(frame);
          if (envelope) {
            dispatchFromEnvelope(envelope);
          }
        }
      }

      const envelope = parseSseFrame(buffer.trim());
      if (envelope) {
        dispatchFromEnvelope(envelope);
      }
    } catch {
      if (signal.aborted) {
        return;
      }
    }

    if (streamAbort?.signal === signal) {
      streamAbort = null;
    }
    scheduleReconnect();
  } catch {
    if (signal.aborted) {
      return;
    }
    if (streamAbort?.signal === signal) {
      streamAbort = null;
    }
    scheduleReconnect();
  }
};

const parseSseFrame = (frame: string): { type: string; properties: unknown } | null => {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) {
    return null;
  }
  return parseEnvelope(dataLine.slice(5).trim());
};

const ensureRuntimeChangeSubscription = () => {
  if (runtimeChangeUnsubscribe || typeof window === 'undefined') return;
  runtimeChangeUnsubscribe = subscribeRuntimeEndpointChanged(() => {
    cleanupSource();
    reconnectAttempt = 0;
    connect();
  });
};

const cleanupRuntimeChangeSubscription = () => {
  runtimeChangeUnsubscribe?.();
  runtimeChangeUnsubscribe = null;
};

export const subscribeOpenchamberEvents = (listener: Listener): (() => void) => {
  // VS Code runs OpenCode through its bridge, not the OpenChamber server that
  // owns this stream. Opening it here retries against vscode-webview:// forever.
  if (isVSCodeRuntime()) return () => undefined;

  listeners.add(listener);
  ensureRuntimeChangeSubscription();
  connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempt = 0;
      cleanupSource();
      cleanupRuntimeChangeSubscription();
    }
  };
};
