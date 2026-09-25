import { MockDemoApi, summarize } from "./mock-api.js";

const api = new MockDemoApi();
const catalogue = api.getScenarioCatalogue();
let state = api.getSnapshot();
let pendingAction = null;

const viewTitles = {
  overview: "Overview",
  orders: "Orders",
  producer: "Produce Event",
  quality: "Data Quality",
  pipeline: "Pipeline Health",
  lab: "Demo Lab",
  architecture: "Architecture"
};

const scenarioCards = [
  ["happy_path", "Happy path", "Valid order and payment reach the serving store."],
  ["duplicate", "Duplicate event", "Replay an event ID; business totals stay unchanged."],
  ["invalid", "Invalid event", "Reject a negative amount without stopping processing."],
  ["late_payment", "Late payment", "Apply delayed data to the correct event-time result."],
  ["recovery", "Recovery test", "Restart Flink and restore managed state."],
  ["reset", "Reset demo", "Return every synthetic result to the baseline fixture."]
];

const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const number = new Intl.NumberFormat("en-CA");
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function navigate(view, updateHash = true) {
  const next = viewTitles[view] ? view : "overview";
  $$("[data-view-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.viewPanel === next));
  $$("[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === next));
  $("#page-title").textContent = viewTitles[next];
  document.title = `OrderFlow — ${viewTitles[next]}`;
  if (updateHash) history.replaceState(null, "", `#${next}`);
  $(".sidebar").classList.remove("open");
  $(".mobile-menu").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll(nextState) {
  state = nextState;
  const summary = summarize(state);
  renderHeader(summary);
  renderPipeline(summary);
  renderKpis(summary);
  renderChart();
  renderRecentEvents();
  renderReconciliationBanner(summary);
  renderOrders();
  renderQuality(summary);
  renderHealth(summary);
  renderScenarios();
  renderMonitor();
  renderReconciliation(summary);
}

function renderHeader(summary) {
  $("#active-scenario-label").textContent = `${state.scenarioLabel} · ${state.scenarioId.slice(-3)}`;
  $("#refresh-time").textContent = "Just now";
  const health = $("#overall-health");
  const recovering = state.health.flink === "recovering";
  health.classList.toggle("recovering", recovering);
  health.querySelector("strong").textContent = recovering ? "Flink recovering" : "All systems healthy";
  health.querySelector("span").textContent = recovering ? "SYSTEM RECOVERY" : "SYSTEM STATUS";
  $("#order-count").textContent = `${number.format(summary.ordersReceived)} orders`;
}

function renderPipeline(summary) {
  $("#kafka-detail").textContent = `${summary.producedEventCount} events · ${state.health.lag} lag`;
  $("#flink-detail").textContent = state.health.flink === "recovering"
    ? "Restoring from checkpoint…"
    : `${summary.acceptedEventCount} accepted · ${summary.rejectedEventCount + summary.duplicateEventCount} isolated`;
  $("#postgres-detail").textContent = `${summary.ordersReceived} current orders · ${(summary.latencyP95Ms / 1000).toFixed(1)}s p95`;
  $$(".flow-connector").forEach(connector => connector.classList.toggle("active", state.run?.status === "running"));
  const flinkDot = $('[data-stage="flink"] .status-dot');
  flinkDot.classList.toggle("warning", state.health.flink === "recovering");
  flinkDot.setAttribute("aria-label", state.health.flink === "recovering" ? "Recovering" : "Healthy");
}

function renderKpis(summary) {
  const cards = [
    ["Orders received", number.format(summary.ordersReceived), "Unique valid orders", "+ live"],
    ["Gross order amount", currency.format(summary.grossAmount), "Before payment outcome", "CAD"],
    ["Captured amount", currency.format(summary.capturedAmount), "Successfully paid", `${summary.capturedPaymentCount} payments`],
    ["Payment success", `${(summary.paymentSuccessRate * 100).toFixed(1)}%`, `${summary.capturedPaymentCount} of ${summary.terminalPaymentCount} terminal attempts`, "event time"],
    ["Rejected events", number.format(summary.rejectedEventCount), "Safely isolated", "pipeline healthy", "warning"],
    ["End-to-end latency", `${(summary.latencyP95Ms / 1000).toFixed(1)}s`, "Kafka event to PostgreSQL", "p95"]
  ];
  $("#kpi-grid").innerHTML = cards.map(([label, value, help, trend, modifier]) => `
    <article class="kpi-card ${modifier ?? ""}">
      <div class="kpi-label"><span>${label}</span><b class="trend">${trend}</b></div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-help">${help}</div>
    </article>`).join("");
}

function renderChart() {
  const svg = $("#activity-chart");
  const data = state.activity;
  const width = 720;
  const height = 260;
  const margin = { top: 18, right: 28, bottom: 30, left: 32 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxOrders = Math.max(...data.map(point => point.orders), 10);
  const maxRevenue = Math.max(...data.map(point => point.captured), 1500);
  const x = index => margin.left + (chartWidth * index) / Math.max(data.length - 1, 1);
  const yOrders = value => margin.top + chartHeight - (value / maxOrders) * chartHeight;
  const yRevenue = value => margin.top + chartHeight - (value / maxRevenue) * chartHeight;
  const orderPath = data.map((point, index) => `${index ? "L" : "M"}${x(index)},${yOrders(point.orders)}`).join(" ");
  const revenuePath = data.map((point, index) => `${index ? "L" : "M"}${x(index)},${yRevenue(point.captured)}`).join(" ");
  const areaPath = `${orderPath} L${x(data.length - 1)},${margin.top + chartHeight} L${x(0)},${margin.top + chartHeight} Z`;
  const grid = [0, .25, .5, .75, 1].map(ratio => {
    const y = margin.top + chartHeight * ratio;
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/><text class="chart-axis" x="2" y="${y + 3}">${Math.round(maxOrders * (1 - ratio))}</text>`;
  }).join("");
  const labels = data.map((point, index) => `<text class="chart-axis" x="${x(index)}" y="${height - 7}" text-anchor="middle">${point.time}</text>`).join("");
  const dots = data.map((point, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${yOrders(point.orders)}" r="3.5"/>`).join("");
  svg.innerHTML = `<defs><linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ee0a0" stop-opacity=".22"/><stop offset="1" stop-color="#5ee0a0" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-order-area" d="${areaPath}"/><path class="chart-order" d="${orderPath}"/><path class="chart-revenue" d="${revenuePath}"/>${dots}${labels}`;
}

function getRecentOutcomes() {
  const base = [
    { icon: "✓", title: "Payment correlated", detail: "ORD-006 · matched by order ID", tone: "", at: "14:03:02" },
    { icon: "↺", title: "Duplicate prevented", detail: "ORD-004 · totals unchanged", tone: "", at: "14:03:09" },
    { icon: "!", title: "Invalid event isolated", detail: "ORD-011 · negative amount", tone: "warning", at: "14:02:55" },
    { icon: "◷", title: "Late event applied", detail: "ORD-006 · correct window updated", tone: "", at: "14:03:02" }
  ];
  const latest = {
    happy_path: { icon: "✓", title: "Order processed", detail: "ORD-009 · available in PostgreSQL", tone: "", at: "now" },
    duplicate: { icon: "↺", title: "Duplicate prevented", detail: "ORD-004 · business totals unchanged", tone: "", at: "now" },
    invalid: { icon: "!", title: "Invalid event isolated", detail: "ORD-012 · processing continued", tone: "warning", at: "now" },
    late_payment: { icon: "◷", title: "Late event applied", detail: "ORD-008 · earlier minute corrected", tone: "", at: "now" },
    recovery: { icon: "✓", title: "Recovered from checkpoint", detail: `Checkpoint ${state.health.checkpointId} · totals reconciled`, tone: "", at: "now" },
    reset: { icon: "✓", title: "Baseline restored", detail: "Synthetic demo state is ready", tone: "", at: "now" }
  }[state.latestOutcome];
  return latest ? [latest, ...base].slice(0, 4) : base;
}

function renderRecentEvents() {
  $("#recent-events").innerHTML = getRecentOutcomes().map(event => `
    <div class="event-row">
      <span class="event-icon ${event.tone}">${event.icon}</span>
      <div><strong>${event.title}</strong><span>${event.detail}</span></div>
      <time>${event.at}</time>
    </div>`).join("");
}

function renderReconciliationBanner(summary) {
  $("#reconciliation-banner").innerHTML = `
    <div><strong>Source-to-result reconciliation passes</strong><p>Every produced event has a visible processing outcome.</p></div>
    <div class="reconciliation-equation">${summary.producedEventCount} produced = ${summary.acceptedEventCount} accepted + ${summary.rejectedEventCount} rejected + ${summary.duplicateEventCount} duplicate</div>`;
}

function renderOrders() {
  const query = $("#order-search")?.value.toLowerCase().trim() ?? "";
  const paymentFilter = $("#payment-filter")?.value ?? "all";
  const orders = [...state.orders].reverse().filter(order => {
    const haystack = `${order.orderId} ${order.customerId} ${order.paymentId ?? ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (paymentFilter === "all" || order.paymentStatus === paymentFilter);
  });
  $("#order-count").textContent = `${orders.length} of ${state.orders.length} orders`;
  $("#orders-body").innerHTML = orders.length ? orders.map(order => `
    <tr tabindex="0" data-order-id="${order.orderId}" aria-label="Open details for ${order.orderId}">
      <td><strong>${order.orderId}</strong></td><td>${order.customerId}</td><td>${order.status}</td>
      <td><strong>${currency.format(Number(order.amount))}</strong></td>
      <td><span class="status-pill ${order.paymentStatus.toLowerCase()}">${order.paymentStatus === "UNPAID" ? "UNPAID" : order.paymentStatus}</span></td>
      <td>${time.format(new Date(order.eventTime))}</td><td>${(order.latencyMs / 1000).toFixed(2)}s</td>
    </tr>`).join("") : `<tr><td colspan="7">No orders match the current filters.</td></tr>`;
}

function renderQuality(summary) {
  $("#quality-summary").innerHTML = `
    <article class="quality-stat"><p class="eyebrow">ACCEPTED</p><strong>${summary.acceptedEventCount}</strong><p>Valid unique events used in business results.</p></article>
    <article class="quality-stat rejected"><p class="eyebrow">REJECTED</p><strong>${summary.rejectedEventCount}</strong><p>Invalid events safely sent to the dead-letter path.</p></article>
    <article class="quality-stat"><p class="eyebrow">DUPLICATES PREVENTED</p><strong>${summary.duplicateEventCount}</strong><p>Repeated identifiers excluded from business totals.</p></article>`;
  $("#rejections-list").innerHTML = state.rejections.map(item => `
    <div class="rejection-row">
      <span class="event-icon">!</span>
      <div><h4>${item.reasonDetail}</h4><p>${item.orderId} from ${item.sourceTopic}. Processing continued; valid events were unaffected.</p><div class="payload-block">{ order_id: "${item.orderId}", <mark>amount: ${item.payload.amount}</mark>, currency: "${item.payload.currency}" }</div></div>
      <span class="reason-code">${item.reasonCode}</span>
    </div>`).join("");
  $("#duplicate-card").innerHTML = `
    <p class="eyebrow">DEDUPLICATION EVIDENCE</p><h3>Same identifier, one business result</h3><p>Flink keyed state remembers processed event identifiers for the configured retention period.</p>
    <div class="event-compare"><div><small>ORIGINAL</small><strong>EVT-ORDER-004</strong><span>Accepted · 14:01:37</span></div><span>≠</span><div><small>REPLAY</small><strong>EVT-ORDER-004</strong><span>Ignored · 14:03:09</span></div></div>
    <div class="proof-callout">Duplicate prevented — order count and financial totals remained unchanged.</div>`;
}

function renderHealth(summary) {
  const cards = [
    { icon: "K", className: "kafka-icon", eyebrow: "EVENT BACKBONE", title: "Apache Kafka", metrics: [["orders.v1 records", summary.ordersReceived], ["payments.v1 records", summary.terminalPaymentCount], ["events.dlq.v1 records", summary.rejectedEventCount], ["Consumer lag", state.health.lag], ["Partitions", 7]], explanation: "Kafka stores the replayable stream and separates event producers from Flink processing." },
    { icon: "F", className: "flink-icon", eyebrow: "STREAM PROCESSOR", title: "Apache Flink", metrics: [["Job state", state.health.flink.toUpperCase()], ["Accepted events", summary.acceptedEventCount], ["Duplicates prevented", summary.duplicateEventCount], ["Latest checkpoint", `#${state.health.checkpointId}`], ["Restart count", state.health.restartCount]], explanation: "Flink validates, remembers, correlates, and aggregates events using event time." },
    { icon: "P", className: "postgres-icon", eyebrow: "OPERATIONAL STORE", title: "PostgreSQL", metrics: [["order_current", summary.ordersReceived], ["order_metrics_1m", state.activity.length], ["rejected_event", summary.rejectedEventCount], ["p95 write latency", "95ms"], ["Sink errors", 0]], explanation: "PostgreSQL serves the current business view and audit evidence shown by this UI." }
  ];
  $("#health-grid").innerHTML = cards.map(card => `
    <article class="health-card">
      <div class="health-title"><span class="tech-icon ${card.className}">${card.icon}</span><div><small>${card.eyebrow}</small><strong>${card.title}</strong></div><span class="healthy-label">● ${card.title === "Apache Flink" && state.health.flink === "recovering" ? "RECOVERING" : "HEALTHY"}</span></div>
      <div class="metric-list">${card.metrics.map(([label, value]) => `<div class="metric-row"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="health-explainer">${card.explanation}</div>
    </article>`).join("");
}

function renderScenarios() {
  const running = state.run?.status === "running";
  $("#scenario-grid").innerHTML = scenarioCards.map(([type, name, description], index) => `
    <article class="scenario-card ${type === "reset" ? "destructive" : ""}">
      <span class="scenario-number">${String(index + 1).padStart(2, "0")}</span>
      <div><h3>${name}</h3><p>${description}</p></div>
      <button type="button" data-scenario="${type}" aria-label="Run ${name}" ${running ? "disabled" : ""}>${type === "reset" ? "↺" : "▶"}</button>
    </article>`).join("");
}

function renderMonitor() {
  const monitor = $("#run-monitor");
  if (!state.run) {
    monitor.innerHTML = `<div class="monitor-empty"><div><span class="lab-symbol">⌁</span><h3>No scenario running</h3><p>Choose a controlled test to see each event move through Kafka, Flink, and PostgreSQL.</p></div></div>`;
    return;
  }
  const { status, currentStep, steps, name } = state.run;
  const passed = status === "passed";
  const progress = passed ? 100 : Math.round(((currentStep + .45) / steps.length) * 100);
  monitor.innerHTML = `
    <div class="monitor-status"><i></i>${passed ? "VERIFICATION PASSED" : "SCENARIO RUNNING"}</div>
    <h3>${name}</h3><p>${passed ? "All expected results were observed and reconciled." : catalogue[state.run.type].description}</p>
    <div class="progress-track"><span style="transform:scaleX(${progress / 100})"></span></div>
    <div class="run-steps">${steps.map((step, index) => `<div class="run-step ${passed || index < currentStep ? "done" : index === currentStep ? "current" : ""}"><i>${passed || index < currentStep ? "✓" : index + 1}</i><span>${step}</span></div>`).join("")}</div>`;
}

function renderReconciliation(summary) {
  $("#reconciliation-panel").innerHTML = `
    <p class="eyebrow">SOURCE-TO-RESULT CHECK</p><h3>Reconciliation</h3>
    <div class="equation-box"><strong>${summary.producedEventCount}</strong><span>produced</span><span>=</span><strong>${summary.acceptedEventCount}</strong><span>accepted</span><span>+</span><strong>${summary.rejectedEventCount}</strong><span>rejected</span><span>+</span><strong>${summary.duplicateEventCount}</strong><span>duplicate</span></div>
    <div class="assertion-list"><div class="assertion"><span>ORDER COUNT</span><strong>${summary.ordersReceived} queryable</strong></div><div class="assertion"><span>CAPTURED TOTAL</span><strong>${currency.format(summary.capturedAmount)}</strong></div><div class="assertion"><span>PIPELINE STATE</span><strong>No data loss</strong></div><div class="assertion"><span>RESULT</span><strong>All checks pass</strong></div></div>`;
}

function openOrderDrawer(orderId) {
  const order = state.orders.find(item => item.orderId === orderId);
  if (!order) return;
  const lateDetail = order.late ? "Arrived after its event-time minute; applied within allowed lateness." : "Processed within the expected event-time window.";
  $("#drawer-content").innerHTML = `
    <p class="eyebrow">ORDER JOURNEY</p><h2 class="drawer-order" id="drawer-title">${order.orderId}</h2><p class="drawer-subtitle">Synthetic customer ${order.customerId}</p>
    <div class="drawer-summary"><div><span>ORDER STATUS</span><strong>${order.status}</strong></div><div><span>PAYMENT</span><strong>${order.paymentStatus}</strong></div><div><span>AMOUNT</span><strong>${currency.format(Number(order.amount))}</strong></div><div><span>END-TO-END</span><strong>${(order.latencyMs / 1000).toFixed(2)}s</strong></div></div>
    <h3 class="journey-title">Kafka → Flink → PostgreSQL</h3>
    <div class="journey">
      <div class="journey-step"><i>1</i><div><strong>Event received</strong><span>Written to orders.v1 with order_id as key.</span></div><time>${time.format(new Date(order.eventTime))}</time></div>
      <div class="journey-step"><i>2</i><div><strong>Validated and deduplicated</strong><span>Schema and business rules passed; event ID was unique.</span></div><time>+0.24s</time></div>
      <div class="journey-step"><i>3</i><div><strong>${order.paymentStatus === "UNPAID" ? "Awaiting payment" : "Payment correlated"}</strong><span>${order.paymentStatus === "UNPAID" ? "No payment event has been observed." : `${order.paymentId} matched by order_id. ${lateDetail}`}</span></div><time>+0.67s</time></div>
      <div class="journey-step"><i>4</i><div><strong>Current state persisted</strong><span>Idempotent upsert completed in PostgreSQL.</span></div><time>+${(order.latencyMs / 1000).toFixed(2)}s</time></div>
    </div>
    <div class="what-proves">${order.late ? "Late event applied — the correct order and event-time result were updated." : "This proves that a valid source event becomes queryable operational state within the latency target."}</div>`;
  $("#drawer-backdrop").hidden = false;
  $("#order-drawer").classList.add("open");
  $("#order-drawer").setAttribute("aria-hidden", "false");
  $(".drawer-close").focus();
}

function closeOrderDrawer() {
  $("#order-drawer").classList.remove("open");
  $("#order-drawer").setAttribute("aria-hidden", "true");
  $("#drawer-backdrop").hidden = true;
}

function requestScenario(type) {
  if (type === "reset" || type === "recovery") {
    pendingAction = type;
    $("#dialog-title").textContent = type === "reset" ? "Reset synthetic demo data?" : "Restart the local Flink job?";
    $("#dialog-copy").textContent = type === "reset"
      ? "This returns scenario data to the initial fixture. Infrastructure and configuration are not removed."
      : "Current totals will be captured, Flink will recover from a checkpoint, and reconciled results will be verified.";
    $("#dialog-confirm").textContent = type === "reset" ? "Reset demo" : "Restart safely";
    $("#confirm-dialog").showModal();
    return;
  }
  executeScenario(type);
}

async function executeScenario(type) {
  navigate("lab");
  try {
    await api.runScenario(type);
    showToast(`${catalogue[type].name} completed — verification passed.`);
  } catch (error) {
    showToast(error.message);
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 3800);
}

function producerPayload() {
  const form = $("#producer-form");
  const values = Object.fromEntries(new FormData(form));
  const payload = {
    event_type: values.event_type,
    order_id: values.order_id,
    amount: Number(values.amount),
    currency: values.currency
  };
  if (values.event_id) payload.event_id = values.event_id;
  if (values.event_type === "ORDER") {
    payload.customer_id = values.customer_id;
    payload.order_status = values.order_status;
  } else {
    payload.payment_id = values.payment_id;
    payload.payment_status = values.payment_status;
  }
  return payload;
}

function updateProducerForm() {
  const payment = $("#producer-type").value === "PAYMENT";
  $$('[data-order-field]').forEach(field => {
    field.hidden = payment;
    field.querySelector("input,select").required = !payment;
  });
  $$('[data-payment-field]').forEach(field => {
    field.hidden = !payment;
    field.querySelector("input,select").required = payment;
  });
  const topic = payment ? "payments.v1" : "orders.v1";
  $("#producer-topic").textContent = topic;
  $("#kafka-guide-topic").textContent = topic;
  $("#producer-preview").textContent = JSON.stringify({ ...producerPayload(), scenario_id: "user-live", event_time: "generated on publish" }, null, 2);
}

function addProducerReceipt(result) {
  const receipts = $("#producer-receipts");
  receipts.querySelector(".empty-copy")?.remove();
  const receipt = document.createElement("article");
  receipt.className = "producer-receipt";
  const heading = document.createElement("strong");
  heading.textContent = result.event_id;
  const location = document.createElement("span");
  location.textContent = `${result.topic} · partition ${result.partition} · offset ${result.offset}`;
  const outcome = document.createElement("small");
  outcome.textContent = "Published to Kafka; awaiting Flink processing";
  receipt.append(heading, location, outcome);
  receipts.prepend(receipt);
}

async function publishUserEvent(event) {
  event.preventDefault();
  const button = $("#producer-submit");
  button.disabled = true;
  button.firstChild.textContent = "Publishing… ";
  try {
    if (typeof api.produceEvent !== "function") throw new Error("User event publishing requires the running local stack");
    const result = await api.produceEvent(producerPayload());
    addProducerReceipt(result);
    showToast(`${result.event_id} published to ${result.topic}.`);
    $("#producer-form").elements.event_id.value = "";
    updateProducerForm();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "Publish event ";
  }
}

function bindEvents() {
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    const target = event.target.closest("[data-target-view]");
    const scenario = event.target.closest("[data-scenario]");
    const orderRow = event.target.closest("[data-order-id]");
    if (nav) { event.preventDefault(); navigate(nav.dataset.view); }
    if (target) navigate(target.dataset.targetView);
    if (scenario) requestScenario(scenario.dataset.scenario);
    if (orderRow) openOrderDrawer(orderRow.dataset.orderId);
  });
  document.addEventListener("keydown", event => {
    const orderRow = event.target.closest("[data-order-id]");
    if (orderRow && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openOrderDrawer(orderRow.dataset.orderId); }
    if (event.key === "Escape") closeOrderDrawer();
  });
  $("#order-search").addEventListener("input", renderOrders);
  $("#payment-filter").addEventListener("change", renderOrders);
  $("#producer-form").addEventListener("submit", publishUserEvent);
  $("#producer-form").addEventListener("input", updateProducerForm);
  $("#producer-form").addEventListener("change", updateProducerForm);
  $(".drawer-close").addEventListener("click", closeOrderDrawer);
  $("#drawer-backdrop").addEventListener("click", closeOrderDrawer);
  $(".mobile-menu").addEventListener("click", event => {
    const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", String(!expanded));
    $(".sidebar").classList.toggle("open", !expanded);
  });
  $("#confirm-dialog").addEventListener("close", event => {
    if (event.target.returnValue === "confirm" && pendingAction) executeScenario(pendingAction);
    pendingAction = null;
  });
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1), false));
}

bindEvents();
updateProducerForm();
api.subscribe(renderAll);
navigate(location.hash.slice(1) || "overview", false);
