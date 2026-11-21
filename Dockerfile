FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
