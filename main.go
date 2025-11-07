package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"
	"github.com/gin-gonic/gin"
)

var ginLambda *ginadapter.GinLambdaV2
var r *gin.Engine

const (
	CHARSET           = "UTF-8"
	MIN_SEARCH_STR    = 1
	MAX_SEARCH_RESULT = 100
	TXT_ACC_DIR       = "Server is unable to access the directory."
	TXT_NO_RES        = "Server not responding."
	TXT_MIN_SEARCH    = "Minimum search characters: "
)

var audioExtensions = []string{"mp3", "wav", "ogg", "mp4"}

// S3 configuration from environment variables
var (
	s3Bucket = os.Getenv("BUCKET")
	s3Region = os.Getenv("AWS_REGION") // This is now optional
	s3Prefix = os.Getenv("S3_PREFIX")
)

var s3Client *s3.Client

// Build info variables, set via -ldflags at build time
var (
	Version    = "dev"
	BuildTime  = "unknown"
	CommitHash = "none"
)

// init function runs before main and sets up the Gin router.
func init() {
	log.Printf("Gin cold start")
	log.Printf("Build info: Version=%s, CommitHash=%s, BuildTime=%s", Version, CommitHash, BuildTime)

	// Initialize storage backend
	if localMusicDir == "" {
		if err := initS3(); err != nil {
			log.Fatalf("S3 init error: %v", err)
		}
	} else {
		log.Printf("Using local music directory: %s", localMusicDir)
	}

	r = gin.Default()
	r.Static("/static", "./static")
	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})
	r.GET("/favicon.ico", func(c *gin.Context) {
		c.File("./static/favicon.ico")
	})
	r.Use(ResponseLogger())
	r.POST("/api", handleRequest)
	r.GET("/audio/*path", audioProxyHandler)
	r.GET("/localdisk/*path", localDiskHandler)
	r.NoRoute(func(c *gin.Context) {
		c.String(http.StatusNotFound, "Not found")
	})
	ginLambda = ginadapter.NewV2(r)
}

// Handler is the function that AWS Lambda will invoke.
func Handler(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	return ginLambda.ProxyWithContext(ctx, req)
}

// main is the entry point for local execution or Lambda deployment.
func main() {
	// A more reliable way to check if we are in a Lambda environment.
	// The AWS_LAMBDA_FUNCTION_NAME variable is always set by the Lambda runtime.
	if _, ok := os.LookupEnv("AWS_LAMBDA_FUNCTION_NAME"); ok {
		lambda.Start(Handler)
	} else {
		log.Println("Running local server on :8080")
		if err := r.Run(":8080"); err != nil {
			log.Fatalf("Gin server error: %v", err)
		}
	}
}

// audioProxyHandler returns a pre-signed S3 URL for the audio file instead of streaming it through Lambda.
func audioProxyHandler(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("path"), "/")
	if key == "" {
		c.String(http.StatusBadRequest, "Missing song path")
		return
	}

	// Validate path to prevent directory traversal attacks
	if strings.Contains(key, "..") || strings.HasPrefix(key, "/") {
		c.String(http.StatusBadRequest, "Invalid path")
		return
	}

	// Prevent caching of pre-signed URLs by Cloudflare or other proxies
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")

	if localMusicDir != "" {
		// For local disk, return a JSON with the local file URL
		filePath := filepath.Join(localMusicDir, filepath.Clean(key))
		
		// Ensure the resolved path is within the music directory
		absPath, err := filepath.Abs(filePath)
		if err != nil {
			c.String(http.StatusBadRequest, "Invalid path")
			return
		}
		
		absMusicDir, err := filepath.Abs(localMusicDir)
		if err != nil {
			c.String(http.StatusInternalServerError, "Server configuration error")
			return
		}
		
		if !strings.HasPrefix(absPath, absMusicDir) {
			c.String(http.StatusForbidden, "Access denied")
			return
		}
		
		if _, err := os.Stat(absPath); err != nil {
			c.String(http.StatusNotFound, "Audio not found")
			return
		}
		c.JSON(http.StatusOK, gin.H{"url": "/localdisk/" + key})
		return
	}

	// S3 mode: return presigned URL as JSON
	presignedUrl, err := s3GetPresignedUrl(key)
	if err != nil {
		log.Printf("S3 presign error for key [%s]: %v", key, err)
		c.String(http.StatusNotFound, "Audio not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": presignedUrl})
}

