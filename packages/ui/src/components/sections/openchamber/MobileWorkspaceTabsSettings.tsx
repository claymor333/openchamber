import React from 'react';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { SettingsSortableVisibilityList } from '@/components/sections/shared/SettingsSortableVisibilityList';
import { isResourceMonitorMobileReady, RESOURCE_MONITOR_GUEST_ID } from '@/lib/guests/mobile-support';
import { loadGuestCatalog } from '@/lib/guests/load-catalog';
import { useGuestsStore } from '@/lib/guests/store';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { orderMobileWorkspaceTabs, shownMobileWorkspaceTabs, type MobileWorkspaceTab } from '@/lib/mobileWorkspaceTabs';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useUIStore } from '@/stores/useUIStore';

const TAB_LABEL_KEYS = {
  changes: 'mobile.menu.git',
  files: 'mobile.menu.files',
  terminal: 'mobile.menu.terminal',
  notes: 'contextRail.surface.notes',
  mcp: 'mobile.menu.mcp',
  'resource-monitor': 'settings.integrations.extensionCatalog.resourceMonitor.name',
} satisfies Record<MobileWorkspaceTab, I18nKey>;

/**
 * Order and visibility of the mobile workspace panel tabs. Stored per
 * device: mobile and desktop are set up apart. The last tab shown cannot be
 * hidden.
 */
export const MobileWorkspaceTabsSettings: React.FC = () => {
  const { t } = useI18n();
  const order = useUIStore((state) => state.mobileWorkspaceTabOrder);
  const hidden = useUIStore((state) => state.mobileWorkspaceHiddenTabs);
  const setOrder = useUIStore((state) => state.setMobileWorkspaceTabOrder);
  const setVisible = useUIStore((state) => state.setMobileWorkspaceTabVisible);
  const catalogStatus = useGuestsStore((state) => state.status);
  const resourceMonitorAvailable = useGuestsStore((state) => {
    if (state.status !== 'ready' || state.runtimeKey !== getRuntimeKey()) return false;
    return isResourceMonitorMobileReady(state.guests.find((guest) => guest.id === RESOURCE_MONITOR_GUEST_ID));
  });

  React.useEffect(() => {
    if (catalogStatus === 'idle') void loadGuestCatalog();
  }, [catalogStatus]);

  const items = React.useMemo(() => {
    const shown = shownMobileWorkspaceTabs(order, hidden, resourceMonitorAvailable);
    return orderMobileWorkspaceTabs(order, resourceMonitorAvailable).map((id) => ({
      id,
      label: t(TAB_LABEL_KEYS[id]),
      visible: shown.includes(id),
      locked: shown.length === 1 && shown.includes(id),
    }));
  }, [hidden, order, resourceMonitorAvailable, t]);

  return (
    <SettingsSection
      title={t('settings.layout.general.mobileTabs.title')}
      info={t('settings.layout.general.mobileTabs.info')}
      settingsItem="layout.mobile-workspace-tabs"
    >
      <SettingsSortableVisibilityList
        items={items}
        onVisibleChange={(id, visible) => {
          const tab = items.find((item) => item.id === id)?.id;
          if (tab) setVisible(tab, visible);
        }}
        onReorder={setOrder}
        settingsItemPrefix="layout.mobile-workspace-tabs."
        dragInstructions={t('settings.layout.general.mobileTabs.dragInstructions')}
      />
    </SettingsSection>
  );
};
