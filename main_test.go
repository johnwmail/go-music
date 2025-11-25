package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() {
	// Set MUSIC_DIR early to prevent S3 initialization during tests
	// This must happen before main's init() tries to initialize S3
	if os.Getenv("MUSIC_DIR") == "" {
		tmpDir, _ := os.MkdirTemp("", "gomusic-test-*")
		os.Setenv("MUSIC_DIR", tmpDir)
	}
}

// TestMain initializes the router before running tests. This mirrors production
// startup where newRouter() is called in main(), but allows tests to run with
// a fully initialized router without relying on init().
func TestMain(m *testing.M) {
	// Set Gin to test mode for cleaner log output
	gin.SetMode(gin.TestMode)

	// Build the router explicitly for tests
	r = newRouter()

	os.Exit(m.Run())
}

// TestIsAudioFile tests the audio file extension detection
func TestIsAudioFile(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		want     bool
	}{
		{"MP3 lowercase", "song.mp3", true},
		{"MP3 uppercase", "song.MP3", true},
		{"MP3 mixed case", "song.Mp3", true},
		{"WAV file", "audio.wav", true},
		{"OGG file", "music.ogg", true},
		{"MP4 file", "video.mp4", true},
		{"Text file", "readme.txt", false},
		{"No extension", "file", false},
		{"Multiple dots", "my.song.mp3", true},
		{"Empty string", "", false},
		{"Just extension", ".mp3", true},
		{"PDF file", "document.pdf", false},
		{"Song with spaces", "Song Name.mp3", true},
		{"Chinese characters", "太極樂隊 - 歌曲.mp3", true},
		{"Chinese artist and title", "關正傑 - 中文歌名.mp3", true},
		{"Mixed language with spaces", "太極樂隊 - Song Name.mp3", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAudioFile(tt.filename)
			assert.Equal(t, tt.want, got, "isAudioFile(%q)", tt.filename)
		})
	}
}

// TestUsingLocal tests the backend detection
func TestUsingLocal(t *testing.T) {
	// Save original
	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	tests := []struct {
		name          string
		localMusicDir string
		want          bool
	}{
		{"Local backend set", "/tmp/music", true},
		{"Local backend empty", "", false},
		{"Local backend with space", " ", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			localMusicDir = tt.localMusicDir
			got := usingLocal()
			assert.Equal(t, tt.want, got)
		})
	}
}

// TestLocalList tests local directory listing
func TestLocalList(t *testing.T) {
	// Create temporary test directory structure
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Save original
	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "artist1"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "artist2"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "song1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "song2.wav"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "readme.txt"), []byte("test"), 0644)

	localMusicDir = tmpDir

	t.Run("List root directory", func(t *testing.T) {
		dirs, files, err := localList("")
		assert.NoError(t, err)
		assert.Contains(t, dirs, "artist1")
		assert.Contains(t, dirs, "artist2")
		assert.Contains(t, files, "song1.mp3")
		assert.Contains(t, files, "song2.wav")
		assert.NotContains(t, files, "readme.txt", "Non-audio files should be filtered")
	})
}

// TestLocalListAllAudioFiles tests recursive file listing
func TestLocalListAllAudioFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	// Create nested structure
	os.MkdirAll(filepath.Join(tmpDir, "artist1", "album1"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "artist1", "song1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "artist1", "album1", "track1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "readme.txt"), []byte("test"), 0644)

	localMusicDir = tmpDir

	files, err := localListAllAudioFiles("")
	assert.NoError(t, err)
	assert.True(t, len(files) >= 2, "Should find at least 2 audio files")

	// Check that paths contain our files
	foundSong1 := false
	foundTrack1 := false
	for _, f := range files {
		if strings.Contains(f, "song1.mp3") {
			foundSong1 = true
		}
		if strings.Contains(f, "track1.mp3") {
			foundTrack1 = true
		}
	}
	assert.True(t, foundSong1, "Should find song1.mp3")
	assert.True(t, foundTrack1, "Should find track1.mp3")
}

