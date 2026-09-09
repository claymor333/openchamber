# Recommended fixes integration

## Goal

Integrate the safe fixes from the five audited branches on top of the current
`upstream/main`, while keeping the existing branches and the dirty main
worktree untouched.

## Scope

- Include `fix/abort-hold-sessionabortflags`.
- Include `fix/agent-rolekey-session-reuse`.
- Combine the mobile dispatched-session and relay-resume fixes, retaining CRLF
  event-frame handling.
- Do not integrate `refresh-on-send` wholesale until its BTW and composer race
  issues are corrected.

## Validation

- Resolve any overlap deliberately, especially event-stream and relay client
  files.
- Run formatting/diff checks and focused tests for each integrated area.
- Record remaining refresh-on-send work in the final report.

## Result

- Integrated the four safe fix areas and the repaired refresh send/relay work.
- Preserved CRLF event-frame normalization while resolving the relay merge.
- Restored pending BTW flow, early duplicate-submit locking, and draft
  preservation during in-flight sends.
- Focused tests, UI/web type checks, and diff checks pass.
- UI lint passes with one pre-existing warning in `MobileChangesSurface.tsx`.
