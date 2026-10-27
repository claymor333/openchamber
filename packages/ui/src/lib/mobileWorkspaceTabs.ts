/**
 * The tabs of the phone's workspace drawer (and the tablet's workspace panel),
 * in their default order. The user's order and hidden set are stored per
 * device in `useUIStore`; both hold plain ids so a tab added in a later
 * release shows up for everyone, at the end of a saved order.
 */
const DEFAULT_MOBILE_WORKSPACE_TABS = ['changes', 'files', 'terminal', 'notes', 'mcp'] as const;
export const RESOURCE_MONITOR_WORKSPACE_TAB = 'resource-monitor' as const;

export type MobileWorkspaceTab = (typeof DEFAULT_MOBILE_WORKSPACE_TABS)[number] | typeof RESOURCE_MONITOR_WORKSPACE_TAB;

const availableMobileWorkspaceTabs = (includeResourceMonitor: boolean): MobileWorkspaceTab[] => (
  includeResourceMonitor
    ? [...DEFAULT_MOBILE_WORKSPACE_TABS, RESOURCE_MONITOR_WORKSPACE_TAB]
    : [...DEFAULT_MOBILE_WORKSPACE_TABS]
);

const isMobileWorkspaceTab = (id: string, includeResourceMonitor: boolean): id is MobileWorkspaceTab =>
  availableMobileWorkspaceTabs(includeResourceMonitor).some((tab) => tab === id);

/** Every tab in the user's order; tabs the saved order does not name follow in default order. */
export const orderMobileWorkspaceTabs = (
  order: readonly string[],
  includeResourceMonitor = false,
): MobileWorkspaceTab[] => {
  const available = availableMobileWorkspaceTabs(includeResourceMonitor);
  const ordered = order.filter((id) => isMobileWorkspaceTab(id, includeResourceMonitor))
    .filter((id, index, all) => all.indexOf(id) === index);
  return [...ordered, ...available.filter((id) => !ordered.includes(id))];
};

/**
 * The tabs the user keeps, in order. Never empty: a saved set that hides every
 * tab (written by hand or by an older build) shows them all.
 */
export const shownMobileWorkspaceTabs = (
  order: readonly string[],
  hidden: readonly string[],
  includeResourceMonitor = false,
): MobileWorkspaceTab[] => {
  const all = orderMobileWorkspaceTabs(order, includeResourceMonitor);
  const shown = all.filter((id) => !hidden.includes(id));
  return shown.length > 0 ? shown : all;
};

export const resolveMobileWorkspaceTab = (
  current: MobileWorkspaceTab,
  order: readonly string[],
  hidden: readonly string[],
  includeResourceMonitor = false,
): MobileWorkspaceTab => {
  const shown = shownMobileWorkspaceTabs(order, hidden, includeResourceMonitor);
  return shown.includes(current) ? current : shown[0] ?? 'changes';
};

/**
 * The tabs the strip offers right now: the ones the user keeps, plus the open
 * tab while something opened it although it is hidden (a changed file tapped
 * in the chat opens Changes either way). It leaves the strip once the user
 * switches away.
 */
export const stripMobileWorkspaceTabs = (
  order: readonly string[],
  hidden: readonly string[],
  active: MobileWorkspaceTab,
  includeResourceMonitor = false,
): MobileWorkspaceTab[] => {
  const all = orderMobileWorkspaceTabs(order, includeResourceMonitor);
  const shown = shownMobileWorkspaceTabs(order, hidden, includeResourceMonitor);
  if (!all.includes(active)) return shown;
  if (shown.includes(active)) return shown;
  return all.filter((id) => id === active || shown.includes(id));
};

export const shouldMountMobileResourceMonitorPane = (state: {
  workspaceOpen: boolean;
  surfaceVisible: boolean;
  tab: MobileWorkspaceTab;
  guestAvailable: boolean;
  documentVisible: boolean;
  nativeAppActive: boolean;
}): boolean => (
  state.workspaceOpen
  && state.surfaceVisible
  && state.tab === RESOURCE_MONITOR_WORKSPACE_TAB
  && state.guestAvailable
  && state.documentVisible
  && state.nativeAppActive
);
