# Incident response

## Trigger and ownership

Open an incident for confirmed tenant crossover, private-play bypass, credential
exposure, sustained error-budget breach, data loss, or unavailable play. Assign
an incident commander, operations lead, and recorder. Use UTC in every record.

## Contain

1. Record the incident ID, start time, affected release, projects, regions, and
   current dashboards without copying tokens or player content.
2. For isolation, authorization, or credential incidents, execute the
   [kill-switch runbook](kill-switch.md). For a bad release, execute the
   [rollback runbook](rollback.md).
3. Revoke exposed credentials and suspend only confirmed affected tenants
   unless the boundary is uncertain; uncertain isolation requires the global
   play kill switch.
4. Preserve immutable logs, deployment hashes, audit records, and provider
   event references. Restrict evidence access.

## Recover and verify

Restore service in stages. Verify health dependencies, private denial,
cross-project denial, session issuance, a room lifecycle, and hosted asset
hashes before increasing traffic. Run `scripts/check-production.ts` with a new
exclusive evidence output. Do not reuse evidence from before containment.

## Close

Record impact, timeline, root cause, corrective owners, and dated verification.
Notify affected parties according to the human-approved legal policy. A passing
release-gate manifest is required before a paused release resumes.
