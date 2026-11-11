# syntax=docker/dockerfile:1
FROM golang:1.26.11-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.21.10
# CA roots come from the builder image (golang:alpine ships them), so the
# runtime stage needs no package downloads. Timezone data is not needed:
# tz.Taipei is a fixed UTC+8 zone. busybox wget serves the healthcheck.
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /server /app/server
USER app
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health >/dev/null || exit 1
CMD ["/app/server"]
