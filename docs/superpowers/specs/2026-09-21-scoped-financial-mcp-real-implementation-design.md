# Scoped financial-data MCP — real implementation — design

## Context

The PoC registry ([pocs.html](https://someshjha.com/pocs.html#financial-data)) tests the claim: *"Can an agent receive only the financial-data capabilities its current task is allowed to use?"* A browser-only mock of this already exists in the site repo ([financial-mcp/](https://someshjha.com/financial-mcp/)) and demonstrates the interaction model with fake, in-memory data.

This spec covers the **real implementation**: an actual MCP server backed by a real Postgres database, with real identity and real database-enforced access control, deployed to a local `kind` Kubernetes cluster via Argo CD GitOps. It lives in its own repository, [poc_mcp](https://github.com/someshjha/poc_mcp) (currently empty), not in the static site repo. This spec is written now; implementation happens later, in a session working against that repo.

## Business requirements — why this is worth building

Financial and wealth-management firms are starting to let AI agents act on customer account data — drafting research notes, summarizing portfolio risk, answering client balance questions, and in some workflows even submitting trade orders. The standard way to grant that access today is a **standing API key or service-account credential** handed to the agent's tool layer, scoped (if at all) by convention rather than by anything the database itself enforces. That pattern creates three concrete problems this PoC is built to test a fix for:

1. **Over-privileged agents.** A single API key that can query positions can usually also query balances, fundamentals, and place orders — because the key wasn't scoped to a task, it was scoped to "this agent." An agent drafting an equity research note has no legitimate reason to ever be capable of calling `place_order`, but with a standing key, it is capable of it; only application-layer logic (easy to get wrong, easy to bypass with a crafted prompt) stops it.
2. **No independent audit trail.** When something goes wrong — a bad trade, a leaked balance, a hallucinated tool call — the only record is usually the agent's own conversation log, which is neither tamper-evident nor reviewable by someone who doesn't have access to (or trust) the agent platform. Compliance functions in regulated finance (the analogue of SEC/FINRA recordkeeping obligations, or SOC 2 access-review requirements) need an audit trail that exists independent of, and is authoritative over, whatever the agent says it did.
3. **Identity gets flattened.** Real firms already segment human analyst access by book of business — a wealth manager can see their own clients' accounts, not a colleague's, even if both hold the same job title and the same application role. When an agent acts "on behalf of" an analyst, a scoping model based only on *task type* (as the mock demonstrates) is not enough on its own — it also has to inherit the *acting user's* entitlements, or it re-introduces the over-broad-access problem one level up.

This PoC tests whether an MCP server can close all three gaps using infrastructure a real firm already has or would already need: an identity provider (Keycloak stands in for an internal SSO/IdP such as Okta or Entra ID) issuing role- and attribute-bearing tokens, and a database that enforces access control itself (Postgres roles + Row-Level Security) rather than trusting application code to remember to check. The two axes of control map directly onto the two real risks above: **task-scoped roles** bound the *capability* surface (which tools/tables exist at all for this task), and **identity-scoped RLS** bounds the *data* surface (which rows of those tables this specific person's agent may touch) — and both are enforced at the one layer that cannot be bypassed by a clever prompt: the database.

## Goal

Build a real, runnable system — not a simulation — that an evaluator can stand up locally with one command and use to verify, independently of the MCP server's own code, that:
- An MCP session authenticated as a given user, with a given task-scope role, can only call the tools/tables that role grants.
- Within those tools, the session can only see rows belonging to accounts that authenticated user owns.
- Every call (allowed or denied) is recorded in a Postgres audit table, reviewable without access to whatever agent or client made the call.

## Non-goals

- Not a production system — no HA, no backup/restore strategy, no TLS termination beyond what `kind`/Argo CD provide by default, no secrets manager (k8s `Secret`s are sufficient for a local demo).
- Not a general-purpose MCP gateway or multi-tenant SaaS — one hardcoded demo realm, a handful of demo users and accounts.
- Not building a custom identity provider — Keycloak is used as a stand-in for enterprise SSO, configured via a committed realm export, not hand-built.
- Row-level security is scoped to "user owns account" — no delegation, no manager-can-see-team's-accounts hierarchy. That is a plausible future enhancement, not part of this build.
- No production-grade Keycloak deployment (clustering, external DB-backed storage) — dev-mode with bundled storage is sufficient for a local `kind` demo whose state doesn't need to survive a cluster teardown.

## High-level architecture

Four components, each its own Kubernetes Deployment in the same `kind` cluster/namespace, each independently managed by its own Argo CD `Application`:

```
                        +-------------------------------+
                        |           kind cluster         |
                        |                                 |
   analyst/agent --HTTP--> ui (FastAPI)                    |
   (browser or             |   |  OIDC login                |
    MCP client)             |   v                             |
                        |   keycloak (realm: financial-mcp)    |
                        |     |  issues JWT (role + user id)    |
                        |     v                                  |
                        |   mcp-server (Python, Streamable        |
                        |     HTTP transport)                       |
                        |     |  validates JWT via Keycloak          |
                        |     |  JWKS; SET LOCAL ROLE + user_id        |
                        |     v                                        |
                        |   postgres (schema + RLS + audit_log)         |
                        +---------------------------------------------+

   Argo CD (in-cluster) --watches--> github.com/someshjha/poc_mcp
      \- root Application -> argocd/apps/{postgres,keycloak,mcp-server,ui}.yaml
```

**Data flow for one tool call:** the UI (or any MCP client) authenticates against Keycloak, gets a JWT carrying the user's `sub` and a realm role (one of the four task scopes). It calls the MCP server's Streamable HTTP endpoint with that JWT as a Bearer token. The MCP server validates the JWT's signature against Keycloak's JWKS endpoint, opens a Postgres transaction, runs `SET LOCAL ROLE <scope_role>` and `SET LOCAL app.current_user_id = '<sub>'`, then executes the tool's query. Postgres itself rejects the query if the role lacks the `GRANT`, or silently filters rows the RLS policy excludes. The server writes one row to `audit_log` regardless of outcome, then returns the (possibly filtered, possibly denied) result.

## Identity & authorization model

Two independent axes, both resolved from the same JWT, both enforced by Postgres:

| Axis | Source | Enforced by | Example |
|---|---|---|---|
| Task scope (capability) | Keycloak realm role claim | Postgres role `GRANT`s | `trade_execution` role can `INSERT` into `orders`; no other role can |
| User identity (data) | Keycloak `sub` claim | Postgres RLS policy | user `alice` can `SELECT` from `accounts` only where `owner_user_id = 'alice'` |

Demo Keycloak users (defined in `keycloak/realm-export.json`), each with one realm role and one or more owned accounts:

| User | Realm role (task scope) | Owns accounts |
|---|---|---|
| `alice.research` | `equity_research` | -- (research tools don't touch account-owned tables) |
| `bob.risk` | `portfolio_risk` | `ACC-1001`, `ACC-2001` |
| `carol.trader` | `trade_execution` | `ACC-1001` |
| `dave.support` | `client_support` | `ACC-1002` |

This table intentionally gives `bob.risk` and `carol.trader` overlapping account ownership (`ACC-1001`) so the verification script can show that task-scope role and account ownership are checked independently — `carol.trader` can place an order for `ACC-1001` but cannot call `get_portfolio_exposure` (wrong role, even though she owns the account), and `bob.risk` can view `ACC-1001`'s exposure but cannot place an order for it (right account, wrong role).

## Postgres schema and RLS design

Schema mirrors the mock demo's tables (`accounts`, `positions`, `orders`, `transactions`, `market_data`, `fundamentals`), plus:
- `accounts.owner_user_id text not null` — the Keycloak `sub` of the owning analyst.
- A new `audit_log` table: `id serial primary key, at timestamptz default now(), scope text, user_id text, kind text, name text, params jsonb, decision text, detail text`.

Four Postgres roles, one per task scope, each `GRANT`ed only the tables its scope needs (mirroring the mock's `TASK_SCOPES` table exactly, so the two demos tell the same story):

```sql
create role equity_research;
grant select on market_data, fundamentals to equity_research;

create role portfolio_risk;
grant select on positions, market_data to portfolio_risk;

create role trade_execution;
grant select on market_data to trade_execution;
grant select, insert on orders to trade_execution;

create role client_support;
grant select on accounts, transactions to client_support;

-- all four roles can read/write their own audit trail
grant select, insert on audit_log to equity_research, portfolio_risk, trade_execution, client_support;
```

Row-Level Security, enabled on the account-owned tables (`accounts`, `positions`, `orders`, `transactions` — not `market_data`/`fundamentals`, which are reference data with no owner):

```sql
alter table accounts enable row level security;
create policy owner_only on accounts
  using (owner_user_id = current_setting('app.current_user_id', true));

-- positions/orders/transactions: policy joins to accounts for ownership
create policy owner_only on positions
  using (account_id in (
    select account_id from accounts
    where owner_user_id = current_setting('app.current_user_id', true)
  ));
-- (orders, transactions: same pattern)
```

The MCP server sets both `SET LOCAL ROLE <scope>` and `SET LOCAL app.current_user_id = '<sub>'` at the start of every transaction, so a single query is filtered by role-based `GRANT`s (which *tables* exist for this call) and by RLS (which *rows* of those tables this user owns) simultaneously, exactly as designed above.

## MCP server

Python, using the official `mcp` SDK, **Streamable HTTP transport** (the transport intended for a deployed, network-reachable server — not stdio, which assumes a local subprocess). Tool set matches the mock's catalogue exactly (`list_tables`, `describe_table`, `get_market_snapshot`, `get_fundamentals`, `get_portfolio_exposure`, `get_account_balance`, `place_order`, `get_audit_log`), so the "real" and "mock" demos are the same product story at two different levels of realism.

Per-request flow:
1. Validate the `Authorization: Bearer <jwt>` header against Keycloak's JWKS (cached, refreshed on `kid` miss).
2. Extract `sub` and the realm role from the validated claims.
3. Open a Postgres transaction as a low-privilege connection-pool user; immediately `SET LOCAL ROLE <realm_role>` and `SET LOCAL app.current_user_id = '<sub>'`.
4. Execute the tool's parameterized query. A `GRANT` failure or an RLS-empty result both surface as a normal query result (a permission error, or zero rows) — the server does not re-implement the check in application code; it reports whatever Postgres decided.
5. Insert one row into `audit_log` with the outcome, inside the same transaction (so audit and effect are atomic — a call that fails still gets audited).

## Keycloak

Deployed in dev-mode (`start-dev`, bundled storage — no second Postgres instance needed just for Keycloak's own state; acceptable because this deployment's state does not need to survive a cluster teardown). Realm `financial-mcp` is provisioned automatically at container start via `--import-realm`, from a ConfigMap-mounted `keycloak/realm-export.json` committed to the repo — so the demo users, the four realm roles, and the `owned_accounts` custom attribute are all GitOps-managed, not manually clicked into existence.

## Showcase UI

A FastAPI app that is simultaneously the web UI's backend and the MCP *client* — necessary because MCP's Streamable HTTP protocol is not something a browser can call directly with `fetch()` from arbitrary static JS. Flow: visitor hits the UI, is redirected to Keycloak for an OIDC Authorization Code login, FastAPI holds the resulting session and forwards the user's JWT on every MCP call it proxies. The UI's "Task Scope" view is now informational — it shows what the *logged-in user's own token* grants, not a free client-side picker like the mock — reinforcing that scope comes from identity, not from a UI toggle. Visual structure mirrors the mock's six views (Overview / Schema / Task Scope / Console / Resources & Prompts / Audit Log) for narrative continuity between the two demos.

## Deployment — kind + Argo CD (app-of-apps GitOps)

- `kind/kind-config.yaml` — cluster config with the port mappings needed to reach the UI and (optionally) Postgres from the host.
- `kind/bootstrap.sh` — creates the kind cluster, installs Argo CD's standard manifests into it, applies the root `Application`, waits for all child apps to reach `Synced`/`Healthy`. One command from a clean checkout to a running demo.
- `argocd/root-app.yaml` — a single Argo CD `Application` pointed at `argocd/apps/` in this same repo (the "app of apps" pattern).
- `argocd/apps/{postgres,keycloak,mcp-server,ui}.yaml` — one child `Application` per component, each syncing `k8s/<component>/`, each with automated sync + self-heal + prune, so a `git push` to any component's manifests resyncs only that component.
- `k8s/postgres/` — `StatefulSet` + `PersistentVolumeClaim` + `Service` + `Secret` (admin credentials) + a `Job` that runs the schema/roles/RLS/seed SQL on first start.
- `k8s/keycloak/` — `Deployment` + `Service` + `ConfigMap` (realm export).
- `k8s/mcp-server/` — `Deployment` + `Service` + `ConfigMap` (Postgres connection info, Keycloak issuer URL).
- `k8s/ui/` — `Deployment` + `Service` (+ `Ingress` or a `NodePort`/port-forward instructions for local access, since this is a `kind` cluster with no external load balancer).

## Repo layout

```
poc_mcp/
|-- mcp_server/           # Python MCP server (Streamable HTTP transport)
|-- db/                   # schema.sql, roles.sql, rls.sql, seed.sql
|-- ui/                   # FastAPI backend + static HTML/JS frontend
|-- keycloak/
|   `-- realm-export.json
|-- k8s/
|   |-- postgres/
|   |-- keycloak/
|   |-- mcp-server/
|   `-- ui/
|-- argocd/
|   |-- root-app.yaml
|   `-- apps/
|-- kind/
|   |-- kind-config.yaml
|   `-- bootstrap.sh
|-- scripts/
|   `-- verify_scopes.py
`-- README.md
```

## Verification strategy

`scripts/verify_scopes.py` is the independent proof both axes actually hold — it does not go through the MCP server at all, so it cannot be fooled by a bug in the server's own enforcement code:

1. For each demo user, request a real access token from Keycloak's token endpoint (password grant, acceptable for a local dev-mode realm).
2. Decode the token locally (no network call needed beyond the token fetch) to get `sub` and realm role.
3. Open a direct Postgres connection as a low-privilege pool user, `SET LOCAL ROLE`/`app.current_user_id` exactly as the MCP server would, and run one query per table.
4. Assert: each user can query only the tables their role grants (role/GRANT boundary), and -- for account-owned tables -- only rows they own (RLS boundary), including the `bob.risk` / `carol.trader` overlapping-ownership case that proves the two axes are checked independently, not conflated.
5. Assert the `audit_log` table received one row per attempt (including denied ones), independent of anything the MCP server itself reports.

The `README.md` documents this script as the thing to run after `kind/bootstrap.sh` to confirm the deployed system actually enforces what this spec claims — the demo is not considered working until this script passes against the live cluster.

## Implementation phases

This is a real system, not a single sitting of work. Suggested sequencing for the future implementation plan (written later, in the `poc_mcp` repo):

1. Postgres schema, roles, RLS policies, seed data, and `verify_scopes.py` running against a local (non-k8s) Postgres — prove the core database-level claim first, before any server or cluster exists.
2. MCP server implementing the tool catalogue against that schema, still running locally (not yet in k8s), authenticating against a locally-run Keycloak dev instance.
3. Showcase UI, still local.
4. Containerize all three; write `k8s/` manifests; validate with plain `kubectl apply` on a `kind` cluster (no Argo CD yet).
5. Add Argo CD (app-of-apps) and `kind/bootstrap.sh`; confirm a clean checkout reaches a running, verified demo with one command.

## Open questions / explicitly deferred

- Manager-can-see-team's-accounts hierarchy (RLS beyond single-owner) — plausible future enhancement, not built.
- TLS between components — out of scope for a local `kind` demo.
- Keycloak production-grade storage/clustering — dev-mode is sufficient here.
- Rotating/short-lived MCP sessions beyond the JWT's own expiry — the JWT's natural expiry is the session lifetime for this PoC; no additional session-revocation layer is built.
