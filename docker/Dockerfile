# Build stage

FROM golang:1.24 AS builder
WORKDIR /app
COPY . .
# Use build args for multi-arch support
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build \
	-ldflags "-X main.buildTime=$(date --utc +%Y-%m-%dT%H:%M:%SZ) -X main.commitHash=$(git rev-parse HEAD) -X main.version=${VERSION:-latest}" \
	-tags netgo -trimpath \
	-o go-music main.go

# Certificate stage
FROM alpine:latest AS certs
RUN apk --no-cache add ca-certificates

# Final minimal image
FROM scratch
COPY --from=builder /app/go-music /go-music
COPY ./static /static
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
USER 8080:8080
EXPOSE 8080
ENTRYPOINT ["/go-music"]
