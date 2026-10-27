import React from 'react';

type MobileTabletChatFrameProps = {
  enabled: boolean;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  overlay?: React.ReactNode;
  rail?: React.ReactNode;
  children: React.ReactNode;
};

/** Breakpoint chrome is adjacent to chat, never an ancestor that replaces it. */
export const MobileTabletChatFrame: React.FC<MobileTabletChatFrameProps> = ({
  enabled,
  leftPanel,
  rightPanel,
  bottomPanel,
  overlay,
  rail,
  children,
}) => (
  <div className="relative flex min-h-0 flex-1 overflow-hidden" data-page-scroll-lock="true" data-workspace-row>
    {enabled ? leftPanel : null}
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" data-page-scroll-lock="true" data-chat-area>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-workspace-chat>
        {children}
        {enabled ? bottomPanel : null}
      </div>
      {enabled ? rightPanel : null}
      {enabled ? overlay : null}
    </div>
    {enabled ? rail : null}
  </div>
);
