import { describe, expect, test } from 'bun:test';
import type { I18nKey } from '@/lib/i18n/store';
import { buildSettingsSearchResults } from './search';

const t = (key: I18nKey): string => key;

const runtimeCtx = {
  isVSCode: false,
  isWeb: true,
  isDesktop: false,
  isMobile: false,
  isDesktopLocalOrigin: false,
  isMac: false,
  isWindows: false,
  isLinux: false,
  isWindowsArm64: false,
};

describe('settings search', () => {
  test('finds the Claude Code third-party integration', () => {
    const results = buildSettingsSearchResults({
      query: 'claude',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'integrations.third-party.opencode-claude')).toBe(true);
  });

  test('finds third-party integrations by OpenChamber npm package names', () => {
    const results = buildSettingsSearchResults({
      query: '@openchamber/opencode-cursor',
      runtimeCtx,
      t,
      getPageTitle: (page) => page,
    });

    expect(results.some((result) => result.id === 'integrations.third-party.opencode-cursor-oauth')).toBe(true);
  });

  test('entry is available on mobile, hidden on VSCode', () => {
    const mobileRuntimeCtx = { ...runtimeCtx, isMobile: true, isLinux: true };
    const options = {
      query: 'hybrid tablet',
      runtimeCtx: mobileRuntimeCtx,
      visiblePageSlugs: undefined,
      t,
      getPageTitle: (page: I18nKey) => page,
    };
    const results = buildSettingsSearchResults(options);
    expect(results.some((result) => result.id === 'appearance.hybrid-tablet-ui')).toBe(true);
    const vscode = buildSettingsSearchResults({
      ...options,
      runtimeCtx: { ...mobileRuntimeCtx, isVSCode: true },
    });
    expect(vscode.some((result) => result.id === 'appearance.hybrid-tablet-ui')).toBe(false);
  });
});
