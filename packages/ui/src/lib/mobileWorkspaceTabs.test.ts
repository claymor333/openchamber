import { describe, expect, test } from 'bun:test';

import {
  orderMobileWorkspaceTabs,
  resolveMobileWorkspaceTab,
  RESOURCE_MONITOR_WORKSPACE_TAB,
  shownMobileWorkspaceTabs,
  shouldMountMobileResourceMonitorPane,
  stripMobileWorkspaceTabs,
} from './mobileWorkspaceTabs';

describe('mobile workspace tabs', () => {
  test('a saved order keeps its tabs first and appends tabs it does not name', () => {
    expect(orderMobileWorkspaceTabs(['terminal', 'gone', 'changes', 'terminal'])).toEqual(['terminal', 'changes', 'files', 'notes', 'mcp']);
    expect(orderMobileWorkspaceTabs([])).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp']);
  });

  test('hidden tabs leave the strip, but never all of them', () => {
    expect(shownMobileWorkspaceTabs(['files'], ['changes', 'mcp'])).toEqual(['files', 'terminal', 'notes']);
    expect(shownMobileWorkspaceTabs([], ['changes', 'files', 'terminal', 'notes', 'mcp'])).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp']);
  });

  test('a hidden tab something opened stays in the strip, in its place, while it is open', () => {
    expect(stripMobileWorkspaceTabs([], ['files', 'terminal'], 'files')).toEqual(['changes', 'files', 'notes', 'mcp']);
    expect(stripMobileWorkspaceTabs([], ['files', 'terminal'], 'notes')).toEqual(['changes', 'notes', 'mcp']);
  });

  test('Resource Monitor is appended only when the curated mobile guest is available', () => {
    expect(orderMobileWorkspaceTabs([], true)).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp', 'resource-monitor']);
    expect(orderMobileWorkspaceTabs(['resource-monitor', 'files'], false)).toEqual(['files', 'changes', 'terminal', 'notes', 'mcp']);
    expect(shownMobileWorkspaceTabs([], ['resource-monitor'], true)).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp']);
    expect(stripMobileWorkspaceTabs([], ['changes', 'resource-monitor'], RESOURCE_MONITOR_WORKSPACE_TAB, true))
      .toEqual(['files', 'terminal', 'notes', 'mcp', 'resource-monitor']);
  });

  test('the selected tab falls back when Resource Monitor is hidden or no longer approved', () => {
    expect(resolveMobileWorkspaceTab(RESOURCE_MONITOR_WORKSPACE_TAB, [], [], true)).toBe(RESOURCE_MONITOR_WORKSPACE_TAB);
    expect(resolveMobileWorkspaceTab(RESOURCE_MONITOR_WORKSPACE_TAB, [], ['resource-monitor'], true)).toBe('changes');
    expect(resolveMobileWorkspaceTab(RESOURCE_MONITOR_WORKSPACE_TAB, [], [], false)).toBe('changes');
  });

  test('the panel mounts only while the workspace surface and compatible guest are active', () => {
    const active = {
      workspaceOpen: true,
      surfaceVisible: true,
      tab: RESOURCE_MONITOR_WORKSPACE_TAB,
      guestAvailable: true,
      documentVisible: true,
      nativeAppActive: true,
    } as const;
    expect(shouldMountMobileResourceMonitorPane(active)).toBe(true);
    expect(shouldMountMobileResourceMonitorPane({ ...active, workspaceOpen: false })).toBe(false);
    expect(shouldMountMobileResourceMonitorPane({ ...active, surfaceVisible: false })).toBe(false);
    expect(shouldMountMobileResourceMonitorPane({ ...active, guestAvailable: false })).toBe(false);
    expect(shouldMountMobileResourceMonitorPane({ ...active, documentVisible: false })).toBe(false);
    expect(shouldMountMobileResourceMonitorPane({ ...active, nativeAppActive: false })).toBe(false);
    expect(shouldMountMobileResourceMonitorPane({ ...active, tab: 'changes' })).toBe(false);
  });
});
