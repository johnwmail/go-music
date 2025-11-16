# Build stage
FROM golang:1.24 AS build

ARG TARGETOS
ARG TARGETARCH
ARG VERSION

WORKDIR /build
COPY . ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -v \
       -ldflags="-w -s -X 'main.BuildTime=$(date --utc +%Y-%m-%dT%H:%M:%SZ)' \
       -X 'main.CommitHash=$(git rev-parse HEAD)' \
       -X 'main.Version=${VERSION:-latest}'" \
       -o /build/go-music .

# Runtime stage 
# distroless/static has certs , which needs for access S3 bucket
FROM gcr.io/distroless/static:nonroot

WORKDIR /app

# copy static assets from build stage (they live at /build/static inside the build stage)
COPY --from=build /build/static /app/static
COPY --from=build /build/templates /app/templates
# copy the compiled binary placed at /build/go-music in the build stage
COPY --from=build /build/go-music /app/go-music

USER 8080:8080
EXPOSE 8080
ENTRYPOINT ["/app/go-music"]

