import { describe, expect, test } from 'bun:test';

import { resolveHybridWorkspaceGeometry } from './hybridWorkspaceGeometry';

describe('resolveHybridWorkspaceGeometry', () => {
    test('closed panel with rail: width 0, inset 44 (rail only)', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: false,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
        })).toEqual({ workspacePanelWidth: 0, chatInsetRight: 44 });
    });

    test('open panel: width = resize, inset = resize + 44', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: true,
            panelIsOpen: true,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 0,
        })).toEqual({ workspacePanelWidth: 320, chatInsetRight: 364 });
    });

    test('non-hybrid passes legacy width and inset through', () => {
        expect(resolveHybridWorkspaceGeometry({
            isHybridTablet: false,
            panelIsOpen: true,
            resizeWidth: 320,
            legacyWorkspacePanelWidth: 260,
        })).toEqual({ workspacePanelWidth: 260, chatInsetRight: 260 });
    });
});
