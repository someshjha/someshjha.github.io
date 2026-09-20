const BASE_ORDERS = [
  { orderId: "ORD-001", customerId: "CUS-1042", status: "CONFIRMED", amount: "199.00", currency: "CAD", paymentId: "PAY-001", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:00:08Z", updatedAt: "2026-09-19T14:00:09.020Z", latencyMs: 1020 },
  { orderId: "ORD-002", customerId: "CUS-2081", status: "CONFIRMED", amount: "249.00", currency: "CAD", paymentId: "PAY-002", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:00:31Z", updatedAt: "2026-09-19T14:00:32.310Z", latencyMs: 1310 },
  { orderId: "ORD-003", customerId: "CUS-1190", status: "CONFIRMED", amount: "175.00", currency: "CAD", paymentId: "PAY-003", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:01:04Z", updatedAt: "2026-09-19T14:01:04.890Z", latencyMs: 890 },
  { orderId: "ORD-004", customerId: "CUS-3452", status: "CONFIRMED", amount: "225.00", currency: "CAD", paymentId: "PAY-004", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:01:37Z", updatedAt: "2026-09-19T14:01:38.140Z", latencyMs: 1140 },
  { orderId: "ORD-005", customerId: "CUS-4520", status: "CONFIRMED", amount: "150.00", currency: "CAD", paymentId: "PAY-005", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:02:11Z", updatedAt: "2026-09-19T14:02:12.480Z", latencyMs: 1480 },
  { orderId: "ORD-006", customerId: "CUS-1188", status: "CONFIRMED", amount: "250.00", currency: "CAD", paymentId: "PAY-006", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:02:41Z", updatedAt: "2026-09-19T14:03:02.100Z", latencyMs: 1210, late: true },
  { orderId: "ORD-007", customerId: "CUS-7601", status: "CONFIRMED", amount: "125.00", currency: "CAD", paymentId: "PAY-007", paymentStatus: "FAILED", eventTime: "2026-09-19T14:02:55Z", updatedAt: "2026-09-19T14:02:56.340Z", latencyMs: 1340 },
  { orderId: "ORD-008", customerId: "CUS-8134", status: "CREATED", amount: "125.00", currency: "CAD", paymentId: null, paymentStatus: "UNPAID", eventTime: "2026-09-19T14:03:06Z", updatedAt: "2026-09-19T14:03:07.060Z", latencyMs: 1060 }
];

const BASE_REJECTIONS = [
  {
    rejectionId: "REJ-001",
    eventId: "EVT-INVALID-001",
    orderId: "ORD-011",
    sourceTopic: "orders.v1",
    reasonCode: "ORDER_AMOUNT_NON_POSITIVE",
    reasonDetail: "Order amount must be greater than zero",
    eventTime: "2026-09-19T14:02:54Z",
    rejectedAt: "2026-09-19T14:02:55.180Z",
    payload: { event_id: "EVT-INVALID-001", order_id: "ORD-011", amount: -42, currency: "CAD" }
  }
];

const BASE_ACTIVITY = [
  { time: "13:59", orders: 0, captured: 0 },
  { time: "14:00", orders: 2, captured: 448 },
  { time: "14:01", orders: 4, captured: 848 },
  { time: "14:02", orders: 7, captured: 1248 },
  { time: "14:03", orders: 8, captured: 1248 }
];

const SCENARIOS = {
  happy_path: { name: "Happy path", description: "Publish a valid order and captured payment.", steps: ["Publishing order event", "Validating in Flink", "Correlating payment", "Writing current state", "Verifying totals"] },
  duplicate: { name: "Duplicate protection", description: "Replay an existing event identifier.", steps: ["Reading baseline totals", "Publishing duplicate", "Checking keyed state", "Suppressing duplicate", "Verifying totals unchanged"] },
  invalid: { name: "Invalid event", description: "Publish an order with a negative amount.", steps: ["Publishing invalid order", "Applying validation rule", "Routing to dead-letter topic", "Writing rejection audit", "Verifying pipeline health"] },
  late_payment: { name: "Late payment", description: "Deliver a payment after its original event-time minute.", steps: ["Publishing delayed payment", "Comparing watermark", "Restoring order state", "Correcting event-time window", "Verifying order status"] },
  recovery: { name: "Checkpoint recovery", description: "Restart Flink and verify state recovery.", steps: ["Capturing baseline totals", "Requesting restart", "Restoring checkpoint 42", "Resuming processing", "Reconciling unchanged totals"] },
  reset: { name: "Reset demo", description: "Return all synthetic data to the baseline fixture.", steps: ["Stopping active load", "Clearing scenario state", "Restoring baseline fixture", "Refreshing read models", "Verifying clean state"] }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildInitialState() {
  return {
    scenarioId: "demo-20260919-001",
    scenarioLabel: "Baseline fixture",
    run: null,
    health: { overall: "healthy", kafka: "healthy", flink: "running", postgres: "connected", lag: 0, checkpointId: "42", restartCount: 0 },
    orders: clone(BASE_ORDERS),
    rejections: clone(BASE_REJECTIONS),
    duplicateCount: 1,
    acceptedEventCount: 16,
    producedEventCount: 18,
    activity: clone(BASE_ACTIVITY),
    latestOutcome: "baseline",
    lastUpdatedAt: new Date().toISOString()
  };
}

export class MockDemoApi {
  constructor({ delayScale = 1 } = {}) {
    this.delayScale = delayScale;
    this.state = buildInitialState();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return clone(this.state);
  }

  getScenarioCatalogue() {
    return clone(SCENARIOS);
  }

  async runScenario(type) {
    if (!SCENARIOS[type]) throw new Error(`Unknown scenario: ${type}`);
    if (this.state.run?.status === "running") {
      const error = new Error("Another scenario is already running");
      error.code = "SCENARIO_CONFLICT";
      throw error;
    }

    const definition = SCENARIOS[type];
    this.state.scenarioLabel = definition.name;
    this.state.run = { type, name: definition.name, status: "running", currentStep: 0, steps: definition.steps, startedAt: new Date().toISOString() };
    if (type === "recovery") this.state.health.flink = "recovering";
    this.#emit();

    for (let step = 0; step < definition.steps.length; step += 1) {
      this.state.run.currentStep = step;
      this.#emit();
      await this.#wait(430);
    }

    this.#applyScenario(type);
    this.state.run.status = "passed";
    this.state.run.currentStep = definition.steps.length;
    this.state.run.completedAt = new Date().toISOString();
    this.state.lastUpdatedAt = new Date().toISOString();
    this.#emit();
    return this.getSnapshot();
  }

  #applyScenario(type) {
    if (type === "happy_path") {
      if (!this.state.orders.some(order => order.orderId === "ORD-009")) {
        this.state.orders.push({ orderId: "ORD-009", customerId: "CUS-9204", status: "CONFIRMED", amount: "89.00", currency: "CAD", paymentId: "PAY-009", paymentStatus: "CAPTURED", eventTime: "2026-09-19T14:04:08Z", updatedAt: new Date().toISOString(), latencyMs: 940 });
        this.state.acceptedEventCount += 2;
        this.state.producedEventCount += 2;
        this.state.activity.push({ time: "14:04", orders: 9, captured: 1337 });
      }
      this.state.latestOutcome = "happy_path";
    }
    if (type === "duplicate") {
      this.state.duplicateCount += 1;
      this.state.producedEventCount += 1;
      this.state.latestOutcome = "duplicate";
    }
    if (type === "invalid") {
      if (!this.state.rejections.some(item => item.rejectionId === "REJ-002")) {
        this.state.rejections.unshift({ rejectionId: "REJ-002", eventId: "EVT-INVALID-002", orderId: "ORD-012", sourceTopic: "orders.v1", reasonCode: "ORDER_AMOUNT_NON_POSITIVE", reasonDetail: "Order amount must be greater than zero", eventTime: "2026-09-19T14:04:22Z", rejectedAt: new Date().toISOString(), payload: { event_id: "EVT-INVALID-002", order_id: "ORD-012", amount: -75, currency: "CAD" } });
        this.state.producedEventCount += 1;
      }
      this.state.latestOutcome = "invalid";
    }
    if (type === "late_payment") {
      const order = this.state.orders.find(item => item.orderId === "ORD-008");
      if (order?.paymentStatus === "UNPAID") {
        order.paymentId = "PAY-008";
        order.paymentStatus = "CAPTURED";
        order.updatedAt = new Date().toISOString();
        order.latencyMs = 1150;
        order.late = true;
        this.state.acceptedEventCount += 1;
        this.state.producedEventCount += 1;
        this.state.activity[this.state.activity.length - 1].captured += 125;
      }
      this.state.latestOutcome = "late_payment";
    }
    if (type === "recovery") {
      this.state.health.flink = "running";
      this.state.health.restartCount += 1;
      this.state.health.checkpointId = String(Number(this.state.health.checkpointId) + 1);
      this.state.latestOutcome = "recovery";
    }
    if (type === "reset") {
      const run = this.state.run;
      this.state = buildInitialState();
      this.state.run = run;
      this.state.scenarioLabel = definitionName(type);
      this.state.latestOutcome = "reset";
    }
  }

  #emit() {
    this.state.lastUpdatedAt = new Date().toISOString();
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }

  #wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds * this.delayScale));
  }
}

function definitionName(type) {
  return SCENARIOS[type]?.name ?? "Baseline fixture";
}

export function summarize(state) {
  const gross = state.orders.reduce((sum, order) => sum + Number(order.amount), 0);
  const capturedOrders = state.orders.filter(order => order.paymentStatus === "CAPTURED");
  const captured = capturedOrders.reduce((sum, order) => sum + Number(order.amount), 0);
  const failedCount = state.orders.filter(order => order.paymentStatus === "FAILED").length;
  const terminalCount = capturedOrders.length + failedCount;
  return {
    ordersReceived: state.orders.length,
    grossAmount: gross,
    capturedAmount: captured,
    capturedPaymentCount: capturedOrders.length,
    terminalPaymentCount: terminalCount,
    paymentSuccessRate: terminalCount ? capturedOrders.length / terminalCount : 0,
    rejectedEventCount: state.rejections.length,
    duplicateEventCount: state.duplicateCount,
    acceptedEventCount: state.acceptedEventCount,
    producedEventCount: state.producedEventCount,
    latencyP95Ms: Math.max(...state.orders.map(order => order.latencyMs), 0)
  };
}
