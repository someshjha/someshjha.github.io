# Scoped Financial-Data MCP Mock Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only, mock MCP console demo (`financial-mcp/`) that shows an agent receiving a task-scoped subset of tools/resources/prompts over representative Postgres-shaped financial data, with every call recorded to a visible audit log — and link it into the existing PoC pages.

**Architecture:** Pure static HTML/CSS/vanilla-JS ES modules, no backend, no build step — matching the existing `poc/` OrderFlow demo. A single `MockMcpServer` class (`financial-mcp/mock-mcp-server.js`) holds in-memory fixture data and enforces scope on every call; `financial-mcp/app.js` renders six views (`Overview`, `Schema`, `Task Scope`, `Console`, `Resources & Prompts`, `Audit Log`) driven by that server's state. `financial-mcp/console.html` is the app shell, iframed by `financial-mcp/index.html` exactly the way `poc/dashboard.html` is iframed by `poc/index.html`.

**Tech Stack:** Vanilla JS (ES modules), HTML, CSS. Node's built-in test runner (`node --test`) for the one pure-logic module. No dependencies, no package.json.

## Global Constraints

- No network calls, no backend, no build tooling — plain files served statically (GitHub Pages).
- The console (`console.html`) is always-dark (`document.documentElement.dataset.theme = 'dark'` set before stylesheet load), matching `poc/dashboard.html`'s convention — it does not follow the parent site's light/dark toggle.
- The embed wrapper (`index.html`) reuses the main site's `../styles.css` and `../script.js` (same header/footer/theme chrome as every other page) — do not duplicate that CSS.
- `financial-mcp/styles.css` is a new, self-contained stylesheet for the console only — do not link `poc/styles.css` from it.
- The real implementation repository is `https://github.com/someshjha/poc_mcp` (currently empty) — link to it, do not build against it.
- No automated tests beyond the Node unit tests for `mock-mcp-server.js` — verify UI tasks by loading pages in the Browser pane, matching this codebase's existing testing level (the `poc/` demo has no tests either).

---

### Task 1: Mock MCP server core (schema, tools, resources, prompts, scoping, audit log)

**Files:**
- Create: `financial-mcp/mock-mcp-server.js`
- Test: `financial-mcp/mock-mcp-server.test.mjs`

