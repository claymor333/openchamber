import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { RESOURCE_MONITOR_GUEST_ID } from '@/lib/guests/mobile-support';
import { useI18n } from '@/lib/i18n';
import { readMobileWorkspaceActivity } from '@/lib/mobileWorkspaceActivity';
import { shouldMountMobileResourceMonitorPane, type MobileWorkspaceTab } from '@/lib/mobileWorkspaceTabs';

const ResourceMonitorPluginPane = React.lazy(async () => {
  const module = await import('@/components/layout/PluginPane');
  return { default: module.PluginPane };
});

export type MobileResourceMonitorSurfaceState = {
  surfaceVisible: boolean;
  guestAvailable: boolean;
  documentVisible: boolean;
  nativeAppActive: boolean;
  isNativeApp: boolean;
  runtimeKey: string;
};

export type MobileResourceMonitorPaneProps = MobileResourceMonitorSurfaceState & {
  workspaceOpen: boolean;
  tab: MobileWorkspaceTab;
};

/** Only mount the guest frame while its mobile workspace surface can be seen. */
export const MobileResourceMonitorPane: React.FC<MobileResourceMonitorPaneProps> = (state) => {
  const { t } = useI18n();
  if (!shouldMountMobileResourceMonitorPane(state)) return null;

  const isActive = () => {
    const activity = readMobileWorkspaceActivity(state.isNativeApp);
    return shouldMountMobileResourceMonitorPane({
      ...state,
      documentVisible: activity.documentVisible,
      nativeAppActive: activity.nativeAppActive,
    });
  };

  return (
    <div className="h-full min-h-0">
      <ErrorBoundary>
        <React.Suspense
          fallback={(
            <div role="status" className="flex h-full min-h-0 items-center justify-center text-muted-foreground">
              <Icon name="loader" className="size-4 animate-spin" />
              <span className="sr-only">{t('common.loading')}</span>
            </div>
          )}
        >
          <ResourceMonitorPluginPane
            key={state.runtimeKey}
            mode={`plugin:${RESOURCE_MONITOR_GUEST_ID}`}
            surface="panel"
            isActive={isActive}
          />
        </React.Suspense>
      </ErrorBoundary>
    </div>
  );
};
