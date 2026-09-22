function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const CASE = {
  case_id: "FRAUD-CASE-4417",
  cardholder: { name: "Devon Marsh", account_id: "ACC-7734", card_last4: "8821" },
  alert: {
    source: "Card network CNP anomaly detector",
    amount_usd: 12400.0,
    merchant: "Nordbyte Electronics",
    merchant_country: "SG",
    cardholder_home_country: "US"
  }
};

export const RECENT_TRANSACTIONS = [
  { at: "2026-09-14T09:12:00Z", merchant: "Green Aisle Grocery", amount_usd: 84.2, country: "US" },
  { at: "2026-09-16T18:41:00Z", merchant: "Streamloop", amount_usd: 15.99, country: "US" },
  { at: "2026-09-19T02:03:00Z", merchant: "Nordbyte Electronics", amount_usd: 12400.0, country: "SG" },
  { at: "2026-09-19T02:07:00Z", merchant: "Nordbyte Electronics", amount_usd: 3100.0, country: "SG" }
];

export const AUTOMATED_STEPS = [
  { id: "IngestAlert", label: "Ingest alert", durationMs: 350, failuresBeforeSuccess: 0 },
  { id: "DeviceIntelligenceLookup", label: "Device intelligence lookup", durationMs: 650, failuresBeforeSuccess: 2 },
  { id: "SanctionsListCheck", label: "Sanctions list check", durationMs: 450, failuresBeforeSuccess: 0 },
  { id: "TransactionPatternAnalysis", label: "Transaction pattern analysis", durationMs: 550, failuresBeforeSuccess: 0 }
];

export const RESOLUTION_STEPS = {
  confirm_fraud: [
    { id: "FreezeCard", label: "Freeze card", durationMs: 450 },
    { id: "NotifyCardholder", label: "Notify cardholder (fraud confirmed)", durationMs: 400 },
    { id: "FileSAR", label: "File SAR", durationMs: 600 }
  ],
  clear_false_positive: [
    { id: "ResumeCardActivity", label: "Resume card activity", durationMs: 400 },
    { id: "NotifyCardholder", label: "Notify cardholder (all clear)", durationMs: 400 }
  ]
};

export const REVIEW_PHASES = {
  AnalystReview: { label: "Analyst review", slaMs: 16000 },
  SeniorAnalystReview: { label: "Senior analyst review (escalated)", slaMs: 8000 }
};

const TICK_MS = 200;

