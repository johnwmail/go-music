package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
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
	buildTime  = "unknown"
	commitHash = "unknown"
	version    = "dev"
)

// init function runs before main and sets up the Gin router.
func init() {
	log.Printf("Gin cold start")
	log.Printf("Build info: version=%s, commit=%s, buildTime=%s", version, commitHash, buildTime)
	if err := initS3(); err != nil {
		log.Fatalf("S3 init error: %v", err)
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
		r.Run(":8080")
	}
}

// audioProxyHandler returns a pre-signed S3 URL for the audio file instead of streaming it through Lambda.
func audioProxyHandler(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("path"), "/")
	if key == "" {
		c.String(http.StatusBadRequest, "Missing song path")
		return
	}

	presignedUrl, err := s3GetPresignedUrl(key)
	if err != nil {
		log.Printf("S3 presign error for key [%s]: %v", key, err)
		c.String(http.StatusNotFound, "Audio not found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": presignedUrl})
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
	case "getAllMp3InDirs":
		handleGetAllMp3InDirs(c, data)
	case "getAllDirs":
		handleGetAllDirs(c)
	default:
		echoReqHtml(c, []interface{}{"error", "Unknown function"}, "default")
	}
}

// --- S3 Helper Functions ---

func s3GetAudioFile(key string) (io.ReadCloser, int64, string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(s3Prefix + key),
	}
	resp, err := s3Client.GetObject(context.Background(), input)
	if err != nil {
		return nil, 0, "", err
	}
	var size int64 = 0
	if resp.ContentLength != nil {
		size = *resp.ContentLength
	}

	contentType := aws.ToString(resp.ContentType)
	// Patch: Always set correct audio content type for known extensions
	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".mp3":
		contentType = "audio/mpeg"
	case ".wav":
		contentType = "audio/wav"
	case ".ogg":
		contentType = "audio/ogg"
	case ".mp4":
		contentType = "audio/mp4"
	}
	if contentType == "" || contentType == "application/octet-stream" {
		mimeType := mime.TypeByExtension(ext)
		if mimeType != "" {
			contentType = mimeType
		} else {
			contentType = "application/octet-stream"
		}
	}

	return resp.Body, size, contentType, nil
}

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

// --- API Logic Handlers ---

func handleGetAllMp3InDirs(c *gin.Context, data string) {
	var selectedFolders []string
	if err := json.Unmarshal([]byte(data), &selectedFolders); err != nil {
		echoReqHtml(c, []interface{}{"error", "Invalid folder data"}, "getAllMp3Data")
		return
	}
	var allFiles []string
	for _, folder := range selectedFolders {
		files, err := s3ListAllAudioFiles(folder)
		if err != nil {
			log.Printf("S3 get all mp3 in dirs error: %v", err)
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
}

// ... (omitting the rest of the handlers for brevity as they are unchanged)

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

func handleDirRequest(c *gin.Context, dir string) {
	dirs, files, err := s3List(dir, "/")
	if err != nil {
		log.Printf("S3 list error: %v", err)
		echoReqHtml(c, []interface{}{"error", TXT_ACC_DIR, dir, []string{}}, "getBrowserData")
		return
	}
	sort.Strings(dirs)
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", dir, dirs, files}, "getBrowserData")
}

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

func handleSearchTitle(c *gin.Context, searchStr string) {
	searchStr = strings.TrimSpace(searchStr)
	if len(searchStr) < MIN_SEARCH_STR {
		echoReqHtml(c, []interface{}{"error", TXT_MIN_SEARCH + fmt.Sprintf("%d", MIN_SEARCH_STR), []string{}}, "getSearchTitle")
		return
	}
	titles, err := s3SearchFiles(searchStr)
	if err != nil {
		log.Printf("S3 search error: %v", err)
		echoReqHtml(c, []interface{}{"error", "S3 search error", []string{}}, "getSearchTitle")
		return
	}
	if len(titles) > MAX_SEARCH_RESULT {
		titles = titles[:MAX_SEARCH_RESULT]
	}
	sort.Strings(titles)
	echoReqHtml(c, []interface{}{"", titles}, "getSearchTitle")
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

func handleSearchDir(c *gin.Context, searchStr string) {
	searchStr = strings.TrimSpace(searchStr)
	if len(searchStr) < MIN_SEARCH_STR {
		echoReqHtml(c, []interface{}{"error", TXT_MIN_SEARCH + fmt.Sprintf("%d", MIN_SEARCH_STR), []string{}}, "getSearchDir")
		return
	}
	dirs, err := s3SearchDirs(searchStr)
	if err != nil {
		log.Printf("S3 search dir error: %v", err)
		echoReqHtml(c, []interface{}{"error", "S3 search dir error", []string{}}, "getSearchDir")
		return
	}
	if len(dirs) > MAX_SEARCH_RESULT {
		dirs = dirs[:MAX_SEARCH_RESULT]
	}
	sort.Strings(dirs)
	echoReqHtml(c, []interface{}{"", dirs}, "getSearchDir")
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

func handleGetAllMp3(c *gin.Context) {
	files, err := s3ListAllAudioFiles("")
	if err != nil {
		log.Printf("S3 get all mp3 error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan S3 bucket"}, "getAllMp3Data")
		return
	}
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", files}, "getAllMp3Data")
}

func handleGetAllMp3InDir(c *gin.Context, dir string) {
	files, err := s3ListAllAudioFiles(dir)
	if err != nil {
		log.Printf("S3 get all mp3 in dir error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan S3 directory"}, "getAllMp3Data")
		return
	}
	sort.Strings(files)
	echoReqHtml(c, []interface{}{"ok", files}, "getAllMp3Data")
}

func handleGetAllDirs(c *gin.Context) {
	dirs, err := s3ListAllDirs()
	if err != nil {
		log.Printf("S3 get all dirs error: %v", err)
		echoReqHtml(c, []interface{}{"error", "Failed to scan S3 directories"}, "getAllDirsData")
		return
	}
	sort.Strings(dirs[1:]) // keep root at top
	echoReqHtml(c, []interface{}{"ok", dirs}, "getAllDirsData")
}
