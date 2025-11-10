# Go Music Copilot Instructions

This document provides guidance for AI coding agents to effectively contribute to the `go-music` project.

## The Big Picture

`go-music` is a web-based music player with a Go backend and a vanilla JavaScript frontend. It's designed to be deployed as a standalone server, a Docker container, or an AWS Lambda function.

- **Backend**: The backend is a Go application using the Gin web framework. It's a single binary defined in `main.go`. It serves the frontend and provides a JSON API.
- **Frontend**: The frontend is a single-page application built with vanilla JavaScript, HTML, and CSS, located in the `static/` directory.
- **Storage**: The application can serve music files from two sources:
    1.  A local directory, specified by the `MUSIC_DIR` environment variable.
    2.  An AWS S3 bucket. This is the default when `MUSIC_DIR` is not set.

The application determines its operating mode (standalone vs. AWS Lambda) at runtime by checking for the `AWS_LAMBDA_FUNCTION_NAME` environment variable.

## Developer Workflow

### Running Locally

To run the application locally for development, you can use `go run`:

```bash
go run main.go
```

This will start a web server on port 8080.

To serve music from a local directory, set the `MUSIC_DIR` environment variable:

```bash
export MUSIC_DIR=/path/to/your/music
go run main.go
```

### Building

The project is built using the standard `go build` command. The `Dockerfile` contains the canonical build command, which injects version information into the binary using `-ldflags`:

```bash
go build -v -ldflags="-w -s -X 'main.Version=dev'" -o go-music .
```

### Running with Docker

The `docker-compose.yml` file provides a template for running the application in a Docker container. It requires environment variables for AWS credentials and S3 configuration.

## Code Conventions

### Backend (Go)

- The main application logic is in `main.go`.
- The application uses the Gin framework for routing.
- For S3 integration, the application uses the AWS SDK for Go v2.
- When serving from S3, it generates pre-signed URLs for audio files for security.
- The API is exposed via a single endpoint, `/api`, which uses a form-based RPC-style communication. The `dffunc` parameter in the form post determines the function to be called.

### Frontend (JavaScript)

- The frontend code is in `static/script.js`.
- It uses vanilla JavaScript and manages state with global variables.
- The frontend communicates with the backend's `/api` endpoint by submitting a hidden form (`dfform`) that targets a hidden `iframe`. The response from the backend is then processed by JavaScript functions.

When making changes, please adhere to these patterns and conventions.
