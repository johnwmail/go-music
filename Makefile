build-MusicFunction:
	# Compile the binary for Linux ARM64
	GOOS=linux GOARCH=arm64 go build -o bootstrap main.go
	
	# Copy binary to the SAM artifacts directory
	cp bootstrap $(ARTIFACTS_DIR)/.
	
	# Copy the required folders to the artifacts directory
	cp -r templates $(ARTIFACTS_DIR)/
	cp -r static $(ARTIFACTS_DIR)/
