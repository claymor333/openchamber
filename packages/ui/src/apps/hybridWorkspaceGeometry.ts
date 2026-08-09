export const RAIL_WIDTH_PX = 44;

export type HybridWorkspaceGeometryInput = {
  isHybridTablet: boolean;
  panelIsOpen: boolean;
  resizeWidth: number;
  legacyWorkspacePanelWidth: number;
};

export type HybridWorkspaceGeometry = {
  workspacePanelWidth: number;
  chatInsetRight: number;
};

export const resolveHybridWorkspaceGeometry = (input: HybridWorkspaceGeometryInput): HybridWorkspaceGeometry => {
  const { isHybridTablet, panelIsOpen, resizeWidth, legacyWorkspacePanelWidth } = input;
  if (!isHybridTablet) {
    return { workspacePanelWidth: legacyWorkspacePanelWidth, chatInsetRight: legacyWorkspacePanelWidth };
  }
  const workspacePanelWidth = panelIsOpen ? resizeWidth : 0;
  return { workspacePanelWidth, chatInsetRight: workspacePanelWidth + RAIL_WIDTH_PX };
};
