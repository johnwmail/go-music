package main

import (
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
	// Set MUSIC_DIR to avoid S3 initialization in tests
	if os.Getenv("MUSIC_DIR") == "" {
		os.Setenv("MUSIC_DIR", "/tmp/gomusic-test")
	}
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isAudioFile(tt.filename)
			assert.Equal(t, tt.want, got, "isAudioFile(%q)", tt.filename)
		})
	}
}

// TestEa tests the JavaScript array encoding function
func TestEa(t *testing.T) {
	tests := []struct {
		name     string
		input    []interface{}
		expected string
	}{
		{
			name:     "Simple strings",
			input:    []interface{}{"ok", "test"},
			expected: `["ok","test"]`,
		},
		{
			name:     "String array",
			input:    []interface{}{"ok", []string{"file1", "file2"}},
			expected: `["ok",["file1","file2"]]`,
		},
		{
			name:     "Empty array",
			input:    []interface{}{"ok", []string{}},
			expected: `["ok",[]]`,
		},
		{
			name:     "String with quotes",
			input:    []interface{}{"He said \"hello\""},
			expected: `["He said \\"hello\\""]`,
		},
		{
			name:     "Array with quoted strings",
			input:    []interface{}{[]string{"song \"A\"", "song \"B\""}},
			expected: `[["song \\"A\\"","song \\"B\\""]]`,
		},
		{
			name:     "Multiple arrays",
			input:    []interface{}{"ok", "", []string{"dir1", "dir2"}, []string{}},
			expected: `["ok","",["dir1","dir2"],[]]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ea(tt.input)
			assert.Equal(t, tt.expected, got)
		})
	}
}

// TestHandleVersion tests the version endpoint
func TestHandleVersion(t *testing.T) {
	// Save original values
	origVersion := Version
	origCommitHash := CommitHash
	origBuildTime := BuildTime

	defer func() {
		Version = origVersion
		CommitHash = origCommitHash
		BuildTime = origBuildTime
	}()

	tests := []struct {
		name        string
		version     string
		wantContain string
	}{
		{
			name:        "Dev version",
			version:     "dev",
			wantContain: "dev",
		},
		{
			name:        "Release version",
			version:     "v1.2.3",
			wantContain: "v1.2.3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			Version = tt.version

			gin.SetMode(gin.TestMode)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			handleVersion(c)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Contains(t, w.Body.String(), tt.wantContain)
			assert.Contains(t, w.Body.String(), "setVersion")
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

	// Create test files
	os.WriteFile(filepath.Join(tmpDir, "Beatles - Hey Jude.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Beatles - Let It Be.mp3"), []byte("test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Queen - Bohemian.mp3"), []byte("test"), 0644)

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

	// Create test directories
	os.MkdirAll(filepath.Join(tmpDir, "The Beatles"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "The Rolling Stones"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "Queen"), 0755)

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
