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
      <label><span>${p.name}${p.required ? "" : " (optional)"}</span><input name="${p.name}" data-type="${p.type}" ${p.type === "number" ? 'type="number" step="1" min="1"' : 'type="text"'} ${p.required ? "required" : ""} /></label>
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
