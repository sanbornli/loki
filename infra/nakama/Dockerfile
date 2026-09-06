FROM heroiclabs/nakama:3.22.0

COPY production.yml /nakama/data/production.yml
COPY modules /nakama/data/modules

EXPOSE 7350

ENTRYPOINT ["/bin/sh", "-ec"]
CMD ["test -n \"$NAKAMA_DATABASE_URL\"; test -n \"$LOKI_NAKAMA_HTTP_KEY\"; test -n \"$LOKI_NAKAMA_SERVER_KEY\"; test -n \"$NAKAMA_SESSION_ENCRYPTION_KEY\"; test -n \"$NAKAMA_REFRESH_ENCRYPTION_KEY\"; test -n \"$NAKAMA_CONSOLE_USERNAME\"; test -n \"$NAKAMA_CONSOLE_PASSWORD\"; test -n \"$NAKAMA_CONSOLE_SIGNING_KEY\"; DB_ADDRESS=${NAKAMA_DATABASE_URL#postgresql://}; /nakama/nakama migrate up --database.address \"$DB_ADDRESS\"; exec /nakama/nakama --database.address \"$DB_ADDRESS\" --config /nakama/data/production.yml --runtime.http_key \"$LOKI_NAKAMA_HTTP_KEY\" --socket.server_key \"$LOKI_NAKAMA_SERVER_KEY\" --session.encryption_key \"$NAKAMA_SESSION_ENCRYPTION_KEY\" --session.refresh_encryption_key \"$NAKAMA_REFRESH_ENCRYPTION_KEY\" --console.username \"$NAKAMA_CONSOLE_USERNAME\" --console.password \"$NAKAMA_CONSOLE_PASSWORD\" --console.signing_key \"$NAKAMA_CONSOLE_SIGNING_KEY\""]
