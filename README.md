# go-music

A serverless music browser and API built with Go, Gin, and AWS Lambda. It serves music/mp3 files on S3, provides a REST API for music search and directory browsing, and streams audio files from S3 using pre-signed URLs.

## Features
- Browse and search music files stored in S3
- Stream audio files via pre-signed S3 URLs
- REST API for directory listing, search, and file operations
- Runs on AWS Lambda or as a Docker
- Build info (version, commit, build time) injected at build

## Getting Started

### Prerequisites
- Go 1.24+
- AWS account with S3 bucket
- AWS credentials configured for Lambda or Docker use

### Required Environment Variables (for S3 access)

Set these environment variables for both Lambda and Docker deployments to enable S3 access:

- `AWS_ACCESS_KEY_ID`: your AWS access key ID
- `AWS_SECRET_ACCESS_KEY`: your AWS secret access key
- `AWS_REGION`: your AWS region
- `BUCKET`: your S3 bucket name
- `S3_PREFIX`: optional S3 prefix (e.g., "music")

For AWS Lambda, set these in the Lambda configuration.
For Docker, pass them with `-e` flags or in your `docker-compose.yml`.

## Usage

### Deploy on AWS Lambda
1. Build the binary for Lambda:
   ```bash
   go build \
     -ldflags "-X main.buildTime=$(date --utc +%Y-%m-%dT%H:%M:%SZ) -X main.commitHash=$(git rev-parse HEAD) -X main.version=latest" \
     -tags netgo -trimpath \
     -o bootstrap main.go
   ```
2. Zip the binary and static files:
   ```bash
   zip -r deployment.zip bootstrap static/
   ```
3. Upload to AWS Lambda (via AWS Console, CLI, or CI/CD).
4. Set environment variables in Lambda:
   - `AWS_ACCESS_KEY_ID`: your AWS access key ID
   - `AWS_SECRET_ACCESS_KEY`: your AWS secret access key
   - `AWS_REGION`: your AWS region
   - `BUCKET`: your S3 bucket name
   - `S3_PREFIX`: optional S3 prefix

### Run with Docker
1. Ensure the `static/` directory (with CSS, JS, HTML) is present in your build context.
2. Build the Docker image:
   ```bash
   docker build -t go-music . -f docker/Dockerfile
   ```
3. Run the container:
    ```bash
    docker run -p 8080:8080 \
       -e AWS_ACCESS_KEY_ID=your-aws-key-id \
       -e AWS_SECRET_ACCESS_KEY=your-aws-secret \
       -e AWS_REGION=your-region \
       -e BUCKET=your-s3-bucket \
       -e S3_PREFIX=optional/prefix/ \
       go-music
    ```
    Or use Docker Compose:
    ```bash
    docker compose -f docker/docker-compose.yml up -d
    ```
    Example environment section for Docker Compose:
    ```yaml
    environment:
       - AWS_ACCESS_KEY_ID=your-aws-key-id
       - AWS_SECRET_ACCESS_KEY=your-aws-secret
       - AWS_REGION=your-region
       - BUCKET=your-s3-bucket
       - S3_PREFIX=optional/prefix/
    ```
4. Access the app at [http://localhost:8080](http://localhost:8080)

## API Endpoints
- `GET /` — Serves the main web UI
- `GET /static/*` — Serves static assets
- `POST /api` — Main API endpoint (functions: dir, searchTitle, searchDir, getAllMp3, getAllMp3InDir, getAllMp3InDirs, getAllDirs)
- `GET /audio/*path` — Returns a pre-signed S3 URL for audio streaming
