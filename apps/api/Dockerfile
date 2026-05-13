FROM node:20-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-contracts/package.json ./packages/shared-contracts/package.json

RUN pnpm install --filter @reloplanner/api... --no-frozen-lockfile

COPY apps/api ./apps/api
COPY packages/shared-contracts ./packages/shared-contracts

RUN pnpm --filter @reloplanner/shared-contracts run build
RUN pnpm --filter @reloplanner/api exec prisma generate
RUN pnpm --filter @reloplanner/api run build

EXPOSE 3000

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main"]
