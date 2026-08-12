import { describe, expect, test } from 'bun:test';

import { buildMaterialYouThemes, DEFAULT_MATERIAL_YOU_SEED } from './materialYouTheme';

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const collectRequiredColors = (theme: ReturnType<typeof buildMaterialYouThemes>['light']) => {
  const colors: string[] = [];
  const { primary, surface, interactive, status, syntax } = theme.colors;

  Object.values(primary).forEach((value) => colors.push(value));
  Object.values(surface).forEach((value) => colors.push(value));
  Object.values(interactive).forEach((value) => colors.push(value));
  Object.values(status).forEach((value) => colors.push(value));
  Object.values(syntax.base).forEach((value) => colors.push(value));

  return colors;
};

describe('buildMaterialYouThemes', () => {
  test('produces light and dark themes with stable metadata', () => {
    const { light, dark } = buildMaterialYouThemes('#123456');

    expect(light.metadata.id).toBe('material-you-light');
    expect(light.metadata.variant).toBe('light');
    expect(dark.metadata.id).toBe('material-you-dark');
    expect(dark.metadata.variant).toBe('dark');
    expect(light.metadata.tags).toContain('material-you');
    expect(dark.metadata.tags).toContain('material-you');
  });

  test('fills every required color slot with a usable hex color', () => {
    const { light, dark } = buildMaterialYouThemes('#1a6b47');

    for (const theme of [light, dark]) {
      for (const color of collectRequiredColors(theme)) {
        expect(typeof color).toBe('string');
        expect(HEX_COLOR.test(color)).toBe(true);
      }
    }
  });

  test('different seeds produce different primary colors', () => {
    const seedA = buildMaterialYouThemes('#9c27b0');
    const seedB = buildMaterialYouThemes('#2e8b57');

    expect(seedA.light.colors.primary.base).not.toBe(seedB.light.colors.primary.base);
    expect(seedA.dark.colors.primary.base).not.toBe(seedB.dark.colors.primary.base);
  });

  test('light and dark variants resolve different surfaces and accents', () => {
    const { light, dark } = buildMaterialYouThemes('#f4532a');

    expect(light.colors.surface.background).not.toBe(dark.colors.surface.background);
    expect(light.colors.primary.base).not.toBe(dark.colors.primary.base);
    expect(light.colors.surface.foreground).not.toBe(dark.colors.surface.foreground);
  });

  test('invalid seeds fall back to the default seed instead of throwing', () => {
    let threw = false;
    try {
      buildMaterialYouThemes('not-a-color');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);

    const { light } = buildMaterialYouThemes('not-a-color');
    const fallback = buildMaterialYouThemes(DEFAULT_MATERIAL_YOU_SEED);

    expect(light.colors.primary.base).toBe(fallback.light.colors.primary.base);
  });
});
