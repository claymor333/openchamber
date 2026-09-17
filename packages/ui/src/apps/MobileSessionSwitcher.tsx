import React from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '@opencode-ai/sdk/v2';

import { SessionActivityDuration } from '@/components/session/SessionActivityDuration';
import { formatSessionCompactDateLabel } from '@/components/session/sidebar/utils';
import { useSwitcherItems } from '@/components/session/sidebar/shell/useSwitcherItems';
import { useTabletLayout } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { refreshGlobalSessions, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUnseenCount } from '@/sync/notification-store';
import { useHasSessionActivityDuration } from '@/sync/session-activity-timing';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionStatus } from '@/sync/sync-context';

const RECENT_SESSIONS_LIMIT = 10;
/** Matches the metadata popover's width so both header dropdowns read as a pair. */
const TABLET_POPOVER_WIDTH = 380;

const getSessionTitle = (session: Session, fallback: string): string =>
  session.title?.trim() || fallback;

/** One switcher row: live status (busy spinner / attention dot), title,
    "project · branch", compact time. Mirrors the desktop SessionSwitcherDropdown
    indicator conventions; no subsession chevrons on mobile by design. */
const SwitcherRow: React.FC<{
  session: Session;
  meta: string;
  active: boolean;
  onSelect: () => void;
}> = ({ session, meta, active, onSelect }) => {
  const { t } = useI18n();
  const status = useGlobalSessionStatus(session.id);
  const unseenCount = useSessionUnseenCount(session.id);
  const statusType = status?.type ?? 'idle';
  const isStreaming = statusType === 'busy' || statusType === 'retry';
  const showUnreadDot = !isStreaming && unseenCount > 0 && !active;
  const hasActivityDuration = useHasSessionActivityDuration(session.id, isStreaming);
  const showActivityDuration = (isStreaming || showUnreadDot) && hasActivityDuration;
  const timeLabel = formatSessionCompactDateLabel(session.time?.updated ?? session.time?.created ?? 0);

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-interactive-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        active && 'bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]',
      )}
      onClick={onSelect}
      style={{ touchAction: 'manipulation' }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('block truncate typography-ui-label', active ? 'text-primary' : 'text-foreground')}>
          {getSessionTitle(session, t('sessions.sidebar.session.untitled'))}
        </span>
        {meta ? (
          <span className="block truncate typography-micro text-muted-foreground">{meta}</span>
        ) : null}
      </span>
      {/* Activity sits on the right, before the time — no reserved left gutter. */}
      {isStreaming || showUnreadDot ? (
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isStreaming ? 'bg-primary' : 'bg-[var(--status-info)]',
          )}
          aria-hidden
        />
      ) : null}
      {/* The elapsed turn takes the time slot while it matters, then hands it
          back to the relative timestamp. */}
      {showActivityDuration ? (
        <SessionActivityDuration
          sessionId={session.id}
          running={isStreaming}
          className="typography-micro"
        />
      ) : timeLabel ? (
        <span className="shrink-0 typography-micro text-muted-foreground tabular-nums">{timeLabel}</span>
      ) : null}
    </button>
  );
};

/** Recent-sessions popover under the mobile header, opened by tapping the
    session title. Same visual family as the metadata/usage overlay. */