**Interfaces:**
- Produces (used by Task 2's `app.js`):
  - `export const SCHEMA` — `{ [table: string]: { name: string, type: string, description: string }[] }`
  - `export const TASK_SCOPES` — `{ [scopeId: string]: { label: string, claim: string, tools: string[], resources: string[], prompts: string[] } }`
  - `export function listAllTools()` — `{ name: string, description: string, inputSchema: { name: string, type: "string"|"string[]"|"number", required: boolean }[] }[]`
  - `export function listAllResources()` — `string[]` (URIs like `"postgres://accounts"`)
  - `export function listAllPrompts()` — `{ id: string, title: string }[]`
  - `export class MockMcpServer` with:
    - `constructor()`
    - `scopeId: string | null` (public field, read by the UI)
    - `orders: object[]` (public field, mutated by `place_order`)
    - `selectTaskScope(scopeId: string): string` — throws if unknown
    - `callTool(name: string, params?: object): AuditEntry`
    - `readResource(uri: string): AuditEntry`
    - `getPrompt(id: string): AuditEntry`
    - `getAuditLog(): AuditEntry[]`
  - `AuditEntry` shape: `{ id: number, at: string (ISO), scope?: string, kind: "tool"|"resource"|"prompt", name: string, params?: object, decision: "allow"|"deny"|"error", result?: any, detail?: string }`

- [ ] **Step 1: Write the failing tests**

Create `financial-mcp/mock-mcp-server.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockMcpServer, TASK_SCOPES, listAllTools } from "./mock-mcp-server.js";

test("list_tables and describe_table are granted under every task scope", () => {
  for (const scopeId of Object.keys(TASK_SCOPES)) {
    const server = new MockMcpServer();
    server.selectTaskScope(scopeId);
    const listed = server.callTool("list_tables", {});
    assert.equal(listed.decision, "allow");
    const described = server.callTool("describe_table", { table: "accounts" });
    assert.equal(described.decision, "allow");
  }
});

test("place_order is denied outside trade_execution", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("equity_research");
  const entry = server.callTool("place_order", { account_id: "ACC-1001", ticker: "AAPL", side: "buy", quantity: 5 });
  assert.equal(entry.decision, "deny");
  assert.match(entry.detail, /not granted/);
});

test("place_order succeeds under trade_execution and appends a new order", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("trade_execution");
  const before = server.orders.length;
  const entry = server.callTool("place_order", { account_id: "ACC-1001", ticker: "AAPL", side: "buy", quantity: 5 });
  assert.equal(entry.decision, "allow");
  assert.equal(server.orders.length, before + 1);
  assert.equal(entry.result.status, "filled");
});

test("place_order rejects an invalid side as an error, not a denial", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("trade_execution");
  const entry = server.callTool("place_order", { account_id: "ACC-1001", ticker: "AAPL", side: "hold", quantity: 5 });
  assert.equal(entry.decision, "error");
});

test("get_portfolio_exposure aggregates ACC-2001 by sector correctly", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("portfolio_risk");
  const entry = server.callTool("get_portfolio_exposure", { account_id: "ACC-2001" });
  assert.equal(entry.decision, "allow");
  assert.equal(entry.result.total_market_value, 2851329);
  const tech = entry.result.by_sector.find(s => s.sector === "Technology");
  const discretionary = entry.result.by_sector.find(s => s.sector === "Consumer Discretionary");
  assert.equal(tech.pct, 73);
  assert.equal(discretionary.pct, 27);
});

test("get_account_balance sums transactions for ACC-1001", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("client_support");
  const entry = server.callTool("get_account_balance", { account_id: "ACC-1001" });
  assert.equal(entry.decision, "allow");
  assert.equal(entry.result.balance, 21000);
});

test("readResource denies postgres://orders outside trade_execution", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("client_support");
  const entry = server.readResource("postgres://orders");
  assert.equal(entry.decision, "deny");
});

test("readResource allows postgres://orders under trade_execution", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("trade_execution");
  const entry = server.readResource("postgres://orders");
  assert.equal(entry.decision, "allow");
  assert.ok(Array.isArray(entry.result));
});

test("getPrompt denies a prompt not granted to the current scope", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("trade_execution");
  const entry = server.getPrompt("equity_research_note");
  assert.equal(entry.decision, "deny");
});

test("audit log accumulates both allow and deny entries in call order", () => {
  const server = new MockMcpServer();
  server.selectTaskScope("equity_research");
  server.callTool("list_tables", {});
  server.callTool("place_order", { account_id: "ACC-1001", ticker: "AAPL", side: "buy", quantity: 1 });
  const log = server.getAuditLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].decision, "allow");
  assert.equal(log[1].decision, "deny");
});

test("listAllTools exposes the full catalogue regardless of scope", () => {
  assert.equal(listAllTools().length, 8);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test financial-mcp/mock-mcp-server.test.mjs`
Expected: FAIL — `Cannot find module './mock-mcp-server.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `financial-mcp/mock-mcp-server.js`:

```js
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

class ToolError extends Error {}

export const SCHEMA = {
  accounts: [
    { name: "account_id", type: "text", description: "Primary key" },
    { name: "owner_name", type: "text", description: "" },
    { name: "account_type", type: "text", description: "individual | institutional" },
    { name: "opened_at", type: "date", description: "" }
  ],
  positions: [
    { name: "account_id", type: "text", description: "References accounts.account_id" },
    { name: "ticker", type: "text", description: "" },
    { name: "quantity", type: "numeric", description: "" },
    { name: "avg_cost", type: "numeric", description: "" }
  ],
  orders: [
    { name: "order_id", type: "text", description: "Primary key" },
    { name: "account_id", type: "text", description: "References accounts.account_id" },
    { name: "ticker", type: "text", description: "" },
    { name: "side", type: "text", description: "buy | sell" },
    { name: "quantity", type: "numeric", description: "" },
    { name: "status", type: "text", description: "" },
    { name: "submitted_at", type: "timestamptz", description: "" }
  ],
  transactions: [
    { name: "transaction_id", type: "text", description: "Primary key" },
    { name: "account_id", type: "text", description: "References accounts.account_id" },
    { name: "type", type: "text", description: "deposit | withdrawal" },
    { name: "amount", type: "numeric", description: "Negative for withdrawals" },
    { name: "occurred_at", type: "timestamptz", description: "" }
  ],
  market_data: [
    { name: "ticker", type: "text", description: "Primary key" },
    { name: "price", type: "numeric", description: "" },
    { name: "change_pct", type: "numeric", description: "1-day change" },
    { name: "as_of", type: "timestamptz", description: "" }
  ],
  fundamentals: [
    { name: "ticker", type: "text", description: "Primary key" },
    { name: "pe_ratio", type: "numeric", description: "" },
    { name: "market_cap", type: "text", description: "" },
    { name: "sector", type: "text", description: "" }
  ]
};

const ACCOUNTS = [
  { account_id: "ACC-1001", owner_name: "Priya Nair", account_type: "individual", opened_at: "2021-03-14" },
  { account_id: "ACC-1002", owner_name: "Marcus Webb", account_type: "individual", opened_at: "2019-11-02" },
  { account_id: "ACC-2001", owner_name: "Ridgeline Capital", account_type: "institutional", opened_at: "2017-06-30" }
];

const POSITIONS = [
  { account_id: "ACC-1001", ticker: "AAPL", quantity: 120, avg_cost: 152.30 },
  { account_id: "ACC-1001", ticker: "MSFT", quantity: 40, avg_cost: 301.10 },
  { account_id: "ACC-1002", ticker: "TSLA", quantity: 25, avg_cost: 210.75 },
  { account_id: "ACC-2001", ticker: "AAPL", quantity: 5200, avg_cost: 148.60 },
  { account_id: "ACC-2001", ticker: "NVDA", quantity: 900, avg_cost: 410.20 },
  { account_id: "ACC-2001", ticker: "MSFT", quantity: 1800, avg_cost: 295.40 },
  { account_id: "ACC-2001", ticker: "TSLA", quantity: 3000, avg_cost: 240.00 }
];

const SEED_ORDERS = [
  { order_id: "ORD-9001", account_id: "ACC-1001", ticker: "AAPL", side: "buy", quantity: 10, status: "filled", submitted_at: "2026-09-18T14:02:00Z" },
  { order_id: "ORD-9002", account_id: "ACC-2001", ticker: "NVDA", side: "sell", quantity: 100, status: "filled", submitted_at: "2026-09-19T09:31:00Z" }
];

const TRANSACTIONS = [
  { transaction_id: "TXN-5001", account_id: "ACC-1001", type: "deposit", amount: 25000, occurred_at: "2026-08-01T00:00:00Z" },
  { transaction_id: "TXN-5002", account_id: "ACC-1001", type: "withdrawal", amount: -4000, occurred_at: "2026-08-20T00:00:00Z" },
  { transaction_id: "TXN-5003", account_id: "ACC-1002", type: "deposit", amount: 12000, occurred_at: "2026-07-12T00:00:00Z" },
  { transaction_id: "TXN-5004", account_id: "ACC-2001", type: "deposit", amount: 4500000, occurred_at: "2026-01-05T00:00:00Z" },
  { transaction_id: "TXN-5005", account_id: "ACC-2001", type: "withdrawal", amount: -250000, occurred_at: "2026-06-11T00:00:00Z" }
];

const MARKET_DATA = [
  { ticker: "AAPL", price: 231.42, change_pct: 0.8, as_of: "2026-09-21T13:30:00Z" },
  { ticker: "MSFT", price: 428.10, change_pct: -0.3, as_of: "2026-09-21T13:30:00Z" },
  { ticker: "TSLA", price: 256.77, change_pct: 2.1, as_of: "2026-09-21T13:30:00Z" },
  { ticker: "NVDA", price: 118.95, change_pct: 1.4, as_of: "2026-09-21T13:30:00Z" }
];

const FUNDAMENTALS = [
  { ticker: "AAPL", pe_ratio: 34.2, market_cap: "3.55T", sector: "Technology" },
  { ticker: "MSFT", pe_ratio: 36.8, market_cap: "3.18T", sector: "Technology" },
  { ticker: "TSLA", pe_ratio: 68.5, market_cap: "820B", sector: "Consumer Discretionary" },
  { ticker: "NVDA", pe_ratio: 44.1, market_cap: "2.92T", sector: "Technology" }
];

export const TASK_SCOPES = {
  equity_research: {
    label: "Equity research",
    claim: "Draft a research note on a ticker.",
    tools: ["list_tables", "describe_table", "get_market_snapshot", "get_fundamentals", "get_audit_log"],
    resources: ["postgres://market_data", "postgres://fundamentals"],
    prompts: ["equity_research_note"]
  },
  portfolio_risk: {
    label: "Portfolio risk",
    claim: "Assess concentration risk for an account.",
    tools: ["list_tables", "describe_table", "get_market_snapshot", "get_portfolio_exposure", "get_audit_log"],
    resources: ["postgres://positions", "postgres://market_data"],
    prompts: ["portfolio_risk_summary"]
  },
  trade_execution: {
    label: "Trade execution",
    claim: "Place an order on behalf of a client.",
    tools: ["list_tables", "describe_table", "get_market_snapshot", "place_order", "get_audit_log"],
    resources: ["postgres://market_data", "postgres://orders"],
    prompts: []
  },
  client_support: {
    label: "Client support",
    claim: "Answer a balance inquiry.",
    tools: ["list_tables", "describe_table", "get_account_balance", "get_audit_log"],
    resources: ["postgres://accounts", "postgres://transactions"],
    prompts: ["client_support_reply"]
  }
};

const RESOURCE_URIS = {
  "postgres://accounts": "accounts",
  "postgres://positions": "positions",
  "postgres://orders": "orders",
  "postgres://transactions": "transactions",
  "postgres://market_data": "market_data",
  "postgres://fundamentals": "fundamentals"
};

const PROMPT_DEFS = {
  equity_research_note: {
    title: "Summarize equity research note",
    template: "Draft a research note for {ticker} using the latest market snapshot and fundamentals. Note the P/E ratio, market cap, and 1-day price change."
  },
  portfolio_risk_summary: {
    title: "Summarize portfolio risk",
    template: "Assess concentration risk for account {account_id}. Identify the largest sector exposure and flag any position over 25% of portfolio value."
  },
  client_support_reply: {
    title: "Draft client support reply",
    template: "Reply to a balance inquiry for account {account_id} using the current balance from transactions. Do not disclose positions or orders."
  }
};

function listTables() {
  return Object.entries(SCHEMA).map(([name, columns]) => ({ name, column_count: columns.length }));
}

function describeTable({ table }) {
  if (!SCHEMA[table]) throw new ToolError(`Unknown table: ${table}`);
  return { table, columns: clone(SCHEMA[table]) };
}

function getMarketSnapshot({ tickers } = {}) {
  const list = Array.isArray(tickers) && tickers.length
    ? MARKET_DATA.filter(m => tickers.includes(m.ticker))
    : MARKET_DATA;
  return clone(list);
}

function getFundamentals({ ticker }) {
  const row = FUNDAMENTALS.find(f => f.ticker === ticker);
  if (!row) throw new ToolError(`Unknown ticker: ${ticker}`);
  return clone(row);
}

function getPortfolioExposure({ account_id }) {
  const rows = POSITIONS.filter(p => p.account_id === account_id);
  if (rows.length === 0) throw new ToolError(`No positions found for account ${account_id}`);
  const byTicker = rows
    .map(p => {
      const quote = MARKET_DATA.find(m => m.ticker === p.ticker);
      return { ticker: p.ticker, quantity: p.quantity, market_value: round2(p.quantity * quote.price) };
    })
    .sort((a, b) => b.market_value - a.market_value);
  const total_market_value = round2(byTicker.reduce((sum, t) => sum + t.market_value, 0));
  const sectorTotals = new Map();
  for (const t of byTicker) {
    const sector = FUNDAMENTALS.find(f => f.ticker === t.ticker)?.sector ?? "Unclassified";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + t.market_value);
  }
  const by_sector = [...sectorTotals.entries()]
    .map(([sector, market_value]) => ({
      sector,
      market_value: round2(market_value),
      pct: round1((market_value / total_market_value) * 100)
    }))
    .sort((a, b) => b.market_value - a.market_value);
  return { account_id, total_market_value, by_ticker: byTicker, by_sector };
}

