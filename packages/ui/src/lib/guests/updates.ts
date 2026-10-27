import { runtimeFetch } from '@/lib/runtime-fetch';
import { z } from 'zod';

import { guestUpdateSchema, parseInstalledGuestJson } from './parse.ts';
import type { GuestUpdate, InstalledGuest } from './types.ts';

const checkResponseSchema = z.object({
  updates: z.record(z.string().min(1), guestUpdateSchema),
});

export type UpdateGuestErrorCode =
  | 'not-git'
  | 'clone-failed'
  | 'clone-auth-failed'
  | 'invalid-manifest'
  | 'missing-build'
  | 'host-too-old'
  | 'enterprise-mode'
  | 'swap-failed'
  | 'not-found'
  | 'failed';

const updateErrorSchema = z.object({
  error: z.enum(['not-git', 'clone-failed', 'clone-auth-failed', 'invalid-manifest', 'missing-build', 'host-too-old', 'swap-failed', 'not-found', 'enterprise-mode']),
  required: z.string().trim().min(1).max(64).optional(),
});

type CheckGuestUpdatesResult =
  | { ok: true; updates: Record<string, GuestUpdate> }
  | { ok: false };

type UpdateGuestResult =
  | { ok: true; guest: InstalledGuest }
  | { ok: false; code: UpdateGuestErrorCode; required?: string };

type GuestSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[] | null;
};

const GUEST_SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const parseGuestSemver = (value: string): GuestSemver | null => {
  const match = GUEST_SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : null,
  };
};

const compareSemverIdentifier = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left === right ? 0 : left < right ? -1 : 1;
};

const compareGuestSemver = (left: string, right: string): number | null => {
  const leftVersion = parseGuestSemver(left);
  const rightVersion = parseGuestSemver(right);
  if (!leftVersion || !rightVersion) return null;

  for (const [leftPart, rightPart] of [
    [leftVersion.major, rightVersion.major],
    [leftVersion.minor, rightVersion.minor],
    [leftVersion.patch, rightVersion.patch],
  ]) {
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }

  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;

  const length = Math.min(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const order = compareSemverIdentifier(
      leftVersion.prerelease[index] ?? '',
      rightVersion.prerelease[index] ?? '',
    );
    if (order !== 0) return order;
  }
  return Math.sign(leftVersion.prerelease.length - rightVersion.prerelease.length);
};

/**
 * The server's cached update is advisory. UI surfaces expose it only while it
 * still names a strictly newer version of an installed Git extension.
 */
export const getNewerGuestUpdate = (
  guest: Pick<InstalledGuest, 'source' | 'version' | 'update'>,
): GuestUpdate | undefined => {
  if (guest.source !== 'git' || !guest.version || !guest.update?.version) return undefined;
  return compareGuestSemver(guest.update.version, guest.version) === 1 ? guest.update : undefined;
};

/**
 * Ask the server to compare every git install with its origin. The server
 * answers from a one-hour cache unless `force`. Failure is distinct from
 * "nothing to update" so the page never clears badges on a network error.
 */
export const checkGuestUpdates = async (force: boolean): Promise<CheckGuestUpdatesResult> => {
  try {
    const response = await runtimeFetch('/api/guests/updates/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      return { ok: false };
    }
    const parsed = checkResponseSchema.safeParse(JSON.parse(await response.text()));
    return parsed.success ? { ok: true, updates: parsed.data.updates } : { ok: false };
  } catch {
    return { ok: false };
  }
};

const readUpdateError = async (response: Response): Promise<{ code: UpdateGuestErrorCode; required?: string }> => {
  try {
    const parsed = updateErrorSchema.safeParse(JSON.parse(await response.text()));
    if (!parsed.success) {
      return { code: 'failed' };
    }
    return parsed.data.required
      ? { code: parsed.data.error, required: parsed.data.required }
      : { code: parsed.data.error };
  } catch {
    return { code: 'failed' };
  }
};

/** Replace the installed git copy with a fresh clone of its origin. Returns the refreshed catalog row. */
export const updateGuest = async (id: string): Promise<UpdateGuestResult> => {
  try {
    const response = await runtimeFetch(`/api/guests/${id}/update`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const error = await readUpdateError(response);
      return error.required
        ? { ok: false, code: error.code, required: error.required }
        : { ok: false, code: error.code };
    }
    const guest = parseInstalledGuestJson(await response.text());
    return guest ? { ok: true, guest } : { ok: false, code: 'failed' };
  } catch {
    return { ok: false, code: 'failed' };
  }
};