// TestLocalSearchFiles tests file search functionality
func TestLocalSearchFiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	// Create test files with spaces and Chinese characters
	os.WriteFile(filepath.Join(tmpDir, "Beatles - Hey Jude.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Beatles - Let It Be.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Queen - Bohemian.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "太極樂隊 - Song Name.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "關正傑 - 中文歌曲.mp3"), []byte("test"), 0644)

	localMusicDir = tmpDir

	t.Run("Search for Beatles", func(t *testing.T) {
		results, err := localSearchFiles("Beatles")
		assert.NoError(t, err)
		assert.Equal(t, 2, len(results), "Should find 2 Beatles songs")
	})

	t.Run("Search case insensitive", func(t *testing.T) {
		results, err := localSearchFiles("beatles")
		assert.NoError(t, err)
		assert.Equal(t, 2, len(results), "Search should be case insensitive")
	})

	t.Run("Search for Queen", func(t *testing.T) {
		results, err := localSearchFiles("Queen")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results), "Should find 1 Queen song")
	})

	t.Run("Search for Chinese characters", func(t *testing.T) {
		results, err := localSearchFiles("太極樂隊")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results), "Should find song with Chinese artist name")
	})

	t.Run("Search for Chinese text", func(t *testing.T) {
		results, err := localSearchFiles("中文")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results), "Should find song with Chinese in filename")
	})

	t.Run("Search no results", func(t *testing.T) {
		results, err := localSearchFiles("Metallica")
		assert.NoError(t, err)
		assert.Equal(t, 0, len(results), "Should find no results")
	})
}

// TestLocalSearchDirs tests directory search
func TestLocalSearchDirs(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	// Create test directories with spaces and Chinese characters
	os.MkdirAll(filepath.Join(tmpDir, "The Beatles"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "The Rolling Stones"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Queen"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "太極樂隊"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "關正傑"), 0755)

	localMusicDir = tmpDir

	t.Run("Search for 'The'", func(t *testing.T) {
		results, err := localSearchDirs("The")
		assert.NoError(t, err)
		assert.Equal(t, 2, len(results), "Should find 2 directories with 'The'")
	})

	t.Run("Search case insensitive", func(t *testing.T) {
		results, err := localSearchDirs("queen")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results))
	})

	t.Run("Search for Chinese artist", func(t *testing.T) {
		results, err := localSearchDirs("太極")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results), "Should find Chinese artist directory")
	})

	t.Run("Search for another Chinese artist", func(t *testing.T) {
		results, err := localSearchDirs("關正傑")
		assert.NoError(t, err)
		assert.Equal(t, 1, len(results), "Should find 關正傑 directory")
	})
}

// TestConstants verifies important constants
func TestConstants(t *testing.T) {
	assert.Equal(t, "UTF-8", CHARSET)
	assert.Equal(t, 1, MIN_SEARCH_STR)
	assert.Equal(t, 100, MAX_SEARCH_RESULT)
	assert.NotEmpty(t, TXT_ACC_DIR)
	assert.NotEmpty(t, TXT_NO_RES)
	assert.NotEmpty(t, TXT_MIN_SEARCH)
}

// TestAudioExtensions verifies supported audio formats
func TestAudioExtensions(t *testing.T) {
	expectedExts := []string{"mp3", "wav", "ogg", "mp4"}
	assert.ElementsMatch(t, expectedExts, audioExtensions)
}

