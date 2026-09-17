import type { Session } from '@opencode-ai/sdk/v2';

import { isReviewSession } from '@/lib/sessionReviewMetadata';
import { isBtwSession } from '@/lib/sessionBtwMetadata';
import { normalizePath } from '@/lib/pathNormalization';
import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import type { SessionFolder } from '@/stores/useSessionFoldersStore';
import type { WorktreeMetadata } from '@/types/worktree';
import type { ProjectEntry } from '@/lib/api/types';
import { CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { orderSessionScopeProjects } from '@/components/session/sidebar/projects/sessionScopeOrder';
import { compareSessionsByLifecycleOrder } from '@/sync/session-ordering';

export const MOBILE_SESSION_SWIPE_THRESHOLD_PX = 72;
export const MOBILE_SESSION_SWIPE_SLOP_PX = 8;
export const MOBILE_SESSION_SWIPE_REBOUND_MS = 180;
export const DEFAULT_MOBILE_SESSION_SWIPE_LIMIT = 5;

export type MobileSessionSwipeDirection = 'next' | 'previous';
export type MobileSessionSwipeDirectionState = 'ready' | 'boundary' | 'unknown';
export type MobileSessionSwipeScopeKind = 'managed-chat' | 'project' | 'worktree';
export type MobileSessionSwipeCompleteness = 'ready' | 'loading' | 'failed' | 'partial' | 'unknown';

export type MobileSessionDirectoryAuthority = {
  status: MobileSessionSwipeCompleteness;
  generation: number;
  error?: string;
};

export type MobileSessionTopologyAuthority = {
  status: MobileSessionSwipeCompleteness;
  generation: number;
  error?: string;
};

export type MobileSessionFolderHydration = {
  status: MobileSessionSwipeCompleteness;
  generation: number;
  error?: string;
};

export type MobileSessionSwipeScopeIdentity = {
  projectId: string;
  worktreeDirectory: string | null;
  folderScopeKey: string;
  folderId: string | null;
};

export type MobileSessionSwipeMetadata = {
  projectLabel: string;
  folderLabel: string | null;
  worktreeLabel: string | null;
  branchLabel: string | null;
};

export type MobileSessionSwipeSession = Session & {
  directory?: string | null;
  parentID?: string | null;
  project?: { worktree?: string | null } | null;
  metadata?: unknown;
};

export type MobileSessionSwipeTarget = MobileSessionSwipeSession & MobileSessionSwipeMetadata & {
  id: string;
  title: string;
  directory: string;
  projectId: string;
  scope: MobileSessionSwipeScopeIdentity;
};

export type MobileSessionSwipeScope = MobileSessionSwipeMetadata & {
  identity: MobileSessionSwipeScopeIdentity;
  kind: MobileSessionSwipeScopeKind;
  completeness: MobileSessionSwipeCompleteness;
  targets: readonly MobileSessionSwipeTarget[];
};

export type MobileSessionSwipeLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  hasLoaded: boolean;
};

export type MobileSessionSwipeModel = {
  runtimeKey: string;
  revision: string;
  currentRootSessionId: string | null;
  scopes: readonly MobileSessionSwipeScope[];
  /** Ordered scopes, including incomplete directional stops. */
  flattenedScopes: readonly MobileSessionSwipeScope[];
  resolveTarget: (direction: MobileSessionSwipeDirection) => MobileSessionSwipeTarget | null;
  directionState: (direction: MobileSessionSwipeDirection) => MobileSessionSwipeDirectionState;
  scopeForTarget: (targetId: string) => MobileSessionSwipeScope | null;
};

