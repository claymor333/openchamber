import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { getChatsRootForHome } from '@/lib/chatDirectories';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useSessionFoldersStore } from '@/stores/useSessionFoldersStore';
import { useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { useWorktreeOrderStore } from '@/stores/useWorktreeOrderStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGitStore, useIsGitRepo } from '@/stores/useGitStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useAllLiveSessions, useSession } from '@/sync/sync-context';
import { useSessionOrderingStore } from '@/sync/session-ordering';
import { normalizePath } from './mobilePaths';

import { MobileSessionMetadataButton } from './MobileSessionMetadata';
import { MobileSessionSwitcher } from './MobileSessionSwitcher';
import {
  buildMobileSessionSwipeModel,
  validateMobileSessionSwipeTarget,
  type MobileSessionSwipeDirection,
  type MobileSessionSwipeModel,
} from './mobileSessionSwipe';
import { useMobileSessionSwipe } from './useMobileSessionSwipe';

export type MobileHeaderHostOptions = {
  mobileTextareaFocused?: boolean;
  onSwipeGestureActive?: (active: boolean) => void;
  onSwipePreviewChange?: (visible: boolean) => void;
  onPopoverOpenIntent?: () => void;
  onPopoverOpenChange?: (open: boolean) => void;
};

export type MobileHeaderPlacement = 'top' | 'bottom';

export type RenderMobileHeader = (
  placement: MobileHeaderPlacement,
  options?: MobileHeaderHostOptions,
) => React.ReactNode;