function getAccountBalance({ account_id }) {
  const rows = TRANSACTIONS.filter(t => t.account_id === account_id);
  if (rows.length === 0) throw new ToolError(`No transactions found for account ${account_id}`);
  return { account_id, balance: round2(rows.reduce((sum, t) => sum + t.amount, 0)), transaction_count: rows.length };
}

function placeOrder({ account_id, ticker, side, quantity }, server) {
  if (!["buy", "sell"].includes(side)) throw new ToolError(`side must be "buy" or "sell", got "${side}"`);
  if (!(Number(quantity) > 0)) throw new ToolError("quantity must be a positive number");
  if (!MARKET_DATA.some(m => m.ticker === ticker)) throw new ToolError(`Unknown ticker: ${ticker}`);
  const order = {
    order_id: `ORD-${9000 + server.orders.length + 1}`,
    account_id,
    ticker,
    side,
    quantity: Number(quantity),
    status: "filled",
    submitted_at: new Date().toISOString()
  };
  server.orders.push(order);
  return order;
}

const TOOL_DEFS = {
  list_tables: {
    description: "List every table in the mock financial schema.",
    inputSchema: [],
    handler: listTables
  },
  describe_table: {
    description: "Describe the columns of one table.",
    inputSchema: [{ name: "table", type: "string", required: true }],
    handler: describeTable
  },
  get_market_snapshot: {
    description: "Get current price and daily change for one or more tickers.",
    inputSchema: [{ name: "tickers", type: "string[]", required: false }],
    handler: getMarketSnapshot
  },
  get_fundamentals: {
    description: "Get fundamentals (P/E, market cap, sector) for one ticker.",
    inputSchema: [{ name: "ticker", type: "string", required: true }],
    handler: getFundamentals
  },
  get_portfolio_exposure: {
    description: "Get an account's position value broken down by ticker and sector.",
    inputSchema: [{ name: "account_id", type: "string", required: true }],
    handler: getPortfolioExposure
  },
  get_account_balance: {
    description: "Get an account's cash balance from its transaction history.",
    inputSchema: [{ name: "account_id", type: "string", required: true }],
    handler: getAccountBalance
  },
  place_order: {
    description: "Submit a buy or sell order for an account.",
    inputSchema: [
      { name: "account_id", type: "string", required: true },
      { name: "ticker", type: "string", required: true },
      { name: "side", type: "string", required: true },
      { name: "quantity", type: "number", required: true }
    ],
    handler: placeOrder
  },
  get_audit_log: {
    description: "Get this session's full tool, resource, and prompt call history.",
    inputSchema: [],
    handler: (_params, server) => clone(server.auditLog)
  }
};

export function listAllTools() {
  return Object.entries(TOOL_DEFS).map(([name, def]) => ({ name, description: def.description, inputSchema: def.inputSchema }));
}

export function listAllResources() {
  return Object.keys(RESOURCE_URIS);
}

export function listAllPrompts() {
  return Object.entries(PROMPT_DEFS).map(([id, def]) => ({ id, title: def.title }));
}

export class MockMcpServer {
  constructor() {
    this.orders = clone(SEED_ORDERS);
    this.auditLog = [];
    this.scopeId = null;
  }

  selectTaskScope(scopeId) {
    if (!TASK_SCOPES[scopeId]) throw new Error(`Unknown task scope: ${scopeId}`);
    this.scopeId = scopeId;
    return this.scopeId;
  }

  callTool(name, params = {}) {
    const at = new Date().toISOString();
    const def = TOOL_DEFS[name];
    if (!def) return this.#log({ at, kind: "tool", name, params, decision: "error", detail: `Unknown tool: ${name}` });
    if (!this.scopeId) return this.#log({ at, kind: "tool", name, params, decision: "deny", detail: "No task scope selected" });
    const scope = TASK_SCOPES[this.scopeId];
    if (!scope.tools.includes(name)) {
      return this.#log({ at, scope: scope.label, kind: "tool", name, params, decision: "deny", detail: `Tool "${name}" is not granted to task scope "${scope.label}"` });
    }
    try {
      const result = def.handler(params, this);
      return this.#log({ at, scope: scope.label, kind: "tool", name, params, decision: "allow", result });
    } catch (err) {
      return this.#log({ at, scope: scope.label, kind: "tool", name, params, decision: "error", detail: err.message });
    }
  }