export type MobileSessionSwipeModelInputs = {
  runtimeKey: string;
  globalLoad: MobileSessionSwipeLoadState;
  activeSessions: readonly Session[];
  liveSessions?: readonly Session[];
  hierarchy?: {
    rootIds: readonly string[];
    childrenByParentId: ReadonlyMap<string, readonly string[]>;
  };
  projectSortOrder: ProjectSortOrder;
  manualProjectOrder: readonly string[];
  projects: readonly ProjectEntry[];
  worktreesByProject: ReadonlyMap<string, WorktreeMetadata[]>;
  worktreeOrderByProject?: Readonly<Record<string, string[]>>;
  directoryAuthority?: ReadonlyMap<string, MobileSessionDirectoryAuthority>;
  topologyAuthority?: ReadonlyMap<string, MobileSessionTopologyAuthority>;
  folderMap: Readonly<Record<string, readonly SessionFolder[]>>;
  folderHydration?: MobileSessionFolderHydration;
  pinnedSessionIds: ReadonlySet<string>;
  lifecycleRanks: ReadonlyMap<string, number>;
  visibleSessionId: string | null;
  resolvedRootSessionId: string | null;
  limit?: number;
  managedChatsRoot?: string | null;
  projectRootBranches?: ReadonlyMap<string, string>;
  projectRootBranchStates?: ReadonlyMap<string, { status: MobileSessionSwipeCompleteness; branch: string | null }>;
};

// SAFETY: OpenCode sends these optional hierarchy, directory, and metadata
// fields on session records even though the SDK base type omits some of them.
const sessionRecord = (session: Session): MobileSessionSwipeSession => session as MobileSessionSwipeSession;

const parentIdOf = (session: Session): string | null => {
  const value = sessionRecord(session).parentID;
  return value?.trim() || null;
};

const directoryOf = (session: Session): string | null => {
  const record = sessionRecord(session);
  return normalizePath(record.directory ?? null) ?? normalizePath(record.project?.worktree ?? null);
};

const labelForProject = (project: ProjectEntry): string => {
  const label = project.label?.trim();
  if (label) return label;
  const normalized = normalizePath(project.path) ?? project.path;
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
};

const isWithin = (directory: string, root: string): boolean => (
  directory === root || directory.startsWith(`${root}/`)
);

const authorityForDirectory = (
  directory: string,
  globalLoad: MobileSessionSwipeLoadState,
  authority: ReadonlyMap<string, MobileSessionDirectoryAuthority> | undefined,
  knownGlobalDirectories?: ReadonlySet<string>,
  managedChatsRoot?: string | null,
): MobileSessionSwipeCompleteness => (
  authority === undefined
    ? (globalLoad.status === 'ready' && globalLoad.hasLoaded ? 'ready' : globalLoad.status === 'loading' ? 'loading' : 'unknown')
    : authority.get(directory)?.status
      ?? (globalLoad.status === 'ready' && globalLoad.hasLoaded
        && (knownGlobalDirectories?.has(directory)
          || (managedChatsRoot === directory && [...(knownGlobalDirectories ?? [])].some((value) => isWithin(value, directory))))
        ? 'ready'
        : 'unknown')
);

const resolveRootSessionId = (
  sessionId: string,
  sessionById: ReadonlyMap<string, MobileSessionSwipeSession>,
  hierarchyParentById: ReadonlyMap<string, string> = new Map(),
): string | null => {
  let current = sessionById.get(sessionId);
  if (!current) return null;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    const parentId = parentIdOf(current) ?? hierarchyParentById.get(current.id) ?? null;
    if (!parentId) return current.id;
    const parent = sessionById.get(parentId);
    if (!parent) return null;
    current = parent;
  }
};

const capAndOrderRoots = (
  sessions: MobileSessionSwipeSession[],
  runtimeKey: string,
  pinnedSessionIds: ReadonlySet<string>,
  lifecycleRanks: ReadonlyMap<string, number>,
  limit: number,
  requiredSessionId: string | null,
): MobileSessionSwipeSession[] => {
  const cap = Number.isFinite(limit)
    ? Math.max(1, Math.min(5, Math.round(limit)))
    : DEFAULT_MOBILE_SESSION_SWIPE_LIMIT;
  const ordered = [...sessions].sort((left, right) => compareSessionsByLifecycleOrder(
    left,
    right,
    new Set(pinnedSessionIds),
    lifecycleRanks,
    runtimeKey,
  ));
  const retained = ordered.slice(0, cap);
  const requiredSession = sessions.find((session) => session.id === requiredSessionId);
  if (requiredSession && !retained.some((session) => session.id === requiredSession.id)) {
    retained[retained.length - 1] = requiredSession;
    retained.sort((left, right) => compareSessionsByLifecycleOrder(
      left,
      right,
      new Set(pinnedSessionIds),
      lifecycleRanks,
      runtimeKey,
    ));
  }
  return retained;
};

