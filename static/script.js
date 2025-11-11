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


function updateProgressBar() {
    var cur = player.currentTime;
    var max = player.duration;
    if ((cur != cur) || (max != max) || (cur > max)) {
        gebi('bar').innerHTML = '<div class="progress-track"><div class="progress-fill" style="width: 0%"></div></div>';
        gebi('trackCurrentTime').innerHTML = secondsToTime(0);
        gebi('trackRemaining').innerHTML = secondsToTime(0);
        gebi('trackDuration').innerHTML = secondsToTime(0);
    } else {
        gebi('trackCurrentTime').innerHTML = secondsToTime(Math.floor(cur));
        gebi('trackRemaining').innerHTML = secondsToTime(Math.floor(max) - Math.floor(cur));
        gebi('trackDuration').innerHTML = secondsToTime(player.duration);
        var progress = (cur / max) * 100;
        gebi('bar').innerHTML = '<div class="progress-track" onclick="seekToPosition(event)"><div class="progress-fill" style="width: ' + progress + '%"></div></div>';
    }
}

function seekToPosition(event) {
    var bar = event.currentTarget;
    var rect = bar.getBoundingClientRect();
    var clickX = event.clientX - rect.left;
    var barWidth = rect.width;
    var seekPercent = clickX / barWidth;
    var seekTime = seekPercent * player.duration;
    if (seekTime >= 0 && seekTime <= player.duration) {
        player.currentTime = seekTime;
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
    trackNameEl.innerHTML = '<div class="track-title">' + trackTitle + '</div><div class="track-path">' + trackDir + '</div>';
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
    return dirStr.join(' &#10137; ');
}


function updateBrowser() {
    var list = '<div class="item-list">';

    // Breadcrumb navigation
    list += '<div class="breadcrumb">';
    list += '<div class="breadcrumb-item" onClick="browseDir()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> Home</div>';
    for (var i = 0; i < browserCurDirs.length; i++) {
        list += '<div class="breadcrumb-item" onClick="browseDirFromBreadCrumbBar(' + i + ')">' + browserCurDirs[i] + '</div>';
    }
    list += '</div>';

    // Directories
    for (var i = 0; i < browserDirs.length; i++) {
        list += '<div class="list-item directory" onClick="browseDir(' + i + ')">';
        list += '<div class="item-content">';
        list += '<div class="item-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ' + browserDirs[i] + '</div>';
        list += '<div class="item-subtitle">' + getTrackDir(browserCurDir) + '</div>';
        list += '</div></div>';
    }

    // Music files
    var playlistCount;
    for (var i = 0; i < browserTitles.length; i++) {
        playlistCount = inPlaylist(browserCurDir + browserTitles[i]);
        var isPlaying = playingTrack == browserCurDir + browserTitles[i];
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromBrowser(' + i + ')">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + getTrackTitle(browserTitles[i]) + '</div>';
        list += '<div class="item-subtitle">' + getTrackDir(browserCurDir) + '</div>';
        list += '</div>';
        list += `<div class="item-action${playlistCount > 0 ? ' in-playlist' : ''}" onClick="event.stopPropagation();${playlistCount > 0 ? 'removeBrowserTrackFromPlaylist' : 'addTrackFromBrowser'}(${i})">`;
        list += (playlistCount > 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' : '＋');
        list += '</div></div>';
    }

    list += '</div>';
    gebi('frameBrowser').innerHTML = list;
}


function updatePlaylist() {
    savePlaylist();
    var list = '<div class="item-list">';

    // Info banner
    if (playlistTracks.length > 0) {
        list += '<div class="info-banner" onClick="clearPlaylist()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' + String(playlistTracks.length) + ' track' + (playlistTracks.length !== 1 ? 's' : '') + ' in playlist - Click to clear</div>';
    } else {
        list += '<div class="info-banner">Playlist is empty - Add tracks from Browser or Search</div>';
    }

    // Add all button
    list += '<div class="list-item directory" onClick="showFolderSelectDialog()">';
    list += '<div class="item-content"><div class="item-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg> Add All MP3 Files to Playlist</div></div>';
    list += '</div>';

    // Playlist tracks
    for (var i = 0; i < playlistTracks.length; i++) {
        var isPlaying = playingTrack == playlistTracks[i];
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromPlaylist(' + i + ');player.play()">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + getTrackTitle(playlistTracks[i]) + '</div>';
        list += '<div class="item-subtitle">' + getTrackDir(playlistTracks[i]) + '</div>';
        list += '</div>';
        list += '<div class="item-action in-playlist" onClick="event.stopPropagation();removeTrack(' + i + ')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>';
        list += '</div>';
    }

    list += '</div>';
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
        list += '<div class="item-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ' + searchDirs[i].split('/').pop() + '</div>';
        list += '<div class="item-subtitle">' + getTrackDir(searchDirs[i]) + '</div>';
        list += '</div></div>';
    }

    // Track results
    var playlistCount;
    for (var i = 0; i < searchDirTracks.length; i++) {
        playlistCount = inPlaylist(searchDirTracks[i]);
        var isPlaying = playingTrack == searchDirTracks[i];
        list += '<div class="list-item' + (isPlaying ? ' active' : '') + '" onClick="setTrackFromSearch(' + i + ',true)">';
        list += '<div class="item-content">';
        list += '<div class="item-title">' + (isPlaying ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ' : '') + getTrackTitle(searchDirTracks[i]) + '</div>';
        list += '<div class="item-subtitle">' + getTrackDir(searchDirTracks[i]) + '</div>';
        list += '</div>';
        list += '<div class="item-action' + (playlistCount > 0 ? ' in-playlist' : '') + '" onClick="event.stopPropagation();' + (playlistCount > 0 ? 'removeSearchTrackFromPlaylist' : 'addTrackFromSearch') + '(' + i + ')">';
        list += (playlistCount > 0 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' : '＋');
        list += '</div></div>';
    }

    list += '</div>';
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
    if (confirm('Clear Playlist?') == true) {
        playlistTracks = [];
        updateAllLists();
    }
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
    markLoading('browser');
    const data = await fetchAPI('dir', dir);
    getBrowserData(data);
}


async function browseDir(id) {
    var dir = '';
    if (id !== undefined) {
        dir += browserCurDir + browserDirs[id] + '/';
    }
    markLoading('browser');
    const data = await fetchAPI('dir', dir);
    getBrowserData(data);
}


async function browseDirByStr(str) {
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

// Add modal for folder selection
var folderSelectModal = null;
var selectedFolders = [];
var folderToCheckboxId = {}; // Map folder names to their checkbox IDs

async function showFolderSelectDialog() {
    selectedFolders = [];
    folderToCheckboxId = {}; // Reset mapping
    if (!folderSelectModal) {
        folderSelectModal = document.createElement('div');
        folderSelectModal.id = 'folderSelectModal';
        folderSelectModal.style.position = 'fixed';
        folderSelectModal.style.top = '0';
        folderSelectModal.style.left = '0';
        folderSelectModal.style.width = '100vw';
        folderSelectModal.style.height = '100vh';
        folderSelectModal.style.background = 'rgba(0,0,0,0.5)';
        folderSelectModal.style.zIndex = '9999';
        folderSelectModal.style.display = 'flex';
        folderSelectModal.style.alignItems = 'center';
        folderSelectModal.style.justifyContent = 'center';
        folderSelectModal.innerHTML = '<div style="background:#fff;padding:2em;border-radius:0.5em;max-height:80vh;overflow:auto;"><div id="folderSelectList">Loading folders...</div><div style="margin-top:1em;text-align:right;"><button onclick="addSelectedFoldersToPlaylist()" style="margin-right:1em;">Add Selected</button><button onclick="closeFolderSelectDialog()">Cancel</button></div></div>';
        document.body.appendChild(folderSelectModal);
    }
    folderSelectModal.style.display = 'flex';
    // Fetch folders from backend
    const data = await fetchAPI('getAllDirs', '');
    getAllDirsData(data);
}

function toggleFolderSelection(folder, event) {
    // Prevent default and stop propagation to avoid double-toggling
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const index = selectedFolders.indexOf(folder);
    const checkboxId = folderToCheckboxId[folder];
    const checkbox = checkboxId ? document.getElementById(checkboxId) : null;

    if (index === -1) {
        selectedFolders.push(folder);
        if (checkbox) checkbox.checked = true;

    } else {
        selectedFolders.splice(index, 1);
        if (checkbox) checkbox.checked = false;
    }
}

function addSelectedFoldersToPlaylist() {
    if (selectedFolders.length === 0) {
        alert('Please select at least one folder');
        return;
    }
    closeFolderSelectDialog();
    markLoading('browser');

    // Store folders to process
    window.foldersToProcess = selectedFolders.slice();
    window.currentFolderIndex = 0;

    // Start processing first folder
    processNextFolder();
}

async function processNextFolder() {
    if (window.currentFolderIndex >= window.foldersToProcess.length) {
        // All done
        loading = false;
        markLoading(false);
        updateAllLists();
        delete window.foldersToProcess;
        delete window.currentFolderIndex;
        return;
    }

    // Process one folder
    var folder = window.foldersToProcess[window.currentFolderIndex];
    const data = await fetchAPI('getAllMp3InDir', JSON.stringify(folder));
    getAllMp3InDirData(data);
}

function getAllMp3InDirData(data) {
    loading = false;
    markLoading(false);

    if (data.status === 'ok' && data.files) {
        // Add files from this folder to playlist
        for (var i = 0; i < data.files.length; i++) {
            if (inPlaylist(data.files[i]) === 0) {
                playlistTracks.push(data.files[i]);
            }
        }
        updateAllLists();
    } else {
        console.error('Failed to process folder:', data.message);
    }

    // Process next folder
    if (window.foldersToProcess) {
        window.currentFolderIndex++;
        setTimeout(processNextFolder, 100); // Small delay between requests
    }
}

function closeFolderSelectDialog() {
    if (folderSelectModal) folderSelectModal.style.display = 'none';
}

function getAllDirsData(data) {
    loading = false;
    markLoading(false);

    if (!folderSelectModal) return;
    const folderListDiv = document.getElementById('folderSelectList');
    if (data.status !== 'ok' || !data.dirs) {
        folderListDiv.innerHTML = 'Failed to load folders.';
        return;
    }
    var html = '<b>Select folders:</b><br><ul style="max-height:50vh;overflow:auto;padding-left:1em;list-style-type:none;">';
    // Helper to escape backslashes and single quotes for inclusion in single-quoted JS string
    function jsSingleQuoteEscape(str) {
        return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
    // Track used checkbox IDs to prevent conflicts
    var usedCheckboxIds = {};
    var idCounter = 0;

    for (var i = 0; i < data.dirs.length; i++) {
        var folder = data.dirs[i];
        var displayName = (folder === '' ? 'Home' : 'Home/' + folder);
        var baseCheckboxId = 'checkbox_' + folder.replace(/[^a-zA-Z0-9]/g, '_');
        var checkboxId = baseCheckboxId;

        // Ensure unique checkbox ID by adding counter if needed
        if (usedCheckboxIds[checkboxId]) {
            checkboxId = baseCheckboxId + '_' + (++idCounter);
        }
        usedCheckboxIds[checkboxId] = true;

        // Store mapping from folder to checkbox ID
        folderToCheckboxId[folder] = checkboxId;

        // Put onclick on label instead of li, and use pointer-events:none on checkbox to prevent double-clicks
        html += '<li style="margin:0.5em 0;"><label style="display:flex;align-items:center;cursor:pointer;" onclick="toggleFolderSelection(\'' + jsSingleQuoteEscape(folder) + '\', event)"><input type="checkbox" id="' + checkboxId + '" style="margin-right:0.5em;pointer-events:none;" disabled> ' + displayName + '</label></li>';
    }
    html += '</ul>';
    folderListDiv.innerHTML = html;
}

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
