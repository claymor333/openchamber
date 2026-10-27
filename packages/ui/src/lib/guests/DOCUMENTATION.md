# Guest catalog and mobile Resource Monitor

## Supported surfaces

- Web and Electron load the existing full guest catalog and keep their current
  panels, actions, pages, status contributions, file editors and capability
  approval behavior.
- VS Code keeps the catalog `unsupported`.
- Hosted mobile and Capacitor clients load the authenticated catalog but filter
  it to the curated `resource-monitor` id. The mobile panel requires version
  `1.4.1` or newer from the owned `claymor333/openchamber-resource-monitor`
  repository, enabled state and the existing approved `service` grant.
  On roomy tablets, its approved host-drawn `statusSource` can also contribute
  to the already-supported Work Status panel. Phones, narrow layouts, generic
  `statusEntry` frames and all other guest contributions remain unavailable.

The Resource Monitor is owned by its separate extension package. Mobile mounts
its existing sandboxed `PluginPane` in the right workspace; it does not copy the
sampling service into core or collect phone-local metrics. The service runs on
the connected OpenChamber server. The frame's `window.name` marker
`openchamber-resource-monitor-mobile` lets that package render server ports as
read-only information on mobile. The host also refuses to send server-loopback
URLs to the phone's system browser. The Work Status renderer applies the same
boundary by displaying status-source URL chips as non-interactive information.
Its host-drawn source also consumes the mobile root activity snapshot: workspace
surfaces, plans, run overview/chat coverage, any Radix dialog, the panel's own
Sections dialog, native inactivity and document hiding suspend service reads.
Scope changes stop old pollers and reject stale actions or completions before
they can target or refresh a newly selected runtime.

## Setup and authorization

Settings → Integrations offers only Resource Monitor on mobile. Settings →
Extensions manages only that installed guest. Install and same-origin update use
the existing guest routes; approval and enable/disable remain explicit. A
same-origin old bundle can use the normal update route. An installation from
another origin (including the upstream repo) is not silently migrated: remove
it through the existing Settings flow, then install from the catalog. The
server clears the old grant on removal, so the catalog copy requires service
approval again. The server's cached update candidate is advisory: guest UI
surfaces use one domain helper to expose it only for a strictly newer semver
than the installed Git package. The SDK service
approval warning and server-side fresh-tree checks remain authoritative for Stop
and Stop all. A capability change that widens the package's requested scope
returns it to approval; no mobile path grants service permissions implicitly.

Catalog loading is authoritative: `idle` / `loading` is not “not installed”,
and a failed read is not an empty success. Integrations and Extensions surface
the existing request failure and a retry. The right-workspace tab appears only
after a successful catalog read finds a compatible, enabled, approved Resource
Monitor from the curated fork. A bundle from another origin remains manageable
in Settings but is not mounted until the user removes it and installs the
catalog copy.

## Visibility and instance lifecycle

The frame mounts only while its workspace is open, Resource Monitor is the
selected visible tab, no full-screen mobile surface covers it, the browser
document is visible and (for Capacitor) `oc-native-app-active` is set. Switching
tabs, closing the workspace, hiding the document, backgrounding the native app,
removing approval or switching runtimes unmounts the frame; `PluginPane.isActive`
also guards host requests synchronously. The runtime-keyed frame and catalog
discard stale requests and snapshots after an instance switch.

The Work Status source reads require a ready catalog for the current runtime,
the same origin/version/enabled/service approval, the shared tablet layout, a
shown and expanded section, a visible document and an active native app. A
single activity signal from the mobile root gates the poller; hidden or stale
sections stop reads and drop late answers. Resume starts one fresh read chain.

Closing a view never calls the service stop route. Resource Monitor keeps its
existing two-second visible sampling, and the shared server service follows its
existing 20-second idle behavior: another viewer keeps it alive. The extension
persists its collapsed groups through guest device storage; transient chart and
expanded-job state may reset when the frame is remounted.
