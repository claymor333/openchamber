# VS Code application roots

## Ownership

`VSCodeApp` composes the shared runtime, theme and sync contexts for VS Code webviews. The extension host selects the root's `panelType` in its bootstrap document. `VSCodeLayout` owns chat/session navigation; `SettingsView` owns Settings pages and responsive navigation. The native panel lifecycle belongs to `packages/vscode/src`, documented there.

## Invariants

- Chat-side Settings entry points request the native Settings tab through `RuntimeAPIs.vscode`. They preserve chat selection, drafts and the current layout. The source's in-page dialog flag is cleared so it cannot block chat shortcuts.
- Only the Settings root receives page navigation. The bridge parses it before applying it to stores, and the mounted root signals readiness before the host consumes pending navigation.
- The Settings root supplies no selected directory to the shared sync provider. It does not start global session polling, selected-directory session bootstrap or background queue delivery/cleanup, and seeing it never marks a chat as viewed. Settings pages resolve their own project through `useSettingsDirectory`; catalog updates still use the shared sync context.
- Its runtime shortcut hook registers Settings actions only and requires no chat sync context. Chat, model and session shortcuts remain with chat roots, so a key pressed in Settings cannot create an unseen draft or change a session selection there. Escape reaches an input or menu before the tab's close handler.
- Settings uses the existing persistence and broadcast protocol. Moving its host changes no stored format, registry key or runtime availability.

## Decisions

### Why navigation carries intent and not the source's stores

Each webview owns its own stores. A small parsed request preserves the originating Settings directory, page links, provider-connect action and new-snippet action without transferring chat state or overwriting the tab's independently edited settings.

## Mobile application root

`MobileApp` owns the sessions sidebar, the narrow workspace drawer and the tablet
context-panel handoff. `MobileTabletContextWorkspace` keeps the chat frame and
`ZoneFitArbiter` mounted as the viewport changes; only the side-panel chrome and
fit watcher are enabled in the roomy layout. The tablet context panes stay
mounted after the shell first recognizes a tablet, including when a fold or
software keyboard switches it back to the drawer.

The mobile shell has one `MobileFileEditor` owner. `MobileFilesSurface` and the
shared file pane provide host elements; `MovablePane` moves its stable DOM host
between them, preserving the editor component, dirty buffer, selection, focus
and pending autosave timer. Detaching or changing host never saves or discards
the buffer. The active file target is scoped to runtime, project directory and
content root before it can be handed to the shared file tab. The mobile Changes
route reports its current per-file path and staged state with the same runtime
and directory scope; on navigation back to the list it clears that handoff.
There is no second drawer editor and no cross-runtime draft cache.

The mobile root keeps `FireworksProvider` inside `RuntimeAPIProvider` and around
the shared shell. Tablet context panels include `GitView`, which consumes
`useFireworksCelebration`; opening that surface must receive the same provider
context as the main app and VS Code roots.

`MobileTabletContextWorkspace` passes `touchTargets` to the same three shared
zones; their edge geometry and resize invariants are documented in
`../components/layout/DOCUMENTATION.md`.

Mobile loads only the curated Resource Monitor panel. On roomy tablets it is a
normal shared context surface, available after the connected host reports the
approved, enabled package from the owned Git origin at version 1.4.1 or newer;
phones and narrow layouts expose it in the workspace drawer instead. Its iframe
is mounted only while that surface is active and visible, including document
and native-app activity, so hidden panels do not keep sampling the host service.
On tablets, its host-drawn `statusSource` may also appear in the existing Work
Status panel while that card owns the right slot. It stops reading when the card
is covered, the section is folded or hidden, the document is hidden, or the
native app backgrounds. Port chips there are informational; mobile never opens
a connected-host loopback URL in the device browser. Phones and narrow layouts
still have no Work Status panel. Other extension panels, actions, pages, attach
rows and status contributions remain unsupported on mobile.

`DedicatedMobileAppProvider.sharedContextPanelsAvailable` mirrors
`workspaceAsPanel`, the condition that mounts the tablet rail and zones. Chat
uses this narrow capability for the work-status panel and subagent side-chat
routing; it does not change the mobile runtime identity or phone behavior. The
mobile header's work-status toggle exists only while that shared layout is
mounted. The panel keeps the shared right-slot reservation and width-threshold
behavior, and yields to the context panel without changing the main session.
The mobile root owns one document/native/root-class activity subscription and
publishes it through `lib/mobileWorkspaceActivity`. It includes the current
`workspaceSurfaceVisible` decision (fullscreen surfaces, plans, run overview and
chat coverage) plus the shared `oc-dialog-open` marker. Work Status readers use
this context instead of installing per-section listeners, so covered cards stop
reading and a dialog or surface dismissal starts one fresh poll chain. Unrelated
root-class changes preserve the activity snapshot identity.
The session metadata donut and dropdown mount only in the drawer layout. Entering
the shared layout unmounts its trigger and message/quota subscriptions and resets
the parent open state, so returning to the drawer does not reopen stale metadata.
The recent-session popover uses the app overlay layer above tablet context zones
and their local resize handles, while full-screen sheets, dialogs and drag-zone
overlays stay above it. Its chat-column anchor and direction-aware geometry stay
unchanged.

When the fit watcher is suspended in the drawer layout, its fold reason remains
in the mounted arbiter. A manual sessions-sidebar toggle clears that reason, so
only an automatic fold the user has not overridden is restored when the shared
panels return. Phones keep the drawer presentation.
