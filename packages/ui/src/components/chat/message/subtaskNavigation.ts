/**
 * Decides whether tapping an agent subtask navigates in place vs opening a
 * new side-panel chat tab. VS Code (single-surface) always navigates in
 * place; a realm that cannot host the embedded session-chat panel (i.e. the
 * panel's own iframe) navigates in place rather than recursing a panel tab;
 * and on the mobile surface, only the hybrid tablet layout has a
 * ContextPanel, so the in-place arm is relaxed when hybrid is active.
 */
export const shouldNavigateSubtaskInPlace = (
    canHostPanel: boolean,
    isMobile: boolean,
    isHybridTablet: boolean,
    isVSCodeRuntime: boolean,
): boolean => {
    return !canHostPanel || (isMobile && !isHybridTablet) || isVSCodeRuntime;
};
