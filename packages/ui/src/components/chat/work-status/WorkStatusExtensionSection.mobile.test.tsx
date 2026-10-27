import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { DedicatedMobileAppProvider, type MobileAppActions } from '@/apps/mobileAppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RESOURCE_MONITOR_MOBILE_SOURCE_URL } from '@/lib/guests/mobile-support';
import { useGuestsStore } from '@/lib/guests/store';
import type { InstalledGuest } from '@/lib/guests/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { MobileWorkspaceActivityProvider, type MobileWorkspaceActivity } from '@/lib/mobileWorkspaceActivity';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { useWorkStatusExtensionSections } from './useWorkStatusExtensionSections';
import { isWorkStatusSectionVisible } from './sections';
import { WorkStatusPresenceProvider } from './presence';
import { WorkStatusExtensionSection } from './WorkStatusExtensionSection';

const resourceMonitor = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'resource-monitor',
  name: 'Resource Monitor',
  icon: 'pulse',
  version: '1.4.1',
  source: 'git',
  origin: { url: RESOURCE_MONITOR_MOBILE_SOURCE_URL },
  service: { runtime: 'host', granted: true },
  capabilities: { requested: ['service'], granted: ['service'] },
  statusSource: { path: '/api/status', interval: 60_000 },
  ...overrides,
});

const mobileActions: MobileAppActions = {
  sharedContextPanelsAvailable: true,
  openChanges: () => undefined,
  openFiles: () => undefined,
  openSettings: () => undefined,
  openSourceBoard: () => undefined,
};

const view = {
  rows: [
    { kind: 'line', id: 'cpu', label: 'Host CPU', value: '25%' },
    {
      kind: 'line', id: 'ports', label: 'Ports',
      content: { kind: 'chips', chips: [{ id: 'local', label: ':5173', url: 'http://127.0.0.1:5173' }] },
    },
    {
      kind: 'line', id: 'memory-history', label: 'Memory history',
      content: { kind: 'chart', values: [20, 30, 25], max: 100, unit: 'percent', step: 1 },
    },
    {
      kind: 'line', id: 'job', label: 'Build',
      actions: [{ kind: 'button', id: 'stop-build', label: 'Stop', confirm: 'Stop build?' }],
    },
  ],
  controls: [{ kind: 'button', id: 'refresh', label: 'Refresh' }],
};

const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const activity = (overrides: Partial<MobileWorkspaceActivity> = {}): MobileWorkspaceActivity => ({
  documentVisible: true,
  nativeAppActive: true,
  dialogOpen: false,
  workspaceSurfaceVisible: true,
  ...overrides,
});

