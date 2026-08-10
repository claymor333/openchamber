export const RAIL_WIDTH_PX = 44;

export type HybridWorkspaceGeometryInput = {
  isHybridTablet: boolean;
  panelIsOpen: boolean;
  /** True when the panel surface is expanded (covers the chat area). */
  isExpanded: boolean;
  resizeWidth: number;
  legacyWorkspacePanelWidth: number;
  /** Full viewport width (for the expanded-width computation). */
  viewportWidth: number;
  /** Sessions sidebar width, so expanded width stops at its right edge. */
  sidebarWidth: number;
};

export type HybridWorkspaceGeometry = {
  workspacePanelWidth: number;
  chatInsetRight: number;
};

export const resolveHybridWorkspaceGeometry = (input: HybridWorkspaceGeometryInput): HybridWorkspaceGeometry => {
  const {
    isHybridTablet,
    panelIsOpen,
    isExpanded,
    resizeWidth,
    legacyWorkspacePanelWidth,
    viewportWidth,
    sidebarWidth,
  } = input;
  if (!isHybridTablet) {
    return { workspacePanelWidth: legacyWorkspacePanelWidth, chatInsetRight: legacyWorkspacePanelWidth };
  }
  const workspacePanelWidth = panelIsOpen
    ? (isExpanded
        // Expanded: take the whole chat area — from the sessions sidebar's
        // right edge to the window's right edge, minus the icon rail.
        ? Math.max(0, viewportWidth - sidebarWidth - RAIL_WIDTH_PX)
        : resizeWidth)
    : 0;
  return { workspacePanelWidth, chatInsetRight: workspacePanelWidth + RAIL_WIDTH_PX };
};