// Serve local files at /localdisk/*path
func localDiskHandler(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("path"), "/")
	
	// Validate path to prevent directory traversal attacks
	if key == "" || strings.Contains(key, "..") || strings.HasPrefix(key, "/") {
		c.String(http.StatusBadRequest, "Invalid path")
		return
	}
	
	filePath := filepath.Join(localMusicDir, filepath.Clean(key))
	
	// Ensure the resolved path is within the music directory
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid path")
		return
	}
	
	absMusicDir, err := filepath.Abs(localMusicDir)
	if err != nil {
		c.String(http.StatusInternalServerError, "Server configuration error")
		return
	}
	
	if !strings.HasPrefix(absPath, absMusicDir) {
		c.String(http.StatusForbidden, "Access denied")
		return
	}
	
	if _, err := os.Stat(absPath); err != nil {
		c.String(http.StatusNotFound, "Audio not found")
		return
	}
	c.File(absPath)
}

// s3GetPresignedUrl generates a pre-signed URL for the given S3 key.
func s3GetPresignedUrl(key string) (string, error) {
	presignClient := s3.NewPresignClient(s3Client)
	input := &s3.GetObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(s3Prefix + key),
	}
	presignedReq, err := presignClient.PresignGetObject(context.Background(), input, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute // 15 minutes
	})
	if err != nil {
		return "", err
	}
	return presignedReq.URL, nil
}

// initS3 initializes the S3 client from environment variables.
func initS3() error {
	if s3Bucket == "" {
		return fmt.Errorf("BUCKET environment variable must be set")
	}

	var cfgOpts []func(*config.LoadOptions) error
	// If the AWS_REGION is explicitly set, use it.
	if s3Region != "" {
		cfgOpts = append(cfgOpts, config.WithRegion(s3Region))
	}

	// Load the configuration. The SDK will automatically look for the region
	// in other places (like the Lambda environment variable AWS_REGION) if it's not provided.
	cfg, err := config.LoadDefaultConfig(context.Background(), cfgOpts...)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	// After attempting to load everything, if the region is still missing, we must error out.
	if cfg.Region == "" {
		return fmt.Errorf("AWS region could not be found. Please set the AWS_REGION environment variable or configure it in your AWS profile")
	}

	log.Printf("S3 client configured for region: %s", cfg.Region)

	if s3Prefix != "" && !strings.HasSuffix(s3Prefix, "/") {
		s3Prefix += "/"
	}

	s3Client = s3.NewFromConfig(cfg)
	return nil
}

// handleRequest is the main router for API calls from the frontend.
func handleRequest(c *gin.Context) {
	funcType := c.PostForm("dffunc")
	data := c.PostForm("dfdata")

	switch funcType {
	case "dir":
		handleDirRequest(c, data)
	case "searchTitle":
		handleSearchTitle(c, data)
	case "searchDir":
		handleSearchDir(c, data)
	case "getAllMp3":
		handleGetAllMp3(c)
	case "getAllMp3InDir":
		handleGetAllMp3InDir(c, data)
	case "getAllDirs":
		handleGetAllDirs(c)
	case "getAllMp3InDirs":
		handleGetAllMp3InDirs(c, data)
	case "version":
		handleVersion(c)
	default:
		echoReqHtml(c, []interface{}{"error", "Unknown function"}, "default")
	}
}

func handleVersion(c *gin.Context) {
	versionInfo := fmt.Sprintf("%s (%s)", Version, CommitHash)
	if BuildTime != "unknown" {
		versionInfo = fmt.Sprintf("%s - %s", versionInfo, BuildTime)
	}
	echoReqHtml(c, []interface{}{"ok", versionInfo}, "setVersion")
}

// --- S3 Helper Functions ---