export class MockFraudWorkflow {
  #running = false;
  #listeners = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.phase = "idle"; // idle | steps | awaiting-decision | resolving | done
    this.stepIndex = 0;
    this.resolutionIndex = 0;
    this.reviewStage = null; // "AnalystReview" | "SeniorAnalystReview"
    this.slaRemainingMs = 0;
    this.slaTotalMs = 0;
    this.attempts = {};
    this.decision = null;
    this.terminalStatus = null;
    this.workerAlive = true;
    this.history = [];
    this.#notify();
  }

  subscribe(fn) {
    this.#listeners.push(fn);
    return () => {
      this.#listeners = this.#listeners.filter((f) => f !== fn);
    };
  }

  #notify() {
    this.#listeners.forEach((fn) => fn());
  }

  #log(type, name, detail) {
    this.history.push({ id: this.history.length + 1, at: new Date().toISOString(), type, name, detail });
  }

  #sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  start() {
    if (this.phase !== "idle") return;
    this.phase = "steps";
    this.stepIndex = 0;
    this.#log(
      "CaseStarted",
      CASE.case_id,
      `Alert received: $${CASE.alert.amount_usd.toLocaleString()} CNP charge at ${CASE.alert.merchant} (${CASE.alert.merchant_country})`
    );
    this.#notify();
    this.#runLoop();
  }

  killWorker() {
    if (!this.workerAlive) return;
    this.workerAlive = false;
    const label = this.#currentStepLabel();
    this.#log("WorkerKilled", "worker-1", label ? `Interrupted mid-step: ${label}` : "Interrupted while idle");
    this.#notify();
  }

  restartWorker() {
    if (this.workerAlive) return;
    this.workerAlive = true;
    this.#log("WorkerRestarted", "worker-1", "Resuming from durable history — completed steps are not re-run");
    this.#notify();
    this.#runLoop();
  }

  submitDecision(decision) {
    if (this.phase !== "awaiting-decision") return;
    this.decision = decision;
    this.#log(
      "SignalReceived",
      "AnalystDecision",
      decision === "confirm_fraud" ? "Analyst confirmed fraud" : "Analyst cleared as false positive"
    );
    this.#log("TimerCanceled", this.reviewStage, "Review SLA timer canceled by signal");
    this.phase = "resolving";
    this.resolutionIndex = 0;
    this.#notify();
    this.#runLoop();
  }

  fastForwardSla() {
    if (this.phase !== "awaiting-decision") return;
    this.slaRemainingMs = 0;
    this.#notify();
  }

  getCaseStatus() {
    return {
      case_id: CASE.case_id,
      phase: this.phase,
      current_step: this.#currentStepId(),
      worker_alive: this.workerAlive,
      review_stage: this.reviewStage,
      sla_remaining_ms: this.slaRemainingMs,
      sla_total_ms: this.slaTotalMs,
      terminal_status: this.terminalStatus,
      attempts: clone(this.attempts)
    };
  }

  getEventHistory() {
    return clone(this.history);
  }

  #currentStepId() {
    if (this.phase === "steps") return AUTOMATED_STEPS[this.stepIndex]?.id ?? null;
    if (this.phase === "awaiting-decision") return this.reviewStage;
    if (this.phase === "resolving") return (RESOLUTION_STEPS[this.decision] ?? [])[this.resolutionIndex]?.id ?? null;
    return null;
  }

  #currentStepLabel() {
    const id = this.#currentStepId();
    if (!id) return null;
    const def =
      AUTOMATED_STEPS.find((s) => s.id === id) ||
      (RESOLUTION_STEPS[this.decision] ?? []).find((s) => s.id === id) ||
      REVIEW_PHASES[id];
    return def?.label ?? id;
  }

  async #runLoop() {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.workerAlive) {
        if (this.phase === "steps") {
          const finished = await this.#runAutomatedStep(AUTOMATED_STEPS[this.stepIndex]);
          if (!this.workerAlive) break;
          if (finished) {
            this.stepIndex += 1;
            if (this.stepIndex >= AUTOMATED_STEPS.length) this.#enterReview("AnalystReview");
          }
        } else if (this.phase === "awaiting-decision") {
          await this.#sleep(TICK_MS);
          if (!this.workerAlive) break;
          this.slaRemainingMs = Math.max(0, this.slaRemainingMs - TICK_MS);
          if (this.slaRemainingMs === 0) this.#handleSlaExpiry();
          this.#notify();
        } else if (this.phase === "resolving") {
          const steps = RESOLUTION_STEPS[this.decision] ?? [];
          if (this.resolutionIndex >= steps.length) {
            this.#resolveCase();
            break;
          }
          const finished = await this.#runAutomatedStep(steps[this.resolutionIndex]);
          if (!this.workerAlive) break;
          if (finished) this.resolutionIndex += 1;
        } else {
          break;
        }
      }
    } finally {
      this.#running = false;
    }
  }

  async #runAutomatedStep(def) {
    const attempt = (this.attempts[def.id] ?? 0) + 1;
    this.attempts[def.id] = attempt;
    this.#log("ActivityStarted", def.label, `Attempt ${attempt}`);
    this.#notify();
    await this.#sleep(def.durationMs);
    if (!this.workerAlive) return false;

    const shouldFail = def.failuresBeforeSuccess && attempt <= def.failuresBeforeSuccess;
    if (shouldFail) {
      this.#log("ActivityFailed", def.label, `Attempt ${attempt} failed (simulated transient error) — retrying with backoff`);
      this.#notify();
      const backoffMs = Math.min(1200, 300 * attempt);
      await this.#sleep(backoffMs);
      if (!this.workerAlive) return false;
      return false;
    }

    this.#log("ActivityCompleted", def.label, attempt > 1 ? `Succeeded on attempt ${attempt}` : "Succeeded");
    this.#notify();
    return true;
  }

  #enterReview(stage) {
    this.phase = "awaiting-decision";
    this.reviewStage = stage;
    this.decision = null;
    this.slaTotalMs = REVIEW_PHASES[stage].slaMs;
    this.slaRemainingMs = this.slaTotalMs;
    this.#log("TimerStarted", stage, `SLA window started (${Math.round(this.slaTotalMs / 1000)}s demo-compressed)`);
    this.#notify();
  }

  #handleSlaExpiry() {
    this.#log("TimerFired", this.reviewStage, "Review SLA expired with no decision");
    if (this.reviewStage === "AnalystReview") {
      this.#log("ActivityStarted", "Escalate to senior analyst", "Attempt 1");
      this.#log("ActivityCompleted", "Escalate to senior analyst", "Case handed to senior analyst queue");
      this.#enterReview("SeniorAnalystReview");
    } else {
      this.terminalStatus = "Escalated — unresolved";
      this.phase = "done";
      this.#log("CaseResolved", CASE.case_id, "Escalated without a senior decision — unresolved");
      this.#notify();
    }
  }

  #resolveCase() {
    this.terminalStatus = this.decision === "confirm_fraud" ? "Confirmed" : "Cleared";
    this.phase = "done";
    this.#log("CaseResolved", CASE.case_id, `Case resolved: ${this.terminalStatus}`);
    this.#notify();
  }
}
