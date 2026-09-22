import { CASE, AUTOMATED_STEPS, MockFraudWorkflow } from "./mock-fraud-workflow.js";

const workflow = new MockFraudWorkflow();

const DIAGRAM_STEPS = [
  { key: "IngestAlert", label: "Ingest alert" },
  { key: "DeviceIntelligenceLookup", label: "Device intelligence lookup" },
  { key: "SanctionsListCheck", label: "Sanctions list check" },
  { key: "TransactionPatternAnalysis", label: "Transaction pattern analysis" },
  { key: "Review", label: "Analyst review (SLA)" },
  { key: "Resolution", label: "Resolution" }
];

document.getElementById("cardholder-name").textContent = CASE.cardholder.name;
document.getElementById("cardholder-account").textContent = `${CASE.cardholder.account_id} · •••• ${CASE.cardholder.card_last4}`;
document.getElementById("alert-summary").textContent = `$${CASE.alert.amount_usd.toLocaleString()} at ${CASE.alert.merchant} (${CASE.alert.merchant_country})`;
document.getElementById("alert-source").textContent = CASE.alert.source;

const startBtn = document.getElementById("start-case-btn");
const killBtn = document.getElementById("kill-worker-btn");
const restartBtn = document.getElementById("restart-worker-btn");
const confirmBtn = document.getElementById("confirm-fraud-btn");
const clearBtn = document.getElementById("clear-btn");
const fastForwardBtn = document.getElementById("fast-forward-btn");
const queryBtn = document.getElementById("query-btn");

function formatMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function diagramStatusFor(key) {
  const { phase, stepIndex, attempts, workerAlive } = workflow;
  const autoIndex = AUTOMATED_STEPS.findIndex((s) => s.id === key);

  if (autoIndex !== -1) {
    if (phase === "idle") return "pending";
    if (phase !== "steps") return "done";
    if (autoIndex < stepIndex) return "done";
    if (autoIndex > stepIndex) return "pending";
    if (!workerAlive) return "interrupted";
    return (attempts[key] ?? 0) > 1 ? "retrying" : "running";
  }

  if (key === "Review") {
    if (phase === "idle" || phase === "steps") return "pending";
    if (phase === "awaiting-decision") return workflow.workerAlive ? "running" : "interrupted";
    return "done";
  }

  if (key === "Resolution") {
    if (phase === "resolving") return workflow.workerAlive ? "running" : "interrupted";
    if (phase === "done") return "done";
    return "pending";
  }

  return "pending";
}

function renderDiagram() {
  const list = document.getElementById("workflow-steps");
  list.innerHTML = DIAGRAM_STEPS.map((step) => {
    const status = diagramStatusFor(step.key);
    const attempt = workflow.attempts[step.key];
    const suffix = status === "retrying" ? ` (attempt ${attempt})` : "";
    return `<li data-status="${status}">
      <span class="step-name">${step.label}</span>
      <span class="step-status">${status}${suffix}</span>
    </li>`;
  }).join("");
}

function renderHeader() {
  const badge = document.getElementById("case-status-badge");
  const map = {
    idle: ["idle", "Not started"],
    steps: ["running", "Running automated checks"],
    "awaiting-decision": ["awaiting-decision", "Awaiting human review"],
    resolving: ["running", "Resolving"],
    done: [
      workflow.terminalStatus === "Confirmed" ? "confirmed" : workflow.terminalStatus === "Cleared" ? "cleared" : "escalated",
      workflow.terminalStatus
    ]
  };
  const [status, label] = map[workflow.phase];
  badge.dataset.status = status;
  badge.textContent = label;
  startBtn.disabled = workflow.phase !== "idle";
}

function renderWorker() {
  const label = document.getElementById("worker-status-label");
  label.dataset.alive = String(workflow.workerAlive);
  label.textContent = workflow.workerAlive ? "worker-1 — running" : "worker-1 — killed, case paused";
  killBtn.disabled = !workflow.workerAlive || workflow.phase === "idle" || workflow.phase === "done";
  restartBtn.disabled = workflow.workerAlive;
}

function renderReview() {
  const stageLabel = document.getElementById("review-stage-label");
  const remaining = document.getElementById("sla-remaining");
  const fill = document.getElementById("sla-fill");

  if (workflow.phase === "awaiting-decision") {
    stageLabel.textContent = workflow.reviewStage === "SeniorAnalystReview" ? "Senior analyst review (escalated)" : "Analyst review";
    remaining.textContent = formatMs(workflow.slaRemainingMs);
    fill.style.width = `${(workflow.slaRemainingMs / workflow.slaTotalMs) * 100}%`;
  } else if (workflow.phase === "done" || workflow.phase === "resolving") {
    stageLabel.textContent = "Review complete";
    remaining.textContent = "—";
    fill.style.width = "0%";
  } else {
    stageLabel.textContent = "Awaiting automated checks";
    remaining.textContent = "—";
    fill.style.width = "0%";
  }

  const decisionActive = workflow.phase === "awaiting-decision" && workflow.workerAlive;
  confirmBtn.disabled = !decisionActive;
  clearBtn.disabled = !decisionActive;
  fastForwardBtn.disabled = !decisionActive;
}

function renderHistory() {
  const body = document.getElementById("history-body");
  const log = workflow.getEventHistory();
  if (log.length === 0) {
    body.innerHTML = `<tr><td colspan="5">No events yet — start the case.</td></tr>`;
    return;
  }
  body.innerHTML = log
    .map(
      (e) => `<tr data-event="${e.type}">
        <td>${e.id}</td>
        <td>${new Date(e.at).toLocaleTimeString()}</td>
        <td>${e.type}</td>
        <td>${e.name}</td>
        <td>${e.detail ?? ""}</td>
      </tr>`
    )
    .join("");
  body.closest(".table-scroll").scrollTop = body.closest(".table-scroll").scrollHeight;
}

function render() {
  renderHeader();
  renderWorker();
  renderDiagram();
  renderReview();
  renderHistory();
}

workflow.subscribe(render);
render();

startBtn.addEventListener("click", () => workflow.start());
killBtn.addEventListener("click", () => workflow.killWorker());
restartBtn.addEventListener("click", () => workflow.restartWorker());
confirmBtn.addEventListener("click", () => workflow.submitDecision("confirm_fraud"));
clearBtn.addEventListener("click", () => workflow.submitDecision("clear_false_positive"));
fastForwardBtn.addEventListener("click", () => workflow.fastForwardSla());
queryBtn.addEventListener("click", () => {
  document.getElementById("query-result").textContent = JSON.stringify(workflow.getCaseStatus(), null, 2);
});