func s3ListAllAudioFiles(prefix string) ([]string, error) {
	var allFiles []string
	input := &s3.ListObjectsV2Input{Bucket: aws.String(s3Bucket), Prefix: aws.String(s3Prefix + prefix)}
	paginator := s3.NewListObjectsV2Paginator(s3Client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return nil, err
		}
		for _, obj := range page.Contents {
			if isAudioFile(*obj.Key) {
				name := strings.TrimPrefix(*obj.Key, s3Prefix)
				allFiles = append(allFiles, name)
			}
		}
	}
	return allFiles, nil
}

// --- Updated API Logic Handlers ---

func handleGetAllMp3(c *gin.Context) {
	files, err := listAllAudioFiles("")
	if err != nil {
		log.Printf("Get all mp3 error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan music files"}, "getAllMp3Data")
		return
	}
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", files}, "getAllMp3Data")
}

func handleGetAllMp3InDir(c *gin.Context, dir string) {
	files, err := listAllAudioFiles(dir)
	if err != nil {
		log.Printf("Get all mp3 in dir error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan music directory"}, "getAllMp3Data")
		return
	}
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", files}, "getAllMp3Data")
}

func handleGetAllDirs(c *gin.Context) {
	dirs, err := listAllDirs()
	if err != nil {
		log.Printf("Get all dirs error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan directories"}, "getAllDirsData")
		return
	}
	if len(dirs) > 1 {
		sort.Strings(dirs[1:]) // keep root at top
	}
	echoReqHtml(c, []interface{}{"ok", dirs}, "getAllDirsData")
}

func handleDirRequest(c *gin.Context, dir string) {
	dirs, files, err := listDir(dir)
	if err != nil {
		log.Printf("List error: %v", err)
		echoReqHtml(c, []interface{}{"error", TXT_ACC_DIR, dir, []string{}}, "getBrowserData")
		return
	}
	sort.Strings(dirs)
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", dir, dirs, files}, "getBrowserData")
}

func handleSearchTitle(c *gin.Context, searchStr string) {
	searchStr = strings.TrimSpace(searchStr)
	if len(searchStr) < MIN_SEARCH_STR {
		echoReqHtml(c, []interface{}{"error", TXT_MIN_SEARCH + fmt.Sprintf("%d", MIN_SEARCH_STR), []string{}}, "getSearchTitle")
		return
	}
	titles, err := searchFiles(searchStr)
	if err != nil {
		log.Printf("Search error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Search error", []string{}}, "getSearchTitle")
		return
	}
	if len(titles) > MAX_SEARCH_RESULT {
		titles = titles[:MAX_SEARCH_RESULT]
	}
	sort.Strings(titles)
	echoReqHtml(c, []interface{}{"", titles}, "getSearchTitle")
}

func handleSearchDir(c *gin.Context, searchStr string) {
	searchStr = strings.TrimSpace(searchStr)
	if len(searchStr) < MIN_SEARCH_STR {
		echoReqHtml(c, []interface{}{"error", TXT_MIN_SEARCH + fmt.Sprintf("%d", MIN_SEARCH_STR), []string{}}, "getSearchDir")
		return
	}
	dirs, err := searchDirs(searchStr)
	if err != nil {
		log.Printf("Search dir error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Search dir error", []string{}}, "getSearchDir")
		return
	}
	if len(dirs) > MAX_SEARCH_RESULT {
		dirs = dirs[:MAX_SEARCH_RESULT]
	}
	sort.Strings(dirs)
	echoReqHtml(c, []interface{}{"", dirs}, "getSearchDir")
}

func handleGetAllMp3InDirs(c *gin.Context, data string) {
	var selectedFolders []string
	if err := json.Unmarshal([]byte(data), &selectedFolders); err != nil {
		echoReqHtml(c, []interface{}{"error", "Invalid folder data"}, "getAllMp3Data")
		return
	}
	var allFiles []string
	for _, folder := range selectedFolders {
		files, ferr := listAllAudioFiles(folder)
		if ferr != nil {
			log.Printf("Get all mp3 in dirs error (%s): %v", folder, ferr)
			continue
		}
		allFiles = append(allFiles, files...)
	}
	uniqueFiles := make(map[string]bool)
	var finalFiles []string
	for _, file := range allFiles {
		if !uniqueFiles[file] {
			uniqueFiles[file] = true
			finalFiles = append(finalFiles, file)
		}
	}
	sort.Strings(finalFiles)
	echoReqHtml(c, []interface{}{"ok", finalFiles}, "getAllMp3Data")
	// FIX: Add missing closing bracket for function
}

