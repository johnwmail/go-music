var player;
var playingFrom = '';
var browserPlaylistTitles = [];
var browserPlaylistDir = '';
var playlistTracks = [];
var browserCurDir = '';
var browserCurDirs = [];
var browserDirs = [];
var browserTitles = [];
var searchDirs = [];
var searchDirTracks = [];
var searchplaylistTracks = [];
var playing = 0;
var playingTrack = '';
var lastProgress = -1;
var tabShowing = 0;
var loading = false;
var searchString = '';
var searchAction = '';
var shuffledList = [];
var shuffle = false;
var browserFilterString = '';


// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// Modern fetch API function to replace iframe-based loadFromServer
async function fetchAPI(functionName, data) {
    loading = true;
    markLoading(functionName === 'dir' ? 'browser' : functionName.includes('search') ? 'search' : false);

    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                function: functionName,
                data: data
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        loading = false;
        markLoading(false);
        return result;
    } catch (error) {
        loading = false;
        markLoading(false);
        console.error('[fetchAPI] Error:', error);
        alert('Server not responding: ' + error.message);
        return { status: 'error', message: error.message };
    }
}


function getBrowserData(data) {
    loading = false;
    markLoading(false);
    if (data.status === 'ok') {
        browserCurDir = String(data.dir);
        var tmpArr = browserCurDir.split('/');
        browserCurDirs = [];
        for (var i = 0; i < tmpArr.length; i++) {
            if (tmpArr[i] != '') {
                browserCurDirs[browserCurDirs.length] = tmpArr[i];
            }
        }
        browserDirs = data.dirs || [];
        browserTitles = data.files || [];
        updateBrowser();
        // Load version after initial directory is loaded (only on first load)
        if (browserCurDir === '' && gebi('appVersion').textContent === 'Loading ...') {
            loadVersion();
        }
    } else {
        alert(data.message || 'Error loading directory');
    }
}


function getSearchTitle(data) {
    loading = false;
    markLoading(false);
    searchDirs = [];
    searchDirTracks = data.titles || [];
    updateSearch('title');
    if (data.status === 'error' && data.message) {
        alert(data.message);
    }
}


function getSearchDir(data) {
    loading = false;
    markLoading(false);
    searchDirTracks = [];
    searchDirs = data.dirs || [];
    updateSearch('dir');
    if (data.status === 'error' && data.message) {
        alert(data.message);
    }
}


