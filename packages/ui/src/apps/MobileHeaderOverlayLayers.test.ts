import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(join(__dirname, path), 'utf-8');
const appSource = source('MobileApp.tsx');
const headerSource = source('MobileHeader.tsx');
const switcherSource = source('MobileSessionSwitcher.tsx');
const contextPanelSource = source('../components/layout/ContextPanel.tsx');
const sessionsSheetSource = source('MobileSessionsSheet.tsx');
const mobileOverlaySource = source('../components/ui/MobileOverlayPanel.tsx');
const zoneDropOverlaySource = source('../components/layout/ZoneDropOverlay.tsx');

describe('mobile recent-session overlay stacking', () => {
  test('the header popover clears tablet context zones without outranking full-screen layers', () => {
    expect(appSource.indexOf('<MobileHeader')).toBeLessThan(appSource.indexOf('<MobileTabletContextWorkspace'));
    expect(headerSource.indexOf('</header>')).toBeLessThan(headerSource.indexOf('<MobileSessionSwitcher'));
    expect(headerSource).toContain('oc-mobile-header relative z-30');
    expect(switcherSource).toContain('top-[calc(var(--oc-safe-area-top,0px)+var(--oc-header-height,56px))] z-40');
    expect(contextPanelSource).toContain("touchResizeActive ? 'z-20 overflow-visible' : 'overflow-clip'");
    expect(contextPanelSource).toContain("'isolate'");
    expect(sessionsSheetSource).toContain('fixed inset-0 z-50');
    expect(mobileOverlaySource).toContain('fixed inset-0 z-[60]');
    expect(zoneDropOverlaySource).toContain('fixed inset-0 z-[60]');
  });
});