  readResource(uri) {
    const at = new Date().toISOString();
    const table = RESOURCE_URIS[uri];
    if (!table) return this.#log({ at, kind: "resource", name: uri, decision: "error", detail: `Unknown resource: ${uri}` });
    if (!this.scopeId) return this.#log({ at, kind: "resource", name: uri, decision: "deny", detail: "No task scope selected" });
    const scope = TASK_SCOPES[this.scopeId];
    if (!scope.resources.includes(uri)) {
      return this.#log({ at, scope: scope.label, kind: "resource", name: uri, decision: "deny", detail: `Resource "${uri}" is not granted to task scope "${scope.label}"` });
    }
    const rows = table === "orders"
      ? this.orders
      : { accounts: ACCOUNTS, positions: POSITIONS, transactions: TRANSACTIONS, market_data: MARKET_DATA, fundamentals: FUNDAMENTALS }[table];
    return this.#log({ at, scope: scope.label, kind: "resource", name: uri, decision: "allow", result: clone(rows) });
  }

  getPrompt(id) {
    const at = new Date().toISOString();
    const def = PROMPT_DEFS[id];
    if (!def) return this.#log({ at, kind: "prompt", name: id, decision: "error", detail: `Unknown prompt: ${id}` });
    if (!this.scopeId) return this.#log({ at, kind: "prompt", name: id, decision: "deny", detail: "No task scope selected" });
    const scope = TASK_SCOPES[this.scopeId];
    if (!scope.prompts.includes(id)) {
      return this.#log({ at, scope: scope.label, kind: "prompt", name: id, decision: "deny", detail: `Prompt "${id}" is not granted to task scope "${scope.label}"` });
    }
    return this.#log({ at, scope: scope.label, kind: "prompt", name: id, decision: "allow", result: clone(def) });
  }

  getAuditLog() {
    return clone(this.auditLog);
  }

  #log(entry) {
    const full = { id: this.auditLog.length + 1, ...entry };
    this.auditLog.push(full);
    return full;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test financial-mcp/mock-mcp-server.test.mjs`
Expected: PASS — 11 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add financial-mcp/mock-mcp-server.js financial-mcp/mock-mcp-server.test.mjs
git commit -m "Add mock MCP server core for scoped financial-data demo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Console UI (`console.html`, `styles.css`, `app.js`)

**Files:**
- Create: `financial-mcp/console.html`
- Create: `financial-mcp/styles.css`
- Create: `financial-mcp/app.js`

**Interfaces:**
- Consumes (from Task 1): `SCHEMA`, `TASK_SCOPES`, `listAllTools()`, `listAllResources()`, `listAllPrompts()`, `MockMcpServer` (`selectTaskScope`, `callTool`, `readResource`, `getPrompt`, `getAuditLog`, `.scopeId`, `.orders`) from `./mock-mcp-server.js`.
- Produces: a loadable `console.html` with `<script type="module" src="./app.js">`, used by Task 3's iframe.

- [ ] **Step 1: Create the HTML shell**

Create `financial-mcp/console.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Mock-only public showcase for scoped financial-data MCP tools." />
    <title>Scoped Financial MCP — Mock-Only PoC Showcase</title>
    <link rel="canonical" href="https://someshjha.com/financial-mcp/" />
    <script>
      document.documentElement.dataset.theme = 'dark';
    </script>
    <link rel="stylesheet" href="./styles.css?v=financial-mcp-v1" />
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar" aria-label="Primary navigation">
        <a class="brand" href="#overview" aria-label="Scoped Financial MCP overview">
          <span class="brand-mark" aria-hidden="true">MCP</span>
          <span>Financial<span>MCP</span></span>
        </a>
        <nav class="nav-list">
          <a class="nav-item active" href="#overview" data-view="overview"><span>Overview</span></a>
          <a class="nav-item" href="#schema" data-view="schema"><span>Schema</span></a>
          <a class="nav-item" href="#scope" data-view="scope"><span>Task Scope</span></a>
          <a class="nav-item" href="#console" data-view="console"><span>Console</span></a>
          <a class="nav-item" href="#catalog" data-view="catalog"><span>Resources &amp; Prompts</span></a>
          <a class="nav-item" href="#audit" data-view="audit"><span>Audit Log</span></a>
        </nav>
        <div class="sidebar-footer">
          <span class="environment-chip">MOCK ONLY</span>
          <span class="synthetic-label"><i></i> Static public data</span>
        </div>
      </aside>

      <main class="main-content">
        <aside class="mock-only-banner" aria-label="Mock-only public page notice">
          <div>
            <strong>Mock-only public showcase</strong>
            <span>This page simulates the MCP tools/resources/prompts protocol in the browser. It does not run a real MCP server or Postgres.</span>
          </div>
          <a href="https://github.com/someshjha/poc_mcp" target="_blank" rel="noopener noreferrer">Real implementation repo ↗</a>
        </aside>

        <header class="topbar">
          <div>
            <p class="eyebrow">SCOPED AGENT ACCESS</p>
            <h1 id="page-title">Overview</h1>
          </div>
          <div class="topbar-status">
            <div class="scenario-identity">
              <span>ACTIVE TASK SCOPE</span>
              <strong id="active-scope-label">None selected</strong>
            </div>
          </div>
        </header>

        <div class="content-area">
          <section class="view active" id="view-overview" data-view-panel="overview">
            <div class="section-heading">
              <div><p class="eyebrow">WHAT THIS DEMONSTRATES</p><h2>Task-scoped MCP capabilities</h2></div>
            </div>
            <div class="kpi-grid" id="kpi-grid"></div>
            <article class="panel overview-copy">
              <p>An agent working a task does not receive a standing API key. It receives exactly the tools, resources, and prompts that task is allowed to use, and every call — allowed or denied — is written to an audit trail.</p>
              <p>Pick a task under <strong>Task Scope</strong>, then call tools from the <strong>Console</strong> to see the boundary enforced live.</p>
            </article>
          </section>

          <section class="view" id="view-schema" data-view-panel="schema">
            <div class="section-heading"><div><p class="eyebrow">MOCK POSTGRES SCHEMA</p><h2>Tables</h2></div></div>
            <div class="schema-grid" id="schema-grid"></div>
          </section>

          <section class="view" id="view-scope" data-view-panel="scope">
            <div class="section-heading"><div><p class="eyebrow">CHOOSE A TASK</p><h2>Task scope</h2></div></div>
            <div class="scope-grid" id="scope-grid"></div>
            <article class="panel capability-panel" id="capability-panel"></article>
          </section>

