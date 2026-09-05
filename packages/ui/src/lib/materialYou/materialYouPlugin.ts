import { registerPlugin } from '@capacitor/core';
import type { Plugin } from '@capacitor/core';

import { getClientPlatform, isCapacitorApp } from '@/lib/platform';

/** Seed palette pushed by the native MaterialYou plugin (Android only). */
export interface WallpaperColorPayload {
  supported: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}

export interface MaterialYouPlugin extends Plugin {
  /** Resolves the current system wallpaper seed colors. */
  getWallpaperColors(): Promise<WallpaperColorPayload>;
}

/**
 * Typed binding to the native `MaterialYou` plugin. On non-native runtimes the
 * proxy exists but is never invoked (callers gate on {@link isMaterialYouEligible}),
 * so web/desktop/VSCode behavior is unchanged.
 */
export const MaterialYou = registerPlugin<MaterialYouPlugin>('MaterialYou');

/** True only inside the native Android Capacitor shell (not iOS, web, desktop, or VSCode). */
export const isMaterialYouEligible = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return isCapacitorApp() && getClientPlatform() === 'android';
};

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** First usable hex seed from the native payload, or null when none is available. */
export const pickSeedColor = (colors: WallpaperColorPayload | null | undefined): string | null => {
  const candidates = [colors?.primaryColor, colors?.secondaryColor, colors?.tertiaryColor];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && HEX_PATTERN.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
};
