# Temporal fraud case investigation mock demo — design

## Context

The PoC registry ([pocs.html](../../../pocs.html)) currently lists "Prior authorization across organizations" (`#prior-authorization`) as PoC 02. Per direction from the site owner, this slot is being replaced with a new PoC: **fraud case investigation on Temporal**, testing the claim *"Can a long-running investigation stay durable across a human review SLA without losing state if a worker restarts?"*

The real implementation (a Temporal server + Python worker + FastAPI showcase, deployed to a local `kind` cluster) will live in a separate repository, [poc_temporal](https://github.com/someshjha/poc_temporal) (currently empty), and is out of scope here — see the companion spec, [2026-09-21-temporal-fraud-investigation-real-implementation-design.md](2026-09-21-temporal-fraud-investigation-real-implementation-design.md).

This spec covers only the mock, browser-only demo that lives in this static site, following the same pattern already established for the OrderFlow (`poc/`) and scoped-MCP (`financial-mcp/`) demos: a standalone page embedding a dashboard-style console via `<iframe>`, using an in-browser simulation of Temporal's own execution model (event history, retries, timers, signals, queries), with no backend calls and no real Temporal server.

## Goal

Make the durable-execution claim visible and interactive around one concrete case: a fraud analyst's console for `FRAUD-CASE-4417`, a $12,400 card-not-present dispute. A visitor starts the case, watches automated activities run (including one that visibly retries after simulated transient failures), watches an SLA countdown for human review, submits an analyst decision (or lets the SLA expire to see auto-escalation), and — critically — can kill the simulated worker mid-case and restart it to see the case resume exactly where it left off, with no completed step re-run and no step silently lost. Every step is recorded to an append-only event history styled like Temporal's own Web UI, plus a live "query" panel that reads current state without appearing in that history.

## Non-goals

- No real Temporal SDK, no real Postgres, no network calls.
- Not a general case-management UI — one hardcoded case scenario, not a queue of arbitrary cases.
- No persistence across page loads (state resets on reload, matching `poc/` and `financial-mcp/`).
- SLA timing is compressed for demo purposes (minutes/seconds standing in for the real system's 24h), not wall-clock accurate.

## Domain model (mock fintech data)

One seeded case, styled as realistic card-fraud alert data:

```
case_id: "FRAUD-CASE-4417"
cardholder: { name: "Devon Marsh", account_id: "ACC-7734", card_last4: "8821" }
alert: {
  source: "Card network CNP anomaly detector",
  amount_usd: 12400.00,
  merchant: "Online electronics retailer",
  merchant_country: "SG",
  cardholder_home_country: "US",
  received_at: <ISO timestamp>
}
```

Supporting fixture data the activities read from: a small recent-transaction history for `ACC-7734` (used by `TransactionPatternAnalysis` to compute a risk score) and a static sanctions/watchlist table (used by `SanctionsListCheck`, always clears for this case — the point of that step is to show a fast, always-allow activity next to a flaky one, not to demonstrate a hit).

## Mock workflow engine (`mock-fraud-workflow.js`)

A `MockFraudWorkflow` class that mirrors Temporal's execution model closely enough to make the analogy legible, not a general-purpose workflow runtime:

**Steps (activities), run in order once the case starts:**
1. `IngestAlert` — records the seeded alert (instant, always succeeds).
2. `DeviceIntelligenceLookup` — calls a mock device-risk vendor. **Deliberately fails on attempts 1 and 2** (simulated transient error) and succeeds on attempt 3, with an exponential-backoff delay between attempts, so retry behavior is visible without any user action.
3. `SanctionsListCheck` — checks the static watchlist; always clears immediately.
4. `TransactionPatternAnalysis` — aggregates the fixture transaction history into a risk score; always succeeds.
5. `StartReviewTimer` — starts a compressed SLA countdown (e.g. 90 simulated seconds representing 24h) and simultaneously opens a signal wait.

**Human-in-the-loop branch (whichever resolves first):**
- **Signal `AnalystDecision`** (`confirm_fraud` | `clear_false_positive`), submitted via UI buttons — if received before the timer expires, cancels the timer and proceeds to the matching resolution branch.
- **Timer expiry** — if no signal arrives first, proceeds to `EscalateToSeniorAnalyst`, which opens a second, longer countdown and a second signal wait (same two decision buttons, now framed as the senior analyst's decision).

**Resolution activities (terminal), depending on how the branch above resolved:**
- `confirm_fraud` → `FreezeCard`, `NotifyCardholder` ("fraud confirmed"), `FileSAR` (records a compliance filing event) → case status `Confirmed`.
- `clear_false_positive` → `ResumeCardActivity`, `NotifyCardholder` ("all clear") → case status `Cleared`.
- Escalation timeout with no senior decision (rare path, reachable via "fast-forward" in the demo) → case status `Escalated — unresolved`.

**Durable execution / worker restart:** a "Kill worker mid-case" control interrupts the engine at whatever step is currently in flight (marks it `interrupted`, stops the automatic advance loop). "Restart worker" resumes: already-completed steps are not re-run (their history entries are untouched); the interrupted step re-runs from scratch (activities are treated as idempotent — this is explicitly called out in the UI copy, matching how Temporal actually behaves: a step that crashed mid-execution is retried, not "resumed halfway"). This is the same interaction pattern already used by the `evidence-review-demo` panel on [poc-demos.html](../../../poc-demos.html), applied here with a fuller event history.

**Query:** `getCaseStatus()` returns a snapshot (current step, retry attempt counts so far, time remaining on the active timer, terminal status if resolved) computed from engine state without appending to the event history — demonstrating that a Temporal Query reads, it does not write.

**Event history:** every state transition appends one entry: `{ id, at, type: "ActivityStarted"|"ActivityFailed"|"ActivityCompleted"|"TimerStarted"|"TimerFired"|"TimerCanceled"|"SignalReceived"|"WorkerKilled"|"WorkerRestarted"|"CaseResolved", name, attempt?, detail? }`. Rendered as an append-only table, newest at the bottom (matching how Temporal's own history view reads), styled like `financial-mcp`'s audit log.

## Views (single dashboard, no multi-page nav — this is one case, not a catalogue)

`dashboard.html` renders one console with:
1. **Case header** — case ID, cardholder/account/card, alert amount and merchant, current case status badge.
2. **Workflow diagram** — the ordered step list from above, each with a status chip (`pending` / `running` / `retrying (n/3)` / `done` / `interrupted` / `skipped`), mirroring the `workflow-steps` pattern already used in `poc-demos.html`'s evidence-review panel.
3. **SLA panel** — countdown clock for whichever timer is currently active, with a "Fast-forward SLA" control (jumps the countdown to zero, for demoing the escalation path without waiting).
4. **Decision controls** — "Confirm fraud" / "Clear as false positive" buttons (send the `AnalystDecision` signal), disabled once the case resolves or its current wait period ends.
5. **Durability controls** — "Kill worker mid-case" / "Restart worker" buttons with a status readout ("Worker: running" / "Worker: killed — case paused").
6. **Query panel** — "Query case status" button that renders the live `getCaseStatus()` result as JSON, visually distinguished (e.g. a different border color) from the event history to reinforce query vs. history.
7. **Event history** — the append-only table described above.

## File layout

New top-level directory `temporal_poc_fintech/`, sibling to `poc/` and `financial-mcp/`:

- `index.html` — hero + iframe embed wrapper, mirroring [poc/index.html](../../../poc/index.html) and [financial-mcp/index.html](../../../financial-mcp/index.html): explains this is mock-only, links back to `pocs.html#prior-authorization` (the entry's new anchor — kept as-is per the "replace this entry" instruction so existing external links to that anchor keep resolving to *a* PoC, now this one), links out to the (currently empty) real repo, and iframes `dashboard.html` with the same auto-resize script as the other two embeds.
- `dashboard.html` — the app shell iframed by `index.html`. Always-dark theme, matching the other two consoles.
- `mock-fraud-workflow.js` — the engine described above: fixture data, `MockFraudWorkflow` class (`start()`, `submitDecision(decision)`, `killWorker()`, `restartWorker()`, `fastForwardTimer()`, `getCaseStatus()`, `getEventHistory()`, a `subscribe(fn)` for reactive UI updates), structured like `financial-mcp/mock-mcp-server.js` and `poc/mock-api.js`.
- `app.js` — renders the dashboard from the engine's state and wires up controls.
- `styles.css` — a new, dedicated dark console stylesheet for this demo (not shared with `poc/styles.css` or `financial-mcp/styles.css`, matching the existing convention that each embed family owns its own stylesheet).

## Site integration

- [pocs.html](../../../pocs.html): replace the `#prior-authorization` `<li class="poc-item">` (currently "Prior authorization across organizations") with a new entry for this PoC — id kept as `prior-authorization` so the anchor keeps resolving, but the label/index changes to `02 / Durable execution`. Claim: *"Can a long-running investigation stay durable across a human review SLA without losing state if a worker restarts?"* Stack: `Temporal`, `Python`, `FastAPI`, `PostgreSQL`. Actions follow the `financial-mcp`/`column-masking` pattern (`Repository planned` + `Open mock demo` linking to `temporal_poc_fintech/`), since the real repo doesn't exist yet. Update the rail nav link text at the top of the page to match.
- [poc-demos.html](../../../poc-demos.html): remove the `#prior-authorization-demo` panel and its entry in the demo index nav — nothing will link to it once `pocs.html` no longer does, and leaving it in place would be dead, unreferenced content.
- No change to `pocs.html`'s summary counts (`05 Focused systems` / `02 In verification` / `03 Planned`) — swapping one planned entry for another planned entry doesn't change the totals.

## Testing

Manual verification in the browser pane: load `temporal_poc_fintech/index.html`, confirm the iframe resizes correctly, start the case, confirm `DeviceIntelligenceLookup` visibly fails twice then succeeds, confirm the SLA countdown runs, confirm both decision paths and the fast-forward-to-escalation path each produce the correct terminal status and terminal activities, confirm "Kill worker" / "Restart worker" leaves completed steps untouched and only reruns the interrupted one, confirm the query panel's snapshot matches the workflow diagram's current state, confirm the event history is append-only and never reorders past entries. No automated test suite — matches `poc/` (none) rather than `financial-mcp/` (which has Node unit tests for its pure-logic module); this module's core logic is more time/interaction-driven than the MCP scoping logic was, so it is verified live in-browser instead.