          <section class="view" id="view-console" data-view-panel="console">
            <div class="section-heading"><div><p class="eyebrow">CALL A TOOL</p><h2>Console</h2></div></div>
            <div class="console-layout">
              <form class="panel console-form" id="console-form">
                <label><span>Tool</span><select id="console-tool" name="tool"></select></label>
                <div id="console-params"></div>
                <button class="primary-action" type="submit">Call tool <span>→</span></button>
              </form>
              <aside class="panel console-evidence">
                <div class="panel-header"><div><p class="eyebrow">REQUEST</p><h3>tools/call</h3></div></div>
                <pre id="console-request"></pre>
                <div class="panel-header"><div><p class="eyebrow">RESPONSE</p><h3>result</h3></div></div>
                <pre id="console-response"></pre>
              </aside>
            </div>
          </section>

          <section class="view" id="view-catalog" data-view-panel="catalog">
            <div class="section-heading"><div><p class="eyebrow">FULL CATALOGUE</p><h2>Resources &amp; prompts</h2></div></div>
            <div class="catalog-grid">
              <article class="panel"><h3>Resources</h3><div id="resource-list"></div></article>
              <article class="panel"><h3>Prompts</h3><div id="prompt-list"></div></article>
            </div>
          </section>

          <section class="view" id="view-audit" data-view-panel="audit">
            <div class="section-heading"><div><p class="eyebrow">REVIEWABLE INDEPENDENTLY</p><h2>Audit log</h2></div></div>
            <div class="table-scroll">
              <table>
                <thead><tr><th>#</th><th>Time</th><th>Task scope</th><th>Kind</th><th>Name</th><th>Decision</th><th>Detail</th></tr></thead>
                <tbody id="audit-body"></tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
    <script type="module" src="./app.js?v=financial-mcp-v1"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the stylesheet**

Create `financial-mcp/styles.css`:

```css
:root {
  color-scheme: dark;
  --ink: #eef5f4;
  --muted: #91a5a2;
  --subtle: #607472;
  --canvas: #07110f;
  --surface: #0c1816;
  --surface-raised: #11211e;
  --surface-soft: #162824;
  --line: #223b36;
  --green: #5ee0a0;
  --green-dark: #173b2c;
  --amber: #f3c56b;
  --amber-dark: #3e321b;
  --red: #ff867c;
  --red-dark: #40221f;
  --sidebar: 224px;
  --radius: 14px;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
html { min-width: 320px; background: var(--canvas); }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  background: radial-gradient(circle at 72% -10%, rgba(57, 126, 101, 0.13), transparent 32rem), var(--canvas);
}
button, input, select { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
button { color: inherit; }
a { color: inherit; }

.app-shell { min-height: 100vh; }

.mock-only-banner {
  display: flex; justify-content: space-between; gap: 18px; align-items: center;
  margin: 0 0 18px; padding: 14px 16px;
  border: 1px solid rgba(243, 197, 107, .45); border-radius: var(--radius);
  background: rgba(62, 50, 27, .78); color: var(--amber);
  box-shadow: 0 14px 34px rgba(0, 0, 0, .18);
}
.mock-only-banner div { display: grid; gap: 4px; }
.mock-only-banner strong { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.mock-only-banner span { color: #f8dfaa; font-size: 13px; line-height: 1.45; }
.mock-only-banner a {
  flex: 0 0 auto; color: var(--ink); background: var(--amber); border-radius: 999px;
  padding: 10px 13px; font-size: 12px; font-weight: 760; text-decoration: none;
}

.sidebar {
  position: fixed; inset: 0 auto 0 0; width: var(--sidebar);
  display: flex; flex-direction: column; padding: 24px 14px 18px;
  border-right: 1px solid var(--line); background: var(--surface);
}
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); font-weight: 760; margin-bottom: 26px; }
.brand-mark {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px;
  background: var(--green-dark); color: var(--green); font-size: 11px; font-weight: 800; letter-spacing: .02em;
}
.brand span span { color: var(--muted); font-weight: 500; }

.nav-list { display: grid; gap: 4px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px;
  color: var(--muted); text-decoration: none; font-size: 13.5px; font-weight: 600;
}
.nav-item:hover { background: var(--surface-soft); color: var(--ink); }
.nav-item.active { background: var(--green-dark); color: var(--green); }

.sidebar-footer { margin-top: auto; display: grid; gap: 8px; }
.environment-chip {
  justify-self: start; padding: 4px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 800;
  letter-spacing: .06em; background: var(--amber-dark); color: var(--amber);
}
.synthetic-label { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--subtle); }
.synthetic-label i { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }

.main-content { margin-left: var(--sidebar); padding: 22px 28px 60px; max-width: 1180px; }

.topbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-bottom: 22px; flex-wrap: wrap; }
.eyebrow { margin: 0 0 4px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--subtle); }
.topbar h1 { margin: 0; font-size: 26px; letter-spacing: -.01em; }
.topbar-status { display: flex; gap: 20px; align-items: center; }
.scenario-identity { display: grid; gap: 2px; text-align: right; }
.scenario-identity span { font-size: 10.5px; letter-spacing: .06em; color: var(--subtle); text-transform: uppercase; }
.scenario-identity strong { font-size: 14px; color: var(--green); }

.content-area { position: relative; }
.view { display: none; }
.view.active { display: block; }

.section-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.section-heading h2 { margin: 0; font-size: 19px; }

.panel {
  background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 18px; box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
}
.panel-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
.panel-header h3 { margin: 0; font-size: 14px; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 18px; }
.kpi-tile {
  background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 14px 16px; display: grid; gap: 6px;
}
.kpi-tile span { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--subtle); }
.kpi-tile strong { font-size: 22px; color: var(--green); }

.overview-copy p { margin: 0 0 10px; color: var(--muted); line-height: 1.6; font-size: 14px; }
.overview-copy p:last-child { margin-bottom: 0; }
.overview-copy strong { color: var(--ink); }

.schema-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.schema-card h3 { margin: 0 0 10px; font-size: 14px; color: var(--green); font-family: ui-monospace, monospace; }
.schema-card table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.schema-card th { text-align: left; color: var(--subtle); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--line); }
.schema-card td { padding: 4px 6px; border-bottom: 1px solid var(--line); color: var(--muted); font-family: ui-monospace, monospace; }
.schema-card tr:last-child td { border-bottom: none; }

.scope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 18px; }
.scope-card {
  text-align: left; background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px; display: grid; gap: 6px; cursor: pointer;
}
.scope-card strong { font-size: 15px; }
.scope-card span { font-size: 12.5px; color: var(--muted); }
.scope-card.is-active { border-color: var(--green); background: var(--green-dark); }
.scope-card.is-active strong { color: var(--green); }

.capability-panel h3 { margin: 0 0 12px; font-size: 14px; }
.capability-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.capability-list li {
  display: flex; justify-content: space-between; align-items: center; padding: 8px 10px;
  border-radius: 8px; font-size: 13px; font-family: ui-monospace, monospace;
}
.capability-list li.is-granted { background: var(--green-dark); color: var(--green); }
.capability-list li.is-denied { background: var(--surface-soft); color: var(--subtle); }
.capability-list li span { font-family: Inter, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }

.console-layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 18px; align-items: start; }
.console-form { display: grid; gap: 12px; align-content: start; }
.console-form label { display: grid; gap: 5px; font-size: 12.5px; color: var(--muted); }
.console-form input, .console-form select {
  background: var(--surface-soft); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; color: var(--ink); font-size: 13.5px;
}
.primary-action {
  justify-self: start; display: inline-flex; align-items: center; gap: 6px;
  background: var(--green); color: #07160f; border: none; border-radius: 999px;
  padding: 10px 16px; font-size: 13px; font-weight: 760; cursor: pointer;
}
.console-evidence { display: grid; gap: 6px; }
.console-evidence pre {
  margin: 0 0 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
  padding: 12px; font-size: 12px; overflow: auto; max-height: 220px; color: var(--muted);
  font-family: ui-monospace, monospace; white-space: pre-wrap; word-break: break-word;
}

.catalog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.catalog-row {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 8px 4px; border-bottom: 1px solid var(--line); font-size: 12.5px;
}
.catalog-row:last-child { border-bottom: none; }
.catalog-row span.is-granted { color: var(--green); }
.catalog-row span.is-denied { color: var(--subtle); }
.catalog-row button {
  background: var(--surface-soft); border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 12px; font-size: 11.5px; color: var(--ink); cursor: pointer;
}

.table-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
thead th {
  text-align: left; padding: 10px 12px; background: var(--surface-soft); color: var(--subtle);
  font-weight: 600; text-transform: uppercase; font-size: 10.5px; letter-spacing: .05em;
  border-bottom: 1px solid var(--line);
}
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--line); color: var(--muted); }
tbody tr:last-child td { border-bottom: none; }
.decision-badge { padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; }
tr.decision-allow .decision-badge { background: var(--green-dark); color: var(--green); }
tr.decision-deny .decision-badge { background: var(--red-dark); color: var(--red); }
tr.decision-error .decision-badge { background: var(--amber-dark); color: var(--amber); }

@media (max-width: 860px) {
  .sidebar { position: static; width: auto; border-right: none; border-bottom: 1px solid var(--line); flex-direction: row; align-items: center; flex-wrap: wrap; }
  .nav-list { flex-direction: row; flex-wrap: wrap; }
  .sidebar-footer { margin-top: 0; flex-direction: row; }
  .main-content { margin-left: 0; padding: 18px 16px 40px; }
  .console-layout { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Write the app logic**

Create `financial-mcp/app.js`:

```js
import { SCHEMA, TASK_SCOPES, listAllTools, listAllResources, listAllPrompts, MockMcpServer } from "./mock-mcp-server.js";

const server = new MockMcpServer();

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item[data-view]");
const pageTitle = document.getElementById("page-title");

const VIEW_TITLES = {
  overview: "Overview",
  schema: "Schema",
  scope: "Task Scope",
  console: "Console",
  catalog: "Resources & Prompts",
  audit: "Audit Log"
};

function showView(viewId) {
  views.forEach(v => v.classList.toggle("active", v.dataset.viewPanel === viewId));
  navItems.forEach(n => n.classList.toggle("active", n.dataset.view === viewId));
  pageTitle.textContent = VIEW_TITLES[viewId] ?? viewId;
}

function updateScopeLabel() {
  document.getElementById("active-scope-label").textContent =
    server.scopeId ? TASK_SCOPES[server.scopeId].label : "None selected";
}

function renderOverview() {
  const grid = document.getElementById("kpi-grid");
  const log = server.getAuditLog();
  const tiles = [
    { label: "Tables", value: Object.keys(SCHEMA).length },
    { label: "Tools in catalogue", value: listAllTools().length },
    { label: "Resources in catalogue", value: listAllResources().length },
    { label: "Prompts in catalogue", value: listAllPrompts().length },
    { label: "Audit entries", value: log.length }
  ];
  grid.innerHTML = tiles.map(t => `<div class="kpi-tile"><span>${t.label}</span><strong>${t.value}</strong></div>`).join("");
}

function renderSchema() {
  const grid = document.getElementById("schema-grid");
  grid.innerHTML = Object.entries(SCHEMA).map(([table, columns]) => `
    <article class="panel schema-card">
      <h3>${table}</h3>
      <table><thead><tr><th>Column</th><th>Type</th></tr></thead><tbody>
        ${columns.map(c => `<tr><td>${c.name}</td><td>${c.type}</td></tr>`).join("")}
      </tbody></table>
    </article>
  `).join("");
}

function renderCapabilityPanel() {
  const panel = document.getElementById("capability-panel");
  if (!server.scopeId) {
    panel.innerHTML = `<p>Select a task above to see its granted capability set.</p>`;
    return;
  }
  const scope = TASK_SCOPES[server.scopeId];
  panel.innerHTML = `
    <h3>${scope.label} — granted tools</h3>
    <ul class="capability-list">
      ${listAllTools().map(t => `
        <li class="${scope.tools.includes(t.name) ? "is-granted" : "is-denied"}">
          <strong>${t.name}</strong><span>${scope.tools.includes(t.name) ? "granted" : "not granted"}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderScope() {
  const grid = document.getElementById("scope-grid");
  grid.innerHTML = Object.entries(TASK_SCOPES).map(([id, scope]) => `
    <button type="button" class="scope-card ${server.scopeId === id ? "is-active" : ""}" data-scope-id="${id}">
      <strong>${scope.label}</strong>
      <span>${scope.claim}</span>
    </button>
  `).join("");
  grid.querySelectorAll("[data-scope-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      server.selectTaskScope(btn.dataset.scopeId);
      refresh();
      renderScope();
    });
  });
  renderCapabilityPanel();
}

