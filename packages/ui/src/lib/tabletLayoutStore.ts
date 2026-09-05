import { readTabletLayout } from "@/lib/device";

export type TabletLayoutSnapshot = {
  enabled: boolean;
  roomyForPanels: boolean;
};

export const DEFAULT_TABLET_LAYOUT: TabletLayoutSnapshot = {
  enabled: false,
  roomyForPanels: false,
};

const tabletLayoutSubscribers = new Set<() => void>();
let tabletLayoutSnapshot: TabletLayoutSnapshot | null = null;
let tabletLayoutFrameId: number | undefined;
let cleanupTabletLayoutSource: (() => void) | null = null;

const readTabletLayoutSnapshot = (): TabletLayoutSnapshot => {
  if (typeof window === "undefined") {
    return DEFAULT_TABLET_LAYOUT;
  }
  if (!tabletLayoutSnapshot) {
    tabletLayoutSnapshot = readTabletLayout();
  }
  return tabletLayoutSnapshot;
};

const notifyTabletLayoutSubscribers = () => {
  for (const listener of tabletLayoutSubscribers) {
    listener();
  }
};

const updateTabletLayoutSnapshot = () => {
  const next = readTabletLayout();
  tabletLayoutSnapshot = next;
  notifyTabletLayoutSubscribers();
};

const scheduleTabletLayoutUpdate = () => {
  if (tabletLayoutFrameId !== undefined) {
    return;
  }
  tabletLayoutFrameId = window.requestAnimationFrame(() => {
    tabletLayoutFrameId = undefined;
    updateTabletLayoutSnapshot();
  });
};

const ensureTabletLayoutSource = () => {
  if (typeof window === "undefined" || cleanupTabletLayoutSource !== null) {
    return;
  }
  window.addEventListener("resize", scheduleTabletLayoutUpdate);
  const orientationQuery = window.matchMedia?.("(orientation: landscape)") ?? null;
  if (orientationQuery?.addEventListener) {
    orientationQuery.addEventListener("change", scheduleTabletLayoutUpdate);
  } else {
    orientationQuery?.addListener?.(scheduleTabletLayoutUpdate as () => void);
  }
  updateTabletLayoutSnapshot();
  cleanupTabletLayoutSource = () => {
    window.removeEventListener("resize", scheduleTabletLayoutUpdate);
    if (orientationQuery?.removeEventListener) {
      orientationQuery.removeEventListener("change", scheduleTabletLayoutUpdate);
    } else {
      orientationQuery?.removeListener?.(scheduleTabletLayoutUpdate as () => void);
    }
    if (tabletLayoutFrameId !== undefined) {
      window.cancelAnimationFrame(tabletLayoutFrameId);
      tabletLayoutFrameId = undefined;
    }
    cleanupTabletLayoutSource = null;
  };
};

export const subscribeTabletLayout = (listener: () => void): (() => void) => {
  ensureTabletLayoutSource();
  tabletLayoutSubscribers.add(listener);
  return () => {
    tabletLayoutSubscribers.delete(listener);
    if (tabletLayoutSubscribers.size === 0) {
      cleanupTabletLayoutSource?.();
    }
  };
};

export const getTabletLayoutSnapshot = (): TabletLayoutSnapshot => {
  if (typeof window === "undefined") {
    return DEFAULT_TABLET_LAYOUT;
  }
  if (!tabletLayoutSnapshot) {
    ensureTabletLayoutSource();
  }
  return tabletLayoutSnapshot ?? readTabletLayoutSnapshot();
};

export const getTabletLayout = (): TabletLayoutSnapshot => getTabletLayoutSnapshot();

// Test hook: force a recompute on next read (used by tests to reset state).
export const __ocResetTabletLayout = (): void => {
  tabletLayoutSnapshot = null;
  notifyTabletLayoutSubscribers();
};