// TestHandleRequest tests the main API router with JSON requests
func TestHandleRequest(t *testing.T) {
	// Create temporary test directory
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "Artist1"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Artist2"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "Artist1", "song1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Artist1", "song2.mp3"), []byte("test"), 0644)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()
	localMusicDir = tmpDir

	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		function       string
		data           string
		wantStatus     int
		wantJSONStatus string
		checkFields    []string
	}{
		{
			name:           "List root directory",
			function:       "dir",
			data:           "",
			wantStatus:     http.StatusOK,
			wantJSONStatus: "ok",
			checkFields:    []string{"dir", "dirs", "files"},
		},
		{
			name:           "Get all directories",
			function:       "getAllDirs",
			data:           "",
			wantStatus:     http.StatusOK,
			wantJSONStatus: "ok",
			checkFields:    []string{"dirs"},
		},
		{
			name:           "Get all MP3 files",
			function:       "getAllMp3",
			data:           "",
			wantStatus:     http.StatusOK,
			wantJSONStatus: "ok",
			checkFields:    []string{"files"},
		},
		{
			name:           "Get MP3 in specific directory",
			function:       "getAllMp3InDir",
			data:           `"Artist1"`, // JSON-encoded string
			wantStatus:     http.StatusOK,
			wantJSONStatus: "ok",
			checkFields:    []string{"files"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create JSON request
			reqBody := map[string]string{
				"function": tt.function,
				"data":     tt.data,
			}
			jsonData, _ := json.Marshal(reqBody)

			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/api", bytes.NewBuffer(jsonData))
			c.Request.Header.Set("Content-Type", "application/json")

			handleRequest(c)

			assert.Equal(t, tt.wantStatus, w.Code)

			// Parse JSON response
			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantJSONStatus, response["status"])

			// Check that expected fields exist
			for _, field := range tt.checkFields {
				assert.Contains(t, response, field, "Response should contain field: "+field)
			}
		})
	}
}

// TestHandleDirRequest tests directory listing
func TestHandleDirRequest(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "TestArtist"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "TestArtist", "test.mp3"), []byte("test"), 0644)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()
	localMusicDir = tmpDir

	gin.SetMode(gin.TestMode)

	tests := []struct {
		name     string
		dirPath  string
		wantDirs bool
	}{
		{
			name:     "Root directory",
			dirPath:  "",
			wantDirs: true,
		},
		{
			name:     "Subdirectory",
			dirPath:  "TestArtist",
			wantDirs: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			reqBody := map[string]string{
				"function": "dir",
				"data":     tt.dirPath,
			}
			jsonData, _ := json.Marshal(reqBody)
			c.Request = httptest.NewRequest("POST", "/api", bytes.NewBuffer(jsonData))
			c.Request.Header.Set("Content-Type", "application/json")

			handleRequest(c)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
			assert.Equal(t, "ok", response["status"])
			assert.Equal(t, tt.dirPath, response["dir"])

			if tt.wantDirs {
				dirs := response["dirs"].([]interface{})
				assert.True(t, len(dirs) > 0, "Should have directories")
			}
		})
	}
}

// TestHandleSearchTitle tests title search functionality
func TestHandleSearchTitle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Create test files with spaces and Chinese characters
	os.WriteFile(filepath.Join(tmpDir, "Test Song 1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Test Song 2.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Other Song.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Song With Space.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "太極樂隊 - 歌曲名稱.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "關正傑 - 中文測試.mp3"), []byte("test"), 0644)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()
	localMusicDir = tmpDir

	gin.SetMode(gin.TestMode)

	tests := []struct {
		name        string
		searchTerm  string
		expectCount int
	}{
		{
			name:        "Search for 'Test'",
			searchTerm:  "Test",
			expectCount: 2,
		},
		{
			name:        "Search for 'Song'",
			searchTerm:  "Song",
			expectCount: 4,
		},
		{
			name:        "Search for 'Other'",
			searchTerm:  "Other",
			expectCount: 1,
		},
		{
			name:        "Search for Chinese artist",
			searchTerm:  "太極樂隊",
			expectCount: 1,
		},
		{
			name:        "Search for Chinese text",
			searchTerm:  "中文",
			expectCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			reqBody := map[string]string{
				"function": "searchTitle",
				"data":     tt.searchTerm,
			}
			jsonData, _ := json.Marshal(reqBody)
			c.Request = httptest.NewRequest("POST", "/api", bytes.NewBuffer(jsonData))
			c.Request.Header.Set("Content-Type", "application/json")

			handleRequest(c)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
			assert.Equal(t, "ok", response["status"])

			titles := response["titles"].([]interface{})
			assert.Equal(t, tt.expectCount, len(titles))
		})
	}
}

