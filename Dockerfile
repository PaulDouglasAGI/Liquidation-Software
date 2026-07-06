# Liquidation Ops — single-container image.
# Build:  docker compose build   Run:  docker compose up -d
FROM node:22-slim

# openssl is required by Prisma's query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# next build imports modules that construct the Prisma client; give it a
# placeholder URL (never connected to). The real one comes from the runtime env.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV LOCAL_UPLOAD_PATH=/data/uploads
EXPOSE 3000

CMD ["bash", "scripts/docker-entrypoint.sh"]
