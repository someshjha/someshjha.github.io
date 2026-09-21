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
