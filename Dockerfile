FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-instructions/package.json packages/agent-instructions/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
COPY packages/ui-web/package.json packages/ui-web/package.json
RUN npm ci

COPY apps apps
COPY packages packages

ENV NODE_ENV=production

CMD ["sh", "-ec", "test -n \"$SERVICE_ENTRYPOINT\"; exec node --import tsx \"$SERVICE_ENTRYPOINT\""]