function paramInputValue(input, type) {
  if (input.value === "") return undefined;
  if (type === "number") return Number(input.value);
  if (type === "string[]") return input.value.split(",").map(s => s.trim()).filter(Boolean);
  return input.value;
}

function renderConsole() {
  const toolSelect = document.getElementById("console-tool");
  const paramsHost = document.getElementById("console-params");
  const allTools = listAllTools();
  const allowed = server.scopeId ? TASK_SCOPES[server.scopeId].tools : [];

  toolSelect.innerHTML = allTools.map(t => `<option value="${t.name}">${t.name}${allowed.includes(t.name) ? "" : " (not granted)"}</option>`).join("");

  function renderParamFields() {
    const def = allTools.find(t => t.name === toolSelect.value);
    paramsHost.innerHTML = (def?.inputSchema ?? []).map(p => `
      <label><span>${p.name}${p.required ? "" : " (optional)"}</span><input name="${p.name}" data-type="${p.type}" ${p.required ? "required" : ""} /></label>
    `).join("");
  }

  toolSelect.onchange = renderParamFields;
  renderParamFields();
}

function renderCatalog() {
  const resourceList = document.getElementById("resource-list");
  const promptList = document.getElementById("prompt-list");
  const granted = server.scopeId ? TASK_SCOPES[server.scopeId] : { resources: [], prompts: [] };

  resourceList.innerHTML = listAllResources().map(uri => `
    <div class="catalog-row">
      <span class="${granted.resources.includes(uri) ? "is-granted" : "is-denied"}">${uri}</span>
      <button type="button" data-read-resource="${uri}">Read</button>
    </div>
  `).join("");
  resourceList.querySelectorAll("[data-read-resource]").forEach(btn => {
    btn.addEventListener("click", () => {
      showResult(server.readResource(btn.dataset.readResource), "resources/read");
      refresh();
    });
  });

  promptList.innerHTML = listAllPrompts().map(p => `
    <div class="catalog-row">
      <span class="${granted.prompts.includes(p.id) ? "is-granted" : "is-denied"}">${p.title}</span>
      <button type="button" data-get-prompt="${p.id}">Get</button>
    </div>
  `).join("");
  promptList.querySelectorAll("[data-get-prompt]").forEach(btn => {
    btn.addEventListener("click", () => {
      showResult(server.getPrompt(btn.dataset.getPrompt), "prompts/get");
      refresh();
    });
  });
}

