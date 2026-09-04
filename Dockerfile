FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=2 && npm cache clean --force
COPY src ./src
COPY web ./web
USER node
EXPOSE 9280
CMD ["node", "src/app.js"]