function init() {
    window.onbeforeunload = function () {
        return 'Quit player?';
    };
    showTab(1);
    markPlayingTab('');
    player = gebi('player');

    // Show loading message in browser
    gebi('frameBrowser').innerHTML = '<div class="item-list"><div class="info-banner">Loading music library...</div></div>';

    loadPlaylist();
    updateProgressBar();
    browseDir();
    updatePlaylist();
    updateSearch();
    player.onended = function () {
        changeTrack(1);
    }
    player.onpause = function () {
        gebi('buttonPlay').innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
    player.onplaying = function () {
        gebi('buttonPlay').innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
    player.ontimeupdate = function () {
        updateProgressBar();
    }
    player.onloadedmetadata = function () {
        updateProgressBar();
    }
}

async function loadVersion() {
    const data = await fetchAPI('version', '');
    if (data.status === 'ok' && data.version) {
        gebi('appVersion').textContent = data.version;
    }
}


function markLoading(tab) {
    var browserLoader = gebi('markLoadBrowser');
    var searchLoader = gebi('markLoadSearch');
    if (tab == false) {
        browserLoader.classList.remove('visible');
        searchLoader.classList.remove('visible');
    } else if (tab == 'browser') {
        browserLoader.classList.add('visible');
        searchLoader.classList.remove('visible');
    } else if (tab == 'search') {
        browserLoader.classList.remove('visible');
        searchLoader.classList.add('visible');
    }
}


function secondsToTime(secs) {
    var negative = false;
    if (secs != secs) {
        return '';
    }
    if (secs < 0) {
        secs *= -1;
        negative = true;
    }

    var hh = Math.floor(secs / 3600);
    var mm = Math.floor(secs / 60) % 60;
    var ss = Math.floor(secs) % 60;
    return (negative ? '-' : '') + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}


var isDragging = false;
var wasPlayingBeforeDrag = false;

function updateProgressBar() {
    var cur = player.currentTime;
    var max = player.duration;
    var barElement = gebi('bar');

    if ((cur != cur) || (max != max) || (cur > max)) {
        // Initialize progress bar structure if not present
        if (!barElement.querySelector('.progress-track')) {
            barElement.innerHTML = '<div class="progress-track"><div class="progress-fill" style="width: 0%"></div></div>';
            initProgressBarEvents();
        } else {
            var fillElement = barElement.querySelector('.progress-fill');
            if (fillElement) {
                fillElement.style.width = '0%';
            }
        }
        gebi('trackCurrentTime').innerHTML = secondsToTime(0);
        gebi('trackRemaining').innerHTML = secondsToTime(0);
        gebi('trackDuration').innerHTML = secondsToTime(0);
    } else {
        gebi('trackCurrentTime').innerHTML = secondsToTime(Math.floor(cur));
        gebi('trackRemaining').innerHTML = secondsToTime(Math.floor(max) - Math.floor(cur));
        gebi('trackDuration').innerHTML = secondsToTime(player.duration);

        // Only update progress bar if not currently dragging
        if (!isDragging) {
            var progress = (cur / max) * 100;

            // Initialize progress bar structure if not present, otherwise just update width
            if (!barElement.querySelector('.progress-track')) {
                barElement.innerHTML = '<div class="progress-track"><div class="progress-fill" style="width: ' + progress + '%"></div></div>';
                initProgressBarEvents();
            } else {
                var fillElement = barElement.querySelector('.progress-fill');
                if (fillElement) {
                    fillElement.style.width = progress + '%';
                }
            }
        }
    }
}

function initProgressBarEvents() {
    var progressTrack = document.querySelector('.progress-track');
    if (!progressTrack) return;

    // Mouse events
    progressTrack.addEventListener('mousedown', startDrag);

    // Touch events for mobile
    progressTrack.addEventListener('touchstart', startDrag, { passive: false });
}

function startDrag(event) {
    // Validate that player.duration is a valid number before seeking
    if (!player.duration || isNaN(player.duration) || player.duration <= 0) {
        return;
    }

    event.preventDefault();
    isDragging = true;
    wasPlayingBeforeDrag = !player.paused;

    // Pause playback while dragging for smoother experience
    if (wasPlayingBeforeDrag) {
        player.pause();
    }

    // Seek to initial position
    seekToPosition(event);

    // Add move and end listeners
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
}

function onDrag(event) {
    if (!isDragging) return;
    event.preventDefault();
    seekToPosition(event);
}

function stopDrag(event) {
    if (!isDragging) return;

    isDragging = false;

    // Resume playback if it was playing before drag
    if (wasPlayingBeforeDrag) {
        player.play();
    }

    // Remove move and end listeners
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', stopDrag);
}

function seekToPosition(event) {
    // Validate that player.duration is a valid number before seeking
    if (!player.duration || isNaN(player.duration) || player.duration <= 0) {
        return;
    }

    var progressTrack = document.querySelector('.progress-track');
    if (!progressTrack) return;

    var rect = progressTrack.getBoundingClientRect();
    var clientX;

    // Handle both mouse and touch events
    if (event.type.startsWith('touch')) {
        clientX = event.touches[0]?.clientX || event.changedTouches[0]?.clientX;
    } else {
        clientX = event.clientX;
    }

    var clickX = clientX - rect.left;
    var barWidth = rect.width;
    var seekPercent = Math.max(0, Math.min(1, clickX / barWidth)); // Clamp between 0 and 1
    var seekTime = seekPercent * player.duration;

    player.currentTime = seekTime;

    // Update progress bar immediately during drag
    if (isDragging) {
        var fillElement = document.querySelector('.progress-fill');
        if (fillElement) {
            fillElement.style.width = (seekPercent * 100) + '%';
        }
    }
}


function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = 'expires=' + d.toGMTString();
    document.cookie = cname + '=' + cvalue + '; ' + expires;
}


function getCookie(cname) {
    var name = cname + '=';
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return '';
}


function loadPlaylist() {
    var playlistCookie = getCookie('playlist');
    if (playlistCookie != '') {
        playlistTracks = playlistCookie.split('|');
    }
}


function savePlaylist() {
    setCookie('playlist', playlistTracks.join('|'), 365);
}


function gebi(id) {
    return document.getElementById(id);
}


function skipSec(sec) {
    var skipTo = player.currentTime + sec;
    if (skipTo > player.duration) {
        skipTo = player.duration - 1;
    }
    if (skipTo < 0) {
        skipTo = 0;
    }
    player.currentTime = skipTo;
}


function shuffleToggle() {
    shuffle = !shuffle;
    var shuffleBtn = gebi('shuffle');
    if (shuffle) {
        shuffleBtn.classList.add('active');
    } else {
        shuffleBtn.classList.remove('active');
    }
}


function shuffleList(length) {
    var i, randomPlace, tmp;
    shuffledList.length = 0;
    for (i = 0; i < length; i++) {
        shuffledList[i] = i;
    }
    // Fisher-Yates shuffle
    for (i = 0; i < length - 1; i++) {
        randomPlace = i + Math.floor(Math.random() * (length - i));
        tmp = shuffledList[i];
        shuffledList[i] = shuffledList[randomPlace];
        shuffledList[randomPlace] = tmp;
    }
}


function changeTrack(dir) {
    if (shuffle) {
        if (playingFrom == 'browser') {
            if (shuffledList.length != browserPlaylistTitles.length) {
                shuffleList(browserPlaylistTitles.length);
            }
        }
        if (playingFrom == 'list') {
            if (shuffledList.length != playlistTracks.length) {
                shuffleList(playlistTracks.length);
            }
        }
        if (playingFrom == 'search') {
            if (shuffledList.length != searchplaylistTracks.length) {
                shuffleList(searchplaylistTracks.length);
            }
        }
        var ply = shuffledList.indexOf(playing) + dir;
        if (ply > shuffledList.length - 1) {
            ply = 0;
        }
        if (ply < 0) {
            ply = shuffledList.length - 1;
        }
        playing = shuffledList[ply];
    } else {
        playing += dir;
    }
    if (playingFrom == 'browser') {
        if (playing > browserPlaylistTitles.length - 1) {
            playing = 0;
        } else if (playing < 0) {
            playing = browserPlaylistTitles.length - 1;
        }
        setAndPlayTrack(browserPlaylistDir + browserPlaylistTitles[playing]);
    } else if (playingFrom == 'list') {
        if (playing > playlistTracks.length - 1) {
            playing = 0;
        } else if (playing < 0) {
            playing = playlistTracks.length - 1;
        }
        setTrackFromPlaylist(playing);
    } else if (playingFrom == 'search') {
        if (playing > searchplaylistTracks.length - 1) {
            playing = 0;
        } else if (playing < 0) {
            playing = searchplaylistTracks.length - 1;
        }
        setTrackFromSearch(playing);
    }
}


function markPlayingTab(tab) {
    playingFrom = tab;
    var browserMark = gebi('markBrowser');
    var listMark = gebi('markList');
    var searchMark = gebi('markSearch');

    browserMark.classList.remove('visible');
    listMark.classList.remove('visible');
    searchMark.classList.remove('visible');

    if (playingFrom == 'browser') {
        browserMark.classList.add('visible');
    } else if (playingFrom == 'list') {
        listMark.classList.add('visible');
    } else if (playingFrom == 'search') {
        searchMark.classList.add('visible');
    }
}


function setTrackFromBrowser(id) {
    setAndPlayTrack(browserCurDir + browserTitles[id]);
    playing = id;
    markPlayingTab('browser');
    browserPlaylistDir = browserCurDir;
    browserPlaylistTitles = browserTitles;
}

// Ensure that when playing a track from a filtered browser view the filter results remain visible.
// Some browsers or async updates can re-render the browser without the filtered subset; force re-render after playback starts.
function setTrackFromBrowserAndKeepView(id) {
    setTrackFromBrowser(id);
    // defer re-render to allow player state updates to settle
    setTimeout(function () {
        // re-render browser which respects browserFilterString
        updateBrowser();
    }, 10);
}


function setTrackFromPlaylist(id) {
    playing = id;
    markPlayingTab('list');
    setAndPlayTrack(playlistTracks[id]);
}


function setTrackFromSearch(id, updateSearchPlaylist) {
    if (updateSearchPlaylist == true) {
        searchplaylistTracks = searchDirTracks;
    }
    playing = id;
    markPlayingTab('search');
    setAndPlayTrack(searchplaylistTracks[id]);
}


function updateAllLists() {
    updateBrowser();
    updatePlaylist();
    updateSearch();
}


function setAndPlayTrack(track) {
    var trackTitle = getTrackTitle(track);
    var trackDir = getTrackDir(track);
    var trackNameEl = gebi('trackName');
    trackNameEl.innerHTML = '<div class="track-title">' + escapeHtml(trackTitle) + '</div><div class="track-path">' + escapeHtml(trackDir) + '</div>';
    playingTrack = track;
    // Fetch the pre-signed S3 URL from the backend and set it as the audio src
    fetch('/audio/' + track)
        .then(res => res.json())
        .then(data => {
            player.src = data.url;
            player.play();
        })
        .catch(err => {
            alert('Failed to load audio: ' + err);
        });
    updateAllLists();
}


function getTrackTitle(track) {
    var name = track.split('/').pop();
    name = name.replace(new RegExp('_', 'g'), ' ');
    name = name.substr(0, name.lastIndexOf('.'));
    return name;
}


function getTrackDir(track) {
    track = 'Home/' + track.replace(new RegExp('_', 'g'), ' ');
    var dirStr = track.split('/');
    var tmp = dirStr.pop();
    // Use the actual Unicode character instead of an HTML entity so
    // escaping (escapeHtml) does not turn it into a literal entity string.
    return dirStr.join(' \u2799 ');
}


function updateBrowser() {
    var list = '<div class="item-list">';

    // Breadcrumb navigation with filter input
    list += '<div class="breadcrumb-filter-container">';
    list += '<div class="breadcrumb">';

    // Home breadcrumb
    if (browserCurDirs.length === 0) {
        // If at home, wrap it with the add button
        list += '<div class="breadcrumb-item-wrapper">';
        list += '<div class="breadcrumb-item" onClick="browseDir()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> Home</div>';
        list += '<button class="breadcrumb-add-btn" onClick="event.stopPropagation();addCurrentDirToPlaylist()" title="Add all songs from current directory">＋</button>';
        list += '</div>';
    } else {
        list += '<div class="breadcrumb-item" onClick="browseDir()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> Home</div>';
    }

    // Directory breadcrumbs
    for (var i = 0; i < browserCurDirs.length; i++) {
        if (i === browserCurDirs.length - 1) {
            // Last item - add the + button
            list += '<div class="breadcrumb-item-wrapper">';
            list += '<div class="breadcrumb-item" onClick="browseDirFromBreadCrumbBar(' + i + ')">' + escapeHtml(browserCurDirs[i]) + '</div>';
            list += '<button class="breadcrumb-add-btn" onClick="event.stopPropagation();addCurrentDirToPlaylist()" title="Add all songs from current directory">＋</button>';
            list += '</div>';
        } else {
            list += '<div class="breadcrumb-item" onClick="browseDirFromBreadCrumbBar(' + i + ')">' + escapeHtml(browserCurDirs[i]) + '</div>';
        }
    }
    list += '</div>';

    // Filter input
    list += '<div class="browser-filter-container">';
    list += '<button class="browser-filter-search-btn" onClick="applyBrowserFilter()" title="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>';
    list += '<input class="browser-filter-input" value="' + escapeHtml(browserFilterString) + '" id="browserFilterInput" type="text" placeholder="Type and press Enter or click search..." onkeypress="if(event.key===\'Enter\')applyBrowserFilter()">';
    if (browserFilterString) {
        list += '<button class="browser-filter-clear" onClick="clearBrowserFilter()" title="Clear filter">✕</button>';
    }
    list += '</div>';
    list += '</div>';

    // Apply filter
    var filterLower = browserFilterString.toLowerCase();

    // Show filter result count
    if (browserFilterString) {
        var filteredDirsCount = 0;
        var filteredTitlesCount = 0;
        for (var i = 0; i < browserDirs.length; i++) {
            if (browserDirs[i].toLowerCase().indexOf(filterLower) >= 0) {
                filteredDirsCount++;
            }
        }
        for (var i = 0; i < browserTitles.length; i++) {
            if (browserTitles[i].toLowerCase().indexOf(filterLower) >= 0) {
                filteredTitlesCount++;
            }
        }
        var totalResults = filteredDirsCount + filteredTitlesCount;
        list += '<div class="info-banner"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> ' + totalResults + ' result' + (totalResults !== 1 ? 's' : '') + ' found for "' + escapeHtml(browserFilterString) + '"</div>';
    }

    // Directories
    for (var i = 0; i < browserDirs.length; i++) {
        if (!filterLower || browserDirs[i].toLowerCase().indexOf(filterLower) >= 0) {
            list += '<div class="list-item directory" onClick="browseDir(' + i + ')">';
            list += '<div class="item-content">';
            list += '<div class="item-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ' + escapeHtml(browserDirs[i]) + '</div>';
            list += '<div class="item-subtitle">' + escapeHtml(getTrackDir(browserCurDir)) + '</div>';
            list += '</div>';
            list += '<div class="item-action" onClick="event.stopPropagation();addDirectoryToPlaylist(' + i + ')" title="Add all songs from this folder">＋</div>';
            list += '</div>';
        }
    }

    // Music files
    var playlistCount;
    for (var i = 0; i < browserTitles.length; i++) {
        if (!filterLower || browserTitles[i].toLowerCase().indexOf(filterLower) >= 0) {
            playlistCount = inPlaylist(browserCurDir + browserTitles[i]);
            var isPlaying = playingTrack == browserCurDir + browserTitles[i];
            list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromBrowserAndKeepView(' + i + ')">';
            list += '<div class="item-content">';
            list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + escapeHtml(getTrackTitle(browserTitles[i])) + '</div>';
            list += '<div class="item-subtitle">' + escapeHtml(getTrackDir(browserCurDir)) + '</div>';
            list += '</div>';
            list += `<div class="item-action${playlistCount > 0 ? ' in-playlist' : ''}" onClick="event.stopPropagation();${playlistCount > 0 ? 'removeBrowserTrackFromPlaylist' : 'addTrackFromBrowser'}(${i})">`;
            list += (playlistCount > 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' : '＋');
            list += '</div></div>';
        }
    }

    list += '</div>';
    // lgtm[js/xss] - All user data in list is escaped via escapeHtml() function
    gebi('frameBrowser').innerHTML = list;
}


function updatePlaylist() {
    savePlaylist();
    var list = '<div class="item-list">';

    // Info banner
    if (playlistTracks.length > 0) {
        // Make the entire banner clickable to clear playlist (with confirmation)
        // add keyboard handler for Enter/Space to improve accessibility
        list += '<div class="info-banner-playlist" onClick="clearPlaylist()" onkeydown="if(event.key===\'Enter\' || event.key===\' \'){ event.preventDefault(); clearPlaylist(); }" role="button" tabindex="0" title="Click to clear playlist">';
        list += '<div class="info-banner-content"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 8px;\"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' + String(playlistTracks.length) + ' track' + (playlistTracks.length !== 1 ? 's' : '') + ' in playlist</div>';
        // Inline hint on the right as a real button for semantics and focus
        list += '<button class="clear-playlist-hint" onclick="event.stopPropagation();clearPlaylist()" aria-label="Clear playlist"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 8px;\"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Click to clear</button>';
        list += '</div>';
    } else {
        list += '<div class="info-banner">Playlist is empty - Add tracks from Browser or Search</div>';
    }

    // (Removed) Add all MP3 files button — functionality available via directory '+' controls in Browser

    // Playlist tracks
    for (var i = 0; i < playlistTracks.length; i++) {
        var isPlaying = playingTrack == playlistTracks[i];
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromPlaylist(' + i + ');player.play()">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + escapeHtml(getTrackTitle(playlistTracks[i])) + '</div>';
        list += '<div class="item-subtitle">' + escapeHtml(getTrackDir(playlistTracks[i])) + '</div>';
        list += '</div>';
        list += '<div class="item-action in-playlist" onClick="event.stopPropagation();removeTrack(' + i + ')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>';
        list += '</div>';
    }

    list += '</div>';
    // lgtm[js/xss] - All user data in list is escaped via escapeHtml() function
    gebi('framePlaylist').innerHTML = list;
}


function updateSearch(action) {
    if (action != undefined) {
        searchAction = action;
    }
    var list = '<div class="item-list">';

    // Search bar
    list += '<div class="search-bar">';
    list += '<input class="search-input" value="' + (searchAction == 'clear' ? '' : searchString) + '" id="searchStr" name="searchStr" type="text" placeholder="Enter search term...">';
    list += '<button class="search-btn" onClick="searchString=gebi(\'searchStr\').value; searchForTitle(searchString); updateSearch(\'search\')">Title</button>';
    list += '<button class="search-btn" onClick="searchString=gebi(\'searchStr\').value; searchForDir(searchString); updateSearch(\'search\')">Directory</button>';
    list += '</div>';

    // Info banner
    var infoText = '';
    if (searchAction == 'dir') {
        infoText = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> Directory search: ' + String(searchDirs.length) + ' result' + (searchDirs.length !== 1 ? 's' : '');
    } else if (searchAction == 'title') {
        infoText = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> Title search: ' + String(searchDirTracks.length) + ' result' + (searchDirTracks.length !== 1 ? 's' : '');
    } else if (searchAction == 'search') {
        infoText = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Searching...';
        searchDirs = [];
        searchDirTracks = [];
    } else if (searchAction == 'clear') {
        infoText = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Enter a search term and choose Title or Directory';
        searchDirs = [];
        searchDirTracks = [];
    } else {
        infoText = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> Enter a search term and choose Title or Directory';
    }
    list += '<div class="info-banner" onClick="updateSearch(\'clear\')">' + infoText + '</div>';

    // Directory results
    for (var i = 0; i < searchDirs.length; i++) {
        list += '<div class="list-item directory" onClick="browseDirByStr(searchDirs[' + i + '])">';
        list += '<div class="item-content">';
        list += '<div class="item-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ' + escapeHtml(searchDirs[i].split('/').pop()) + '</div>';
        list += '<div class="item-subtitle">' + escapeHtml(getTrackDir(searchDirs[i])) + '</div>';
        list += '</div></div>';
    }

    // Track results
    var playlistCount;
    for (var i = 0; i < searchDirTracks.length; i++) {
        playlistCount = inPlaylist(searchDirTracks[i]);
        var isPlaying = playingTrack == searchDirTracks[i];
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromSearch(' + i + ',true)">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + escapeHtml(getTrackTitle(searchDirTracks[i])) + '</div>';
        list += '<div class="item-subtitle">' + escapeHtml(getTrackDir(searchDirTracks[i])) + '</div>';
        list += '</div>';
        list += '<div class="item-action' + (playlistCount > 0 ? ' in-playlist' : '') + '" onClick="event.stopPropagation();' + (playlistCount > 0 ? 'removeSearchTrackFromPlaylist' : 'addTrackFromSearch') + '(' + i + ')">';
        list += (playlistCount > 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' : '＋');
        list += '</div></div>';
    }

    list += '</div>';
    // lgtm[js/xss] - All user data in list is escaped via escapeHtml() function
    gebi('frameSearch').innerHTML = list;
}


function inPlaylist(track) {
    var number = 0;
    for (var i = 0; i < playlistTracks.length; i++) {
        if (playlistTracks[i] == track) {
            number++;
        }
    }
    return number;
}


function addTrackFromBrowser(id) {
    playlistTracks[playlistTracks.length] = browserCurDir + browserTitles[id];
    updateAllLists();
}


function addTrackFromSearch(id) {
    playlistTracks[playlistTracks.length] = searchDirTracks[id];
    updateAllLists();
}


function clearPlaylist() {
    showConfirmDialog(
        'Clear Playlist?',
        'Are you sure you want to remove all ' + playlistTracks.length + ' track' + (playlistTracks.length !== 1 ? 's' : '') + ' from the playlist?',
        function () {
            // User confirmed
            playlistTracks = [];
            updateAllLists();
        }
    );
}

// Show a modern confirm dialog
function showConfirmDialog(title, message, onConfirm) {
    // Create modal overlay
    var modal = document.createElement('div');
    modal.className = 'confirm-modal';

    // Create dialog content
    var dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    dialog.innerHTML =
        '<div class="confirm-title">' + title + '</div>' +
        '<div class="confirm-message">' + message + '</div>' +
        '<div class="confirm-buttons">' +
        '<button class="confirm-btn confirm-cancel" onclick="closeConfirmDialog()">Cancel</button>' +
        '<button class="confirm-btn confirm-ok" onclick="confirmDialogOK()">OK</button>' +
        '</div>';

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // Store callback globally (stateless - only exists during dialog lifetime)
    window._confirmCallback = onConfirm;

    // Show modal with animation
    setTimeout(function () {
        modal.classList.add('show');
    }, 10);
}

function closeConfirmDialog() {
    var modal = document.querySelector('.confirm-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(function () {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            delete window._confirmCallback;
        }, 300);
    }
}

function confirmDialogOK() {
    if (window._confirmCallback) {
        window._confirmCallback();
    }
    closeConfirmDialog();
}


function playerStop() {
    if ((player.paused) && (player.currentTime == 0)) {
        player.src = '';
        gebi('trackName').innerHTML = '';
        playing = 0;
        updateProgressBar();
        markPlayingTab('');
        playingTrack = '';
    } else {
        player.pause();
        player.currentTime = 0;
    }
    updateAllLists();
}


function removeBrowserTrackFromPlaylist(id) {
    var index = playlistTracks.lastIndexOf(browserCurDir + browserTitles[id])
    if (index > -1) {
        playlistTracks.splice(index, 1);
    }
    updateAllLists();
}


function removeSearchTrackFromPlaylist(id) {
    var index = playlistTracks.lastIndexOf(searchDirTracks[id])
    if (index > -1) {
        playlistTracks.splice(index, 1);
    }
    updateAllLists();
}


function removeTrack(id) {
    playlistTracks.splice(id, 1);
    if (id <= playing) {
        playing--;
        if (playing < 0) {
            playing = playlistTracks.length;
        }
    }
    updateAllLists();
}


async function searchForTitle(search) {
    markLoading('search');
    const data = await fetchAPI('searchTitle', search);
    getSearchTitle(data);
}


async function searchForDir(search) {
    markLoading('search');
    const data = await fetchAPI('searchDir', search);
    getSearchDir(data);
}


async function browseDirFromBreadCrumbBar(id) {
    var dir = '';
    for (var i = 0; i <= id; i++) {
        dir += browserCurDirs[i] + '/';
    }
    browserFilterString = ''; // Clear filter when navigating
    markLoading('browser');
    const data = await fetchAPI('dir', dir);
    getBrowserData(data);
}


async function browseDir(id) {
    var dir = '';
    if (id !== undefined) {
        dir += browserCurDir + browserDirs[id] + '/';
    }
    browserFilterString = ''; // Clear filter when navigating
    markLoading('browser');
    const data = await fetchAPI('dir', dir);
    getBrowserData(data);
}


async function browseDirByStr(str) {
    browserFilterString = ''; // Clear filter when navigating
    markLoading('browser');
    const data = await fetchAPI('dir', str + '/');
    getBrowserData(data);
    tabShowing = 0;
    showTab(1);
}


async function getPlayingDir() {
    if (playingTrack !== '') {
        var path = playingTrack.substr(0, playingTrack.lastIndexOf('/')) + '/';
        markLoading('browser');
        const data = await fetchAPI('dir', path);
        getBrowserData(data);
        tabShowing = 0;
        showTab(1);
    }
}


function showTab(id) {
    if (tabShowing == id) {
        if (id == 1) {
            if (browserCurDirs.length > 1) {
                browseDirFromBreadCrumbBar(browserCurDirs.length - 2);
            } else if (browserCurDirs.length == 1) {
                browseDir();
            }
        }
    } else {
        tabShowing = id;

        // Remove all active states
        gebi('frameBrowser').classList.remove('active');
        gebi('framePlaylist').classList.remove('active');
        gebi('frameSearch').classList.remove('active');
        gebi('tabBrowser').classList.remove('active');
        gebi('tabPlaylist').classList.remove('active');
        gebi('tabSearch').classList.remove('active');

        // Add active state to selected tab
        if (id == 1) {
            gebi('frameBrowser').classList.add('active');
            gebi('tabBrowser').classList.add('active');
        } else if (id == 2) {
            gebi('framePlaylist').classList.add('active');
            gebi('tabPlaylist').classList.add('active');
        } else if (id == 3) {
            gebi('frameSearch').classList.add('active');
            gebi('tabSearch').classList.add('active');
        }
    }
}

// Folder-select modal removed: functionality is covered by the Browser '+' controls.

function getAllMp3Data(data) {
    loading = false;
    markLoading(false);
    if (data.status === 'ok' && data.files) {
        for (var i = 0; i < data.files.length; i++) {
            if (inPlaylist(data.files[i]) === 0) {
                playlistTracks.push(data.files[i]);
            }
        }
        updateAllLists();
    } else {
        alert('Failed to add files: ' + (data.message || 'Unknown error'));
    }
}

// Show a temporary toast notification
function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    // Clear previous content
    toast.textContent = '';

    // If message is an object with svg and text, build it safely
    if (typeof message === 'object' && message.svg && message.text) {
        var span = document.createElement('span');
        span.innerHTML = message.svg;
        toast.appendChild(span);
        toast.appendChild(document.createTextNode(' ' + message.text));
    } else {
        // Plain text message
        toast.textContent = message;
    }

    toast.classList.add('show');

    setTimeout(function () {
        toast.classList.remove('show');
    }, 3000);
}

