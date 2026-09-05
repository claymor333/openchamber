/**
 * Regression guards for the embedded (hybrid tablet) ContextPanel width model.
 *
 * The host aside owns the width *clip* (open/close reveal and the drag
 * resize). The embedded panel reads the host's live `--oc-ipad-sidebar-width`
 * var in every state so its own width never changes on open/close (no double
 * animation with the aside clip), but keeps its own width transition so the
 * expand/collapse (var change) still animates. During a drag the panel's own
 * transition is suppressed (`embeddedResizing`) so it follows the finger
 * without lag.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contextPanelSource = readFileSync(join(__dirname, '..', 'ContextPanel.tsx'), 'utf-8');

describe('embedded ContextPanel width model', () => {
  test('the embedded branch serves every open state from the host var', () => {
    // Closed, docked, and expanded embedded states share ONE width source (the
    // host aside's live `--oc-ipad-sidebar-width`, which the aside sets to the
    // full chat area when expanded). No ResizeObserver-measured width and no
    // open/close zeroing, so the panel width is constant through open/close and
    // the aside clip is the only animation there.
    const styleStart = contextPanelSource.indexOf('const panelStyle: React.CSSProperties');
    expect(styleStart).toBeGreaterThan(-1);
    const start = contextPanelSource.indexOf('embeddedWidth !== undefined', styleStart);
    expect(start).toBeGreaterThan(-1);
    const end = contextPanelSource.indexOf(': !isOpen', start);
    expect(end).toBeGreaterThan(start);
    const branch = contextPanelSource.slice(start, end);
    expect(branch).toContain("width: 'min(var(--oc-ipad-sidebar-width), 100%)'");
    expect(branch).toContain("'--oc-context-panel-width' as string]: 'min(var(--oc-ipad-sidebar-width), 100%)'");
    expect(branch).not.toContain('availablePanelAreaWidth');
    expect(branch).not.toContain('width: 0');
  });

  test('the embedded branch appears before the closed and desktop expanded branches', () => {
    const styleStart = contextPanelSource.indexOf('const panelStyle: React.CSSProperties');
    const embeddedIndex = contextPanelSource.indexOf('embeddedWidth !== undefined', styleStart);
    const isOpenZeroIndex = contextPanelSource.indexOf(': !isOpen', styleStart);
    const isExpandedIndex = contextPanelSource.indexOf(': isExpanded', styleStart);
    expect(embeddedIndex).toBeGreaterThan(-1);
    expect(isOpenZeroIndex).toBeGreaterThan(embeddedIndex);
    expect(isExpandedIndex).toBeGreaterThan(embeddedIndex);
  });

  test('the root width transition stays enabled when embedded', () => {
    // Expand/collapse animates because the var changes; open/close does not
    // because the var is constant. The transition must NOT be gated on
    // `embeddedWidth === undefined`.
    const gate = contextPanelSource.indexOf("embeddedWidth === undefined && 'transition-[width]");
    expect(gate).toBe(-1);
  });

  test('the root width transition is suppressed only during a drag', () => {
    expect(contextPanelSource).toContain(
      "embeddedResizing && 'transition-none'",
    );
  });

  test('the header wrapper suppresses its transition only during a drag', () => {
    expect(contextPanelSource).toContain(
      "'transition-[width,opacity]'",
    );
    expect(contextPanelSource).toContain(
      "embeddedResizing && 'transition-none'",
    );
  });
});