// --- Utility Functions ---

type responseWriter struct {
	gin.ResponseWriter
	buffer *bytes.Buffer
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	rw.buffer.Write(b)
	return rw.ResponseWriter.Write(b)
}

func logResponse(c *gin.Context, response string) {
	log.Printf("Response to %s %s: %s", c.Request.Method, c.Request.URL.Path, response)
}

func ResponseLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		var responseBuffer bytes.Buffer
		writer := &responseWriter{ResponseWriter: c.Writer, buffer: &responseBuffer}
		c.Writer = writer
		c.Next()
		if c.Writer.Status() >= 400 {
			logResponse(c, responseBuffer.String())
		}
	}
}

func isAudioFile(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	for _, audioExt := range audioExtensions {
		if ext == "."+audioExt {
			return true
		}
	}
	return false
}

// --- Backend-agnostic helper wrappers (reduce duplication) ---
// These helpers choose the correct backend (local disk vs S3) based on configuration.
// They intentionally preserve existing semantics (e.g. directory name formats, root inclusion).

func usingLocal() bool { return localMusicDir != "" }

func listDir(prefix string) ([]string, []string, error) {
	if usingLocal() {
		return localList(prefix)
	}
	return s3List(prefix, "/")
}

func listAllAudioFiles(prefix string) ([]string, error) {
	if usingLocal() {
		return localListAllAudioFiles(prefix)
	}
	return s3ListAllAudioFiles(prefix)
}

func listAllDirs() ([]string, error) {
	if usingLocal() {
		return localListAllDirs()
	}
	return s3ListAllDirs()
}

func searchFiles(term string) ([]string, error) {
	if usingLocal() {
		return localSearchFiles(term)
	}
	return s3SearchFiles(term)
}

func searchDirs(term string) ([]string, error) {
	if usingLocal() {
		return localSearchDirs(term)
	}
	return s3SearchDirs(term)
}

func echoReqHtml(c *gin.Context, data []interface{}, funcName string) {
	c.Header("Content-Type", "text/html; charset="+CHARSET)
	c.String(http.StatusOK, `<!DOCTYPE html><html><head><meta charset="UTF-8"><script>var dataContainer = `+ea(data)+`;</script></head><body onload="parent.`+funcName+`(dataContainer)"></body></html>`)
}

func ea(varData []interface{}) string {
	res := ""
	for i, v := range varData {
		if i > 0 {
			res += ","
		}
		if arr, ok := v.([]string); ok {
			var quotedItems []string
			for _, item := range arr {
				quotedItems = append(quotedItems, `"`+strings.ReplaceAll(item, `"`, `\\"`)+`"`)
			}
			res += "[" + strings.Join(quotedItems, ",") + "]"
		} else {
			res += `"` + strings.ReplaceAll(fmt.Sprint(v), `"`, `\\"`) + `"`
		}
	}
	return "[" + res + "]"
}

// --- Placeholder handlers from original code ---
// It's good practice to ensure all called functions exist.

func s3List(prefix string, delimiter string) ([]string, []string, error) {
	var dirs, files []string
	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(s3Bucket),
		Prefix:    aws.String(s3Prefix + prefix),
		Delimiter: aws.String(delimiter),
	}
	resp, err := s3Client.ListObjectsV2(context.Background(), input)
	if err != nil {
		return nil, nil, err
	}
	for _, cp := range resp.CommonPrefixes {
		name := strings.TrimPrefix(*cp.Prefix, s3Prefix+prefix)
		name = strings.TrimSuffix(name, "/")
		if name != "" {
			dirs = append(dirs, name)
		}
	}
	for _, obj := range resp.Contents {
		name := strings.TrimPrefix(*obj.Key, s3Prefix+prefix)
		if name != "" && !strings.Contains(name, "/") {
			files = append(files, name)
		}
	}
	return dirs, files, nil
}

