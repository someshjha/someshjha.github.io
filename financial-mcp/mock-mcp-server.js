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
