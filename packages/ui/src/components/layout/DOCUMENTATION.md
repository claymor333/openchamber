# Shared Layout Components

## Ownership

`ContextPanel` owns the left, right and bottom context zones and the right-zone
work-status slot. Desktop keeps its deferred resize flow; the mobile tablet
shell opts the same zones into touch-sized, live resize behavior rather than
creating a second panel implementation.

## Invariants

- Desktop resize handles stay compact at 8px and keep the 100ms deferred
  follow/size transition. Hybrid tablet handles use a 40 CSS-pixel target
  centered on the visible card edge, only after that zone's opening has settled
  and while it is unexpanded. Header controls remain above the target.
- The hybrid target uses `touch-action: none`, escapes the outer slot clip only
  after opening settles, and is rendered after the card content. An inner card
  wrapper continues to clip the mounted surface.
- During a hybrid drag, each move writes the cached/clamped size to the outer
  slot's width or height variable. Flex layout reflows the chat, card and
  mounted surface together. The owner store is written once when the gesture
  ends, and a no-op gesture writes nothing. Slot and card transitions are
  disabled only during that drag; desktop keeps its deferred update.
- A resize grows toward chat. Horizontal direction mirrors in RTL; the bottom
  zone grows upward. Available geometry is measured once at drag start.

On mobile, the curated Resource Monitor guest is the exception to the generic
keep-alive guest-pane rule. Its frame mounts only when its context tab is shown,
the zone is open and settled, the package is approved and compatible, and the
workspace, document and native app are active. Closing, switching, covering or
backgrounding the view unmounts its poller without stopping the shared host
service; desktop guest panes keep their existing lifecycle.

### Why the touch target straddles the seam

The 40 CSS-pixel target extends equally across the visible card edge, so a touch
slightly inside or outside the seam can begin a resize. Header controls sit
above it, and the card's clipped inner wrapper keeps surface content contained.

### Why touch resizing updates the slot directly

The outer slot determines how much space the chat and panel content receive.
Updating that slot on each pointermove keeps both sides of the layout live;
overlaying a resized card would leave the chat and mounted surface frozen until
release.
