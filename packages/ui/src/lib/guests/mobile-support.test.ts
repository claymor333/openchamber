import { describe, expect, test } from 'bun:test';

import type { InstalledGuest } from './types.ts';
import {
  filterMobileGuestCatalog,
  isResourceMonitorMobileReady,
  isResourceMonitorMobileOrigin,
  isResourceMonitorMobileVersion,
  RESOURCE_MONITOR_MOBILE_SOURCE_URL,
} from './mobile-support.ts';

const resourceMonitor = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'resource-monitor',
  name: 'Resource Monitor',
  icon: 'pulse',
  version: '1.4.1',
  source: 'git',
  origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
  service: { runtime: 'host', granted: true },
  capabilities: { requested: ['service'], granted: ['service'] },
  ...overrides,
});

describe('curated mobile guest support', () => {
  test('filters the installed and unreadable catalog to Resource Monitor only', () => {
    const catalog = filterMobileGuestCatalog({
      guests: [resourceMonitor(), resourceMonitor({ id: 'other-extension', name: 'Other' })],
      unreadable: [
        { id: 'resource-monitor', name: 'Resource Monitor', builtIn: false },
        { id: 'other-extension', name: 'Other', builtIn: false },
        { id: null, name: null, builtIn: false },
      ],
    });

    expect(catalog.guests.map((guest) => guest.id)).toEqual(['resource-monitor']);
    expect(catalog.unreadable.map((guest) => guest.id)).toEqual(['resource-monitor']);
  });

  test('requires a compatible version, active grant, enabled state, and granted host service', () => {
    expect(isResourceMonitorMobileReady(resourceMonitor())).toBe(true);
    expect(isResourceMonitorMobileReady(resourceMonitor({ version: '1.4.0' }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ version: '1.4.1-rc.1' }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ version: undefined }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ enabled: false }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ capabilities: { requested: ['service'], granted: [] } }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ service: { runtime: 'host', granted: false } }))).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ enterpriseBlocked: ['service'] }))).toBe(false);
  });

  test('rejects malformed version strings and accepts later compatible patches', () => {
    expect(isResourceMonitorMobileVersion('1.4.0')).toBe(false);
    expect(isResourceMonitorMobileVersion('not-a-version')).toBe(false);
    expect(isResourceMonitorMobileVersion('1.4.2')).toBe(true);
    expect(isResourceMonitorMobileVersion('2.0.0')).toBe(true);
  });

  test('requires a stable release while allowing supported build metadata', () => {
    expect(isResourceMonitorMobileVersion('1.4.1-rc.1')).toBe(false);
    expect(isResourceMonitorMobileVersion('1.4.1-beta.2')).toBe(false);
    expect(isResourceMonitorMobileVersion('1.4.2-rc.1')).toBe(false);
    expect(isResourceMonitorMobileVersion('1.4.1+build.7')).toBe(true);
    expect(isResourceMonitorMobileVersion('v1.4.1+build-7')).toBe(true);
  });

  test('accepts only the curated GitHub origin, including the installer .git suffix', () => {
    expect(isResourceMonitorMobileOrigin('https://github.com/claymor333/openchamber-resource-monitor.git')).toBe(true);
    expect(isResourceMonitorMobileOrigin('git@github.com:claymor333/openchamber-resource-monitor.git')).toBe(true);
    expect(isResourceMonitorMobileOrigin('https://github.com/openchamber/openchamber-resource-monitor')).toBe(false);
    expect(isResourceMonitorMobileReady(resourceMonitor({ origin: undefined }))).toBe(false);
  });
});