function showResult(entry, method) {
  showView("console");
  document.getElementById("console-request").textContent = JSON.stringify({ method, name: entry.name }, null, 2);
  document.getElementById("console-response").textContent = JSON.stringify(entry, null, 2);
}

function renderAuditLog() {
  const body = document.getElementById("audit-body");
  const log = server.getAuditLog();
  body.innerHTML = log.slice().reverse().map(e => `
    <tr class="decision-${e.decision}">
      <td>${e.id}</td>
      <td>${new Date(e.at).toLocaleTimeString()}</td>
      <td>${e.scope ?? "—"}</td>
      <td>${e.kind}</td>
      <td>${e.name}</td>
      <td><span class="decision-badge">${e.decision}</span></td>
      <td>${e.detail ?? (e.decision === "allow" ? "ok" : "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">No calls yet.</td></tr>`;
}

function refresh() {
  renderOverview();
  renderAuditLog();
  updateScopeLabel();
  if (document.getElementById("view-scope").classList.contains("active")) renderCapabilityPanel();
  if (document.getElementById("view-catalog").classList.contains("active")) renderCatalog();
}

const VIEW_RENDERERS = {
  overview: renderOverview,
  schema: renderSchema,
  scope: renderScope,
  console: renderConsole,
  catalog: renderCatalog,
  audit: renderAuditLog
};

navItems.forEach(item => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    const viewId = item.dataset.view;
    showView(viewId);
    VIEW_RENDERERS[viewId]?.();
  });
});

document.getElementById("console-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const toolName = document.getElementById("console-tool").value;
  const def = listAllTools().find(t => t.name === toolName);
  const params = {};
  (def?.inputSchema ?? []).forEach(p => {
    const input = event.target.elements[p.name];
    if (!input) return;
    const value = paramInputValue(input, p.type);
    if (value !== undefined) params[p.name] = value;
  });
  const entry = server.callTool(toolName, params);
  document.getElementById("console-request").textContent = JSON.stringify({ method: "tools/call", params: { name: toolName, arguments: params } }, null, 2);
  document.getElementById("console-response").textContent = JSON.stringify(entry, null, 2);
  refresh();
});

showView("overview");
renderOverview();
renderAuditLog();
updateScopeLabel();
```

- [ ] **Step 4: Verify in the browser**

Start a static server from the repo root (Node ships `npx`, no install needed):

Run: `npx --yes http-server -p 8123 -c-1 .` (leave running)

In the Browser pane:
1. Navigate to `http://localhost:8123/financial-mcp/console.html`.
2. Confirm the sidebar shows 6 nav items and the Overview KPI tiles render with `Tables: 6`, `Tools in catalogue: 8`, `Resources in catalogue: 6`, `Prompts in catalogue: 3`, `Audit entries: 0`.
3. Click **Task Scope**, click the **Trade execution** card, confirm it highlights and the capability panel shows `place_order` as granted and `get_fundamentals` as not granted.
4. Click **Console**, select `place_order`, fill `account_id=ACC-1001`, `ticker=AAPL`, `side=buy`, `quantity=5`, submit — confirm the response pane shows `"decision": "allow"` and `"status": "filled"`.
5. Switch scope to **Equity research**, go to **Console**, select `place_order`, submit with the same params — confirm `"decision": "deny"`.
6. Click **Audit Log**, confirm both calls appear with the correct decisions, newest first.
7. Check the Browser pane console for errors (`read_console_messages`, `onlyErrors: true`) — expect none.

- [ ] **Step 5: Commit**

```bash
git add financial-mcp/console.html financial-mcp/styles.css financial-mcp/app.js
git commit -m "Add interactive console UI for scoped financial-data MCP mock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Embed wrapper (`index.html`)

**Files:**
- Create: `financial-mcp/index.html`

**Interfaces:**
- Consumes: iframes `./console.html` from Task 2.
- Consumes: `../styles.css`, `../script.js` (existing site chrome — do not modify).

- [ ] **Step 1: Create the wrapper page**

Create `financial-mcp/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f4f0e8">
  <meta name="description" content="Mock-only embedded console for the scoped financial-data MCP proof of concept.">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Scoped financial MCP mock console — Somesh Jha">
  <meta property="og:description" content="A single-page mock-only showcase embedding a scoped MCP tools console and linking to the real implementation repository.">
  <meta property="og:url" content="https://someshjha.com/financial-mcp/">
  <link rel="canonical" href="https://someshjha.com/financial-mcp/">
  <script>document.documentElement.classList.add('js')</script>
  <link rel="stylesheet" href="../styles.css?v=theme-notes-v2">
  <script defer src="../script.js?v=theme-notes-v2"></script>
  <title>Scoped financial MCP mock console — Somesh Jha</title>