export const MobileHeader: React.FC<{
  onOpenSessions: () => void;
  /** Opens the right workspace drawer (Changes / Files / Terminal / Notes / MCP). */
  onOpenWorkspace: () => void;
  /** Tablet: keep the title trigger sized to its text. */
  compactTitle?: boolean;
  placement?: MobileHeaderPlacement;
  mobileTextareaFocused?: boolean;
  onSwipeGestureActive?: (active: boolean) => void;
  onSwipePreviewChange?: (visible: boolean) => void;
  onPopoverOpenIntent?: () => void;
  onPopoverOpenChange?: (open: boolean) => void;
}> = ({
  onOpenSessions,
  onOpenWorkspace,
  compactTitle = false,
  placement = 'top',
  mobileTextareaFocused = false,
  onSwipeGestureActive,
  onSwipePreviewChange,
  onPopoverOpenIntent,
  onPopoverOpenChange,
}) => {
  const { t } = useI18n();
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const titleRef = React.useRef<HTMLButtonElement>(null);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSessionDirectory = useSessionUIStore(
    React.useCallback(
      (state) => (currentSessionId ? state.getDirectoryForSession(currentSessionId) : null),
      [currentSessionId],
    ),
  );
  const effectiveDirectory = currentSessionDirectory || currentDirectory;
  const currentSession = useSession(currentSessionId, effectiveDirectory || undefined);
  const isNewSessionDraftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  // Uncommitted changes in the active project or worktree: the workspace
  // button gets a dot instead of a changed-files bar above the composer.
  const isGitRepo = useIsGitRepo(effectiveDirectory || null);
  const hasUncommittedChanges = useGitStore((state) => {
    if (!effectiveDirectory || isGitRepo !== true) return false;
    const status = state.directories.get(effectiveDirectory)?.status;
    return Boolean(status && !status.isClean);
  });
  const selectionTransition = useSessionUIStore((state) => state.selectionTransition);
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const globalLoadStatus = useGlobalSessionsStore((state) => state.status);
  const globalHasLoaded = useGlobalSessionsStore((state) => state.hasLoaded);
  const directoryAuthority = useGlobalSessionsStore((state) => state.directoryAuthority);
  const sessionStructure = useGlobalSessionsStore((state) => state.structure);
  const sessionHierarchy = React.useMemo(() => ({
    rootIds: sessionStructure.activeRootIds,
    childrenByParentId: sessionStructure.activeChildrenByParentId,
  }), [sessionStructure]);
  const liveSessions = useAllLiveSessions();
  const projects = useProjectsStore((state) => state.projects);
  const manualProjectOrder = useProjectsStore((state) => state.manualProjectOrder);
  const projectSortOrder = useSessionDisplayStore((state) => state.projectSortOrder);
  const worktreeOrderByProject = useWorktreeOrderStore((state) => state.orderByProject);
  const worktreesByProject = useSessionUIStore((state) => state.availableWorktreesByProject);
  const topologyAuthority = useSessionUIStore((state) => state.worktreeTopologyAuthority);
  const projectRootBranches = useSessionUIStore((state) => state.projectRootBranches);
  const projectRootBranchStates = useSessionUIStore((state) => state.projectRootBranchStates);
  const folders = useSessionFoldersStore((state) => state.foldersMap);
  const runtimeKey = getRuntimeKey();
  const folderHydration = useSessionFoldersStore((state) => state.folderHydrationByRuntime.get(runtimeKey));
  const pinnedSessionIds = useSessionPinnedStore((state) => state.ids);
  const lifecycleRanks = useSessionOrderingStore((state) => state.rankById);
  const mobileSessionSwipeLimit = useUIStore((state) => state.mobileSessionSwipeLimit);
  const managedChatsRoot = getChatsRootForHome(homeDirectory);

  const swipeModel = React.useMemo<MobileSessionSwipeModel>(() => buildMobileSessionSwipeModel({
    runtimeKey,
    globalLoad: { status: globalLoadStatus, hasLoaded: globalHasLoaded },
    activeSessions,
    liveSessions,
    hierarchy: sessionHierarchy,
    projectSortOrder,
    manualProjectOrder,
    projects,
    worktreesByProject,
    worktreeOrderByProject,
    directoryAuthority,
    topologyAuthority,
    folderMap: folders,
    folderHydration,
    pinnedSessionIds,
    lifecycleRanks,
    visibleSessionId: currentSessionId,
    resolvedRootSessionId: null,
    limit: mobileSessionSwipeLimit,
    managedChatsRoot,
    projectRootBranches,
    projectRootBranchStates,
  }), [
    activeSessions,
    currentSessionId,
    directoryAuthority,
    folderHydration,
    folders,
    globalHasLoaded,
    globalLoadStatus,
    sessionHierarchy,
    lifecycleRanks,
    liveSessions,
    managedChatsRoot,
    manualProjectOrder,
    mobileSessionSwipeLimit,
    pinnedSessionIds,
    projectRootBranches,
    projectRootBranchStates,
    projectSortOrder,
    projects,
    runtimeKey,
    topologyAuthority,
    worktreeOrderByProject,
    worktreesByProject,
  ]);

  const currentModelRef = React.useRef(swipeModel);
  currentModelRef.current = swipeModel;
  const swipe = useMobileSessionSwipe({
    model: swipeModel,
    runtimeKey,
    // Bottom navigation is a fixed destination bar, not a session-swipe
    // surface. Keep swipe navigation on the top header only.
    disabled: placement === 'bottom' || !currentSessionId || selectionTransition === 'pending',
    onClosePopovers: () => {
      setMetadataOpen(false);
      setSwitcherOpen(false);
      onPopoverOpenChange?.(false);
    },
    onGestureActiveChange: onSwipeGestureActive,
    onCommit: (target, capturedModel, direction) => {
      if (!validateMobileSessionSwipeTarget(capturedModel, currentModelRef.current, target, direction)) return;
      // Session selection owns directory, loader, persistence, viewport and
      // viewed-state updates. The header does not optimistically set a project.
      useSessionUIStore.getState().setCurrentSession(target.id, resolveGlobalSessionDirectory(target));
    },
  });

  const sessionTitle = currentSession?.title?.trim();
  const primaryLabel = sessionTitle
    || (currentSessionId ? t('mobile.sessions.untitled') : t('sessions.switcher.draftTitle'));
  const previewTarget = swipe.previewTarget;
  // The selected session title remains stable throughout the gesture. The
  // candidate session is communicated by the metadata line instead, so a
  // boundary or canceled swipe never makes the header appear to switch early.
  const previewLabel = primaryLabel;
  const previewDirectionIcon = swipe.direction === 'next' ? 'arrow-right' : 'arrow-left';
  const previewMeta = previewTarget
    ? [previewTarget.title, previewTarget.projectLabel, previewTarget.folderLabel, previewTarget.worktreeLabel ?? previewTarget.branchLabel]
      .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
      .join(' · ')
    : null;
  const currentRootTarget = React.useMemo(
    () => swipeModel.scopes.flatMap((scope) => scope.targets)
      .find((target) => target.id === swipeModel.currentRootSessionId),
    [swipeModel],
  );
  const currentBranch = React.useMemo(() => {
    const normalizedDirectory = normalizePath(
      effectiveDirectory || (currentSession ? resolveGlobalSessionDirectory(currentSession) : null),
    );
    if (!normalizedDirectory) return null;
    let projectRootBranch: string | null = null;
    let matchesProjectRoot = false;
    let bestWorktree: { path: string; branch: string } | null = null;

    for (const project of projects) {
      const projectPath = normalizePath(project.path);
      if (!projectPath) continue;
      if (normalizedDirectory === projectPath) {
        matchesProjectRoot = true;
        projectRootBranch = projectRootBranches.get(project.id)?.trim() || null;
      }
      for (const worktree of worktreesByProject.get(project.id) ?? []) {
        const worktreePath = normalizePath(worktree.path);
        const branch = worktree.branch?.trim();
        if (!worktreePath || !branch) continue;
        if (normalizedDirectory !== worktreePath && !normalizedDirectory.startsWith(`${worktreePath}/`)) continue;
        if (!bestWorktree || worktreePath.length > bestWorktree.path.length) {
          bestWorktree = { path: worktreePath, branch };
        }
      }
    }
    return currentRootTarget?.branchLabel
      ?? bestWorktree?.branch
      ?? (matchesProjectRoot ? projectRootBranch : null);
  }, [currentRootTarget, currentSession, effectiveDirectory, projectRootBranches, projects, worktreesByProject]);

  React.useEffect(() => {
    setMetadataOpen(false);
    setSwitcherOpen(false);
  }, [currentSessionId, effectiveDirectory]);

  const handleOpenSessions = React.useCallback(() => {
    setMetadataOpen(false);
    setSwitcherOpen(false);
    onPopoverOpenChange?.(false);
    onOpenSessions();
  }, [onOpenSessions, onPopoverOpenChange]);

  const handleMetadataOpenChange = React.useCallback((value: boolean | ((open: boolean) => boolean)) => {
    setMetadataOpen((current) => {
      const next = value instanceof Function ? value(current) : value;
      if (next) {
        setSwitcherOpen(false);
        onPopoverOpenChange?.(true);
      } else if (!switcherOpen) {
        onPopoverOpenChange?.(false);
      }
      return next;
    });
  }, [onPopoverOpenChange, switcherOpen]);

  const toggleSwitcher = React.useCallback(() => {
    setSwitcherOpen((current) => {
      const next = !current;
      if (next) {
        setMetadataOpen(false);
        onPopoverOpenChange?.(true);
      } else if (!metadataOpen) {
        onPopoverOpenChange?.(false);
      }
      return next;
    });
  }, [metadataOpen, onPopoverOpenChange]);

  const isBottom = placement === 'bottom';
  const headerHeight = isBottom
    ? '56px'
    : 'var(--oc-header-height, 56px)';
  const swipeMaskFrameRef = React.useRef<HTMLDivElement | null>(null);
  const swipeMaskLabelRef = React.useRef<HTMLSpanElement | null>(null);
  const [swipePreviewExiting, setSwipePreviewExiting] = React.useState(false);
  const hadSwipePreviewRef = React.useRef(false);
  const lastPreviewRef = React.useRef<{ direction: MobileSessionSwipeDirection; meta: string | null }>({ direction: 'next', meta: null });
  const showPreviewMeta = swipe.thresholdCrossed || swipePreviewExiting;

  if (swipe.direction !== null) {
    if (swipe.thresholdCrossed) hadSwipePreviewRef.current = true;
    lastPreviewRef.current = { direction: swipe.direction, meta: previewMeta };
  }

  React.useEffect(() => {
    if (swipe.thresholdCrossed) {
      setSwipePreviewExiting(false);
      return;
    }
    if (!hadSwipePreviewRef.current) return;
    setSwipePreviewExiting(true);
    const timeoutId = window.setTimeout(() => {
      hadSwipePreviewRef.current = false;
      setSwipePreviewExiting(false);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [swipe.thresholdCrossed]);

  React.useEffect(() => {
    onSwipePreviewChange?.(swipe.thresholdCrossed);
  }, [onSwipePreviewChange, swipe.thresholdCrossed]);

  const swipeMaskActive = swipe.direction !== null || swipePreviewExiting || hadSwipePreviewRef.current;

  const measureSwipeMask = React.useCallback(() => {
    if (swipe.isDragging) return;
    const frame = swipeMaskFrameRef.current;
    const label = swipeMaskLabelRef.current;
    const surface = swipe.surfaceRef.current;
    if (!frame || !label || !surface) return;
    const frameRect = frame.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    if (frameRect.width <= 0 || labelRect.width <= 0) return;
    const textLeft = Math.max(0, Math.min(frameRect.width, labelRect.left - surfaceRect.left));
    const textRight = Math.max(textLeft, Math.min(frameRect.width, textLeft + labelRect.width));
    const left = textLeft;
    const right = textRight;
    const fadeWidth = Math.min(labelRect.width / 2, 48);
    frame.style.setProperty('--oc-mobile-header-swipe-mask-left', `${left}px`);
    frame.style.setProperty('--oc-mobile-header-swipe-mask-right', `${right}px`);
    frame.style.setProperty('--oc-mobile-header-swipe-mask-width', `${fadeWidth}px`);
  }, [swipe.isDragging, swipe.surfaceRef]);

  React.useLayoutEffect(() => {
    const frame = swipeMaskFrameRef.current;
    const label = swipeMaskLabelRef.current;
    if (!frame || !label) return;
    measureSwipeMask();
    const observer = new ResizeObserver(measureSwipeMask);
    observer.observe(frame);
    observer.observe(label);
    return () => observer.disconnect();
  }, [measureSwipeMask]);

  const fallbackPreviewMeta = swipe.unknownBoundary
    ? t('mobile.header.swipe.loading')
    : swipe.boundary
      ? t('mobile.header.swipe.boundary')
      : t('mobile.header.swipe.releaseToSwitch');
  const currentPreviewMeta = (swipePreviewExiting ? lastPreviewRef.current.meta : previewMeta) ?? fallbackPreviewMeta;
  const currentPreviewIcon = swipePreviewExiting
    ? (lastPreviewRef.current.direction === 'next' ? 'arrow-right' : 'arrow-left')
    : previewDirectionIcon;
  const [displayedPreviewMeta, setDisplayedPreviewMeta] = React.useState<{ icon: 'arrow-left' | 'arrow-right'; text: string } | null>(null);
  const [previewMetaTextVisible, setPreviewMetaTextVisible] = React.useState(false);

  React.useEffect(() => {
    if (!showPreviewMeta) {
      setPreviewMetaTextVisible(false);
      return;
    }
    setPreviewMetaTextVisible(false);
    const timeoutId = window.setTimeout(() => {
      setDisplayedPreviewMeta({ icon: currentPreviewIcon, text: currentPreviewMeta });
      requestAnimationFrame(() => setPreviewMetaTextVisible(true));
    }, 90);
    return () => window.clearTimeout(timeoutId);
  }, [currentPreviewIcon, currentPreviewMeta, showPreviewMeta]);

  return (
    <>
      <header
        className={cn(
          'oc-mobile-header relative z-30 flex shrink-0 touch-none items-center gap-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          isBottom ? 'relative w-full' : 'relative',
          mobileTextareaFocused && 'oc-mobile-header-keyboard-visible',
          swipeMaskActive && 'oc-mobile-header-swipe-active',
        )}
        data-mobile-header-placement={placement}
        data-mobile-header-surface="true"
        {...swipe.surfaceProps}
        style={isBottom
          ? {
            // SAFETY: CSS custom-property keys are not represented in React.CSSProperties.
            ['--oc-mobile-header-layout-height' as string]: headerHeight,
          }
          : {
            paddingTop: 'var(--oc-safe-area-top, 0px)',
            // SAFETY: CSS custom-property keys are not represented in React.CSSProperties.
            ['--oc-mobile-header-layout-height' as string]: headerHeight,
          }}
      >
        <div
          className="absolute inset-0 z-0 touch-none"
          data-mobile-header-drag-region="true"
           data-mobile-header-surface="true"
           role="group"
           aria-label={t('mobile.header.swipe.dragRegionAria')}
         />
        <div className="pointer-events-none relative z-10 flex h-[var(--oc-mobile-header-layout-height)] w-full items-center gap-1 px-2">
          <button
            type="button"
            className={cn(
              'pointer-events-auto flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'size-10',
            )}
            aria-label={t('mobile.sessions.openSheetAria')}
            onPointerDown={(event) => {
              if (mobileTextareaFocused) event.preventDefault();
            }}
            onClick={handleOpenSessions}
            style={{ touchAction: 'manipulation' }}
          >
              <Icon name="list-unordered" className="size-5" />
          </button>

          <div
            ref={swipeMaskFrameRef}
            className={cn(
              'oc-mobile-header-swipe-frame relative min-w-0 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none',
              compactTitle ? 'shrink' : 'flex-1',
              swipe.isDragging && 'oc-mobile-header-swipe-active',
              swipeMaskActive && 'oc-mobile-header-swipe-text',
            )}
          >
            <div ref={swipe.surfaceRef} className="oc-mobile-header-swipe-surface min-w-0">
              <button
                ref={titleRef}
                type="button"
                className={cn(
                  'pointer-events-auto flex w-full min-w-0 items-center rounded-lg px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'py-1.5',
                  !swipe.isDragging && 'active:bg-interactive-hover',
                )}
                aria-label={t('sessions.switcher.openAria')}
                aria-haspopup="dialog"
                aria-expanded={switcherOpen}
                onPointerDown={(event) => {
                  if (mobileTextareaFocused) event.preventDefault();
                  if (!switcherOpen) onPopoverOpenIntent?.();
                }}
                onClick={toggleSwitcher}
                style={{ touchAction: 'manipulation' }}
              >
                <span ref={swipeMaskLabelRef} className="oc-mobile-header-swipe-label flex min-w-0 flex-col items-start">
                  <span className="flex min-w-0 max-w-full items-center gap-1">
                    <span className={cn(
                      'block min-w-0 truncate typography-ui-label text-foreground',
                    )}>{previewLabel}</span>
                    <Icon
                      name="arrow-down-s"
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
                        switcherOpen && 'rotate-180',
                      )}
                    />
                  </span>
                  {currentBranch ? (
                    <span className="max-w-full truncate typography-micro leading-3 text-muted-foreground">{currentBranch}</span>
                  ) : null}
                </span>
              </button>
            </div>
          </div>

          {compactTitle ? <div className="min-w-0 flex-1" /> : null}

          <MobileSessionMetadataButton
            open={metadataOpen}
            onOpenChange={handleMetadataOpenChange}
            onOpenIntent={onPopoverOpenIntent}
            currentSessionId={currentSessionId}
            effectiveDirectory={effectiveDirectory}
            isNewSessionDraftOpen={isNewSessionDraftOpen}
            placement={placement}
            preventFocusOnPointerDown={mobileTextareaFocused}
          />

          <button
            type="button"
            className={cn(
              'relative pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
            aria-label={hasUncommittedChanges
              ? t('mobile.header.openWorkspaceWithChangesAria')
              : t('mobile.header.openWorkspaceAria')}
            onPointerDown={(event) => {
              if (mobileTextareaFocused) event.preventDefault();
            }}
            onClick={() => {
              setMetadataOpen(false);
              setSwitcherOpen(false);
              onPopoverOpenChange?.(false);
              onOpenWorkspace();
            }}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="pencil-ruler-2" className="size-5" />
            {hasUncommittedChanges ? (
              <span
                className="absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-[var(--background)] bg-[var(--status-warning)]"
                aria-hidden
              />
            ) : null}
          </button>
        </div>
        {showPreviewMeta ? (
          <div
            aria-live="polite"
            className={cn(
            'pointer-events-none absolute inset-x-14 truncate text-center typography-micro text-muted-foreground transition-[opacity,transform] duration-150 motion-reduce:transition-none',
            isBottom ? 'bottom-full mb-1' : 'top-full -mt-1',
            (!previewMetaTextVisible || swipePreviewExiting) && 'opacity-0',
            swipe.readyToCommit && 'text-primary',
          )}>
            <Icon name={displayedPreviewMeta?.icon ?? currentPreviewIcon} className="mr-1 inline-block size-3 align-[-2px]" aria-hidden />
            {displayedPreviewMeta?.text ?? currentPreviewMeta}
          </div>
        ) : null}
      </header>
      <MobileSessionSwitcher
        open={switcherOpen}
        onClose={() => {
          setSwitcherOpen(false);
          onPopoverOpenChange?.(false);
        }}
        anchorRef={titleRef}
        placement={placement}
      />
    </>
  );
};
