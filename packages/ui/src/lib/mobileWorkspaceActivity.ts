import React from 'react';

export type MobileWorkspaceActivity = {
  documentVisible: boolean;
  nativeAppActive: boolean;
  dialogOpen: boolean;
  workspaceSurfaceVisible: boolean;
};

const MobileWorkspaceActivityContext = React.createContext<MobileWorkspaceActivity | null>(null);

/** The mobile shell shares its single lifecycle subscription with mounted features. */
export const MobileWorkspaceActivityProvider: React.FC<{
  activity: MobileWorkspaceActivity;
  children: React.ReactNode;
}> = ({ activity, children }) => (
  React.createElement(MobileWorkspaceActivityContext.Provider, { value: activity }, children)
);

/** The browser document, or null where there is none; `in` probes the global object without a typeof check. */
const readBrowserDocument = (): Document | null => ('document' in globalThis ? globalThis.document : null);

export const readMobileWorkspaceActivity = (isNativeApp: boolean): MobileWorkspaceActivity => {
  const doc = readBrowserDocument();
  return {
    documentVisible: doc?.visibilityState === 'visible',
    nativeAppActive: !isNativeApp || (doc?.documentElement.classList.contains('oc-native-app-active') ?? false),
    dialogOpen: doc?.documentElement.classList.contains('oc-dialog-open') ?? false,
    workspaceSurfaceVisible: true,
  };
};

/** Subscribe once to document, native and modal activity at the mobile root. */
export const useMobileWorkspaceActivity = (isNativeApp: boolean): MobileWorkspaceActivity => {
  const readActivity = React.useCallback(() => readMobileWorkspaceActivity(isNativeApp), [isNativeApp]);
  const [activity, setActivity] = React.useState(readActivity);

  React.useEffect(() => {
    const doc = readBrowserDocument();
    if (!doc) return;
    const update = () => setActivity((previous) => {
      const next = readActivity();
      return previous.documentVisible === next.documentVisible
        && previous.nativeAppActive === next.nativeAppActive
        && previous.dialogOpen === next.dialogOpen
        && previous.workspaceSurfaceVisible === next.workspaceSurfaceVisible
        ? previous
        : next;
    });
    doc.addEventListener('visibilitychange', update);
    const observer = 'MutationObserver' in globalThis
      ? new MutationObserver(update)
      : null;
    observer?.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    update();
    return () => {
      doc.removeEventListener('visibilitychange', update);
      observer?.disconnect();
    };
  }, [isNativeApp, readActivity]);

  return activity;
};
