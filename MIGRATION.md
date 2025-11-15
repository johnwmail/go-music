# Migration from iframe to Fetch API# Migration to Fetch API



## Overview## Summary



This document describes the migration from the legacy iframe-based API communication to the modern Fetch API approach.Successfully migrated the go-music application from the old-fashioned iframe-based API communication pattern to modern Fetch API.



## Changes Made## Changes Made



### 1. Frontend (JavaScript)### Backend (main.go)



#### Removed Components1. **Added APIResponse struct** - Standard JSON response structure

- **Hidden iframe and form** (`index.html`): Removed the `<iframe>` and `<form>` elements that were used for API communication   ```go

- **`loadFromServer()` function**: Replaced with modern `fetchAPI()` function   type APIResponse struct {

- **`checkDataframe()` function**: Removed the timeout monitoring mechanism (no longer needed with fetch)       Status string      `json:"status"`

- **`dataframeTime` variable**: Removed global timeout tracking variable       Data   interface{} `json:"data,omitempty"`

       Error  string      `json:"error,omitempty"`

#### Added Components   }

- **`fetchAPI()` function**: New async function using modern Fetch API   ```

  - Automatically handles JSON request/response

  - Built-in error handling with try/catch2. **Updated handleRequest** - Now accepts JSON requests instead of form data

  - Cleaner async/await syntax   - Changed from `c.PostForm("dffunc")` to JSON body parsing

  - No more timeout polling - relies on browser's native timeout handling   - Request format: `{"function": "...", "data": "..."}`



#### Updated Functions3. **Updated all API handlers** - Return proper JSON instead of HTML with embedded JavaScript

All functions that previously called `loadFromServer()` now use `fetchAPI()`:   - `handleVersion` → Returns `{status: "ok", data: "version"}`
 # Migration: iframe → Fetch API

 ## Summary

 This document summarizes the migration from the legacy iframe/form-based frontend API integration to a modern Fetch API approach. The change simplifies client-server communication by using standard JSON requests and responses, removes fragile iframe callbacks, and improves maintainability and reliability (particularly for Lambda deployments).

 ## Goals

 - Replace iframe/form callbacks with Fetch-based API calls.
 - Standardize request/response shapes as JSON objects.
 - Keep backward compatibility during the migration where practical.
 - Remove dead helpers that were specific to the iframe approach.

 ## What changed (high level)

 - Frontend now uses an async `fetchAPI(functionName, data)` wrapper to call `/api`.
 - Backend `handleRequest` accepts JSON bodies and still falls back to form parsing for legacy compatibility.
 - All handlers return JSON objects instead of HTML pages that contain JavaScript callbacks.
 - Hidden iframe, form inputs, and related helper plumbing were removed from the frontend.
 - A few small compatibility helpers were removed from the codebase (see "Removed functions" below).

 ## Key differences (request/response shapes)

 - Old (iframe): responses were returned in HTML with embedded JavaScript and callback invocation like parent.cb([...]) or used custom array formats.
 - New (fetch): responses are JSON objects, e.g. `{ "status": "ok", "files": [...] }` or `{ "status": "ok", "dir": "...", "dirs": [...], "files": [...] }`.

 Frontend code now expects and handles these JSON objects directly.

 ## Removed / cleaned up

 These helpers were specific to the iframe callback approach and were removed to reduce dead code:

 - `echoReqHtml()` — HTML wrapper used to execute parent callbacks from an iframe.
 - `ea()` — JS helper that encoded arrays into a string for embedding in HTML callback arguments.

 In Go code, leftover helpers used only for the iframe flow were also removed.

 ## Notable updated handlers (backend)

 - `handleRequest` — accepts JSON (`Content-Type: application/json`) and falls back to form parsing if needed. It dispatches on the request `function` field and returns JSON.
 - `handleDirRequest`, `handleGetAllMp3`, `handleGetAllMp3InDir`, `handleGetAllDirs`, `handleGetAllMp3InDirs`, `handleSearchTitle`, `handleSearchDir` — all return consistent JSON shapes.

 The backend changes are focused on returning proper JSON and preserving behaviors (directory listing, searches, presigned URLs for S3, or local-file routing).

 ## Frontend changes (static/script.js)

 - New `fetchAPI()` async wrapper that sends JSON and parses JSON responses.
 - UI callbacks (`getBrowserData`, `getSearchTitle`, `getSearchDir`, etc.) now accept JSON objects and handle them without iframe callbacks.

 ## Backward compatibility

 - During migration, the backend still accepts form-encoded requests (legacy) so you can deploy the backend before the frontend.
 - After migration stabilizes, the fallback form parsing can be removed for simplification.

 ## Benefits

 - Simpler and clearer code (no HTML generation for data transport).
 - Easier debugging in browser DevTools (JSON is visible in Network tab).
 - Better reliability when deploying to serverless platforms (Lambda + API Gateway).
 - Cleaner API contract between frontend and backend.

 ## Testing checklist

 Run these locally before/after deployment:

 - [x] Directory browsing (browse directories and see file lists)
 - [x] Search by title (results show expected matches)
 - [x] Search by directory (results show expected matches)
 - [x] Get all MP3(s) and per-directory MP3 listings
 - [x] Audio playback (play, pause, next/prev, progress)

 Local test commands that are useful:

 ```bash
 # build
 go build -v -ldflags="-w -s -X 'main.Version=dev'" -o go-music .
 # run
 MUSIC_DIR=./mp3 ./go-music
 # open
 http://localhost:8080
 ```

 - Run unit tests (uses MUSIC_DIR to avoid S3 init):

 ```bash
 MUSIC_DIR=/tmp/gotest go test -v
 ```

 ## Rollback plan

 If issues are discovered, you can revert to a commit before the migration and redeploy. All previous iframe-based code remains available in git history.

 ## Code cleanup opportunities (post-migration)

 Once the new fetch-based flow is stable, consider removing:

 1. Form-data fallback parsing in `handleRequest()`.
 2. Any leftover iframe/form DOM elements in `static/index.html`.
 3. Any migration-only comments or shim helpers in the codebase.

 ## Notes about `setVersion()`

 `setVersion()` (a small frontend compatibility helper used in the iframe approach) was removed from `static/script.js`. The async `loadVersion()` function now updates the UI directly. `MIGRATION.md` and other docs were updated to note this removal.

 ## Next steps

 - Verify the application behavior in a staging environment (Lambda or local) and run the testing checklist above.
 - If everything is stable for a few deploy cycles, remove legacy fallbacks and migration notes.
 - Consider adding a small section in the README summarizing how the API expects to be called (JSON `{function, data}`) so future contributors understand the contract.

 ## Conclusion

 This migration modernizes the frontend-backend contract and removes brittle iframe callback plumbing. It improves maintainability, observability, and serverless compatibility while keeping the user-facing behavior unchanged.
