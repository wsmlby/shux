# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install

FROM base AS web-build
COPY web web
RUN npm run build -w web

FROM base AS server-build
COPY server server
RUN npm run build -w server

FROM node:20-alpine AS runtime
# poppler-utils provides pdftoppm, used to rasterize PDF cover thumbnails.
RUN apk add --no-cache openssl poppler-utils
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    LIBRARY_DIR=/library \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/shux.db

COPY package.json ./
COPY server/package.json server/package.json
RUN npm install -w server --omit=dev

COPY --from=server-build /app/server/prisma server/prisma
COPY --from=server-build /app/server/dist server/dist
COPY --from=web-build /app/web/dist server/web-dist

WORKDIR /app/server
RUN npx prisma generate

EXPOSE 8080
VOLUME ["/library", "/data"]

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
