import {
  argbFromHex,
  hexFromArgb,
  TonalPalette,
  themeFromSourceColor,
} from '@material/material-color-utilities';

import type { Theme } from '@/types/theme';

export interface MaterialYouThemes {
  light: Theme;
  dark: Theme;
}

/** Brand fallback seed used when the device has no wallpaper palette (API < 27, no wallpaper). */
export const DEFAULT_MATERIAL_YOU_SEED = '#b35017';

const LIGHT_THEME_ID = 'material-you-light';
const DARK_THEME_ID = 'material-you-dark';

const SEED_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Surface-container tonal levels follow the Material 3 tonal map. */
const CONTAINER_TONES = {
  light: { low: 96, mid: 94, high: 92 },
  dark: { low: 10, mid: 12, high: 17 },
} as const;

/** Readable fixed-hue syntax colors (M3 tonal pairs), seed-independent so code stays readable. */
const SYNTAX_HUES = {
  keyword: 265,
  string: 150,
  number: 35,
  function: 215,
  variable: 190,
  type: 310,
} as const;

const hex = (argb: number): string => hexFromArgb(argb);

/** Appends an alpha channel to a 6-digit hex color (matches the theme system's #RRGGBBAA format). */
const withAlpha = (argb: number, alpha: number): string => {
  const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hexFromArgb(argb)}${alphaHex}`;
};

const toneHex = (hue: number, chroma: number, tone: number): string =>
  hex(TonalPalette.fromHueAndChroma(hue, chroma).tone(tone));

const isDarkVariant = (variant: 'light' | 'dark'): boolean => variant === 'dark';

const buildPrimary = (
  theme: MaterialTheme,
  variant: 'light' | 'dark',
): Theme['colors']['primary'] => {
  const dark = isDarkVariant(variant);
  return {
    base: hex(theme.schemes[variant].primary),
    hover: hex(theme.palettes.primary.tone(dark ? 90 : 35)),
    active: hex(theme.palettes.primary.tone(dark ? 95 : 30)),
    foreground: hex(theme.schemes[variant].onPrimary),
    muted: hex(theme.palettes.primary.tone(dark ? 30 : 90)),
    emphasis: hex(theme.palettes.primary.tone(dark ? 80 : 45)),
  };
};

const buildSurface = (theme: MaterialTheme, variant: 'light' | 'dark'): Theme['colors']['surface'] => {
  const scheme = theme.schemes[variant];
  return {
    background: hex(scheme.background),
    foreground: hex(scheme.onBackground),
    muted: hex(scheme.surfaceVariant),
    mutedForeground: hex(scheme.onSurfaceVariant),
    elevated: hex(theme.palettes.neutral.tone(CONTAINER_TONES[variant].high)),
    elevatedForeground: hex(scheme.onSurface),
    overlay: withAlpha(scheme.onSurface, 0.12),
    subtle: hex(theme.palettes.neutral.tone(CONTAINER_TONES[variant].low)),
  };
};

const buildInteractive = (
  theme: MaterialTheme,
  variant: 'light' | 'dark',
): Theme['colors']['interactive'] => {
  const dark = isDarkVariant(variant);
  const scheme = theme.schemes[variant];
  return {
    border: hex(scheme.outlineVariant),
    borderHover: hex(scheme.outline),
    borderFocus: hex(scheme.primary),
    selection: hex(scheme.primaryContainer),
    selectionForeground: hex(scheme.onPrimaryContainer),
    focus: hex(scheme.primary),
    focusRing: withAlpha(scheme.primary, 0.33),
    cursor: hex(scheme.onBackground),
    hover: dark ? withAlpha(0xffffff, 0.08) : withAlpha(0x000000, 0.05),
    active: dark ? withAlpha(0xffffff, 0.12) : withAlpha(0x000000, 0.08),
  };
};

/** error/warning/success/info trio. Error follows the scheme; the rest use fixed M3-ish hues. */
const buildStatus = (theme: MaterialTheme, variant: 'light' | 'dark'): Theme['colors']['status'] => {
  const dark = isDarkVariant(variant);
  const scheme = theme.schemes[variant];

  const trio = (hue: number): { main: string; foreground: string; background: string; border: string } => {
    const mainTone = dark ? 80 : 40;
    const containerTone = dark ? 30 : 90;
    const onTone = dark ? 10 : 100;
    const main = toneHex(hue, 45, mainTone);
    return {
      main,
      foreground: toneHex(hue, 20, onTone),
      background: toneHex(hue, 40, containerTone),
      border: withAlpha(argbFromHex(main), 0.31),
    };
  };

  const warning = trio(60);
  const success = trio(145);
  const info = trio(250);

  return {
    error: hex(scheme.error),
    errorForeground: hex(scheme.onError),
    errorBackground: withAlpha(scheme.error, 0.13),
    errorBorder: withAlpha(scheme.error, 0.31),
    warning: warning.main,
    warningForeground: warning.foreground,
    warningBackground: warning.background,
    warningBorder: warning.border,
    success: success.main,
    successForeground: success.foreground,
    successBackground: success.background,
    successBorder: success.border,
    info: info.main,
    infoForeground: info.foreground,
    infoBackground: info.background,
    infoBorder: info.border,
  };
};

const buildSyntax = (theme: MaterialTheme, variant: 'light' | 'dark') => {
  const dark = isDarkVariant(variant);
  const scheme = theme.schemes[variant];
  const tokenTone = dark ? 80 : 40;

  return {
    base: {
      background: hex(theme.palettes.neutral.tone(CONTAINER_TONES[variant].mid)),
      foreground: hex(scheme.onSurface),
      comment: hex(scheme.onSurfaceVariant),
      keyword: toneHex(SYNTAX_HUES.keyword, 60, tokenTone),
      string: toneHex(SYNTAX_HUES.string, 60, tokenTone),
      number: toneHex(SYNTAX_HUES.number, 60, tokenTone),
      function: toneHex(SYNTAX_HUES.function, 60, tokenTone),
      variable: toneHex(SYNTAX_HUES.variable, 60, tokenTone),
      type: toneHex(SYNTAX_HUES.type, 60, tokenTone),
      operator: hex(scheme.outline),
    },
  };
};

const buildPullRequest = (
  theme: MaterialTheme,
  status: Theme['colors']['status'],
  variant: 'light' | 'dark',
) => ({
  open: status.success,
  draft: hex(theme.schemes[variant].onSurfaceVariant),
  blocked: status.warning,
  merged: toneHex(265, 35, isDarkVariant(variant) ? 80 : 40),
  closed: status.error,
});

const buildTheme = (
  theme: MaterialTheme,
  variant: 'light' | 'dark',
  metadata: { id: string; name: string },
): Theme => {
  const status = buildStatus(theme, variant);

  return {
    metadata: {
      id: metadata.id,
      name: metadata.name,
      description:
        'Dynamic theme derived from your Android wallpaper palette (Material You). Updates live when the wallpaper changes.',
      version: '1.0.0',
      variant,
      tags: ['material-you', 'dynamic', 'android'],
    },
    colors: {
      primary: buildPrimary(theme, variant),
      surface: buildSurface(theme, variant),
      interactive: buildInteractive(theme, variant),
      status,
      pr: buildPullRequest(theme, status, variant),
      syntax: buildSyntax(theme, variant),
    },
  };
};

type MaterialTheme = ReturnType<typeof themeFromSourceColor>;

const normalizeSeed = (seed: string): string => {
  const trimmed = seed.trim();
  return SEED_PATTERN.test(trimmed) ? trimmed : DEFAULT_MATERIAL_YOU_SEED;
};

/** Builds the light and dark OpenChamber themes derived from a wallpaper seed color. */
export const buildMaterialYouThemes = (seed: string): MaterialYouThemes => {
  const theme = themeFromSourceColor(argbFromHex(normalizeSeed(seed)));
  return {
    light: buildTheme(theme, 'light', { id: LIGHT_THEME_ID, name: 'Material You Light' }),
    dark: buildTheme(theme, 'dark', { id: DARK_THEME_ID, name: 'Material You Dark' }),
  };
};
