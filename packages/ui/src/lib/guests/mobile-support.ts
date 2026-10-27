import { compareOpenChamberVersions, parseOpenChamberVersion } from '@openchamber/sdk';

import { isGuestActive } from './capabilities.ts';
import type { GuestCatalog, InstalledGuest } from './types.ts';

/** Mobile guest support is deliberately limited to this curated panel. */
export const RESOURCE_MONITOR_GUEST_ID = 'resource-monitor';
export const RESOURCE_MONITOR_MOBILE_MIN_VERSION = '1.4.1';
export const RESOURCE_MONITOR_MOBILE_SOURCE_URL = 'https://github.com/claymor333/openchamber-resource-monitor';
export const RESOURCE_MONITOR_MOBILE_FRAME_NAME = 'openchamber-resource-monitor-mobile';

/** Keep other installed guests out of the mobile guest surface and settings list. */
export const filterMobileGuestCatalog = (catalog: GuestCatalog): GuestCatalog => ({
  guests: catalog.guests.filter((guest) => guest.id === RESOURCE_MONITOR_GUEST_ID),
  unreadable: catalog.unreadable.filter((guest) => guest.id === RESOURCE_MONITOR_GUEST_ID),
});

export const isResourceMonitorMobileVersion = (version: string | undefined): boolean => {
  if (!version || parseOpenChamberVersion(version) === null) return false;

  const normalized = version.trim().replace(/^v/i, '');
  const prereleaseSeparator = normalized.indexOf('-');
  const buildSeparator = normalized.indexOf('+');
  const hasPrerelease = prereleaseSeparator >= 0 && (buildSeparator < 0 || prereleaseSeparator < buildSeparator);
  return !hasPrerelease && compareOpenChamberVersions(version, RESOURCE_MONITOR_MOBILE_MIN_VERSION) >= 0;
};

const canonicalGitHubRepository = (value: string | undefined): string | null => {
  if (!value) return null;
  const url = value.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+\/[^/]+)$/i.exec(url);
  return match?.[1]?.toLowerCase() ?? null;
};

/** The mobile panel is trusted only from the curated Git repository. */
export const isResourceMonitorMobileOrigin = (originUrl: string | undefined): boolean => (
  canonicalGitHubRepository(originUrl) === canonicalGitHubRepository(RESOURCE_MONITOR_MOBILE_SOURCE_URL)
);

const isResourceMonitorMobileCompatible = (guest: InstalledGuest | null | undefined): boolean => (
  guest !== null
  && guest !== undefined
  && guest.id === RESOURCE_MONITOR_GUEST_ID
  && guest.source === 'git'
  && isResourceMonitorMobileOrigin(guest.origin?.url)
  && isResourceMonitorMobileVersion(guest.version)
);

/** The mobile workspace only opens a fully approved, enabled, compatible panel. */
export const isResourceMonitorMobileReady = (guest: InstalledGuest | null | undefined): boolean => (
  guest !== null
  && guest !== undefined
  && guest.id === RESOURCE_MONITOR_GUEST_ID
  && !guest.enterpriseBlocked?.length
  && isResourceMonitorMobileCompatible(guest)
  && isGuestActive(guest)
  && guest.capabilities.requested.includes('service')
  && guest.capabilities.granted.includes('service')
  && guest.service?.runtime === 'host'
  && guest.service.granted
);