// Add all songs from a directory to playlist
async function addDirectoryToPlaylist(dirIndex) {
    var dirPath = browserCurDir + browserDirs[dirIndex];
    console.log('[debug] addDirectoryToPlaylist called, dirIndex=', dirIndex, 'dirPath=', dirPath);
    var dirName = browserDirs[dirIndex];
    markLoading('browser');
    const data = await fetchAPI('getAllMp3InDir', JSON.stringify(dirPath));
    getAllMp3InDirData(data);

    // Show notification after adding
    setTimeout(function () {
        showToast({
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
            text: dirName + ' added to playlist'
        });
    }, 500);
}

// Add all songs from current directory to playlist
async function addCurrentDirToPlaylist() {
    var dirPath = browserCurDir || ''; // Empty string for root/home
    console.log('[debug] addCurrentDirToPlaylist called, dirPath=', dirPath);
    var dirName = browserCurDir ? browserCurDir.replace(/\/$/, '').split('/').pop() : 'Home';
    markLoading('browser');
    const data = await fetchAPI('getAllMp3InDir', JSON.stringify(dirPath));
    getAllMp3InDirData(data);

    // Show notification after adding
    setTimeout(function () {
        showToast({
            svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
            text: dirName + ' added to playlist'
        });
    }, 500);
}

