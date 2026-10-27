import type { IconName } from '@/components/icon/icons';
import type { I18nKey } from '@/lib/i18n';
import { guestNeedsApproval } from '@/lib/guests/capabilities';
import {
  isResourceMonitorMobileOrigin,
  isResourceMonitorMobileVersion,
  RESOURCE_MONITOR_MOBILE_MIN_VERSION,
  RESOURCE_MONITOR_MOBILE_SOURCE_URL,
} from '@/lib/guests/mobile-support';
import { getNewerGuestUpdate } from '@/lib/guests/updates';
import type { InstalledGuest } from '@/lib/guests/types';

/** An OpenChamber extension the team publishes and the Integrations page offers to install. */
export interface CatalogExtensionDefinition {
  /** The extension's `panel.id`, which is its id once installed. */
  guestId: string;
  /** Installed through the same Git install as Settings → Extensions. */
  gitUrl: string;
  homepage: string;
  nameKey: I18nKey;
  descriptionKey: I18nKey;
  logo: CatalogExtensionLogo;
  /** Minimum compatible bundle version; mobile eligibility also requires the curated Git origin. */
  mobileMinimumVersion?: string;
}

/** The card's logo: the file-type icon of a file the extension opens, or an app icon. */
export type CatalogExtensionLogo =
  | { kind: 'file-type'; fileName: string }
  | { kind: 'icon'; name: IconName };

export const EXCALIDRAW_EXTENSION: CatalogExtensionDefinition = {
  guestId: 'excalidraw',
  gitUrl: 'https://github.com/openchamber/openchamber-excalidraw',
  homepage: 'https://github.com/openchamber/openchamber-excalidraw',
  nameKey: 'settings.integrations.extensionCatalog.excalidraw.name',
  descriptionKey: 'settings.integrations.extensionCatalog.excalidraw.description',
  logo: { kind: 'file-type', fileName: 'drawing.excalidraw' },
};

export const RESOURCE_MONITOR_EXTENSION: CatalogExtensionDefinition = {
  guestId: 'resource-monitor',
  gitUrl: RESOURCE_MONITOR_MOBILE_SOURCE_URL,
  homepage: RESOURCE_MONITOR_MOBILE_SOURCE_URL,
  nameKey: 'settings.integrations.extensionCatalog.resourceMonitor.name',
  descriptionKey: 'settings.integrations.extensionCatalog.resourceMonitor.description',
  logo: { kind: 'icon', name: 'pulse' },
  mobileMinimumVersion: RESOURCE_MONITOR_MOBILE_MIN_VERSION,
};

export const CATALOG_EXTENSIONS: readonly CatalogExtensionDefinition[] = [EXCALIDRAW_EXTENSION, RESOURCE_MONITOR_EXTENSION];

/** Mobile Settings may install only the curated Resource Monitor guest. */
export const catalogExtensionsForSurface = (mobileSurface: boolean): readonly CatalogExtensionDefinition[] => (
  mobileSurface ? [RESOURCE_MONITOR_EXTENSION] : CATALOG_EXTENSIONS
);

export type CatalogExtensionState =
  | { kind: 'not-installed' }
  | { kind: 'blocked'; guest: InstalledGuest }
  | { kind: 'needs-approval'; guest: InstalledGuest }
  | { kind: 'paused'; guest: InstalledGuest }
  | { kind: 'mobile-reinstall-required'; guest: InstalledGuest }
  | { kind: 'mobile-update-required'; guest: InstalledGuest; minimumVersion: string }
  | { kind: 'update-available'; guest: InstalledGuest; version: string }
  | { kind: 'installed'; guest: InstalledGuest };

/**
 * One state per card, from the installed catalog. Approval and pause outrank
 * an available update: the extension does nothing until they are resolved.
 */
export const getCatalogExtensionState = (
  guests: readonly InstalledGuest[],
  definition: CatalogExtensionDefinition,
  mobileSurface = false,
): CatalogExtensionState => {
  const guest = guests.find((candidate) => candidate.id === definition.guestId);
  if (!guest) return { kind: 'not-installed' };
  // Enterprise mode refuses this package; no approval can change that.
  if (guest.enterpriseBlocked?.length) return { kind: 'blocked', guest };
  if (mobileSurface && definition.mobileMinimumVersion && (guest.source !== 'git' || !isResourceMonitorMobileOrigin(guest.origin?.url))) {
    return { kind: 'mobile-reinstall-required', guest };
  }
  if (guestNeedsApproval(guest)) return { kind: 'needs-approval', guest };
  if (guest.enabled === false) return { kind: 'paused', guest };
  const update = getNewerGuestUpdate(guest);
  if (mobileSurface && definition.mobileMinimumVersion && !isResourceMonitorMobileVersion(guest.version)) {
    if (update && isResourceMonitorMobileVersion(update.version)) {
      return { kind: 'update-available', guest, version: update.version };
    }
    return { kind: 'mobile-update-required', guest, minimumVersion: definition.mobileMinimumVersion };
  }
  if (update) return { kind: 'update-available', guest, version: update.version };
  return { kind: 'installed', guest };
};
