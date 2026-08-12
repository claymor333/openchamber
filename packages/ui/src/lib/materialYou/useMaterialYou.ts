import React from 'react';

import { DEFAULT_MATERIAL_YOU_SEED } from './materialYouTheme';
import type { MaterialYouThemes } from './materialYouTheme';
import { isMaterialYouEligible, pickSeedColor } from './materialYouPlugin';
import type { WallpaperColorPayload } from './materialYouPlugin';

/**
 * Subscribes to the native Material You wallpaper palette and derives the light
 * and dark OpenChamber themes from it. Returns {@code null} on every non-Android
 * runtime (web, desktop, VSCode, iOS) so those surfaces keep their exact current
 * theming behavior. The plugin and the color-utilities chunk are imported lazily
 * so they only enter the bundle's async chunk, never the main web bundle.
 */
export const useMaterialYouThemes = (): { themes: MaterialYouThemes | null } => {
  const [themes, setThemes] = React.useState<MaterialYouThemes | null>(null);

  React.useEffect(() => {
    if (!isMaterialYouEligible()) {
      return;
    }

    let disposed = false;
    let removeListener: (() => void) | null = null;
    const seed = { current: DEFAULT_MATERIAL_YOU_SEED };

    const build = (seedColor: string) => {
      void import('./materialYouTheme')
        .then(({ buildMaterialYouThemes }) => {
          if (disposed) {
            return;
          }
          setThemes(buildMaterialYouThemes(seedColor));
        })
        .catch(() => undefined);
    };

    // Seed with the brand color immediately; the native palette (or its absence)
    // refines this on the first bridge call.
    build(seed.current);

    void import('./materialYouPlugin')
      .then(async ({ MaterialYou }) => {
        if (disposed) {
          return;
        }

        const handle = await MaterialYou.addListener('wallpaperColors', (colors: WallpaperColorPayload) => {
          const nextSeed = pickSeedColor(colors);
          if (!nextSeed) {
            return;
          }
          seed.current = nextSeed;
          build(seed.current);
        }).catch(() => null);

        if (disposed) {
          void handle?.remove();
          return;
        }
        removeListener = () => void handle?.remove();

        const colors = await MaterialYou.getWallpaperColors().catch(() => null);
        if (disposed) {
          return;
        }
        const initialSeed = pickSeedColor(colors);
        if (initialSeed) {
          seed.current = initialSeed;
          build(seed.current);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  return { themes };
};