const buildScope = (
  input: {
    projectId: string;
    projectLabel: string;
    kind: MobileSessionSwipeScopeKind;
    directory: string | null;
    worktreeDirectory: string | null;
    folder: SessionFolder | null;
    worktreeLabel: string | null;
    branchLabel: string | null;
    completeness: MobileSessionSwipeCompleteness;
  },
  roots: MobileSessionSwipeSession[],
  modelInputs: MobileSessionSwipeModelInputs,
  sessionById: ReadonlyMap<string, MobileSessionSwipeSession>,
): MobileSessionSwipeScope => {
  const directory = input.directory ?? '';
  const scope: MobileSessionSwipeScopeIdentity = {
    projectId: input.projectId,
    worktreeDirectory: input.worktreeDirectory,
    folderScopeKey: directory,
    folderId: input.folder?.id ?? null,
  };
  const orderedRoots = input.completeness === 'ready' && directory
    ? capAndOrderRoots(
      roots,
      modelInputs.runtimeKey,
      modelInputs.pinnedSessionIds,
      modelInputs.lifecycleRanks,
      modelInputs.limit ?? DEFAULT_MOBILE_SESSION_SWIPE_LIMIT,
      modelInputs.resolvedRootSessionId,
    )
    : [];
  const targets = orderedRoots.flatMap((root) => {
    const targetDirectory = directoryOf(sessionById.get(root.id) ?? root);
    if (!targetDirectory) return [];
    return [{
      ...root,
      id: root.id,
      title: root.title?.trim() || root.id,
      directory: targetDirectory,
      projectId: input.projectId,
      projectLabel: input.projectLabel,
      folderLabel: input.folder?.name ?? null,
      worktreeLabel: input.worktreeLabel,
      branchLabel: input.branchLabel,
      scope,
    }];
  });
  return Object.freeze({
    projectLabel: input.projectLabel,
    folderLabel: input.folder?.name ?? null,
    worktreeLabel: input.worktreeLabel,
    branchLabel: input.branchLabel,
    identity: Object.freeze(scope),
    kind: input.kind,
    completeness: input.completeness,
    targets: Object.freeze(targets),
  });
};

const foldersForDirectory = (
  directory: string,
  folderMap: Readonly<Record<string, readonly SessionFolder[]>>,
): readonly SessionFolder[] => folderMap[directory] ?? [];

const folderForSession = (
  folders: readonly SessionFolder[],
  sessionId: string,
): SessionFolder | null => folders.find((folder) => folder.sessionIds.includes(sessionId)) ?? null;

const createDirectoryScopes = (
  input: {
    projectId: string;
    projectLabel: string;
    kind: MobileSessionSwipeScopeKind;
    directory: string;
    worktreeDirectory: string | null;
    worktreeLabel: string | null;
    branchLabel: string | null;
    completeness: MobileSessionSwipeCompleteness;
  },
  roots: MobileSessionSwipeSession[],
  modelInputs: MobileSessionSwipeModelInputs,
  sessionById: ReadonlyMap<string, MobileSessionSwipeSession>,
): MobileSessionSwipeScope[] => {
  const folderReady = modelInputs.folderHydration?.status === 'ready' || !modelInputs.folderHydration;
  if (!folderReady) {
    return [buildScope({ ...input, folder: null, completeness: input.completeness === 'ready' ? modelInputs.folderHydration?.status ?? 'unknown' : input.completeness }, [], modelInputs, sessionById)];
  }

  const folders = foldersForDirectory(input.directory, modelInputs.folderMap);
  const rootsByFolder = new Map<string | null, MobileSessionSwipeSession[]>();
  for (const root of roots) {
    const folderId = folderForSession(folders, root.id)?.id ?? null;
    const list = rootsByFolder.get(folderId) ?? [];
    list.push(root);
    rootsByFolder.set(folderId, list);
  }

  const scopes: MobileSessionSwipeScope[] = [];
  const unfiledRoots = rootsByFolder.get(null) ?? [];
  if (unfiledRoots.length > 0) {
    scopes.push(buildScope({ ...input, folder: null }, unfiledRoots, modelInputs, sessionById));
  }
  for (const folder of folders) {
    const folderRoots = rootsByFolder.get(folder.id) ?? [];
    if (folderRoots.length === 0) continue;
    scopes.push(buildScope({ ...input, folder }, folderRoots, modelInputs, sessionById));
  }
  return scopes;
};

