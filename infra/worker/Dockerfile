FROM golang:1.22-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/worker .

FROM gcr.io/distroless/static-debian12

COPY --from=build /out/worker /worker

EXPOSE 8090

# LOKI_WORKER_PUBLIC_URL and LOKI_WORKER_MODULE_BASE_URL are required Railway
# service variables; see README.md. There is no shell in a distroless image
# to assert that with `test -n`, so main.go itself fails fast (log.Fatal) if
# LOKI_WORKER_PUBLIC_URL is unset.
ENTRYPOINT ["/worker"]
