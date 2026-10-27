import { describe, expect, test } from 'bun:test';

import { RESOURCE_MONITOR_MOBILE_SOURCE_URL } from '@/lib/guests/mobile-support';
import type { InstalledGuest } from '@/lib/guests/types';
import {
  CATALOG_EXTENSIONS,
  catalogExtensionsForSurface,
  EXCALIDRAW_EXTENSION,
  RESOURCE_MONITOR_EXTENSION,
  getCatalogExtensionState,
} from './catalogExtensions';

const installed = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'excalidraw',
  name: 'Excalidraw',
  icon: 'icon.svg',
  version: '1.0.0',
  capabilities: { requested: [], granted: [] },
  ...overrides,
});

describe('getCatalogExtensionState', () => {
  test('follows the installed catalog by extension id', () => {
    expect(getCatalogExtensionState([], EXCALIDRAW_EXTENSION)).toEqual({ kind: 'not-installed' });
    expect(getCatalogExtensionState([installed({ id: 'other' })], EXCALIDRAW_EXTENSION)).toEqual({ kind: 'not-installed' });
    expect(getCatalogExtensionState([installed()], EXCALIDRAW_EXTENSION)).toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([installed({ source: 'git', update: { version: '1.1.0' } })], EXCALIDRAW_EXTENSION))
      .toMatchObject({ kind: 'update-available', version: '1.1.0' });
    expect(getCatalogExtensionState([installed({ source: 'zip', update: { version: '1.1.0' } })], EXCALIDRAW_EXTENSION))
      .toMatchObject({ kind: 'installed' });
  });

  test('approval and pause outrank an update, since the extension does nothing until they are resolved', () => {
    const unapproved = installed({ capabilities: { requested: ['files'], granted: [] }, enabled: false, update: { version: '2.0.0' } });
    expect(getCatalogExtensionState([unapproved], EXCALIDRAW_EXTENSION)).toMatchObject({ kind: 'needs-approval' });
    expect(getCatalogExtensionState([installed({ enabled: false, update: { version: '2.0.0' } })], EXCALIDRAW_EXTENSION))
      .toMatchObject({ kind: 'paused' });
  });

  test('ignores cached candidates that are not newer than the installed version', () => {
    const monitor = installed({
      id: RESOURCE_MONITOR_EXTENSION.guestId,
      version: '1.4.1',
      source: 'git',
      origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
      service: { runtime: 'host', granted: true },
      capabilities: { requested: ['service'], granted: ['service'] },
      update: { version: '1.4.0' },
    });

    expect(getCatalogExtensionState([monitor], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([{ ...monitor, update: { version: '1.4.1' } }], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([{ ...monitor, update: { version: '1.4.1+build.7' } }], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([{
      ...monitor,
      version: '1.4.1-rc.1',
      update: { version: '1.4.1' },
    }], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'update-available', version: '1.4.1' });
  });

  test('mobile requires an approved, enabled, compatible Resource Monitor bundle', () => {
    const monitor = installed({
      id: RESOURCE_MONITOR_EXTENSION.guestId,
      version: '1.4.0',
      source: 'git',
      origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
      service: { runtime: 'host', granted: true },
      capabilities: { requested: ['service'], granted: ['service'] },
    });
    expect(getCatalogExtensionState([monitor], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'mobile-update-required', minimumVersion: '1.4.1' });
    expect(getCatalogExtensionState([{ ...monitor, version: '1.4.1-rc.1' }], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'mobile-update-required', minimumVersion: '1.4.1' });
    expect(getCatalogExtensionState([{ ...monitor, version: '1.4.1+build.7' }], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([{
      ...monitor,
      update: { version: '1.4.1' },
    }], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'update-available', version: '1.4.1' });
    expect(getCatalogExtensionState([{
      ...monitor,
      version: '1.4.1',
      origin: { url: 'https://github.com/openchamber/openchamber-resource-monitor' },
      capabilities: { requested: ['service'], granted: [] },
      service: { runtime: 'host', granted: false },
    }], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'mobile-reinstall-required' });
    expect(getCatalogExtensionState([{
      ...monitor,
      capabilities: { requested: ['service'], granted: [] },
      service: { runtime: 'host', granted: false },
    }], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'needs-approval' });
    expect(getCatalogExtensionState([{ ...monitor, enabled: false }], RESOURCE_MONITOR_EXTENSION, true))
      .toMatchObject({ kind: 'paused' });
    expect(getCatalogExtensionState([{
      ...monitor,
      version: '1.4.1',
      update: { version: '1.4.2' },
    }], RESOURCE_MONITOR_EXTENSION, true)).toMatchObject({ kind: 'update-available', version: '1.4.2' });
  });
});

describe('CATALOG_EXTENSIONS', () => {
  test('Resource Monitor installs and links to the owned fork', () => {
    expect(RESOURCE_MONITOR_EXTENSION.gitUrl).toBe(RESOURCE_MONITOR_MOBILE_SOURCE_URL);
    expect(RESOURCE_MONITOR_EXTENSION.homepage).toBe(RESOURCE_MONITOR_MOBILE_SOURCE_URL);
  });

  test('every card installs a different extension', () => {
    const ids = CATALOG_EXTENSIONS.map((definition) => definition.guestId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCatalogExtensionState([installed({ id: 'resource-monitor' })], RESOURCE_MONITOR_EXTENSION)).toMatchObject({ kind: 'installed' });
  });

  test('mobile discovery is restricted to Resource Monitor', () => {
    expect(catalogExtensionsForSurface(true).map((definition) => definition.guestId)).toEqual(['resource-monitor']);
    expect(catalogExtensionsForSurface(false).map((definition) => definition.guestId)).toEqual(['excalidraw', 'resource-monitor']);
  });
});