// Browser filter functions
function applyBrowserFilter() {
    var input = gebi('browserFilterInput');
    if (input) {
        browserFilterString = input.value;

        // If filter is empty, just update the browser view
        if (!browserFilterString) {
            updateBrowser();
            setTimeout(function () { input.focus(); }, 0);
            return;
        }

        // Try local (current directory) matches first
        var filterLower = browserFilterString.toLowerCase();
        var localMatches = 0;
        for (var i = 0; i < browserDirs.length; i++) {
            if (browserDirs[i].toLowerCase().indexOf(filterLower) >= 0) localMatches++;
        }
        for (var i = 0; i < browserTitles.length; i++) {
            // match against filename and displayed title
            var titleText = getTrackTitle(browserTitles[i]).toLowerCase();
            if (browserTitles[i].toLowerCase().indexOf(filterLower) >= 0 || titleText.indexOf(filterLower) >= 0) localMatches++;
        }

        if (localMatches > 0) {
            // Show local filtered results
            updateBrowser();
            // Keep focus on input
            setTimeout(function () { input.focus(); }, 0);
        } else {
            // No local matches — perform a recursive directory search on the server
            // Keep results in Browser tab (don't switch tabs)
            var payload = JSON.stringify({ dir: browserCurDir || '', term: browserFilterString, limit: 200 });
            markLoading('browser');
            fetchAPI('searchInDir', payload).then(function (data) {
                markLoading(false);
                getSearchInDirData(data);
                setTimeout(function () { input.focus(); }, 0);
            }).catch(function (err) {
                markLoading(false);
                console.error('searchInDir error', err);
                alert('Search failed: ' + err.message);
            });
        }
    }
}

