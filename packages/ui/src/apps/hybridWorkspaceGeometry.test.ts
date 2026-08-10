import { describe, expect, test } from 'bun:test';

import { resolveHybridWorkspaceGeometry } from './hybridWorkspaceGeometry';

describe('resolveHybridWorkspaceGeometry', () => {
    test('closed panel with rail: width 0, inset 44 (rail only)', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: false,
            isExpanded: false,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
            viewportWidth: 1468,
            sidebarWidth: 282,
        })).toEqual({ workspacePanelWidth: 0, chatInsetRight: 44 });
    });

    test('open panel: width = resize, inset = resize + 44', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: true,
            isExpanded: false,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
            viewportWidth: 1468,
            sidebarWidth: 282,
        })).toEqual({ workspacePanelWidth: 320, chatInsetRight: 364 });
    });

    test('expanded panel: width = viewport - sidebar - rail, inset = width + rail', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: true,
            isExpanded: true,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
            viewportWidth: 1468,
            sidebarWidth: 282,
        })).toEqual({ workspacePanelWidth: 1142, chatInsetRight: 1186 });
    });

    test('expanded panel clamps to 0 when the viewport is too narrow', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: true,
            isExpanded: true,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
            viewportWidth: 300,
            sidebarWidth: 282,
        })).toEqual({ workspacePanelWidth: 0, chatInsetRight: 44 });
    });

    test('non-hybrid passes legacy width and inset through', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: false,
            panelIsOpen: true,
            isExpanded: false,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 260,
            viewportWidth: 1468,
            sidebarWidth: 282,
        })).toEqual({ workspacePanelWidth: 260, chatInsetRight: 260 });
    });
});
