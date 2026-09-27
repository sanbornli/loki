FROM heroiclabs/nakama:3.22.0

COPY production.yml /nakama/data/production.yml
COPY modules /nakama/data/modules

EXPOSE 7350

ENTRYPOINT ["/bin/sh", "-ec"]
# LOKI_TURN_SECRET/LOKI_TURN_URLS and LOKI_SERVER_AUTHORITY_ENABLED/
# LOKI_WORKER_ORCHESTRATOR_URL are optional Railway service variables, not
# baked into production.yml: when a pair is fully set it is passed through as
# --runtime.env flags (with LOKI_REGION re-stated alongside them, since a CLI
# --runtime.env flag can otherwise replace rather than merge with the file's
# runtime.env list). Unset, ctx.env.LOKI_TURN_SECRET stays undefined and Loki
# stays STUN-only, and ctx.env.LOKI_SERVER_AUTHORITY_ENABLED stays unset so
# matchInit rejects "server" authority, exactly like local compose.
CMD ["test -n \"$NAKAMA_DATABASE_URL\"; test -n \"$LOKI_NAKAMA_HTTP_KEY\"; test -n \"$LOKI_NAKAMA_SERVER_KEY\"; test -n \"$NAKAMA_SESSION_ENCRYPTION_KEY\"; test -n \"$NAKAMA_REFRESH_ENCRYPTION_KEY\"; test -n \"$NAKAMA_CONSOLE_USERNAME\"; test -n \"$NAKAMA_CONSOLE_PASSWORD\"; test -n \"$NAKAMA_CONSOLE_SIGNING_KEY\"; DB_ADDRESS=${NAKAMA_DATABASE_URL#postgresql://}; /nakama/nakama migrate up --database.address \"$DB_ADDRESS\"; set -- --database.address \"$DB_ADDRESS\" --config /nakama/data/production.yml --runtime.http_key \"$LOKI_NAKAMA_HTTP_KEY\" --socket.server_key \"$LOKI_NAKAMA_SERVER_KEY\" --session.encryption_key \"$NAKAMA_SESSION_ENCRYPTION_KEY\" --session.refresh_encryption_key \"$NAKAMA_REFRESH_ENCRYPTION_KEY\" --console.username \"$NAKAMA_CONSOLE_USERNAME\" --console.password \"$NAKAMA_CONSOLE_PASSWORD\" --console.signing_key \"$NAKAMA_CONSOLE_SIGNING_KEY\"; if [ -n \"${LOKI_TURN_SECRET:-}\" ] && [ -n \"${LOKI_TURN_URLS:-}\" ]; then set -- \"$@\" --runtime.env \"LOKI_REGION=sg\" --runtime.env \"LOKI_TURN_SECRET=$LOKI_TURN_SECRET\" --runtime.env \"LOKI_TURN_URLS=$LOKI_TURN_URLS\"; fi; if [ \"${LOKI_SERVER_AUTHORITY_ENABLED:-}\" = \"true\" ] && [ -n \"${LOKI_WORKER_ORCHESTRATOR_URL:-}\" ]; then set -- \"$@\" --runtime.env \"LOKI_REGION=sg\" --runtime.env \"LOKI_SERVER_AUTHORITY_ENABLED=true\" --runtime.env \"LOKI_WORKER_ORCHESTRATOR_URL=$LOKI_WORKER_ORCHESTRATOR_URL\"; fi; exec /nakama/nakama \"$@\""]