const dedupeSessions = (activeSessions: readonly Session[], liveSessions: readonly Session[] = []): MobileSessionSwipeSession[] => {
  const byId = new Map<string, MobileSessionSwipeSession>();
  for (const session of activeSessions) byId.set(session.id, sessionRecord(session));
  for (const session of liveSessions) {
    const existing = byId.get(session.id);
    byId.set(session.id, existing ? { ...existing, ...sessionRecord(session) } : sessionRecord(session));
  }
  return [...byId.values()];
};

const buildRevision = (input: MobileSessionSwipeModelInputs, sessions: readonly MobileSessionSwipeSession[]): string => {
  const authority = [...(input.directoryAuthority?.entries() ?? [])]
    .map(([directory, state]) => `${directory}:${state.status}:${state.generation}`)
    .join('|');
  const topology = [...(input.topologyAuthority?.entries() ?? [])]
    .map(([directory, state]) => `${directory}:${state.status}:${state.generation}`)
    .join('|');
  const folders = input.folderHydration ? `${input.folderHydration.status}:${input.folderHydration.generation}` : 'ready';
  const folderMembership = Object.entries(input.folderMap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scope, entries]) => `${scope}:${entries.map((folder) => `${folder.id}=${folder.sessionIds.join(',')}`).join('|')}`)
    .join('||');
  const topologyValues = [...input.worktreesByProject.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, worktrees]) => `${directory}:${worktrees.map((worktree) => `${worktree.path}:${worktree.branch}`).join('|')}`)
    .join('||');
  const rootBranches = [
    ...(input.projectRootBranches?.entries() ?? []),
    ...(input.projectRootBranchStates?.entries() ?? []),
  ].map(([project, value]) => `${project}:${JSON.stringify(value)}`).sort().join('|');
  const lifecycle = [...input.lifecycleRanks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, rank]) => `${id}:${rank}`).join('|');
  const pinned = [...input.pinnedSessionIds].sort().join('|');
  const worktreeOrder = Object.entries(input.worktreeOrderByProject ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([project, order]) => `${project}:${order.join(',')}`).join('|');
  return [
    input.runtimeKey,
    input.visibleSessionId ?? '',
    input.resolvedRootSessionId ?? '',
    input.limit ?? DEFAULT_MOBILE_SESSION_SWIPE_LIMIT,
    input.globalLoad.status,
    input.globalLoad.hasLoaded,
    sessions.map((session) => `${session.id}:${directoryOf(session) ?? ''}:${parentIdOf(session) ?? ''}`).join('|'),
    authority,
    topology,
    folders,
    folderMembership,
    topologyValues,
    rootBranches,
    lifecycle,
    pinned,
    worktreeOrder,
    input.projectSortOrder,
    input.manualProjectOrder.join(','),
    input.hierarchy
      ? `${input.hierarchy.rootIds.join(',')}|${[...input.hierarchy.childrenByParentId.entries()].map(([parent, children]) => `${parent}:${children.join(',')}`).join(';')}`
      : '',
  ].join('::');
};

const latestTarget = (scope: MobileSessionSwipeScope): MobileSessionSwipeTarget | null => scope.targets[0] ?? null;

