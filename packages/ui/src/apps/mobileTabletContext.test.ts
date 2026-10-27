import { beforeEach, describe, expect, test } from 'bun:test';

import { getZoneView, isZoneShown, resolveZoneActiveTab } from '@/lib/workspace/zones';
import { RESOURCE_MONITOR_WORKSPACE_TAB } from '@/lib/mobileWorkspaceTabs';
import { useUIStore } from '@/stores/useUIStore';
import {
  closeAllContextZones,
  closeMostRecentContextZone,
  mobileWorkspaceForOpenContext,
  openMobileWorkspaceInContext,
} from './mobileTabletContext';

const directory = '/repo';

beforeEach(() => {
  useUIStore.setState({ contextPanelByDirectory: {}, contextSurfaceZones: {} });
});

describe('tablet workspace routing', () => {
  test('opens mobile workspace choices in their canonical context zones', () => {
    useUIStore.setState({ contextSurfaceZones: { git: 'left', file: 'bottom' } });

    expect(openMobileWorkspaceInContext(directory, 'changes')).toBe(true);
    expect(openMobileWorkspaceInContext(directory, 'files')).toBe(true);

    const store = useUIStore.getState();
    const panel = store.contextPanelByDirectory[directory];
    expect(resolveZoneActiveTab(panel, store.contextSurfaceZones, 'left')?.mode).toBe('git');
    expect(resolveZoneActiveTab(panel, store.contextSurfaceZones, 'bottom')?.mode).toBe('file');
    expect(getZoneView(panel, 'left').isOpen).toBe(true);
    expect(getZoneView(panel, 'bottom').isOpen).toBe(true);
  });

  test('opens a requested file diff with its staged state in the shared diff surface', () => {
    useUIStore.setState({ contextSurfaceZones: { diff: 'bottom' } });

    expect(openMobileWorkspaceInContext(directory, 'changes', { path: '/repo/src/app.ts', staged: true })).toBe(true);

    const store = useUIStore.getState();
    const panel = store.contextPanelByDirectory[directory];
    const diff = panel.tabs.find((tab) => tab.mode === 'diff');
    expect(diff).toMatchObject({ targetPath: '/repo/src/app.ts', stagedDiff: true });
    expect(isZoneShown(panel, store.contextSurfaceZones, 'bottom')).toBe(true);
  });

  test('routes the approved mobile Resource Monitor through the shared context panel', () => {
    expect(openMobileWorkspaceInContext(directory, RESOURCE_MONITOR_WORKSPACE_TAB)).toBe(false);
    expect(openMobileWorkspaceInContext(directory, RESOURCE_MONITOR_WORKSPACE_TAB, null, true)).toBe(true);

    const panel = useUIStore.getState().contextPanelByDirectory[directory];
    expect(resolveZoneActiveTab(panel, {}, 'right')?.mode).toBe('plugin:resource-monitor');
    expect(mobileWorkspaceForOpenContext(directory)).toEqual({
      tab: RESOURCE_MONITOR_WORKSPACE_TAB,
      diff: null,
      filePath: null,
    });
  });

  test('direct file-open requests retain their target in the canonically placed file pane', () => {
    useUIStore.setState({ contextSurfaceZones: { file: 'left' } });
    useUIStore.getState().openContextFile(directory, '/repo/src/main.ts');

    const store = useUIStore.getState();
    const panel = store.contextPanelByDirectory[directory];
    expect(resolveZoneActiveTab(panel, store.contextSurfaceZones, 'left')).toMatchObject({
      mode: 'file',
      targetPath: '/repo/src/main.ts',
    });
    expect(mobileWorkspaceForOpenContext(directory)).toMatchObject({
      tab: 'files',
      filePath: '/repo/src/main.ts',
    });
  });

  test('direct plan-open requests activate Notes in its configured zone', () => {
    useUIStore.setState({ contextSurfaceZones: { notes: 'bottom' } });
    useUIStore.getState().openProjectKnowledgePlan(directory, 'project-context', 'plan-1');

    const store = useUIStore.getState();
    const panel = store.contextPanelByDirectory[directory];
    expect(resolveZoneActiveTab(panel, store.contextSurfaceZones, 'bottom')?.mode).toBe('notes');
    expect(store.projectKnowledgePlanRequest).toEqual({ projectContextId: 'project-context', planId: 'plan-1' });
  });

  test('reopening the header-selected workspace surface leaves it visible', () => {
    useUIStore.getState().openContextSurface(directory, 'terminal');

    expect(openMobileWorkspaceInContext(directory, 'terminal')).toBe(true);
    const panel = useUIStore.getState().contextPanelByDirectory[directory];
    expect(panel.isOpen).toBe(true);
    expect(resolveZoneActiveTab(panel, {}, 'right')?.mode).toBe('terminal');
  });

  test('maps an open shared surface back to the mobile fallback, including its diff target', () => {
    useUIStore.getState().openContextDiff(directory, '/repo/src/changed.ts', true);

    expect(mobileWorkspaceForOpenContext(directory)).toEqual({
      tab: 'changes',
      diff: { path: '/repo/src/changed.ts', staged: true },
      filePath: null,
    });
  });

  test('Android back closes one most-recently used zone and leaves other zones open', () => {
    useUIStore.setState({ contextSurfaceZones: { terminal: 'bottom' } });
    const store = useUIStore.getState();
    store.openContextSurface(directory, 'git');
    store.openContextSurface(directory, 'terminal');

    expect(closeMostRecentContextZone(directory)).toBe(true);
    const next = useUIStore.getState();
    const panel = next.contextPanelByDirectory[directory];
    const openZones = (['left', 'right', 'bottom'] as const).filter((zone) => getZoneView(panel, zone).isOpen);
    expect(openZones).toHaveLength(1);
    expect(closeMostRecentContextZone(directory)).toBe(true);
    expect(closeMostRecentContextZone(directory)).toBe(false);
  });

  test('narrow-layout handoff closes visible zones without discarding their tabs', () => {
    useUIStore.setState({ contextSurfaceZones: { terminal: 'bottom' } });
    const store = useUIStore.getState();
    store.openContextSurface(directory, 'git');
    store.openContextSurface(directory, 'terminal');

    expect(closeAllContextZones(directory)).toBe(2);
    const panel = useUIStore.getState().contextPanelByDirectory[directory];
    expect(panel.tabs.map((tab) => tab.mode)).toEqual(['git', 'terminal']);
    expect((['left', 'right', 'bottom'] as const).some((zone) => getZoneView(panel, zone).isOpen)).toBe(false);
  });

  test('MCP remains on the mobile settings path because it has no context rail mode', () => {
    expect(openMobileWorkspaceInContext(directory, 'mcp')).toBe(false);
    expect(useUIStore.getState().contextPanelByDirectory[directory]).toBeUndefined();
  });
});