function clearBrowserFilter() {
    browserFilterString = '';
    updateBrowser();
    // Refocus on the input after clearing
    setTimeout(function () {
        var input = gebi('browserFilterInput');
        if (input) {
            input.focus();
        }
    }, 50);
}

// Results returned by server-side recursive search for the current dir
var searchInDirMatches = [];

function getSearchInDirData(data) {
    loading = false;
    markLoading(false);
    if (!data || data.status !== 'ok') {
        var msg = (data && data.message) ? data.message : 'No results';
        gebi('frameBrowser').innerHTML = '<div class="item-list"><div class="info-banner">' + escapeHtml(msg) + '</div></div>';
        return;
    }

    searchInDirMatches = data.matches || [];
    var list = '<div class="item-list">';

    // Keep breadcrumb and filter input visible
    list += '<div class="breadcrumb-filter-container">';
    list += '<div class="breadcrumb">';
    list += '<div class="breadcrumb-item" onClick="browseDir()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> Home</div>';
    for (var i = 0; i < browserCurDirs.length; i++) {
        list += '<div class="breadcrumb-item" onClick="browseDirFromBreadCrumbBar(' + i + ')">' + escapeHtml(browserCurDirs[i]) + '</div>';
    }
    list += '</div>';
    list += '<div class="browser-filter-container">';
    list += '<button class="browser-filter-search-btn" onClick="applyBrowserFilter()" title="Search"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>';
    list += '<input class="browser-filter-input" value="' + escapeHtml(browserFilterString) + '" id="browserFilterInput" type="text" placeholder="Type and press Enter or click search...">';
    if (browserFilterString) {
        list += '<button class="browser-filter-clear" onClick="clearBrowserFilter()" title="Clear filter">✕</button>';
    }
    list += '</div></div>';

    list += '<div class="info-banner">' + String(searchInDirMatches.length) + ' result' + (searchInDirMatches.length !== 1 ? 's' : '') + ' found for "' + escapeHtml(browserFilterString) + '"</div>';

    for (var i = 0; i < searchInDirMatches.length; i++) {
        var m = searchInDirMatches[i];
        var isPlaying = playingTrack == m.path;
        var playlistCount = inPlaylist(m.path);
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromSearchInDirAndKeepView(' + i + ')">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + escapeHtml(m.title) + '</div>';
        list += '<div class="item-subtitle">' + escapeHtml(m.dir ? ('Home/' + m.dir) : 'Home') + '</div>';
        list += '</div>';
        // show add (+) when not in playlist, star(remove) when already in playlist
        list += `<div class="item-action${playlistCount > 0 ? ' in-playlist' : ''}" onClick="event.stopPropagation();${playlistCount > 0 ? 'removeSearchInDirTrackFromPlaylist' : 'addTrackFromSearchInDir'}(${i})">`;
        list += (playlistCount > 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' : '＋');
        list += '</div>';
        list += '</div>';
    }

    list += '</div>';
    gebi('frameBrowser').innerHTML = list;
}

function setTrackFromSearchInDir(i) {
    if (!searchInDirMatches[i]) return;
    var path = searchInDirMatches[i].path;
    setAndPlayTrack(path);
    markPlayingTab('browser');
}

// When playing an item from server-side searchInDir results, keep the search results visible
function setTrackFromSearchInDirAndKeepView(i) {
    if (!searchInDirMatches[i]) return;
    setTrackFromSearchInDir(i);
    setTimeout(function () {
        getSearchInDirData({ status: 'ok', matches: searchInDirMatches });
    }, 10);
}

function addTrackFromSearchInDir(i) {
    if (!searchInDirMatches[i]) return;
    var path = searchInDirMatches[i].path;
    // prevent duplicates
    if (inPlaylist(path) === 0) {
        playlistTracks.push(path);
        // only update playlist UI and re-render current search results so user stays on same view
        updatePlaylist();
        // re-render searchInDir results to reflect new in-playlist state
        getSearchInDirData({ status: 'ok', matches: searchInDirMatches });
    }
}

function removeSearchInDirTrackFromPlaylist(i) {
    if (!searchInDirMatches[i]) return;
    var path = searchInDirMatches[i].path;
    var index = playlistTracks.lastIndexOf(path);
    if (index > -1) {
        playlistTracks.splice(index, 1);
    }
    // update playlist and re-render search results
    updatePlaylist();
    getSearchInDirData({ status: 'ok', matches: searchInDirMatches });
}