export const buildMobileSessionSwipeModel = (input: MobileSessionSwipeModelInputs): MobileSessionSwipeModel => {
  const sessions = dedupeSessions(input.activeSessions, input.liveSessions);
  const knownGlobalDirectories = new Set(input.activeSessions.map(directoryOf).filter((value): value is string => Boolean(value)));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const rootIdBySessionId = new Map<string, string>();
  const eligibleRoots = new Map<string, MobileSessionSwipeSession>();
  const hierarchyParentById = new Map<string, string>();
  const liveSessionIds = new Set((input.liveSessions ?? []).map((session) => session.id));
  for (const [parentId, childIds] of input.hierarchy?.childrenByParentId ?? []) {
    for (const childId of childIds) hierarchyParentById.set(childId, parentId);
  }

  for (const session of sessions) {
    const rootId = resolveRootSessionId(session.id, sessionById, hierarchyParentById);
    if (!rootId) continue;
    rootIdBySessionId.set(session.id, rootId);
    const root = sessionById.get(rootId);
    if (!root || root.id !== session.id || parentIdOf(root) || hierarchyParentById.has(root.id)
      || (input.hierarchy && !input.hierarchy.rootIds.includes(root.id) && !liveSessionIds.has(root.id))
      || isBtwSession(root) || isReviewSession(root)) continue;
    const directory = directoryOf(root);
    if (!directory) continue;
    eligibleRoots.set(root.id, root);
  }

  const currentRootSessionId = input.resolvedRootSessionId
    ?? (input.visibleSessionId ? rootIdBySessionId.get(input.visibleSessionId) ?? null : null);
  const modelInput = { ...input, resolvedRootSessionId: currentRootSessionId };

  const orderedProjects = orderSessionScopeProjects(
    input.projects.map((project) => ({ ...project, normalizedPath: normalizePath(project.path) ?? '' })),
    input.projectSortOrder,
    input.manualProjectOrder,
    input.worktreesByProject,
    input.worktreeOrderByProject,
  );
  const scopes: MobileSessionSwipeScope[] = [];
  const managedRoot = normalizePath(input.managedChatsRoot ?? null);
  const managedRoots = managedRoot
    ? [...eligibleRoots.values()].filter((session) => {
      const directory = directoryOf(session);
      return Boolean(directory && isWithin(directory, managedRoot));
    })
    : [];
  if (managedRoots.length > 0 || (input.globalLoad.status !== 'ready' && managedRoot)) {
    scopes.push(...createDirectoryScopes({
      projectId: CHAT_DRAFT_PROJECT_ID,
      projectLabel: CHAT_DRAFT_PROJECT_ID,
       kind: 'managed-chat',
       directory: managedRoot ?? '',
       worktreeDirectory: null,
      worktreeLabel: null,
      branchLabel: null,
       completeness: managedRoot ? authorityForDirectory(managedRoot, input.globalLoad, input.directoryAuthority, knownGlobalDirectories, managedRoot) : 'unknown',
    }, managedRoots, modelInput, sessionById));
  }

  for (const project of orderedProjects) {
    const projectPath = project.normalizedPath;
    const projectLabel = labelForProject(project);
    const projectAuthority = authorityForDirectory(projectPath, input.globalLoad, input.directoryAuthority, knownGlobalDirectories);
    const rootBranchState = input.projectRootBranchStates?.get(project.id);
    const rootBranch = input.projectRootBranches?.get(project.id) ?? rootBranchState?.branch ?? null;
    const projectRoots = [...eligibleRoots.values()].filter((session) => directoryOf(session) === projectPath);
    scopes.push(...createDirectoryScopes({
      projectId: project.id,
      projectLabel,
      kind: 'project',
      directory: projectPath,
      worktreeDirectory: projectPath,
      worktreeLabel: rootBranch || projectLabel,
      branchLabel: rootBranch,
      completeness: projectAuthority,
    }, projectRoots, modelInput, sessionById));

    for (const worktree of project.worktrees) {
      const worktreePath = normalizePath(worktree.path);
      if (!worktreePath) continue;
      const topology = input.topologyAuthority?.get(worktreePath) ?? input.topologyAuthority?.get(projectPath);
      const topologyStatus = topology?.status ?? 'unknown';
      const directoryStatus = authorityForDirectory(worktreePath, input.globalLoad, input.directoryAuthority, knownGlobalDirectories);
      const completeness = topologyStatus === 'ready' ? directoryStatus : topologyStatus;
      const worktreeRoots = [...eligibleRoots.values()].filter((session) => directoryOf(session) === worktreePath);
      scopes.push(...createDirectoryScopes({
        projectId: project.id,
        projectLabel,
        kind: 'worktree',
        directory: worktreePath,
        worktreeDirectory: worktreePath,
        worktreeLabel: worktree.branch || worktree.label || worktree.name || worktreePath,
        branchLabel: worktree.branch || null,
        completeness,
      }, worktreeRoots, modelInput, sessionById));
    }
  }

  const frozenScopes = Object.freeze(scopes);
  const scopeForTarget = (targetId: string): MobileSessionSwipeScope | null => (
    frozenScopes.find((scope) => scope.targets.some((target) => target.id === targetId)) ?? null
  );
  const currentScopeIndex = currentRootSessionId
    ? frozenScopes.findIndex((scope) => scope.targets.some((target) => target.id === currentRootSessionId))
    : -1;
  const currentTargetIndex = currentScopeIndex >= 0
    ? frozenScopes[currentScopeIndex].targets.findIndex((target) => target.id === currentRootSessionId)
    : -1;
  const resolveTarget = (direction: MobileSessionSwipeDirection): MobileSessionSwipeTarget | null => {
    if (currentScopeIndex < 0) return null;
    const step = direction === 'next' ? 1 : -1;
    const inScope = frozenScopes[currentScopeIndex].targets[currentTargetIndex + step];
    if (inScope) return inScope;
    const nextScopeIndex = currentScopeIndex + step;
    if (nextScopeIndex < 0 || nextScopeIndex >= frozenScopes.length) return null;
    const nextScope = frozenScopes[nextScopeIndex];
    if (nextScope.completeness !== 'ready') return null;
    if (nextScope.identity.projectId !== frozenScopes[currentScopeIndex].identity.projectId) {
      const projectTargets = frozenScopes
        .filter((scope) => scope.identity.projectId === nextScope.identity.projectId && scope.completeness === 'ready')
        .flatMap((scope) => [...scope.targets]);
      projectTargets.sort((left, right) => compareSessionsByLifecycleOrder(
        left,
        right,
        new Set(input.pinnedSessionIds),
        input.lifecycleRanks,
        input.runtimeKey,
      ));
      return projectTargets[0] ?? null;
    }
    return latestTarget(nextScope);
  };

  const directionState = (direction: MobileSessionSwipeDirection): MobileSessionSwipeDirectionState => {
    if (currentScopeIndex < 0 || frozenScopes[currentScopeIndex].completeness !== 'ready') return 'unknown';
    const step = direction === 'next' ? 1 : -1;
    if (frozenScopes[currentScopeIndex].targets[currentTargetIndex + step]) return 'ready';
    const nextScopeIndex = currentScopeIndex + step;
    if (nextScopeIndex < 0 || nextScopeIndex >= frozenScopes.length) return 'boundary';
    const nextScope = frozenScopes[nextScopeIndex];
    if (nextScope.completeness !== 'ready') return 'unknown';
    if (nextScope.identity.projectId !== frozenScopes[currentScopeIndex].identity.projectId) {
      return frozenScopes
        .filter((scope) => scope.identity.projectId === nextScope.identity.projectId && scope.completeness === 'ready')
        .some((scope) => scope.targets.length > 0)
        ? 'ready'
        : 'boundary';
    }
    return nextScope.targets.length > 0 ? 'ready' : 'boundary';
  };

  return Object.freeze({
    runtimeKey: input.runtimeKey,
    revision: buildRevision(input, sessions),
    currentRootSessionId,
    scopes: frozenScopes,
    flattenedScopes: frozenScopes,
    resolveTarget,
    directionState,
    scopeForTarget,
  });
};

