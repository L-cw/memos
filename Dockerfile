ARG NODE_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/node:20-alpine
ARG GO_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/golang:1.23-alpine
ARG ALPINE_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/alpine:latest
ARG PNPM_VERSION=9.15.4
ARG BUILD_LOG_LEVEL=warn
ARG GOPROXY=https://goproxy.cn,direct
ARG GOSUMDB=sum.golang.google.cn

FROM ${NODE_IMAGE} AS frontend-deps
WORKDIR /frontend-build
ARG PNPM_VERSION

RUN npm install --global --no-fund --no-audit --no-update-notifier --loglevel=error pnpm@${PNPM_VERSION}

COPY web/package.json web/pnpm-lock.yaml ./web/
WORKDIR /frontend-build/web

RUN --mount=type=cache,id=memos-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline \
      --store-dir=/pnpm/store --reporter=append-only --loglevel=info

# Build frontend dist.
FROM frontend-deps AS frontend
WORKDIR /frontend-build

COPY proto ./proto
COPY web ./web

WORKDIR /frontend-build/web

RUN --mount=type=cache,id=memos-buf-cache,target=/root/.cache/buf \
    cd ../proto && ../web/node_modules/.bin/buf generate
ARG BUILD_LOG_LEVEL
RUN pnpm exec vite build --logLevel=${BUILD_LOG_LEVEL}

# Build backend exec file.
FROM ${GO_IMAGE} AS backend
WORKDIR /backend-build
ARG GOPROXY
ARG GOSUMDB
ENV GOPROXY=${GOPROXY}
ENV GOSUMDB=${GOSUMDB}

COPY go.mod go.sum ./
RUN --mount=type=cache,id=memos-go-mod,target=/go/pkg/mod \
    go mod download

COPY bin ./bin
COPY internal ./internal
COPY plugin ./plugin
COPY proto ./proto
COPY server ./server
COPY store ./store
COPY --from=frontend /frontend-build/web/dist /backend-build/server/router/frontend/dist

RUN --mount=type=cache,id=memos-go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=memos-go-build,target=/root/.cache/go-build \
    go build -o memos ./bin/memos

# Make workspace with above generated files.
FROM ${ALPINE_IMAGE} AS monolithic
WORKDIR /usr/local/memos

RUN apk add --no-cache tzdata
ENV TZ="UTC"

COPY --from=backend /backend-build/memos /usr/local/memos/
COPY entrypoint.sh /usr/local/memos/

EXPOSE 5230

# Directory to store the data, which can be referenced as the mounting point.
RUN mkdir -p /var/opt/memos
VOLUME /var/opt/memos

ENV MEMOS_MODE="prod"
ENV MEMOS_PORT="5230"

ENTRYPOINT ["./entrypoint.sh", "./memos"]
