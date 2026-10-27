import { expect, test } from 'bun:test';
import { OpenCode } from '@opencode/client';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { DedicatedMobileAppProvider, type MobileAppActions } from '@/apps/mobileAppContext';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { I18nProvider } from '@/lib/i18n';
import { MobileWorkspaceActivityProvider, type MobileWorkspaceActivity } from '@/lib/mobileWorkspaceActivity';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { createRuntimeUrlResolver } from '@/lib/runtime-url';
import { useGuestsStore } from '@/lib/guests/store';
import { SyncProvider } from '@/sync/sync-context';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { createWebAPIs } from '../../../../../web/src/api/index';
import { WORK_STATUS_SECTION_IDS } from './sections';
import { WorkStatusPanel } from './WorkStatusPanel';
import { WorkStatusCollapsibleSection } from './WorkStatusPrimitives';

const activity: MobileWorkspaceActivity = {
  documentVisible: true,
  nativeAppActive: true,
  dialogOpen: false,
  workspaceSurfaceVisible: true,
};

const mobileActions: MobileAppActions = {
  sharedContextPanelsAvailable: true,
  openChanges: () => undefined,
  openFiles: () => undefined,
  openSettings: () => undefined,
  openSourceBoard: () => undefined,
};

test('touch sections control aligns with the first heading; desktop stays compact', async () => {
  const dom = new Window({ url: 'http://status.test/?surface=mobile' });
  const mockFetch: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/event')) {
      return new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    if (url.endsWith('/api/session-warming')) {
      return Response.json({ revision: 0, enabled: false, minutes: 60, sessions: [] });
    }
    if (url.endsWith('/api/fs/home')) return Response.json({ home: '/home/test' });
    return Response.json({});
  };
  Object.defineProperty(dom, 'fetch', { configurable: true, value: mockFetch });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    Node: dom.Node,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    HTMLButtonElement: dom.HTMLButtonElement,
    HTMLInputElement: dom.HTMLInputElement,
    SVGElement: dom.SVGElement,
    Document: dom.Document,
    DOMRect: dom.DOMRect,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    localStorage: dom.localStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    fetch: mockFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const previousUi = useUIStore.getState();
  const previousGuests = useGuestsStore.getState();
  const previousProjects = useProjectsStore.getState();
  const runtimeKey = getRuntimeKey();
  const sdk = OpenCode.make({ baseUrl: 'http://status.test', fetch: mockFetch });
  const apis = createWebAPIs({ urls: createRuntimeUrlResolver({ apiBaseUrl: 'http://status.test' }) });
  const render = async (touchTargets: boolean) => act(async () => root.render(
    <SyncProvider sdk={sdk} directory="/work-status-layout">
      <I18nProvider>
        <RuntimeAPIContext.Provider value={apis}>
          {touchTargets ? (
            <DedicatedMobileAppProvider actions={mobileActions}>
              <MobileWorkspaceActivityProvider activity={activity}>
                <WorkStatusPanel sessionId={null} directory={null} visible />
                <WorkStatusCollapsibleSection id="layout-probe" title="Monitor" defaultExpanded>
                  <span>Status</span>
                </WorkStatusCollapsibleSection>
              </MobileWorkspaceActivityProvider>
            </DedicatedMobileAppProvider>
          ) : (
            <WorkStatusPanel sessionId={null} directory={null} visible />
          )}
        </RuntimeAPIContext.Provider>
      </I18nProvider>
    </SyncProvider>,
  ));

  const panel = () => container.querySelector('aside');
  const sectionsButton = () => panel()?.querySelector<HTMLButtonElement>('button[aria-label="Choose sections"]') ?? null;
  const sectionElements = (scroller: HTMLElement) => Array.from(scroller.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'SECTION',
  );

  try {
    useGuestsStore.getState().resetForRuntimeSwitch(runtimeKey);
    useGuestsStore.getState().replaceCatalog([], runtimeKey);
    useProjectsStore.setState({
      projects: [{ id: 'layout-project', path: '/work-status-layout', label: 'Project' }],
      activeProjectId: 'layout-project',
    });
    useUIStore.setState({
      workStatusSectionOrder: [...WORK_STATUS_SECTION_IDS],
      workStatusHiddenSections: [],
      workStatusExpandedSections: {},
    });

    await render(true);
    const touchPanel = panel();
    const touchButton = sectionsButton();
    const scroller = touchPanel?.querySelector<HTMLElement>('.oc-hide-scrollbar');
    const collapsibleHeading = container.querySelector<HTMLElement>('[data-work-status-section="layout-probe"] [data-work-status-heading]');
    if (!touchButton || !scroller || !collapsibleHeading) throw new Error('Expected Work Status layout elements');
    const touchSections = sectionElements(scroller);
    const firstHeading = touchSections[0]?.querySelector<HTMLElement>('[data-work-status-heading]');
    const projectHeading = touchSections[1]?.querySelector<HTMLElement>('[data-work-status-heading]');
    if (!firstHeading || !projectHeading) throw new Error('Expected Session and Project headings');

    expect(firstHeading.querySelector('h3')?.textContent).toBe('Session');
    expect(projectHeading.querySelector('h3')?.textContent).toBe('Project');
    expect(firstHeading.className).not.toContain('min-h-10');
    expect(projectHeading.className).not.toContain('min-h-10');
    expect(collapsibleHeading.className).toContain('min-h-10');
    expect(scroller.className).toContain('[&>section:first-child>[data-work-status-heading]]:min-h-10');
    expect(touchSections[1]?.className).toContain('[&:not(:first-child)]:mt-2');
    expect(touchButton.className).toContain('flex');
    expect(touchButton.className).toContain('items-center');
    expect(touchButton.className).toContain('justify-center');
    expect(touchButton.className).toContain('min-h-10');
    expect(touchButton.className).toContain('min-w-10');
    expect(touchButton.className).toContain('inset-e-0');
    expect(touchButton.className).toContain('top-2');
    expect(touchButton.querySelector('svg')?.getAttribute('class')).toContain('size-4');
    expect(scroller.className).toContain('pe-10');
    expect(scroller.className).toContain('p-2');

    const reordered = [...WORK_STATUS_SECTION_IDS];
    const projectIndex = reordered.indexOf('repository');
    if (projectIndex > 0) reordered.unshift(...reordered.splice(projectIndex, 1));
    await act(async () => useUIStore.setState({ workStatusSectionOrder: reordered }));
    const reorderedSections = sectionElements(scroller);
    expect(reorderedSections[0]?.querySelector('h3')?.textContent).toBe('Project');
    expect(reorderedSections[0]?.querySelector('[data-work-status-heading]')?.className).not.toContain('min-h-10');
    await act(async () => useUIStore.setState({ workStatusHiddenSections: ['repository'] }));
    expect(sectionElements(scroller)[0]?.querySelector('h3')?.textContent).toBe('Session');

    dom.document.documentElement.dir = 'rtl';
    expect(dom.document.documentElement.dir).toBe('rtl');
    expect(touchButton.className).toContain('inset-e-0');
    expect(scroller.className).toContain('pe-10');

    await act(async () => useUIStore.setState({ workStatusHiddenSections: [...WORK_STATUS_SECTION_IDS] }));
    expect(panel()?.textContent).toContain('No sections selected');
    expect(sectionsButton()?.className).toContain('min-h-10');

    await act(async () => useUIStore.setState({ workStatusHiddenSections: [] }));
    await render(false);
    const desktopPanel = panel();
    const desktopButton = sectionsButton();
    const desktopHeading = desktopPanel?.querySelector<HTMLElement>('[data-work-status-heading]');
    const desktopScroller = desktopPanel?.querySelector<HTMLElement>('.oc-hide-scrollbar');
    if (!desktopButton || !desktopHeading || !desktopScroller) throw new Error('Expected compact desktop Work Status layout');
    expect(desktopButton.className).toContain('inset-e-2');
    expect(desktopButton.className).toContain('top-1.5');
    expect(desktopButton.className).not.toContain('min-h-10');
    expect(desktopButton.className).not.toContain('min-w-10');
    expect(desktopHeading.className).not.toContain('min-h-10');
    expect(desktopScroller.className).toContain('pe-7');
    expect(desktopScroller.className).not.toContain('pe-10');
    expect(desktopScroller.className).not.toContain('min-h-10');
    const desktopSections = sectionElements(desktopScroller);
    expect(desktopSections[1]?.className).toContain('[&:not(:first-child)]:mt-5');
    expect(desktopSections[1]?.querySelector('[data-work-status-heading]')?.className).not.toContain('min-h-10');
  } finally {
    await act(async () => root.unmount());
    useUIStore.setState(previousUi, true);
    useGuestsStore.setState(previousGuests, true);
    useProjectsStore.setState(previousProjects, true);
    await dom.happyDOM.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
