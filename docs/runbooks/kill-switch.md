# Emergency kill switch

## Decision

Use the project switch for one confirmed tenant. Use the global switch when
tenant isolation, shared credentials, or control-plane integrity is uncertain.
The incident commander authorizes activation; security incidents do not wait
for creator confirmation.

## Activate

1. Record UTC start time, operator, incident ID, scope, and current release.
2. Set affected projects to `suspended` through the operator API. Activate the
   deployment/environment global play switch when required.
3. Revoke unused deployment credentials and invalidate session-signing material
   when compromise is suspected. Rotate Nakama and R2 credentials only through
   provider secret management.
4. Within 30 seconds, verify that new player sessions, Nakama exchanges,
   deployment credentials, and play asset access are denied as applicable.
   Preserve status codes and request IDs, never tokens.
5. Confirm existing multiplayer sessions stop or lose authorization according
   to policy. If they continue past 30 seconds, isolate Nakama ingress.

## Restore

Resolve the cause, rotate affected credentials, and run fresh isolation,
private-denial, quota, hosted-asset, and multiplayer checks. Restore one canary
project first, observe the alert window, then expand. Record activation and
recovery latency in immutable evidence. Never mark the gate passed from the
runbook alone.
