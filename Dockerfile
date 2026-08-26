ARG NODE_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/node:20-alpine
ARG GO_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/golang:1.23-alpine
ARG ALPINE_IMAGE=registry.cn-hangzhou.aliyuncs.com/goodlcw1-prod/alpine:latest
ARG PNPM_VERSION=9.15.4
ARG BUILD_LOG_LEVEL=warn

FROM ${NODE_IMAGE} AS frontend-deps
WORKDIR /frontend-build
ARG PNPM_VERSION

RUN set -eu; \
    npm install --global --no-fund --no-audit --no-update-notifier --loglevel=error pnpm@${PNPM_VERSION} \
      >/tmp/pnpm-bootstrap.log 2>&1 || { \
        printf '%s\n' 'pnpm bootstrap failed (last 100 lines):' >&2; \
        tail -n 100 /tmp/pnpm-bootstrap.log >&2; \
        exit 1; \
      }; \
    printf '%s\n' 'pnpm bootstrap complete'

COPY web/package.json web/pnpm-lock.yaml ./web/
WORKDIR /frontend-build/web

RUN --mount=type=cache,id=memos-pnpm-store,target=/pnpm/store \
    set -eu; \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store \
      --reporter=append-only --loglevel=error \
      >/tmp/pnpm-install.log 2>&1 || { \
        printf '%s\n' 'frontend dependency install failed (last 100 lines):' >&2; \
        tail -n 100 /tmp/pnpm-install.log >&2; \
        exit 1; \
      }; \
    printf '%s\n' 'frontend dependencies ready'

# Build frontend dist.
FROM frontend-deps AS frontend
WORKDIR /frontend-build

COPY proto ./proto
COPY web ./web

WORKDIR /frontend-build/web

RUN --mount=type=cache,id=memos-buf-cache,target=/root/.cache/buf \
    set -eu; \
    cd ../proto; \
    ../web/node_modules/.bin/buf generate >/tmp/buf-generate.log 2>&1 || { \
      printf '%s\n' 'Buf generation failed (last 100 lines):' >&2; \
      tail -n 100 /tmp/buf-generate.log >&2; \
      exit 1; \
    }
ARG BUILD_LOG_LEVEL
RUN set -eu; \
    pnpm exec vite build --logLevel=${BUILD_LOG_LEVEL} >/tmp/frontend-build.log 2>&1 || { \
      printf '%s\n' 'frontend build failed (last 100 lines):' >&2; \
      tail -n 100 /tmp/frontend-build.log >&2; \
      exit 1; \
    }; \
    grep -E '(^Browserslist:|^\(!\)|built in)' /tmp/frontend-build.log || \
      printf '%s\n' 'frontend build complete'

# Build backend exec file.
FROM ${GO_IMAGE} AS backend
WORKDIR /backend-build

COPY go.mod go.sum ./
RUN --mount=type=cache,id=memos-go-mod,target=/go/pkg/mod \
    set -eu; \
    go mod download >/tmp/go-mod-download.log 2>&1 || { \
      printf '%s\n' 'Go module download failed (last 100 lines):' >&2; \
      tail -n 100 /tmp/go-mod-download.log >&2; \
      exit 1; \
    }; \
    printf '%s\n' 'go modules ready'

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
