import React from 'react';

import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useDraftSpaceTarget } from '@/lib/spaces/useDraftSpaceTarget';
import { panelContentDirectory } from '@/lib/spaces/space-creation-requests';
import { normalizeContextPanelDirectoryKey } from '@/stores/useUIStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { MovablePane } from '@/components/layout/MovablePane';

const FilesView = lazyWithChunkRecovery(() => import('@/components/views/FilesView').then((module) => ({ default: module.FilesView })));

export const MobileFileEditorHost: React.FC<{ host: HTMLElement | null; children: React.ReactNode }> = ({ host, children }) => (
  <MovablePane zone="right" hostOverride={host}>{children}</MovablePane>
);

/** One mounted FilesView owner for the mobile shell; only its DOM host changes. */
export const MobileFileEditor: React.FC<{
  host: HTMLElement | null;
  visible: boolean;
  onCloseFile?: (path: string) => void;
}> = ({ host, visible, onCloseFile }) => {
  const effectiveDirectory = useEffectiveDirectory();
  const draftSpace = useDraftSpaceTarget();
  const root = panelContentDirectory(draftSpace, effectiveDirectory) ?? '';
  const rootKey = root ? normalizeContextPanelDirectoryKey(root) : '';
  const selectedPath = useFilesViewTabsStore((state) => {
    const rootState = rootKey ? state.byRoot[rootKey] : undefined;
    return rootState?.selectedPath ?? rootState?.openPaths[0] ?? null;
  });
  const hasBeenHostedRef = React.useRef(false);
  if (host) hasBeenHostedRef.current = true;

  if (!selectedPath || (!host && !hasBeenHostedRef.current) || draftSpace?.kind === 'preparing') return null;

  return (
    <MobileFileEditorHost host={host}>
      <React.Suspense fallback={null}>
        <FilesView mode="editor-only" visible={visible} onCloseFile={onCloseFile} />
      </React.Suspense>
    </MobileFileEditorHost>
  );
};