export const validateMobileSessionSwipeTarget = (
  capturedModel: MobileSessionSwipeModel,
  currentModel: MobileSessionSwipeModel,
  target: MobileSessionSwipeTarget,
  direction: MobileSessionSwipeDirection,
): boolean => {
  if (capturedModel.runtimeKey !== currentModel.runtimeKey) return false;
  // The model may rebuild while the composer releases a popover hold. The
  // release-time checks below are the authoritative guard: they revalidate
  // the target's directory/scope and that it is still adjacent in this
  // direction, without rejecting a harmless metadata-only rebuild.
  if (currentModel.scopes.some((scope) => scope.completeness !== 'ready' && scope.identity.folderScopeKey === target.scope.folderScopeKey)) return false;
  const currentScope = currentModel.scopeForTarget(target.id);
  const currentTarget = currentScope?.targets.find((candidate) => candidate.id === target.id);
  if (!currentScope || !currentTarget || currentTarget.directory !== target.directory) return false;
  if (currentTarget.scope.projectId !== target.scope.projectId
    || currentTarget.scope.folderId !== target.scope.folderId
    || currentTarget.scope.worktreeDirectory !== target.scope.worktreeDirectory) return false;
  return currentModel.resolveTarget(direction)?.id === target.id;
};

export type MobileSessionSwipeGestureState = {
  phase: 'idle' | 'tracking' | 'horizontal' | 'cancelled' | 'committing' | 'rebounding';
  pointerId: number | null;
  startX: number;
  startY: number;
  displacementX: number;
  direction: MobileSessionSwipeDirection | null;
  thresholdCrossed: boolean;
  readyToCommit: boolean;
  hapticSent: boolean;
};

