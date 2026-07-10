FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/memory-core/package.json ./packages/memory-core/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json

RUN npm ci

COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS production

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV MCP_PATH=/mcp

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/db/migrate.mjs ./scripts/db/migrate.mjs
COPY --from=build /app/packages/memory-core/package.json ./packages/memory-core/package.json
COPY --from=build /app/packages/memory-core/dist ./packages/memory-core/dist
COPY --from=build /app/packages/memory-core/migrations ./packages/memory-core/migrations
COPY --from=build /app/packages/memory-core/README.md ./packages/memory-core/README.md

EXPOSE 3000

CMD ["node", "dist/index.js"]
