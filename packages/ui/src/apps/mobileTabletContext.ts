import { CONTEXT_ZONES, isZoneShown, resolveZoneActiveTab } from '@/lib/workspace/zones';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { RESOURCE_MONITOR_GUEST_ID } from '@/lib/guests/mobile-support';
import { RESOURCE_MONITOR_WORKSPACE_TAB, type MobileWorkspaceTab } from '@/lib/mobileWorkspaceTabs';
import type { PluginContextPanelMode } from '@/lib/surfaces/modes';

type PendingChangesDiff = { path: string; staged: boolean } | null;

const CONTEXT_MODE_BY_WORKSPACE_TAB = {
  changes: 'git',
  files: 'file',
  terminal: 'terminal',
  notes: 'notes',
} as const;

const RESOURCE_MONITOR_CONTEXT_MODE: PluginContextPanelMode = `plugin:${RESOURCE_MONITOR_GUEST_ID}`;

type TabletWorkspaceSurface = Exclude<MobileWorkspaceTab, 'mcp'>;

const modeForWorkspaceTab = (tab: TabletWorkspaceSurface) => (
  tab === RESOURCE_MONITOR_WORKSPACE_TAB ? RESOURCE_MONITOR_CONTEXT_MODE : CONTEXT_MODE_BY_WORKSPACE_TAB[tab]
);

/** Opens the desktop context surface that corresponds to a mobile workspace tab. */
export const openMobileWorkspaceInContext = (
  directory: string | undefined,
  tab: MobileWorkspaceTab,
  diff: PendingChangesDiff = null,
  resourceMonitorAvailable = false,
): boolean => {
  if (!directory || tab === 'mcp' || (tab === RESOURCE_MONITOR_WORKSPACE_TAB && !resourceMonitorAvailable)) return false;

  const store = useUIStore.getState();
  if (tab === 'changes' && diff) {
    store.openContextDiff(directory, diff.path, diff.staged);
    return true;
  }

  const mode = modeForWorkspaceTab(tab);
  const directoryKey = normalizeContextPanelDirectoryKey(directory);
  const panel = store.contextPanelByDirectory[directoryKey];
  const alreadyShown = CONTEXT_ZONES.some((zone) => (
    isZoneShown(panel, store.contextSurfaceZones, zone)
      && resolveZoneActiveTab(panel, store.contextSurfaceZones, zone)?.mode === mode
  ));
  if (!alreadyShown) store.openContextSurface(directoryKey, mode);
  return true;
};

/** Finds the most recently active shared surface that has a mobile drawer equivalent. */
export const mobileWorkspaceForOpenContext = (directory: string | undefined): {
  tab: TabletWorkspaceSurface;
  diff: PendingChangesDiff;
  filePath: string | null;
} | null => {
  if (!directory) return null;

  const store = useUIStore.getState();
  const directoryKey = normalizeContextPanelDirectoryKey(directory);
  const panel = store.contextPanelByDirectory[directoryKey];
  if (!panel) return null;

  const active = CONTEXT_ZONES
    .filter((zone) => isZoneShown(panel, store.contextSurfaceZones, zone))
    .flatMap((zone) => {
      const tab = resolveZoneActiveTab(panel, store.contextSurfaceZones, zone);
      return tab ? [{ tab }] : [];
    })
    .sort((a, b) => b.tab.touchedAt - a.tab.touchedAt);
  const mode = active[0]?.tab.mode;
  if (mode === 'git') return { tab: 'changes', diff: null, filePath: null };
  if (mode === 'file') return { tab: 'files', diff: null, filePath: active[0].tab.targetPath };
  if (mode === 'terminal') return { tab: 'terminal', diff: null, filePath: null };
  if (mode === 'notes') return { tab: 'notes', diff: null, filePath: null };
  if (mode === RESOURCE_MONITOR_CONTEXT_MODE) return { tab: RESOURCE_MONITOR_WORKSPACE_TAB, diff: null, filePath: null };
  if (mode === 'diff') {
    const activeTab = active[0].tab;
    return {
      tab: 'changes',
      diff: activeTab.targetPath ? { path: activeTab.targetPath, staged: activeTab.stagedDiff } : null,
      filePath: null,
    };
  }
  return null;
};

/** Closes the latest open context zone when Android back is pressed. */
export const closeMostRecentContextZone = (directory: string | undefined): boolean => {
  if (!directory) return false;

  const store = useUIStore.getState();
  const directoryKey = normalizeContextPanelDirectoryKey(directory);
  const panel = store.contextPanelByDirectory[directoryKey];
  if (!panel) return false;

  const zone = CONTEXT_ZONES
    .filter((candidate) => isZoneShown(panel, store.contextSurfaceZones, candidate))
    .map((candidate) => ({
      candidate,
      touchedAt: resolveZoneActiveTab(panel, store.contextSurfaceZones, candidate)?.touchedAt ?? 0,
    }))
    .sort((a, b) => b.touchedAt - a.touchedAt)[0]?.candidate;
  if (!zone) return false;

  store.closeContextZone(directoryKey, zone);
  return true;
};

/** Leaves the shared panel tabs stored but hides all zones for the mobile fallback. */
export const closeAllContextZones = (directory: string | undefined): number => {
  let closedCount = 0;
  while (closeMostRecentContextZone(directory)) closedCount += 1;
  return closedCount;
};