export const INITIAL_MOBILE_SESSION_SWIPE_GESTURE: MobileSessionSwipeGestureState = {
  phase: 'idle',
  pointerId: null,
  startX: 0,
  startY: 0,
  displacementX: 0,
  direction: null,
  thresholdCrossed: false,
  readyToCommit: false,
  hapticSent: false,
};

export const beginMobileSessionSwipeGesture = (
  pointerId: number,
  startX: number,
  startY: number,
): MobileSessionSwipeGestureState => ({
  ...INITIAL_MOBILE_SESSION_SWIPE_GESTURE,
  phase: 'tracking',
  pointerId,
  startX,
  startY,
});

export const updateMobileSessionSwipeGesture = (
  state: MobileSessionSwipeGestureState,
  x: number,
  y: number,
  hasTarget: (direction: MobileSessionSwipeDirection) => boolean,
): MobileSessionSwipeGestureState => {
  if (state.phase === 'idle' || state.phase === 'cancelled' || state.phase === 'committing' || state.phase === 'rebounding') return state;
  const displacementX = x - state.startX;
  const displacementY = y - state.startY;
  if (state.phase === 'tracking' && Math.abs(displacementY) > MOBILE_SESSION_SWIPE_SLOP_PX && Math.abs(displacementY) > Math.abs(displacementX)) {
    return { ...state, phase: 'cancelled', displacementX };
  }
  if (state.phase === 'tracking' && Math.max(Math.abs(displacementX), Math.abs(displacementY)) < MOBILE_SESSION_SWIPE_SLOP_PX) {
    return { ...state, displacementX };
  }
  const direction: MobileSessionSwipeDirection = displacementX < 0 ? 'next' : 'previous';
  const thresholdCrossed = Math.abs(displacementX) >= MOBILE_SESSION_SWIPE_THRESHOLD_PX;
  const readyToCommit = thresholdCrossed && hasTarget(direction);
  return {
    ...state,
    phase: 'horizontal',
    displacementX,
    direction,
    thresholdCrossed,
    readyToCommit,
  };
};

export const finishMobileSessionSwipeGesture = (
  state: MobileSessionSwipeGestureState,
): MobileSessionSwipeGestureState => ({
  ...state,
  phase: state.readyToCommit ? 'committing' : 'rebounding',
});

export const shouldNotifyMobileSessionSwipeReady = (
  previous: MobileSessionSwipeGestureState,
  next: MobileSessionSwipeGestureState,
): boolean => next.readyToCommit && !previous.readyToCommit && !previous.hapticSent;

/** Ignore implicit pointer-capture loss bubbling from a header button. */
export const ownsMobileSessionSwipePointerCapture = (
  eventTarget: EventTarget | null,
  currentTarget: EventTarget | null,
): boolean => eventTarget === currentTarget;