test('the tablet Work Status hook and source section obey approval, visibility, lifecycle, and host URL boundaries', async () => {
  const dom = new Window({ url: 'http://status.test/?surface=mobile' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    localStorage: dom.localStorage,
    PointerEvent: dom.PointerEvent,
    MouseEvent: dom.MouseEvent,
    HTMLInputElement: dom.HTMLInputElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const runtimeKey = getRuntimeKey();
  const previousGuests = useGuestsStore.getState();
  const previousUI = useUIStore.getState();
  const previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: 'http://status.test' });
  Object.defineProperty(dom, '__OPENCHAMBER_SURFACE__', { configurable: true, writable: true, value: 'mobile' });
  useUIStore.setState({ workStatusExpandedSections: {}, workStatusHiddenSections: [] });
  useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
  useGuestsStore.getState().replaceCatalog([resourceMonitor()], runtimeKey);

  const reads: Array<{ path: string; directory?: string; locale?: string }> = [];
  let holdNextRead = false;
  let releaseHeldRead: () => void = () => undefined;
  let heldReadStarted = false;
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (!target.includes('/api/guests/resource-monitor/service/request')) return Response.json({});
    const body = JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : '{}')));
    if (body.method === 'GET') {
      reads.push(body.query ? { path: body.path, ...body.query } : { path: body.path });
      if (holdNextRead) {
        holdNextRead = false;
        heldReadStarted = true;
        return new Promise<Response>((resolve) => {
          releaseHeldRead = () => resolve(Response.json({ status: 200, body: JSON.stringify(view) }));
        });
      }
      return Response.json({ status: 200, body: JSON.stringify(view) });
    }
    return Response.json({ status: 204, body: '' });
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const StatusSections: React.FC<{ active: boolean }> = ({ active }) => {
    const sections = useWorkStatusExtensionSections();
    const hidden = useUIStore((state) => state.workStatusHiddenSections);
    return (
      <WorkStatusPresenceProvider onChange={() => undefined}>
        {sections.ids.map((id) => {
          const guest = sections.byId.get(id);
          if (!guest || !isWorkStatusSectionVisible(hidden, id)) return null;
          return <WorkStatusExtensionSection key={id} guest={guest} directory="/repo" active={active} />;
        })}
      </WorkStatusPresenceProvider>
    );
  };
  const render = async (active: boolean, activity: MobileWorkspaceActivity) => {
    await act(async () => root.render(
      <I18nProvider>
        <TooltipProvider>
          <DedicatedMobileAppProvider actions={mobileActions}>
            <MobileWorkspaceActivityProvider activity={activity}>
              <StatusSections active={active} />
            </MobileWorkspaceActivityProvider>
          </DedicatedMobileAppProvider>
        </TooltipProvider>
      </I18nProvider>,
    ));
    await settle();
  };
  const replaceCatalog = async (guests: InstalledGuest[], key = runtimeKey) => act(async () => {
    useGuestsStore.getState().resetForRuntimeSwitch(key);
    useGuestsStore.getState().replaceCatalog(guests, key);
  });

  try {
    await render(true, activity({ nativeAppActive: false }));
    expect(reads).toEqual([]);

    await render(true, activity());
    expect(reads).toEqual([{ path: '/api/status', directory: '/repo', locale: 'en' }]);
    expect(container.querySelector('iframe')).toBeNull();
    const portChip = [...container.querySelectorAll('span')].find((element) => element.textContent === ':5173');
    expect(portChip).toBeTruthy();
    expect(portChip?.closest('button, a')).toBeNull();
    expect(container.querySelector('[dir="ltr"]')).toBeTruthy();

    const section = container.querySelector('[data-work-status-section="ext:resource-monitor"]');
    const heading = section?.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!section || !heading) throw new Error('Resource Monitor Work Status section did not render');
    expect(heading.classList.contains('min-h-10')).toBe(true);
    const stop = [...section.querySelectorAll('button')].find((button) => button.textContent?.includes('Stop'));
    const refresh = [...section.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Refresh');
    expect(stop?.classList.contains('min-h-10')).toBe(true);
    expect(refresh?.classList.contains('min-h-10')).toBe(true);

    await act(async () => heading.click());
    expect(container.querySelector('[data-guest-status-body="resource-monitor"]')).toBeNull();
    expect(reads).toHaveLength(1);
    await act(async () => heading.click());
    await settle();
    expect(reads).toHaveLength(2);

    // The card remains mounted during its fade while a context panel covers it.
    await render(false, activity());
    expect(reads).toHaveLength(2);
    await render(true, activity());
    expect(reads).toHaveLength(3);

    await act(async () => useUIStore.getState().setWorkStatusSectionVisible('ext:resource-monitor', false));
    expect(container.querySelector('[data-guest-status-body="resource-monitor"]')).toBeNull();
    expect(reads).toHaveLength(3);
    await act(async () => useUIStore.getState().setWorkStatusSectionVisible('ext:resource-monitor', true));
    await settle();
    expect(reads).toHaveLength(4);

    await render(true, activity({ nativeAppActive: false }));
    expect(reads).toHaveLength(4);
    await render(true, activity());
    expect(reads).toHaveLength(5);

    await render(true, activity({ documentVisible: false }));
    expect(reads).toHaveLength(5);
    await render(true, activity());
    expect(reads).toHaveLength(6);

    // MobileApp lowers workspaceSurfaceVisible for Settings/Instances/Plans,
    // run overview and chatCovered; each dismiss starts one fresh poll chain.
    await render(true, activity({ workspaceSurfaceVisible: false }));
    expect(reads).toHaveLength(6);
    await render(true, activity());
    expect(reads).toHaveLength(7);
    await render(true, activity({ workspaceSurfaceVisible: false }));
    expect(reads).toHaveLength(7);
    await render(true, activity());
    expect(reads).toHaveLength(8);

    // Radix's html marker covers the card, including its own SectionsDialog.
    await render(false, activity({ dialogOpen: true }));
    expect(reads).toHaveLength(8);
    await render(true, activity());
    expect(reads).toHaveLength(9);

    await act(async () => useGuestsStore.setState({ status: 'loading' }));
    expect(container.querySelector('[data-guest-status-body="resource-monitor"]')).toBeNull();
    expect(reads).toHaveLength(9);
    await replaceCatalog([resourceMonitor({ capabilities: { requested: ['service'], granted: [] } })]);
    expect(container.querySelector('[data-work-status-section="ext:resource-monitor"]')).toBeNull();
    expect(reads).toHaveLength(9);

    holdNextRead = true;
    await replaceCatalog([resourceMonitor()]);
    await settle();
    expect(reads).toHaveLength(10);
    if (!heldReadStarted) throw new Error('The pending host status read did not start');
    await act(async () => useGuestsStore.getState().resetForRuntimeSwitch(`${runtimeKey}:other`));
    releaseHeldRead();
    await settle();
    expect(container.textContent).not.toContain('Host CPU');
    expect(container.querySelector('[data-work-status-controls]')).toBeNull();
    expect(reads).toHaveLength(10);
  } finally {
    await act(async () => root.unmount());
    fetch.mockRestore();
    setRuntimeUrlResolver(previousResolver);
    useGuestsStore.setState(previousGuests, true);
    useUIStore.setState(previousUI, true);
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