</head>
<body class="pocs-page poc-embed-page">
  <a class="skip-link" href="#financial-mcp-frame">Skip to console</a>

  <header class="site-header scrolled" data-header>
    <div class="shell nav-wrap">
      <a class="brand" href="../index.html" aria-label="Somesh Jha, home">
        <span class="brand-mark" aria-hidden="true">SJ</span>
        <span class="brand-name">Somesh Jha</span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span class="sr-only">Toggle navigation</span>
        <span></span><span></span>
      </button>
      <nav class="nav" id="site-nav" aria-label="Primary navigation">
        <a href="../index.html#about">About</a>
        <a href="../index.html#services">Services</a>
        <a href="../index.html#work">Work</a>
        <a href="../pocs.html" aria-current="page">PoCs</a>
        <a href="../writing.html">Notes</a>
        <a class="nav-cta" href="../index.html#contact">Contact <span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </header>

  <main>
    <section class="poc-embed-hero" aria-labelledby="poc-title">
      <div class="shell poc-embed-hero-grid">
        <div>
          <p class="eyebrow"><span></span> Mock-only embedded console</p>
          <h1 id="poc-title">Scoped financial <em>MCP.</em></h1>
        </div>
        <div class="poc-embed-copy">
          <p>This page embeds a mock MCP console directly below. It simulates the tools/resources/prompts protocol with representative Postgres-shaped financial data and enforces task-scoped access in the browser only. The repository will contain the real Python MCP server, Postgres schema, and kind + Argo CD deployment.</p>
          <div class="poc-embed-actions">
            <a class="button button-dark" href="https://github.com/someshjha/poc_mcp" target="_blank" rel="noopener noreferrer">Real implementation repo <span aria-hidden="true">↗</span></a>
            <a class="text-link" href="../pocs.html#financial-data">PoC registry</a>
          </div>
        </div>
      </div>
    </section>

    <section class="poc-embed-shell" aria-labelledby="frame-title">
      <div class="shell">
        <div class="poc-embed-notice" role="note">
          <strong>Mock only</strong>
          <span>The embedded console does not run a real MCP server or Postgres. Use the GitHub repository to run the real local kind + Argo CD implementation once it is published.</span>
        </div>

        <div class="poc-frame-card">
          <div class="poc-frame-toolbar">
            <div>
              <span></span><span></span><span></span>
            </div>
            <strong id="frame-title">Scoped MCP console mock</strong>
            <a href="./console.html" target="_blank" rel="noopener noreferrer">Open frame directly ↗</a>
          </div>
          <iframe
            id="financial-mcp-frame"
            title="Scoped financial MCP mock console"
            src="./console.html"
            loading="eager"
            referrerpolicy="no-referrer"
          ></iframe>
        </div>
      </div>
    </section>
  </main>

  <footer class="poc-footer">
    <div class="shell">
      <p>© <span data-year></span> Somesh Jha</p>
      <p>Mock-only public iframe · Real system in GitHub</p>
      <a href="../pocs.html">PoC registry ↑</a>
    </div>
  </footer>
  <script>
    const frame = document.querySelector("#financial-mcp-frame");

    function resizeConsoleFrame() {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        frame.style.height = "0px";
        const height = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight || 0,
          880
        );
        frame.style.height = `${height}px`;
      } catch {
        frame.style.height = "940px";
      }
    }

    frame.addEventListener("load", () => {
      resizeConsoleFrame();
      const doc = frame.contentDocument;
      if (!doc) return;
      new ResizeObserver(() => requestAnimationFrame(resizeConsoleFrame)).observe(doc.documentElement);
      doc.addEventListener("click", () => requestAnimationFrame(resizeConsoleFrame));
      doc.addEventListener("input", () => requestAnimationFrame(resizeConsoleFrame));
    });

    new ResizeObserver(() => requestAnimationFrame(resizeConsoleFrame)).observe(frame);
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in the browser**

With the static server from Task 2 still running (`http://localhost:8123`):

1. Navigate to `http://localhost:8123/financial-mcp/index.html`.
2. Confirm the hero renders, the "Real implementation repo" button links to `https://github.com/someshjha/poc_mcp`, and the "PoC registry" link points to `../pocs.html#financial-data`.
3. Confirm the iframe loads `console.html` and resizes to show the full console without an inner scrollbar (use `read_page` or a screenshot to check).
4. Click into the iframe, select a task scope, confirm the frame still resizes correctly after the DOM changes (the `ResizeObserver` + click listener from `index.html`'s script).

- [ ] **Step 3: Commit**

```bash
git add financial-mcp/index.html
git commit -m "Add iframe embed wrapper for scoped financial-data MCP mock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Site integration (`pocs.html`, `poc-demos.html`)

**Files:**
- Modify: `pocs.html:133-148` (the `#financial-data` `<li class="poc-item">` block)
- Modify: `poc-demos.html:135-153` (the `#financial-data-demo` `<article class="demo-panel">` block)

**Interfaces:**
- Consumes: `financial-mcp/index.html` (Task 3), `https://github.com/someshjha/poc_mcp`.

- [ ] **Step 1: Add the mock-demo link to `pocs.html`**

In `pocs.html`, find the `poc-actions` block inside the `#financial-data` item (currently):

```html
            <div class="poc-actions">
              <span class="poc-pending">Repository planned</span>
              <a class="poc-demo-link" href="poc-demos.html#financial-data-demo">Concept demo <span aria-hidden="true">→</span></a>
            </div>
```

Replace it with:

```html
            <div class="poc-actions">
              <span class="poc-pending">Repository planned</span>
              <a class="poc-demo-link" href="financial-mcp/">Open mock demo <span aria-hidden="true">→</span></a>
              <a class="poc-demo-link" href="poc-demos.html#financial-data-demo">Concept demo <span aria-hidden="true">→</span></a>
            </div>
```

- [ ] **Step 2: Add the mock-demo note to `poc-demos.html`**

In `poc-demos.html`, find the `financial-data-demo` panel's closing output paragraph (currently ends with):

```html
            <p class="demo-output" data-demo-output aria-live="polite">Select a task to issue a scoped capability set and record the decision.</p>
          </div>
        </div>
      </article>
```

Replace it with:

```html
            <p class="demo-output" data-demo-output aria-live="polite">Select a task to issue a scoped capability set and record the decision.</p>
            <p class="demo-output">This inline preview is a simplified teaser. Open the full <a href="financial-mcp/">scoped MCP console mock</a> or the (repository planned) <a href="https://github.com/someshjha/poc_mcp" target="_blank" rel="noopener noreferrer">real implementation repository</a>.</p>
          </div>
        </div>
      </article>
```

- [ ] **Step 3: Verify in the browser**

With the static server still running:

1. Navigate to `http://localhost:8123/pocs.html`, find the "Scoped financial-data tools for agents" entry, confirm it now shows three items in `.poc-actions`: "Repository planned" text, "Open mock demo" link, "Concept demo" link. Click "Open mock demo" and confirm it lands on the console page.
2. Navigate to `http://localhost:8123/poc-demos.html#financial-data-demo`, confirm the new closing paragraph renders with both links, and that the "scoped MCP console mock" link opens `financial-mcp/`.
3. Confirm the existing button-driven mini-demo on this panel (research/risk buttons, wired in `poc-demos.js`) still works — click "Equity research task" and confirm the output text still updates (this plan does not touch `poc-demos.js`).
4. Stop the static server (`Ctrl+C` in the terminal, or kill the background process).

- [ ] **Step 4: Commit**

```bash
git add pocs.html poc-demos.html
git commit -m "Link the scoped financial-data MCP mock demo from the PoC pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
