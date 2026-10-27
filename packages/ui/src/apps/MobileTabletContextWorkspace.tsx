import React from 'react';

import { ContextPanel } from '@/components/layout/ContextPanel';
import { ContextPanelRail } from '@/components/layout/ContextPanelRail';
import { ContextSurfacePanes } from '@/components/layout/ContextSurfacePanes';
import { ZoneDropOverlay } from '@/components/layout/ZoneDropOverlay';
import { ZoneFitArbiter } from '@/components/layout/ZoneFitArbiter';
import { ZoneInteractiveContext } from '@/components/layout/zoneInteractiveContext';
import type { ZoneFitSidebar } from '@/components/layout/zoneFitWatch';
import { PauseClock } from '@/components/ui/pause-clock';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DockedPanelSurfaceContext } from '@/hooks/usePageColors';
import type { MobileResourceMonitorSurfaceState } from '@/components/layout/MobileResourceMonitorPane';
import { MobileFileEditor } from './MobileFileEditor';
import { MobileTabletChatFrame } from './MobileTabletChatFrame';

export const MobileTabletContextWorkspace: React.FC<{
  children: React.ReactNode;
  sidebar: ZoneFitSidebar;
  enabled: boolean;
  retainContextWorkspace: boolean;
  mobileFileEditorHost: HTMLElement | null;
  mobileFileEditorVisible: boolean;
  mobileResourceMonitor?: MobileResourceMonitorSurfaceState;
}> = ({ children, sidebar, enabled, retainContextWorkspace, mobileFileEditorHost, mobileFileEditorVisible, mobileResourceMonitor }) => {
  const [contextFileEditorHost, setContextFileEditorHost] = React.useState<HTMLElement | null>(null);
  const [contextFileEditorVisible, setContextFileEditorVisible] = React.useState(false);
  const [contextFileEditorInteractive, setContextFileEditorInteractive] = React.useState(false);
  const [hasContextCloseHandler, setHasContextCloseHandler] = React.useState(false);
  const contextCloseHandlerRef = React.useRef<((path: string) => void) | null>(null);
  const registerContextCloseHandler = React.useCallback((handler: ((path: string) => void) | null) => {
    contextCloseHandlerRef.current = handler;
    setHasContextCloseHandler(Boolean(handler));
  }, []);
  const closeContextFile = React.useCallback((path: string) => contextCloseHandlerRef.current?.(path), []);

  const editorHost = enabled ? contextFileEditorHost : mobileFileEditorHost;
  const editorVisible = enabled ? contextFileEditorVisible : mobileFileEditorVisible;
  const editorInteractive = enabled ? contextFileEditorInteractive : mobileFileEditorVisible;

  return (
    <>
      <MobileTabletChatFrame
        enabled={enabled}
        leftPanel={<ContextPanel zone="left" touchTargets />}
        bottomPanel={<ContextPanel zone="bottom" touchTargets />}
        rightPanel={<ContextPanel zone="right" touchTargets />}
        overlay={<ZoneDropOverlay />}
        rail={<div data-page-scroll-lock="true"><ErrorBoundary><ContextPanelRail touchTargets /></ErrorBoundary></div>}
      >
        {children}
      </MobileTabletChatFrame>
      <ZoneFitArbiter sidebar={sidebar} enabled={enabled} />
      {retainContextWorkspace ? (
        <ContextSurfacePanes
          enabled={enabled}
          mobileResourceMonitor={mobileResourceMonitor}
          externalFileEditor
          onFileEditorSlotChange={setContextFileEditorHost}
          onFileEditorVisibleChange={setContextFileEditorVisible}
          onFileEditorInteractiveChange={setContextFileEditorInteractive}
          registerFileEditorCloseHandler={registerContextCloseHandler}
        />
      ) : null}
      <DockedPanelSurfaceContext.Provider value={enabled}>
        <ZoneInteractiveContext.Provider value={editorInteractive}>
          <PauseClock paused={!editorVisible}>
            <ErrorBoundary>
              <MobileFileEditor
                host={editorHost}
                visible={editorVisible}
                onCloseFile={hasContextCloseHandler ? closeContextFile : undefined}
              />
            </ErrorBoundary>
          </PauseClock>
        </ZoneInteractiveContext.Provider>
      </DockedPanelSurfaceContext.Provider>
    </>
  );
};
