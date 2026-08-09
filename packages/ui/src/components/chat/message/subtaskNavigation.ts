/**
 * Decides whether tapping an agent subtask navigates in place vs opening a
 * new side-panel chat tab. Embedded session-chat (no ContextPanel in the
 * iframe) and VS Code (single-surface) always navigate in place; on the
 * mobile surface, only the hybrid tablet layout has a ContextPanel, so the
 * in-place arm is relaxed when hybrid is active.
 */
export const shouldNavigateSubtaskInPlace = (
    isEmbeddedSessionChat: boolean,
    isMobile: boolean,
    isHybridTablet: boolean,
    isVSCodeRuntime: boolean,
): boolean => {
    return isEmbeddedSessionChat || (isMobile && !isHybridTablet) || isVSCodeRuntime;
};
