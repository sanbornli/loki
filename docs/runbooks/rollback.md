# Release rollback

1. Declare the affected release, project scope, rollback owner, and UTC start
   time. Stop new deployments while the cause is unknown.
2. Select the last known-good immutable deployment by recorded content hash.
   Never rebuild an old release and call it equivalent.
3. Activate that deployment through the authenticated operator path. If the
   incident affects authorization, isolation, schema compatibility, or data
   integrity, keep play disabled and follow the incident runbook.
4. Confirm the player shell and release assets resolve to the expected
   deployment ID and hashes. Check that new credentials and sessions obey the
   current project state.
5. Exercise one private-denial check, one authorized session, one room, and one
   reconnect. Monitor errors and RTT for at least the normal alert evaluation
   window.
6. Record start/end time, prior and restored deployment IDs, immutable hashes,
   operator, reason, verification output, and any database migration decision.

Database rollback is not a default release rollback. Use the provider restore
runbook only when data restoration is explicitly approved.
