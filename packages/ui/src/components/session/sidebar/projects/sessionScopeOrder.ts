import type { ProjectSortOrder } from '@/stores/useSessionDisplayStore';
import type { WorktreeMetadata } from '@/types/worktree';

import { orderWorktrees } from '@/stores/useWorktreeOrderStore';
import { normalizePath } from '@/lib/pathNormalization';
import { sortProjectsByOrder, type SortableProject } from '../list/projectSort';

export type SessionScopeProject = SortableProject & {
  normalizedPath?: string;
};

export type OrderedSessionScopeProject<T extends SessionScopeProject = SessionScopeProject> = T & {
  normalizedPath: string;
  worktrees: WorktreeMetadata[];
};

/**
 * The project and worktree order shared by the sessions drawer and mobile
 * session navigation. New worktrees stay after the persisted order until the
 * user places them explicitly.
 */
export const orderSessionScopeProjects = <T extends SessionScopeProject>(
  projects: readonly T[],
  projectSortOrder: ProjectSortOrder,
  manualProjectOrder: readonly string[],
  worktreesByProject: ReadonlyMap<string, WorktreeMetadata[]>,
  worktreeOrderByProject: Readonly<Record<string, string[]>> = {},
): OrderedSessionScopeProject<T>[] => {
  const orderedProjects = sortProjectsByOrder(projects, projectSortOrder, manualProjectOrder);

  return orderedProjects.flatMap((project) => {
    const normalizedPath = normalizePath(project.normalizedPath ?? project.path) ?? '';
    if (!normalizedPath) return [];
    const worktrees = orderWorktrees(
      worktreeOrderByProject[project.id],
      worktreesByProject.get(normalizedPath) ?? [],
    );
    return [{ ...project, normalizedPath, worktrees }];
  });
};