export const MobileSessionSwitcher: React.FC<{
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: 'top' | 'bottom';
}> = ({ open, onClose, anchorRef, placement = 'top' }) => {
  const { t } = useI18n();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = React.useState(open);
  const [isExiting, setIsExiting] = React.useState(false);
  // Tablet: a phone-width sheet stretched across the whole chat column looks
  // broken — anchor a popover under the title instead. Mirror image of the
  // metadata/usage popover, which anchors to the ring on the right.
  const { enabled: isTabletLayout } = useTabletLayout();
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const [visualViewportHeight, setVisualViewportHeight] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !shouldRender) return;
    const compute = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      setAnchorRect(anchorRect ?? null);
      setVisualViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    };
    compute();
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', compute);
    visualViewport?.addEventListener('scroll', compute);
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(compute) : null;
    if (observer && anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      visualViewport?.removeEventListener('resize', compute);
      visualViewport?.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
      observer?.disconnect();
    };
  }, [anchorRef, open, shouldRender]);

  const isPopover = isTabletLayout && anchorRect !== null;
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const setActiveProjectIdOnly = useProjectsStore((state) => state.setActiveProjectIdOnly);

  const items = useSwitcherItems(open || shouldRender, { maxParents: RECENT_SESSIONS_LIMIT });

  React.useEffect(() => {
    if (open) {
      // Fresh authoritative snapshot on open — updated stamps re-sort recents
      // (see raiseSessionOrderingBaselines) while the cached list shows first.
      void refreshGlobalSessions();
      setShouldRender(true);
      setIsExiting(false);
      return;
    }
    if (!shouldRender) return;
    setIsExiting(true);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
    }, 140);
    return () => window.clearTimeout(timeoutId);
  }, [open, shouldRender]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        onClose();
        return;
      }
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', closeIfOutside, true);
    return () => document.removeEventListener('pointerdown', closeIfOutside, true);
  }, [anchorRef, onClose, open]);

  const handleSelect = React.useCallback((session: Session) => {
    void setCurrentSession(session.id, resolveGlobalSessionDirectory(session));
    onClose();
  }, [onClose, setCurrentSession]);

  if (!shouldRender || !globalThis.document) return null;

  return createPortal((
      <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('sessions.switcher.openAria')}
          className={cn(
            'oc-surface-elevated flex flex-col overflow-hidden rounded-[20px] border border-border/70 bg-surface-elevated p-2 shadow-[0_12px_32px_rgb(0_0_0_/_0.2)] will-change-transform',
            isPopover ? 'absolute origin-top-left' : 'absolute inset-x-3',
            isExiting ? 'pointer-events-none' : 'pointer-events-auto',
          )}
          style={{
            animation: `${isExiting ? 'session-switcher-out' : 'session-switcher-in'} ${isExiting ? 140 : 170}ms cubic-bezier(0.32, 0.72, 0, 1) forwards`,
            maxHeight: `min(72dvh, ${Math.max(0, (visualViewportHeight ?? window.innerHeight) - 16)}px)`,
            ...(isPopover
              ? {
                left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - TABLET_POPOVER_WIDTH - 8)),
                width: `min(${TABLET_POPOVER_WIDTH}px, calc(100vw - 16px))`,
                ...(placement === 'bottom'
                  ? { bottom: Math.max(8, window.innerHeight - anchorRect.top + 8) }
                  : { top: anchorRect.bottom + 8 }),
              }
              : placement === 'bottom' && anchorRect
                ? {
                  bottom: Math.max(8, window.innerHeight - anchorRect.top + 8),
                }
                : {
                  top: anchorRect ? anchorRect.bottom + 8 : 'calc(var(--oc-safe-area-top, 0px) + var(--oc-header-height, 56px) + 8px)',
                }),
          }}
      >
        <div className="oc-hide-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center typography-small text-muted-foreground">
              {t('sessions.switcher.empty')}
            </p>
          ) : (
            items.map((item) => {
              const session = item.node.session;
              const meta = [item.secondaryMeta?.projectLabel, item.secondaryMeta?.branchLabel]
                .filter(Boolean)
                .join(' · ');
              return (
                <SwitcherRow
                  key={session.id}
                  session={session}
                  meta={meta}
                  active={session.id === currentSessionId}
                  onSelect={() => {
                    if (item.projectId) setActiveProjectIdOnly(item.projectId);
                    handleSelect(session);
                  }}
                />
              );
            })
          )}
        </div>
      </div>
      <style>{`
        @keyframes session-switcher-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes session-switcher-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-6px) scale(0.985); }
        }
      `}</style>
      </div>
  ), document.body);
};
