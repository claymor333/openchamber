import { describe, expect, mock, test } from 'bun:test';

mock.module('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: { activeColorTheme: { kind: 1 } },
}));

const { sanitizeSettingsChanges } = await import('./bridge-settings-runtime.ts');

describe('VS Code settings sanitizer', () => {
  test('preserves valid Enter settings and drops invalid values', () => {
    expect(sanitizeSettingsChanges({
      enterToSend: true,
      enterToSendConfigured: false,
      themeVariant: 'dark',
      invalid: 'ignored by this focused assertion',
    })).toEqual({
      enterToSend: true,
      enterToSendConfigured: false,
      invalid: 'ignored by this focused assertion',
    });

    expect(sanitizeSettingsChanges({
      enterToSend: 'true',
      enterToSendConfigured: 1,
    })).toEqual({});
  });
});
