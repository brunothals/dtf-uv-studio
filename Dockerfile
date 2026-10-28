FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/montadora ./montadora
COPY --from=build /app/assets ./assets
COPY --from=build /app/index.html /app/quote-core.js /app/quote-ui.js ./
USER node
CMD ["node", "server/index.cjs"]
