# Temporal fraud case investigation — real implementation — design

## Context

The PoC registry ([pocs.html](https://someshjha.com/pocs.html#prior-authorization)) tests the claim: *"Can a long-running investigation stay durable across a human review SLA without losing state if a worker restarts?"* A browser-only mock of this already exists in the site repo ([temporal_poc_fintech/](https://someshjha.com/temporal_poc_fintech/)) and demonstrates the interaction model with fake, in-memory data — see [the mock demo's design spec](2026-09-21-temporal-fraud-investigation-mock-demo-design.md).

This spec covers the **real implementation**: an actual Temporal server backed by real Postgres persistence, a real Python worker executing real workflow/activity code, deployed to a local `kind` Kubernetes cluster via Argo CD GitOps — the same deployment shape already specified for the [scoped financial-data MCP PoC](2026-09-21-scoped-financial-mcp-real-implementation-design.md). It lives in its own repository, `temporal-fraud-investigation` (not yet created), not in the static site repo. This spec is written now; implementation happens later, in a session working against that repo.

## Business requirements — why this is worth building

Fraud and financial-crime operations teams run long-lived investigations that mix automated checks with mandatory human review, under real regulatory time pressure (for example, U.S. Bank Secrecy Act SAR-filing timelines). The systems that host these investigations are ordinary Kubernetes workloads: they get redeployed, rescheduled onto other nodes, and occasionally crash, like anything else running in a cluster. That operational reality creates three concrete problems this PoC is built to test a fix for:

1. **Lost investigation state on restart.** If a worker pod is killed mid-investigation — mid-deploy, during autoscaling, on spot-node reclamation — a naive implementation (in-memory state, or a hand-rolled state machine in application rows) either loses track of where the case was, or worse, silently restarts it from the top and re-runs steps that already had a real-world side effect.
2. **Unsafe retries on flaky dependencies.** Fraud investigations call external services — device-risk vendors, sanctions/watchlist screening — that fail transiently like any network dependency. Handwritten retry logic is easy to get subtly wrong (no backoff, no cap, or retries wrapped around a step that isn't actually safe to repeat), and once it's wrong, the failure mode is either silent data loss or duplicated side effects (freezing a card twice, filing two SARs for one case).
3. **No independently reviewable record of a long-running case.** A case that spans a human SLA window needs an audit trail of exactly what happened and when — every automated check, every retry, the timer that was running, the decision that was made and by whom — that exists independent of whatever the case-management UI's own database claims, for the same reason financial-crime audit trails generally need to be tamper-evident and reviewable outside the system that produced them.

This PoC tests whether a durable execution engine (Temporal) can close all three gaps as an infrastructure property, not an application-code discipline: workflow state is durably persisted and replayed by the engine itself (not hand-rolled), retries are declared as policy per activity rather than written as loops, and the engine's own event history *is* the audit trail — reviewable via Temporal's API/UI independent of the fraud-ops database.

## Goal

Build a real, runnable system — not a simulation — that an evaluator can stand up locally with one command and use to verify, independently of the worker's own application code, that:
- A fraud case started against the real Temporal server survives the worker pod being killed and restarted mid-case: activities that already completed are not re-executed, and the case resumes and reaches a correct terminal state.
- A deliberately flaky mock vendor dependency is retried according to a declared policy (bounded attempts, exponential backoff) without any retry logic written in the workflow/activity code itself.
- The full history of one case (every activity attempt, the SLA timer, the signal that resolved it) is readable directly from Temporal, independent of whatever the showcase UI's own database records.

## Non-goals

- Not a production system — no multi-cluster Temporal, no mTLS between services, no HA Postgres, no secrets manager (k8s `Secret`s are sufficient for a local demo).
- Not a general-purpose case-management platform — one workflow type, one seeded case scenario per run, not a queue of arbitrary case types.
- Not a real device-intelligence or sanctions-screening integration — both are small mocked HTTP services deployed in-cluster, one of them deliberately stateful and flaky (fails the first two calls per case, then succeeds), to make retry behavior deterministic and demoable rather than dependent on a real vendor's actual uptime.
- Not building a full Temporal Web UI feature set — the bundled `temporal-ui` is deployed as-is (official image) for browsing history/queries; no custom Temporal UI is built.
- No authn/authz layer — single-tenant, unauthenticated local demo (unlike the MCP PoC, this one's claim is about durability and retries, not access control).
- No horizontal worker autoscaling test — one worker replica is enough to demonstrate durability across a restart; scaling to N workers is a plausible future enhancement, not part of this build.

## High-level architecture

Five components, each its own Kubernetes Deployment/StatefulSet in the same `kind` cluster/namespace, each independently managed by its own Argo CD `Application`:

```
                        +----------------------------------------------+
                        |                 kind cluster                  |
                        |                                                |
   evaluator --HTTP-->  |   api (FastAPI showcase UI + backend)          |
   (browser)            |     |  starts workflow / sends signal            |
                        |     |  / calls query, via Temporal Python SDK      |
                        |     v                                              |
                        |   temporal (server: temporalio/auto-setup image,     |
                        |     frontend+history+matching+worker services         |
                        |     in one process -- sufficient for a local kind      |
                        |     demo; a production system splits these)            |
                        |     |         ^                                          |
                        |     v         |  poll task queue                          |
                        |   postgres   worker (Python, temporalio SDK)                |
                        |   (Temporal    |  FraudCaseWorkflow + activities              |
                        |   persistence) |  calls mock-device-risk / mock-sanctions       |
                        |                v                                               |
                        |              mock-device-risk (flaky, stateful per case)         |
                        |              mock-sanctions (always clears)                       |
                        |                                                                    |
                        |   temporal-ui (official image, browses history/queries directly)    |
                        +--------------------------------------------------------------------+

   Argo CD (in-cluster) --watches--> github.com/someshjha/temporal-fraud-investigation
      \- root Application -> argocd/apps/{postgres,temporal,temporal-ui,mock-services,worker,api}.yaml
```

**Data flow for one case:** the evaluator (via the `api` showcase UI, or directly via `temporalctl`/the Temporal SDK) starts a `FraudCaseWorkflow` execution on the `fraud-investigation` task queue. The `worker` pod, polling that queue, picks it up and begins executing activities in order. `DeviceIntelligenceLookup` calls `mock-device-risk`, which returns HTTP 503 for a case's first two calls (tracked per `case_id` in the mock service's own in-memory state) and 200 on the third; Temporal's activity retry policy — not application code — drives those retries with backoff. Once past the automated activities, the workflow starts a timer and waits on a signal. The `api` UI (or a direct `temporal signal` command) sends `AnalystDecision`. The workflow proceeds to the matching resolution activities and completes. At any point, killing the `worker` pod (`kubectl delete pod`) and letting the Deployment reschedule it demonstrates that Temporal replays the workflow's history against the new worker process and resumes exactly where it left off — this is the core claim under test, and it requires zero extra code: durability is the engine's property, not something the workflow author implements.

## Workflow & activities

Python, using the official `temporalio` SDK. Signature-level sketch (illustrative, not final):

```python
@workflow.defn
class FraudCaseWorkflow:
    def __init__(self) -> None:
        self._status: CaseStatus = CaseStatus.RUNNING
        self._current_step: str = "IngestAlert"
        self._decision: AnalystDecision | None = None

    @workflow.run
    async def run(self, alert: FraudAlert) -> CaseResult:
        await workflow.execute_activity(ingest_alert, alert, start_to_close_timeout=timedelta(seconds=10))

        self._current_step = "DeviceIntelligenceLookup"
        device_risk = await workflow.execute_activity(
            device_intelligence_lookup, alert.account_id,
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(initial_interval=timedelta(seconds=1), backoff_coefficient=2.0, maximum_attempts=5),
        )

        self._current_step = "SanctionsListCheck"
        await workflow.execute_activity(sanctions_list_check, alert.cardholder_name, start_to_close_timeout=timedelta(seconds=10))

        self._current_step = "TransactionPatternAnalysis"
        risk_score = await workflow.execute_activity(transaction_pattern_analysis, alert.account_id, start_to_close_timeout=timedelta(seconds=10))

        decision = await self._await_decision_or_escalate(sla=timedelta(hours=24), escalated=False)
        if decision is None:
            decision = await self._await_decision_or_escalate(sla=timedelta(hours=4), escalated=True)

        return await self._resolve(decision, risk_score, device_risk)

    async def _await_decision_or_escalate(self, sla: timedelta, escalated: bool) -> AnalystDecision | None:
        self._current_step = "SeniorAnalystReview" if escalated else "AnalystReview"
        try:
            await workflow.wait_condition(lambda: self._decision is not None, timeout=sla)
            return self._decision
        except asyncio.TimeoutError:
            return None

    @workflow.signal
    def submit_analyst_decision(self, decision: AnalystDecision) -> None:
        self._decision = decision

    @workflow.query
    def get_case_status(self) -> CaseStatus:
        return self._status
```

Activities (`activities.py`): `ingest_alert`, `device_intelligence_lookup` (the deliberately-flaky one — calls `mock-device-risk`), `sanctions_list_check`, `transaction_pattern_analysis`, `freeze_card`, `resume_card_activity`, `notify_cardholder`, `file_sar`. Each is written to be safely retryable on its own (idempotent per `case_id` where it matters, e.g. `freeze_card` checks current card state before acting) — Temporal's retry policy assumes this, so it's a property the activities must hold, not something the engine guarantees for free.

## Deployment — kind + Argo CD (app-of-apps GitOps)

- `kind/kind-config.yaml` — cluster config with port mappings to reach `api` and `temporal-ui` from the host.
- `kind/bootstrap.sh` — creates the kind cluster, installs Argo CD's standard manifests, applies the root `Application`, waits for all child apps to reach `Synced`/`Healthy`. One command from a clean checkout to a running demo.
- `argocd/root-app.yaml` — a single Argo CD `Application` pointed at `argocd/apps/` in this same repo (app-of-apps).
- `argocd/apps/{postgres,temporal,temporal-ui,mock-services,worker,api}.yaml` — one child `Application` per component, each syncing `k8s/<component>/`, automated sync + self-heal + prune.
- `k8s/postgres/` — `StatefulSet` + `PersistentVolumeClaim` + `Service` + `Secret`, used only as Temporal's own persistence store (no application schema of its own — this PoC's state of record is Temporal's event history, not a hand-maintained cases table).
- `k8s/temporal/` — `Deployment` + `Service`, the `temporalio/auto-setup` image (bundles frontend/history/matching/worker services in one process against the `postgres` above) — the pragmatic choice for a local `kind` PoC; a production deployment would split these via the official Temporal Helm chart, noted here as a deliberate simplification, not an oversight.
- `k8s/temporal-ui/` — `Deployment` + `Service`, official `temporalio/ui` image, pointed at the `temporal` frontend service.
- `k8s/mock-services/` — `Deployment` + `Service` for `mock-device-risk` (stateful, per-`case_id` failure counter, resettable via an admin endpoint the demo script uses between runs) and `mock-sanctions` (stateless, always clears).
- `k8s/worker/` — `Deployment` + `ConfigMap` (Temporal server address, task queue name, mock-service URLs). No `Service` — a worker only polls, it doesn't serve.
- `k8s/api/` — `Deployment` + `Service` (+ `Ingress` or documented `kubectl port-forward` instructions, since `kind` has no external load balancer) — FastAPI backend that starts workflows, forwards signals, and renders a case view mirroring the six regions of the mock demo's dashboard for narrative continuity between the two demos.

## Repo layout

```
temporal-fraud-investigation/
|-- worker/
|   |-- workflows.py
|   |-- activities.py
|   `-- worker_main.py
|-- mock_services/
|   |-- device_risk_server.py
|   `-- sanctions_server.py
|-- api/                    # FastAPI backend + static HTML/JS frontend
|-- k8s/
|   |-- postgres/
|   |-- temporal/
|   |-- temporal-ui/
|   |-- mock-services/
|   |-- worker/
|   `-- api/
|-- argocd/
|   |-- root-app.yaml
|   `-- apps/
|-- kind/
|   |-- kind-config.yaml
|   `-- bootstrap.sh
|-- scripts/
|   `-- verify_durability.py
`-- README.md
```

## Verification strategy

`scripts/verify_durability.py` is the independent proof the durability and retry claims actually hold — it drives the system through the Temporal SDK and `kubectl`, not through the showcase UI, so it cannot be fooled by a bug in the UI's own rendering:

1. Reset `mock-device-risk`'s per-case failure counter, then start a new `FraudCaseWorkflow` execution via the Temporal client, with a fresh `case_id`.
2. Poll `get_case_status` (a real Temporal Query) until the workflow reaches `AnalystReview`, confirming along the way (by fetching the workflow's event history via the SDK) that `DeviceIntelligenceLookup` recorded exactly 3 attempts (2 failures, 1 success) — proving the retry policy, not application code, drove the retries.
3. `kubectl delete pod` on the running `worker` pod mid-case (after step 2, before sending the decision signal), wait for the Deployment to reschedule a replacement, and confirm via the event history that no activity already marked complete before the kill re-executes after the restart.
4. Send `submit_analyst_decision(CONFIRM_FRAUD)` via the SDK and wait for the workflow to complete; assert the terminal result and that the history shows exactly one `FreezeCard` and one `FileSAR` activity execution — proving the restart did not duplicate side-effecting steps.
5. Repeat steps 1-2 with the decision signal never sent, using a short SLA override the script passes as a workflow input (so the real 24h timer isn't waited on in CI-length runs), and assert the workflow escalates and, without a senior decision either, reaches `Escalated — unresolved`.

The `README.md` documents this script as the thing to run after `kind/bootstrap.sh` to confirm the deployed system actually behaves as this spec claims — the demo is not considered working until this script passes against the live cluster.

## Implementation phases

This is a real system, not a single sitting of work. Suggested sequencing for the future implementation plan (written later, in the `temporal-fraud-investigation` repo):

1. Workflow, activities, and both mock services running locally (not yet in k8s) against a Temporal dev server (`temporal server start-dev`, which needs no separate Postgres) — prove the core retry and signal/timer behavior first, before any cluster exists.
2. `verify_durability.py` written and passing against that local dev server, including the worker-kill step (kill the local worker process, restart it, confirm resumption) — prove the durability claim before containerizing anything.
3. Containerize worker, mock services, and API; write `k8s/` manifests using a real (non-dev-mode) Temporal server backed by Postgres; validate with plain `kubectl apply` on a `kind` cluster (no Argo CD yet).
4. Add `temporal-ui` for interactive history browsing during manual demoing.
5. Add Argo CD (app-of-apps) and `kind/bootstrap.sh`; confirm a clean checkout reaches a running, verified demo with one command, and that `verify_durability.py` passes against the fully deployed cluster (including the `kubectl delete pod` step against the real Deployment, not a local process).

## Open questions / explicitly deferred

- Splitting the bundled `temporalio/auto-setup` image into the full frontend/history/matching/worker-service topology (via the official Helm chart) — plausible for a "more realistic" follow-up, not needed to demonstrate this PoC's claim.
- Horizontal worker scaling (multiple worker replicas racing for tasks) — not built; one replica is sufficient to demonstrate restart durability.
- Real device-intelligence/sanctions vendor integrations — out of scope; the mocked services exist to make retry behavior deterministic on demand.
- TLS between components, secrets management beyond k8s `Secret`s, HA Postgres — out of scope for a local `kind` demo, same as the MCP PoC's real-implementation spec.
