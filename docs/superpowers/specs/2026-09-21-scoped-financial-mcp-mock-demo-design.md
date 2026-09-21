# Scoped financial-data MCP mock demo — design

## Context

The PoC registry ([pocs.html](../../../pocs.html)) lists a planned proof of concept, "Scoped financial-data tools for agents" (`#financial-data`): can an agent receive only the financial-data capabilities its current task is allowed to use? The real implementation (an MCP server backed by Postgres, deployed to a local `kind` cluster via Argo CD GitOps) will live in a separate repository, [poc_mcp](https://github.com/someshjha/poc_mcp), and is out of scope here.

This spec covers only the mock, browser-only demo that lives in this static site, following the same pattern already established for the OrderFlow PoC: a standalone page embedding a dashboard-style console via `<iframe>`, using an in-browser mock of the real system's state machine, with no backend calls.

## Goal

Make the "scoped MCP tools" claim visible and interactive: a visitor picks a task, sees the exact tool/resource/prompt capability set issued for that task, calls tools through a console, sees denials for out-of-scope calls, and reviews an audit trail — all against representative Postgres-shaped financial data, styled like a PostgREST-style schema browser plus an MCP protocol console.

## Non-goals

- No real MCP protocol implementation, no real Postgres, no network calls.
- Not a general-purpose MCP client — only the tools/resources/prompts defined in the fixture.
- No persistence across page loads (state resets on reload, matching the OrderFlow mock).

## File layout

New top-level directory `financial-mcp/`, sibling to the existing `poc/`:

- `index.html` — hero + iframe embed wrapper. Mirrors [poc/index.html](../../../poc/index.html): explains this is mock-only, links back to `pocs.html#financial-data`, links out to the (currently empty) real repo, and iframes `console.html` with the same auto-resize script.
- `console.html` — the app shell iframed by `index.html`: sidebar nav, topbar, content views. Always-dark theme, matching the OrderFlow console's console/terminal aesthetic. Loads `app.js` as a module.
- `mock-mcp-server.js` — an in-browser simulation of an MCP server: the fixture data (mock Postgres tables), the tool/resource/prompt registries, task-scope issuance, and an audit log. Structured like [poc/mock-api.js](../../../poc/mock-api.js) (a class holding state, `subscribe`/emit for reactive updates, async methods that resolve after a short simulated delay).
- `app.js` — renders each view from the mock server's state and wires up controls (task picker, tool console form, nav).
- `styles.css` — a new, dedicated dark console stylesheet for this demo family (not shared with `poc/styles.css`, to keep the two demos independent).

## Mock MCP surface

**Schema (mock Postgres tables)**, shown in a "Schema" view like PostgREST's root discovery:
- `accounts` (account_id, owner_name, account_type, opened_at)
- `positions` (account_id, ticker, quantity, avg_cost)
- `orders` (order_id, account_id, ticker, side, quantity, status, submitted_at)
- `transactions` (transaction_id, account_id, type, amount, occurred_at)
- `market_data` (ticker, price, change_pct, as_of)
- `fundamentals` (ticker, pe_ratio, market_cap, sector)

**Tools** (`tools/list`, `tools/call`):
- `list_tables()` — returns the schema catalogue
- `describe_table(table)` — returns columns for one table
- `get_market_snapshot(tickers)` — quotes from `market_data`
- `get_fundamentals(ticker)` — row from `fundamentals`
- `get_portfolio_exposure(account_id)` — aggregated `positions` by sector/ticker
- `get_account_balance(account_id)` — derived from `transactions`
- `place_order(account_id, ticker, side, quantity)` — appends to `orders` (the one mutating, highest-privilege tool)
- `get_audit_log()` — the session's own call history

**Resources** (`resources/list`, `resources/read`): `postgres://<table>` read-only dumps, one per table above.

**Prompts** (`prompts/list`, `prompts/get`): 3 templates — "Summarize equity research note", "Summarize portfolio risk", "Draft client support reply" — each tagged with the task scope(s) that can fetch it.

**Task scopes** (selectable in a "Task Scope" view), each issuing a distinct capability set:

| Task | Tools granted | Resources | Prompts |
|---|---|---|---|
| Equity research | list_tables, describe_table, get_market_snapshot, get_fundamentals | market_data, fundamentals | equity research note |
| Portfolio risk | list_tables, describe_table, get_market_snapshot, get_portfolio_exposure | positions, market_data | portfolio risk |
| Trade execution | list_tables, describe_table, get_market_snapshot, place_order | market_data, orders | (none) |
| Client support | list_tables, describe_table, get_account_balance | accounts, transactions | client support reply |

`get_audit_log` and `list_tables`/`describe_table` are available under every scope. No task gets `place_order` except Trade execution — the demo's central point.

## Views (sidebar nav in `console.html`)

1. **Overview** — explains the mock, stat tiles (tables / tools / resources / prompts / audit entries so far).
2. **Schema** — the Postgres-style table/column browser.
3. **Task Scope** — pick a task; see the issued tool/resource/prompt set rendered against the full catalogue, denied items visibly greyed out with the reason.
4. **Console** — pick a tool from the current scope (or explicitly attempt one outside it, to demonstrate denial), fill parameters, "Call tool" → renders a JSON-RPC-style request and response (or a structured MCP error for denials).
5. **Resources & Prompts** — catalogue view, each entry tagged with which task scopes can reach it.
6. **Audit Log** — chronological table: timestamp, task scope, tool/resource, allow/deny, latency.

## Site integration

- [pocs.html](../../../pocs.html) `#financial-data` entry: add an "Open mock demo" action linking to `financial-mcp/`, alongside the existing "Repository planned" text and the "Concept demo" link to `poc-demos.html#financial-data-demo`.
- [poc-demos.html](../../../poc-demos.html) `#financial-data-demo` panel: add a closing note + link to the full mock demo, matching the note already on `#streaming-orders-demo` ("This embedded scenario is mock-only. Open the dedicated ... page.").
- No change to `pocs.html`'s summary counts — the entry stays "Planned" (the real repo has no content yet).

## Testing

Manual verification in the browser pane: load `financial-mcp/index.html`, confirm the iframe resizes correctly, exercise each task scope, confirm `place_order` is only callable under Trade execution and denied elsewhere, confirm the audit log records both outcomes. No automated test suite — matches the existing `poc/` demo, which has none.
