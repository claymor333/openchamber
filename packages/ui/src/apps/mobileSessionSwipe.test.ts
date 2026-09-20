import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';

import {
  buildMobileSessionSwipeModel,
  validateMobileSessionSwipeTarget,
  type MobileSessionSwipeModelInputs,
} from './mobileSessionSwipe';

type SessionFixtureExtra = {
  directory?: string | null;
  parentID?: string | null;
  metadata?: { openchamber?: { kind?: string; originalSessionID?: string } };
};

const makeSession = (
  id: string,
  directory: string,
  time: number,
  extra: SessionFixtureExtra = {},
): Session & SessionFixtureExtra => {
  // SAFETY: this fixture supplies the session fields used by the pure model;
  // the SDK type also includes server-only fields that are irrelevant here.
  return {
  id,
  title: id,
  time: { created: time, updated: time },
  directory,
  ...extra,
  } as Session & SessionFixtureExtra;
};

const buildInput = (
  sessions: Session[],
  currentSessionId: string | null,
  overrides: Partial<MobileSessionSwipeModelInputs> = {},
): MobileSessionSwipeModelInputs => ({
  runtimeKey: 'runtime-a',
  globalLoad: { status: 'ready', hasLoaded: true },
  activeSessions: sessions,
  projectSortOrder: 'manual',
  manualProjectOrder: ['project-a', 'project-b'],
  projects: [
    { id: 'project-a', path: '/repo-a', label: 'Project A' },
    { id: 'project-b', path: '/repo-b', label: 'Project B' },
  ],
  worktreesByProject: new Map(),
  topologyAuthority: new Map(),
  directoryAuthority: new Map(
      [...new Set(sessions.map((session) => session.directory))]
      .map((directory): [string, { status: 'ready'; generation: number }] => [directory, { status: 'ready', generation: 1 }]),
  ),
  folderMap: {},
  folderHydration: { status: 'ready', generation: 1 },
  pinnedSessionIds: new Set(),
  lifecycleRanks: new Map(),
  visibleSessionId: currentSessionId,
  resolvedRootSessionId: null,
  limit: 5,
  managedChatsRoot: null,
  projectRootBranches: new Map(),
  projectRootBranchStates: new Map(),
  ...overrides,
});

describe('mobile session swipe model', () => {
  test('uses exact folder membership and keeps the current root inside the cap', () => {
    const sessions = Array.from({ length: 6 }, (_, index) => makeSession(`session-${index}`, '/repo-a/worktree', index + 1));
    const model = buildMobileSessionSwipeModel(buildInput(sessions, 'session-0', {
      projects: [{ id: 'project-a', path: '/repo-a', label: 'Project A' }],
      worktreesByProject: new Map([['/repo-a', [{ path: '/repo-a/worktree', projectDirectory: '/repo-a', branch: 'feature', label: 'feature' }]]]),
      topologyAuthority: new Map([['/repo-a', { status: 'ready', generation: 1 }]]),
      folderMap: {
        '/repo-a/worktree': [{ id: 'folder-a', name: 'Folder A', sessionIds: ['session-0'], createdAt: 1 }],
      },
      limit: 1,
    }));

    const folderScope = model.scopes.find((scope) => scope.identity.folderId === 'folder-a');
    const unfiledScope = model.scopes.find((scope) => scope.identity.folderId === null);
    expect(folderScope?.targets.map((target) => target.id)).toEqual(['session-0']);
    expect(unfiledScope?.targets.map((target) => target.id)).toEqual(['session-5']);
  });

  test('resolves roots through the complete parent chain and excludes orphans and temporary sessions', () => {
    const sessions = [
      makeSession('root', '/repo-a', 1),
      makeSession('child', '/repo-a', 2, { parentID: 'root' }),
      makeSession('orphan', '/repo-a', 3, { parentID: 'missing' }),
      makeSession('btw', '/repo-a', 4, { metadata: { openchamber: { kind: 'btw', originalSessionID: 'root' } } }),
    ];
    const model = buildMobileSessionSwipeModel(buildInput(sessions, 'child', {
      projects: [{ id: 'project-a', path: '/repo-a', label: 'Project A' }],
    }));

    expect(model.currentRootSessionId).toBe('root');
    expect(model.scopes.flatMap((scope) => scope.targets.map((target) => target.id))).toEqual(['root']);
  });

  test('retains the current root but does not reserve pinned sessions outside the cap', () => {
    const sessions = [
      makeSession('current-old', '/repo-a', 1),
      makeSession('pinned-new', '/repo-a', 2),
    ];
    const model = buildMobileSessionSwipeModel(buildInput(sessions, 'current-old', {
      projects: [{ id: 'project-a', path: '/repo-a', label: 'Project A' }],
      limit: 1,
      pinnedSessionIds: new Set([JSON.stringify(['runtime-a', '/repo-a', 'pinned-new'])]),
    }));

    expect(model.scopes.flatMap((scope) => scope.targets.map((target) => target.id))).toEqual(['current-old']);
  });

  test('crosses to the latest root in the next project and stops at the boundary', () => {
    const sessions = [
      makeSession('current', '/repo-a', 1),
      makeSession('other-old', '/repo-b', 2),
      makeSession('other-latest', '/repo-b', 3),
    ];
    const model = buildMobileSessionSwipeModel(buildInput(sessions, 'current'));

    expect(model.resolveTarget('next')?.id).toBe('other-latest');
    expect(model.resolveTarget('previous')).toBeNull();
  });

  test('does not turn incomplete directory or folder authority into a false boundary', () => {
    const current = makeSession('current', '/repo-a', 1);
    const other = makeSession('other', '/repo-b', 2);
    const model = buildMobileSessionSwipeModel(buildInput([current, other], 'current', {
      directoryAuthority: new Map([
        ['/repo-a', { status: 'ready', generation: 1 }],
        ['/repo-b', { status: 'loading', generation: 1 }],
      ]),
    }));

    expect(model.resolveTarget('next')).toBeNull();
    expect(model.scopes.some((scope) => scope.completeness === 'loading')).toBe(true);
  });

  test('rejects a captured target after its directory authority changes', () => {
    const current = makeSession('current', '/repo-a', 1);
    const other = makeSession('other', '/repo-b', 2);
    const captured = buildMobileSessionSwipeModel(buildInput([current, other], 'current'));
    const target = captured.resolveTarget('next');
    if (!target) throw new Error('expected an adjacent target');

    const currentModel = buildMobileSessionSwipeModel(buildInput([current, other], 'current', {
      directoryAuthority: new Map([
        ['/repo-a', { status: 'ready', generation: 1 }],
        ['/repo-b', { status: 'failed', generation: 2 }],
      ]),
    }));
    expect(validateMobileSessionSwipeTarget(captured, currentModel, target, 'next')).toBe(false);
  });
});
