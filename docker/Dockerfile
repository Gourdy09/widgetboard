# Stage 1: Compile the Go binary
FROM golang:1.23-alpine AS builder
WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -o widgetboard ./cmd/widgetboard

# Stage 2: Minimal runtime container
FROM scratch
COPY --from=builder /app/widgetboard /widgetboard

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080
ENTRYPOINT ["/widgetboard"]