// TestHandleSearchDir tests directory search functionality
func TestHandleSearchDir(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	// Create test directories with spaces and Chinese characters
	os.MkdirAll(filepath.Join(tmpDir, "Test Artist 1"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Test Artist 2"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Other Artist"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "太極樂隊"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "關正傑"), 0755)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()
	localMusicDir = tmpDir

	gin.SetMode(gin.TestMode)

	tests := []struct {
		name        string
		searchTerm  string
		expectCount int
	}{
		{
			name:        "Search for 'Test'",
			searchTerm:  "Test",
			expectCount: 2,
		},
		{
			name:        "Search for Chinese artist",
			searchTerm:  "太極",
			expectCount: 1,
		},
		{
			name:        "Search for full Chinese artist name",
			searchTerm:  "關正傑",
			expectCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			reqBody := map[string]string{
				"function": "searchDir",
				"data":     tt.searchTerm,
			}
			jsonData, _ := json.Marshal(reqBody)
			c.Request = httptest.NewRequest("POST", "/api", bytes.NewBuffer(jsonData))
			c.Request.Header.Set("Content-Type", "application/json")

			handleRequest(c)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err = json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
			assert.Equal(t, "ok", response["status"])

			dirs := response["dirs"].([]interface{})
			assert.Equal(t, tt.expectCount, len(dirs), "Should find expected number of directories")
		})
	}
}

// TestHandleSearchInDir tests the recursive searchInDir API which should
// return matches found under the provided directory (including nested folders).
func TestHandleSearchInDir(t *testing.T) {
	// Create temporary test directory with nested structure
	tmpDir, err := os.MkdirTemp("", "gomusic-test-*")
	assert.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	origLocalMusicDir := localMusicDir
	defer func() {
		localMusicDir = origLocalMusicDir
	}()

	// Nested directories and files. Some filenames include the term "test"
	os.MkdirAll(filepath.Join(tmpDir, "Artist1", "Album1"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Artist2", "Album2"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "Artist1", "Test Song 1.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Artist1", "Album1", "track_test.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Artist2", "Album2", "other.mp3"), []byte("test"), 0644)

	localMusicDir = tmpDir

	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	// Build the inner data object (JSON string) expected by handleSearchInDir
	dataObj := map[string]interface{}{"dir": "", "term": "test", "limit": 100}
	dataBytes, _ := json.Marshal(dataObj)

	reqBody := map[string]string{
		"function": "searchInDir",
		"data":     string(dataBytes),
	}
	jsonData, _ := json.Marshal(reqBody)
	c.Request = httptest.NewRequest("POST", "/api", bytes.NewBuffer(jsonData))
	c.Request.Header.Set("Content-Type", "application/json")

	handleRequest(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "ok", response["status"])

	// matches should be present and include the two files that contain "test"
	matches, ok := response["matches"].([]interface{})
	assert.True(t, ok, "matches field should be an array")
	assert.Equal(t, 2, len(matches), "Should find 2 matching files containing 'test'")

	// verify structure of returned match objects
	for _, m := range matches {
		mm := m.(map[string]interface{})
		assert.Contains(t, mm, "path")
		assert.Contains(t, mm, "title")
		assert.Contains(t, mm, "dir")
	}
}

// TestIndexServesVersion ensures the server-side template injects the build Version
// into the served HTML for the index page.
func TestIndexServesVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	// Use the global router created in init()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	body := w.Body.String()
	assert.Contains(t, body, Version, "index page should contain Version string")
}