func s3SearchFiles(searchStr string) ([]string, error) {
	allFiles, err := s3ListAllAudioFiles("")
	if err != nil {
		return nil, err
	}
	var matches []string
	for _, f := range allFiles {
		if strings.Contains(strings.ToLower(f), strings.ToLower(searchStr)) {
			matches = append(matches, f)
		}
	}
	return matches, nil
}

func s3SearchDirs(searchStr string) ([]string, error) {
	allDirs, err := s3ListAllDirs()
	if err != nil {
		return nil, err
	}
	var matches []string
	for _, d := range allDirs {
		if strings.Contains(strings.ToLower(d), strings.ToLower(searchStr)) {
			matches = append(matches, d+"/")
		}
	}
	return matches, nil
}
func s3ListAllDirs() ([]string, error) {
	var allDirs []string
	var walk func(prefix string) error
	walk = func(prefix string) error {
		input := &s3.ListObjectsV2Input{
			Bucket:    aws.String(s3Bucket),
			Prefix:    aws.String(s3Prefix + prefix),
			Delimiter: aws.String("/"),
		}
		resp, err := s3Client.ListObjectsV2(context.Background(), input)
		if err != nil {
			return err
		}
		for _, cp := range resp.CommonPrefixes {
			name := strings.TrimPrefix(*cp.Prefix, s3Prefix)
			name = strings.TrimSuffix(name, "/")
			allDirs = append(allDirs, name)
			if err := walk(name + "/"); err != nil {
				return err
			}
		}
		return nil
	}
	allDirs = append(allDirs, "")
	if err := walk(""); err != nil {
		return nil, err
	}
	return allDirs, nil
}

// --- Local Disk Helper Functions ---

var localMusicDir = os.Getenv("MUSIC_DIR") // e.g. "/mp3"

func localList(prefix string) ([]string, []string, error) {
	var dirs, files []string
	base := filepath.Join(localMusicDir, prefix)
	// Validate that base is inside localMusicDir (avoid path traversal)
	rootAbs, err := filepath.Abs(localMusicDir)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve music dir: %w", err)
	}
	baseAbs, err := filepath.Abs(base)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve target dir: %w", err)
	}
	// Ensure the requested baseAbs is within rootAbs
	if !strings.HasPrefix(baseAbs, rootAbs) {
		return nil, nil, fmt.Errorf("invalid directory path: %s", prefix)
	}
	entries, err := os.ReadDir(baseAbs)
	if err != nil {
		return nil, nil, err
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			dirs = append(dirs, name)
		} else if isAudioFile(name) {
			files = append(files, name)
		}
	}
	return dirs, files, nil
}

func localListAllAudioFiles(prefix string) ([]string, error) {
	var allFiles []string
	base := filepath.Join(localMusicDir, prefix)
	err := filepath.Walk(base, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && isAudioFile(info.Name()) {
			rel, _ := filepath.Rel(localMusicDir, path)
			allFiles = append(allFiles, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return allFiles, nil
}

func localListAllDirs() ([]string, error) {
	var allDirs []string
	err := filepath.Walk(localMusicDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			rel, _ := filepath.Rel(localMusicDir, path)
			allDirs = append(allDirs, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return allDirs, nil
}

func localSearchFiles(searchStr string) ([]string, error) {
	allFiles, err := localListAllAudioFiles("")
	if err != nil {
		return nil, err
	}
	var matches []string
	for _, f := range allFiles {
		if strings.Contains(strings.ToLower(f), strings.ToLower(searchStr)) {
			matches = append(matches, f)
		}
	}
	return matches, nil
}

func localSearchDirs(searchStr string) ([]string, error) {
	allDirs, err := localListAllDirs()
	if err != nil {
		return nil, err
	}
	var matches []string
	for _, d := range allDirs {
		if strings.Contains(strings.ToLower(d), strings.ToLower(searchStr)) {
			matches = append(matches, d+"/")
		}
	}
	return matches, nil
}
