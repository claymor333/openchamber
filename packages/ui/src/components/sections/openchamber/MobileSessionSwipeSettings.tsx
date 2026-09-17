import React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { NumberInput } from '@/components/ui/number-input';
import {
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_NUMBER_INPUT_CLASS,
  SettingsFieldRow,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  DEFAULT_MOBILE_SESSION_SWIPE_LIMIT,
  useUIStore,
} from '@/stores/useUIStore';

const MIN_LIMIT = 1;
const MAX_LIMIT = 5;

/** The install-local session navigation preference for phone and PWA surfaces. */
export const MobileSessionSwipeSettings: React.FC = () => {
  const { t } = useI18n();
  const { isMobile } = useDeviceInfo();
  const limit = useUIStore((state) => state.mobileSessionSwipeLimit);
  const setLimit = useUIStore((state) => state.setMobileSessionSwipeLimit);

  if (!isMobile) return null;

  return (
    <SettingsSection
      title={t('settings.openchamber.mobileSessionSwipe.title')}
      info={t('settings.openchamber.mobileSessionSwipe.info')}
    >
      <SettingsFieldRow
        settingsItem="sessions.mobile-swipe-limit"
        label={t('settings.openchamber.mobileSessionSwipe.field.limit')}
        info={t('settings.openchamber.mobileSessionSwipe.field.limitHint')}
      >
        <NumberInput
          value={limit}
          onValueChange={setLimit}
          min={MIN_LIMIT}
          max={MAX_LIMIT}
          step={1}
          aria-label={t('settings.openchamber.mobileSessionSwipe.field.limitAria')}
          className={cn(SETTINGS_NUMBER_INPUT_CLASS, 'tabular-nums')}
        />
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setLimit(DEFAULT_MOBILE_SESSION_SWIPE_LIMIT)}
          disabled={limit === DEFAULT_MOBILE_SESSION_SWIPE_LIMIT}
          className={SETTINGS_ICON_BUTTON_CLASS}
          aria-label={t('settings.openchamber.mobileSessionSwipe.actions.resetAria')}
          title={t('settings.common.actions.reset')}
        >
          <Icon name="restart" className="size-3.5" />
        </Button>
      </SettingsFieldRow>
    </SettingsSection>
  );
};
