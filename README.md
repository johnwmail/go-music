# go-music

[![Lint, Test and Build](https://github.com/johnwmail/go-music/workflows/Lint,%20Test%20and%20Build/badge.svg)](https://github.com/johnwmail/go-music/actions/workflows/test.yml)
[![Go Report Card](https://goreportcard.com/badge/github.com/johnwmail/go-music)](https://goreportcard.com/report/github.com/johnwmail/go-music)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/release/johnwmail/go-music.svg)](https://github.com/johnwmail/go-music/releases)
[![Go Version](https://img.shields.io/badge/go-1.24+-blue.svg)](go.mod)

A serverless music browser and streaming API built with Go, Gin, and AWS Lambda. Browse, search, and stream music files stored in S3 with a beautiful web interface and powerful REST API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Build Metadata](#build-metadata)
- [Links](#links)

<a id="overview"></a>
## Overview

`go-music` provides a complete solution for browsing and streaming music files stored in AWS S3. It features:

- **Interactive Web UI** – Browse directories, search by title or folder, and stream audio directly from S3
- **REST API** – JSON endpoints for directory listing, search, and file operations
- **Pre-signed URLs** – Secure, time-limited audio streaming without exposing credentials
- **Multi-format Support** – Handles MP3, WAV, OGG, and MP4 audio files
- **Flexible Deployment** – Run on AWS Lambda, Docker, or standalone

The service automatically adapts to its environment, running as a Lambda function when `AWS_LAMBDA_FUNCTION_NAME` is detected or as a standard web server otherwise.

<a id="features"></a>
## ✨ Features

- 🎵 **Music Streaming** – Stream audio files from S3 using secure pre-signed URLs
- 🔍 **Smart Search** – Search by song title or directory name with real-time results
- 📁 **Directory Browsing** – Navigate your S3 music collection like a file browser
- 🎨 **Modern UI** – Responsive web interface with clean design
- ☁️ **Lambda Ready** – Auto-detects AWS Lambda environment with zero config changes
- 🐳 **Docker Support** – Containerized deployment with multi-arch builds (amd64/arm64)
- 🔐 **Secure** – Uses IAM roles and pre-signed URLs, never exposes credentials
- 🚀 **Fast** – Efficient S3 API usage with streaming support
- 📊 **Build Metadata** – Version, commit hash, and build time baked into releases

<a id="quick-start"></a>
## 🚀 Quick Start

### Run with Go

Requires Go 1.24+.

```bash
git clone https://github.com/johnwmail/go-music.git
cd go-music

# Set required environment variables
export BUCKET=your-s3-bucket-name
export AWS_REGION=us-east-1
export S3_PREFIX=music  # optional

# Run the service
go run .
```

Visit http://localhost:8080 to browse your music collection.

### Quick Docker Start

```bash
docker run -p 8080:8080 \
  -e BUCKET=your-bucket \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  ghcr.io/johnwmail/go-music:latest
```

<a id="deployment"></a>
## ☁️ Deployment

### Docker

Build and run locally:

```bash
docker build -t go-music:local -f docker/Dockerfile .
docker run --rm -p 8080:8080 \
  -e BUCKET=your-bucket \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  --name go-music go-music:local
```

Using Compose:

```bash
docker compose -f docker/docker-compose.yml up --build
```

**Multi-arch support**: Images are built for `linux/amd64` and `linux/arm64` automatically via GitHub Actions.

### AWS Lambda

The app switches to Lambda mode when `AWS_LAMBDA_FUNCTION_NAME` is present. The `deploy-lambda.yml` workflow handles automated deployments.

#### Manual Deployment

1. Build the Lambda bootstrap binary:
   ```bash
   go build \
     -ldflags "-X main.Version=v1.0.0 -X main.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ) -X main.CommitHash=$(git rev-parse --short HEAD)" \
     -tags netgo -trimpath \
     -o bootstrap .
   ```

2. Package with static assets:
   ```bash
   mkdir -p lambda-artifacts
   mv bootstrap lambda-artifacts/
   cp -r static lambda-artifacts/
   cd lambda-artifacts && zip -r ../deployment.zip . && cd ..
   ```

3. Deploy via AWS CLI or Console with these environment variables:
   - `BUCKET` – Your S3 bucket name
   - `S3_PREFIX` – Optional prefix (e.g., "music")
   - `GIN_MODE` – Set to "release" for production

#### Automated Deployment

Push to the `deploy/lambda` branch or manually trigger the workflow:

```bash
gh workflow run deploy-lambda.yml \
  -f function_name=your-lambda-function-name
```

Required GitHub secrets:
- `AWS_ACCESS_KEY_ID_DEPLOY_LAMBDA`
- `AWS_SECRET_ACCESS_KEY_DEPLOY_LAMBDA`
- `AWS_REGION`

Required GitHub variables:
- `LAMBDA_FUNCTION_NAME`
- `BUCKET`
- `S3_PREFIX` (optional)
- `LAMBDA_EXECUTION_ROLE`

### Container Registry

Pre-built images are available on GitHub Container Registry:

```bash
docker pull ghcr.io/johnwmail/go-music:latest
docker pull ghcr.io/johnwmail/go-music:v1.0.0  # specific version
```

<a id="configuration"></a>
## ⚙️ Configuration

The service uses environment variables for configuration:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BUCKET` | Yes | – | S3 bucket containing your music files |
| `AWS_REGION` | Recommended | auto-detect | AWS region for S3 bucket |
| `S3_PREFIX` | No | `""` | Optional prefix path in S3 (e.g., "music") |
| `AWS_ACCESS_KEY_ID` | Docker only* | – | AWS access key (use IAM role in Lambda) |
| `AWS_SECRET_ACCESS_KEY` | Docker only* | – | AWS secret key (use IAM role in Lambda) |
| `PORT` | No | `8080` | HTTP server port (ignored in Lambda) |
| `GIN_MODE` | No | `debug` | Set to "release" for production |

\* **Lambda deployments** should use IAM roles instead of static credentials.

### S3 Bucket Setup

Your S3 bucket should contain audio files organized in directories:

```
my-music-bucket/
├── music/                 # S3_PREFIX="music"
│   ├── Rock/
│   │   ├── song1.mp3
│   │   └── song2.mp3
│   └── Jazz/
│       └── tune.mp3
```

Required IAM permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

<a id="api-endpoints"></a>
## 📋 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves the web UI |
| GET | `/static/*` | Serves static assets (CSS, JS) |
| POST | `/api` | Main API endpoint (see functions below) |
| GET | `/audio/*path` | Returns pre-signed S3 URL for streaming |

### API Functions (POST to `/api`)

Send JSON payloads with a `function` field and relevant parameters:

#### Directory Listing
```bash
curl -X POST http://localhost:8080/api \
  -H "Content-Type: application/json" \
  -d '{"function":"dir","path":"Rock/"}'
```

#### Search by Title
```bash
curl -X POST http://localhost:8080/api \
  -H "Content-Type: application/json" \
  -d '{"function":"searchTitle","searchStr":"love"}'
```

#### Search by Directory
```bash
curl -X POST http://localhost:8080/api \
  -H "Content-Type: application/json" \
  -d '{"function":"searchDir","searchStr":"jazz"}'
```

#### Get All MP3s
```bash
curl -X POST http://localhost:8080/api \
  -H "Content-Type: application/json" \
  -d '{"function":"getAllMp3"}'
```

#### Get All Directories
```bash
curl -X POST http://localhost:8080/api \
  -H "Content-Type: application/json" \
  -d '{"function":"getAllDirs"}'
```

#### Audio Streaming
```bash
# Get pre-signed URL (valid for 1 hour)
curl http://localhost:8080/audio/Rock/song.mp3
# Returns: {"url":"https://s3.amazonaws.com/..."}
```

Sample API response:
```json
{
  "files": [
    {
      "name": "song.mp3",
      "path": "Rock/song.mp3",
      "size": 5242880,
      "modified": "2024-01-15T10:30:00Z"
    }
  ],
  "directories": ["Rock", "Jazz", "Classical"]
}
```

<a id="development"></a>
## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/johnwmail/go-music.git
cd go-music

# Install dependencies
go mod download

# Run tests (no AWS credentials required)
export MUSIC_DIR=/tmp/test-music
export GIN_MODE=release
go test -v ./...

# Run tests with coverage
go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
go tool cover -html=coverage.out

# Format and lint
go fmt ./...
go vet ./...
golangci-lint run

# Run locally with live reload
go run .
```

### Running Tests

The test suite is designed to run **without AWS/S3 credentials**. Tests use local filesystem operations and mocked dependencies:

```bash
# Run all tests
MUSIC_DIR=/tmp/test-music GIN_MODE=release go test -v ./...

# Run specific test
MUSIC_DIR=/tmp/test-music go test -v -run TestIsAudioFile

# Run with race detection
MUSIC_DIR=/tmp/test-music go test -race ./...

# Generate coverage report
MUSIC_DIR=/tmp/test-music go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

The tests cover:
- ✅ Audio file detection (mp3, wav, ogg, mp4)
- ✅ JavaScript array encoding for web UI
- ✅ Version endpoint handler
- ✅ Local file system operations (listing, searching)
- ✅ Directory browsing and filtering
- ✅ Search functionality (case-insensitive)

The CI pipeline in `.github/workflows/test.yml` enforces code quality checks and runs the full test suite automatically.

### Project Structure

```
go-music/
├── .github/
│   ├── instructions/        # Development guidelines
│   └── workflows/           # CI/CD pipelines
├── docker/
│   ├── Dockerfile          # Multi-stage container build
│   └── docker-compose.yml  # Local development setup
├── static/                 # Web UI assets (HTML, CSS, JS)
├── main.go                 # Application entry point
├── go.mod                  # Go module definition
└── README.md
```

<a id="build-metadata"></a>
## 🏷️ Build Metadata

`main.go` exposes three build-time variables for versioning:

| Variable | Default | Purpose |
|----------|---------|---------|
| `Version` | `dev` | Semantic version or git tag |
| `BuildTime` | `unknown` | Build timestamp (ISO 8601) |
| `CommitHash` | `none` | Git commit SHA (short) |

Inject values with Go build flags:

```bash
go build \
  -ldflags "-X main.Version=v1.2.3 \
            -X main.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
            -X main.CommitHash=$(git rev-parse --short HEAD)" \
  -o go-music .
```

Values are logged on startup and accessible via the web UI.

<a id="links"></a>
## 🔗 Links

- **GitHub**: https://github.com/johnwmail/go-music
- **Container Images**: https://github.com/johnwmail/go-music/pkgs/container/go-music
- **Issues**: https://github.com/johnwmail/go-music/issues
- **Actions**: https://github.com/johnwmail/go-music/actions
- **Releases**: https://github.com/johnwmail/go-music/releases

---

⭐ Star the project if this music streamer helps you out!
