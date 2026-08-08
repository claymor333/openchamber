import React from 'react';

import { MainLayout } from '@/components/layout/MainLayout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { FireworksProvider } from '@/contexts/FireworksContext';
import { useI18n } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { AboutSettings } from '@/components/sections/openchamber/AboutSettings';

import { useDeepLinkHandlers } from './deepLinkNavigation';
import { isCapacitorMobileApp, useNativeAndroidBackButton } from './mobileNativeChrome';
import { MobileFullscreenSurface } from './MobileFullscreenSurface';
import { MobileInstancesSurface } from './MobileInstancesSurface';

/**
 * The native app's tablet desktop shell.
 *
 * On a native (Capacitor) tablet the app renders the shared desktop layout —
 * MainLayout with the sessions sidebar, the full header, the context-panel
 * rail, the command palette, multi-run, etc. — instead of the phone shell
 * upgraded with a tablet layout. Touch-optimized inputs come from the
 * `device-tablet` / `mobile-pointer` root classes, which mobile.css turns into
 * larger hit targets, safe areas and type. Phones keep the mobile shell
 * unchanged; hosted mobile.html in a browser is untouched.
 *
 * Native-only surfaces the desktop chrome lacks are surfaced here: connection
 * management (Instances) is reachable from a Capacitor-only header button and
 * a deep link, and the update page opens on demand. Deep links map to desktop
 * store actions instead of mobile drawer state.
 */
export const TabletDesktopShell: React.FC<{ onActiveConnectionDeleted: () => void }> = ({
  onActiveConnectionDeleted,
}) => {
  const { t } = useI18n();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const wideChatLayoutEnabled = useUIStore((state) => state.wideChatLayoutEnabled);
  const isNativeApp = React.useMemo(() => isCapacitorMobileApp(), []);
  const [instancesOpen, setInstancesOpen] = React.useState(false);
  const [updateOpen, setUpdateOpen] = React.useState(false);

  // The desktop App applies this class at the top level; on the mobile surface
  // the phone shell does it. Tablets get the desktop chrome, so apply it here.
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('wide-chat-layout', wideChatLayoutEnabled);
    return () => root.classList.remove('wide-chat-layout');
  }, [wideChatLayoutEnabled]);

  // The Capacitor-only Instances button in the desktop header opens the
  // connection-management dialog through a window event, mirroring how App.tsx
  // routes desktop-only events (open-session, open-mini-chat, …).
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setInstancesOpen(true);
    window.addEventListener('openchamber:open-instances', handler);
    return () => window.removeEventListener('openchamber:open-instances', handler);
  }, []);

  const openDirectory = (): string => {
    const directory = currentDirectory || useDirectoryStore.getState().currentDirectory || '';
    return directory.replace(/\\/g, '/').replace(/\/+$/, '');
  };

  const closeSurface = React.useCallback(() => {
    setInstancesOpen(false);
    setUpdateOpen(false);
  }, []);

  // Native back: close the top-most dialog, else let the system minimize.
  useNativeAndroidBackButton(() => {
    if (instancesOpen || updateOpen) {
      closeSurface();
      return true;
    }
    return false;
  });

  // Deep links that the phone shell satisfies with its drawer state map to the
  // desktop chrome here: sessions sidebar, context-panel surfaces, the windowed
  // settings dialog, and the native dialogs above.
  useDeepLinkHandlers({
    openSessions: () => {
      useUIStore.getState().setSidebarOpen(true);
    },
    openView: (target) => {
      const directory = openDirectory();
      if (target === 'files') {
        useUIStore.getState().openContextSurface(directory, 'file');
        return;
      }
      if (target === 'mcp') {
        setSettingsPage('mcp');
        useUIStore.getState().setSettingsDialogOpen(true);
        return;
      }
      if (target === 'instances') {
        setInstancesOpen(true);
        return;
      }
      if (target === 'update') {
        setUpdateOpen(true);
      }
    },
    openChanges: ({ path, staged } = {}) => {
      const directory = openDirectory();
      if (!directory) return;
      if (path) {
        useUIStore.getState().openContextDiff(directory, path, staged === true);
        return;
      }
      useUIStore.getState().openContextSurface(directory, 'git');
    },
    openSettings: (section) => {
      if (section) setSettingsPage(section);
      useUIStore.getState().setSettingsDialogOpen(true);
    },
  });

  return (
    <div className="oc-tablet-desktop-shell relative h-full bg-background text-foreground" data-page-scroll-lock="true">
      <FireworksProvider>
        <ErrorBoundary>
          <MainLayout />
        </ErrorBoundary>
      </FireworksProvider>

      {isNativeApp && instancesOpen ? (
        <MobileFullscreenSurface
          open
          variant="dialog"
          dialogAlign="app"
          onClose={() => setInstancesOpen(false)}
          ariaLabel={t('mobile.menu.instances')}
          title={t('mobile.menu.instances')}
        >
          <MobileInstancesSurface
            onConnect={closeSurface}
            onActiveConnectionDeleted={onActiveConnectionDeleted}
          />
        </MobileFullscreenSurface>
      ) : null}

      {isNativeApp && updateOpen ? (
        <MobileFullscreenSurface
          open
          variant="dialog"
          dialogAlign="app"
          onClose={() => setUpdateOpen(false)}
          ariaLabel={t('mobile.menu.update')}
          title={t('mobile.menu.update')}
        >
          <div className="h-full overflow-auto px-5 py-4">
            <AboutSettings initialUpdateDialogOpen />
          </div>
        </MobileFullscreenSurface>
      ) : null}
    </div>
  );
};
