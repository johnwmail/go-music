var player;
var playingFrom = '';
var browserPlaylistTitles = [];
var browserPlaylistDir = '';
var playlistTracks = [];
var browserCurDir;
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
var dataframeTime = 0;
var searchString = '';
var searchAction = '';
var shuffledList = [];
var shuffle = false;


function getBrowserData(data) {
    loading = false;
    markLoading(false);
    if (String(data[0]) == 'ok') {
        browserCurDir = (String(data[1]));
        var tmpArr = browserCurDir.split('/');
        browserCurDirs = [];
        for (var i = 0; i < tmpArr.length; i++) {
            if (tmpArr[i] != '') {
                browserCurDirs[browserCurDirs.length] = tmpArr[i];
            }
        }
        browserDirs = data[2];
        browserTitles = data[3];
        updateBrowser();
    } else {
        alert(data[0]);
    }
}


function getSearchTitle(data) {
    loading = false;
    markLoading(false);
    searchDirs = [];
    searchDirTracks = data[1];
    updateSearch('title');
    if (data[0] != '') {
        alert(data[0]);
    }
}


function getSearchDir(data) {
    loading = false;
    markLoading(false);
    searchDirTracks = [];
    searchDirs = data[1];
    updateSearch('dir');
    if (data[0] != '') {
        alert(data[0]);
    }
}


function init() {
    window.onbeforeunload = function() {
        return 'Quit player?';
    };
    checkDataframe();
    showTab(1);
    markPlayingTab('');
    player = gebi('player');
    loadPlaylist();
    updateProgressBar();
    browseDir();
    updateAllLists();
    player.onended = function() {
        changeTrack(1);
    }
    player.onpause = function() {
        gebi('buttonPlay').innerHTML = '<alignPlay>&#9658;</alignPlay>';
    }
    player.onplaying = function() {
        gebi('buttonPlay').innerHTML = '<alignJumpPause>&#10074;&#10074;</alignJumpPause>';
    }
    player.ontimeupdate = function() {
        updateProgressBar();
    }
    player.onloadedmetadata = function() {
        updateProgressBar();
    }
}


function markLoading(tab) {
    if (tab == false) {
        gebi('markLoadBrowser').style.visibility = 'hidden';
        gebi('markLoadSearch').style.visibility = 'hidden';
    } else if (tab == 'browser') {
        gebi('markLoadBrowser').style.visibility = 'visible';
        gebi('markLoadSearch').style.visibility = 'hidden';
    } else if (tab == 'search') {
        gebi('markLoadBrowser').style.visibility = 'hidden';
        gebi('markLoadSearch').style.visibility = 'visible';
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
    var leds = 14;
    var cur = player.currentTime;
    var max = player.duration;
    if ((cur != cur) || (max != max) || (cur > max)) {
        var bar = '';
        var progress = -1; // Set progress to a value that will trigger the update
        lastProgress = progress;
        for (var i = 0; i < leds; i++) {
            bar += '<div class="barGrey"></div>';
        }
        gebi('bar').innerHTML = bar;
        gebi('trackCurrentTime').innerHTML = secondsToTime(0);
        gebi('trackRemaining').innerHTML = secondsToTime(0);
        gebi('trackDuration').innerHTML = secondsToTime(0);
    } else {
        gebi('trackCurrentTime').innerHTML = secondsToTime(Math.floor(cur));
        gebi('trackRemaining').innerHTML = secondsToTime(Math.floor(max) - Math.floor(cur));
        gebi('trackDuration').innerHTML = secondsToTime(player.duration);
        var progress = Math.floor(cur / max * leds);
        if (progress == leds) {
            progress = leds - 1;
        }
        if (progress != lastProgress) {
            var bar = '';
            lastProgress = progress;
            for (var i = 0; i < leds; i++) {
                bar += '<div class="' + (progress == i ? "barOn" : "barOff") + '" onClick="player.currentTime=' + Math.ceil(max / leds * (i)) + '"></div>';
            }
            gebi('bar').innerHTML = bar;
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
    if (shuffle) {
        gebi('shuffle').className = 'shuffleOn';
    } else {
        gebi('shuffle').className = 'shuffleOff';
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
    if (playingFrom == 'browser') {
        gebi('markBrowser').style.visibility = 'visible';
        gebi('markList').style.visibility = 'hidden';
        gebi('markSearch').style.visibility = 'hidden';
    } else if (playingFrom == 'list') {
        gebi('markBrowser').style.visibility = 'hidden';
        gebi('markList').style.visibility = 'visible';
        gebi('markSearch').style.visibility = 'hidden';
    } else if (playingFrom == 'search') {
        gebi('markBrowser').style.visibility = 'hidden';
        gebi('markList').style.visibility = 'hidden';
        gebi('markSearch').style.visibility = 'visible';
    } else {
        gebi('markBrowser').style.visibility = 'hidden';
        gebi('markList').style.visibility = 'hidden';
        gebi('markSearch').style.visibility = 'hidden';
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
    gebi('trackName').innerHTML = '&nbsp;' + getTrackTitle(track) + '<br>&nbsp;<smallPath>' + getTrackDir(track) + '</smallPath>';
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
    var list = '';
    list += '<div class="pathContainer"><div class="browserPath" onClick="browseDir()">&nbsp;Home&nbsp;</div>';
    for (var i = 0; i < browserCurDirs.length; i++) {
        list += '<div class="browserPath" onClick="browseDirFromBreadCrumbBar(' + i + ')">&nbsp;' + browserCurDirs[i] + '&nbsp;</div>';
    }
    list += '</div>';
    for (var i = 0; i < browserDirs.length; i++) {
        list += '<div class="listContainer"><div class="browserDir" onClick="browseDir(' + i + ')">&nbsp;' + browserDirs[i] + '&nbsp;<br>&nbsp;<smallPath>' + getTrackDir(browserCurDir) + '</smallPath></div></div>';
    }
    var playlistCount;
    for (var i = 0; i < browserTitles.length; i++) {
        playlistCount = inPlaylist(browserCurDir + browserTitles[i]);
        list += '<div class="listContainer"><div class="' + (playingTrack == browserCurDir + browserTitles[i] ? 'browserTitleHL' : 'browserTitle') + '" onClick="setTrackFromBrowser(' + i + ')">&nbsp;' + getTrackTitle(browserTitles[i]) + '&nbsp;<br>&nbsp;<smallPath>' + getTrackDir(browserCurDir) + '</smallPath></div><div class="browserAction" onClick="' + (playlistCount > 0 ? 'removeBrowserTrackFromPlaylist' : 'addTrackFromBrowser') + '(' + i + ')">' + (playlistCount > 0 ? '<div class="mark">&#9733;</div>' : '&nbsp;') + '</div></div>';
    }
    gebi('frameBrowser').innerHTML = list;
}


function updatePlaylist() {
    savePlaylist();
    var list = '<div class="listContainer">';
    if (playlistTracks.length > 0) {
        list += '<div class="browserDir" onClick="clearPlaylist()">&nbsp;Titles in playlist: ' + String(playlistTracks.length) + ' - Click to clear';
    } else {
        list += '<div class="browserDir">&nbsp;Playlist is Empty';
    }
    list += '</div></div>';
    list += '<div class="listContainer"><div class="browserDir" onClick="showFolderSelectDialog()">&nbsp;Add All MP3 Files to Playlist</div></div>';
    for (var i = 0; i < playlistTracks.length; i++) {
        list += '<div class="listContainer"><div class="' + (playingTrack == playlistTracks[i] ? 'browserTitleHL' : 'browserTitle') + '" onClick="setTrackFromPlaylist(' + i + ');player.play()">&nbsp;' + getTrackTitle(playlistTracks[i]) + '&nbsp;<br>&nbsp;<smallPath>' + getTrackDir(playlistTracks[i]) + '</smallPath></div><div class="browserAction" onClick="removeTrack(' + i + ')"><div class="mark">&#9733;</div></div></div>';
    }
    gebi('framePlaylist').innerHTML = list;
}


function updateSearch(action) {
    if (action != undefined) {
        searchAction = action;
    }
    var list = '<div class="pathContainer"><div class="browserPath">&nbsp;<input class="inp" value="' + (searchAction == 'clear' ? '' : searchString) + '" id="searchStr" name="searchStr" type="text"></div><div class="browserPath" onClick="searchString=gebi(\'searchStr\').value; searchForTitle(searchString); updateSearch(\'search\')"><div class="third">Title</div></div><div class="browserPath" onClick="searchString=gebi(\'searchStr\').value; searchForDir(searchString); updateSearch(\'search\')"><div class="third">Directory</div></div></div>';
    list += '<div class="listContainer"><div class="browserDir" onClick="updateSearch(\'clear\')">';
    if (searchAction == 'dir') {
        list += '&nbsp;Directory search result: ' + String(searchDirs.length);
    } else if (searchAction == 'title') {
        list += '&nbsp;Title search result: ' + String(searchDirTracks.length);
    } else if (searchAction == 'search') {
        list += '&nbsp;Searching...';
        searchDirs = [];
        searchDirTracks = [];
    } else if (searchAction == 'clear') {
        list += '&nbsp;Type and choose Title or Directory';
        searchDirs = [];
        searchDirTracks = [];
    } else {
        list += '&nbsp;Type and choose Title or Directory';
    }
    list += '</div></div>';
    for (var i = 0; i < searchDirs.length; i++) {
        list += '<div class="listContainer"><div class="browserDir" onClick="browseDirByStr(searchDirs[' + i + '])">&nbsp;' + searchDirs[i].split('/').pop() + '&nbsp;<br>&nbsp;<smallPath>' + getTrackDir(searchDirs[i]) + '</smallPath></div></div>';
    }
    var playlistCount;
    for (var i = 0; i < searchDirTracks.length; i++) {
        playlistCount = inPlaylist(searchDirTracks[i]);
        list += '<div class="listContainer"><div class="' + (playingTrack == searchDirTracks[i] ? 'browserTitleHL' : 'browserTitle') + '" onClick="setTrackFromSearch(' + i + ',true)">&nbsp;' + getTrackTitle(searchDirTracks[i]) + '&nbsp;<br>&nbsp;<smallPath>' + getTrackDir(searchDirTracks[i]) + '</smallPath></div><div class="browserAction" onClick="' + (playlistCount > 0 ? 'removeSearchTrackFromPlaylist' : 'addTrackFromSearch') + '(' + i + ')">' + (playlistCount > 0 ? '<div class="mark">&#9733;</div>' : '&nbsp;') + '</div></div>';
    }
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


function searchForTitle(search) {
    markLoading('search');
    loadFromServer('searchTitle', search);
}


function searchForDir(search) {
    markLoading('search');
    loadFromServer('searchDir', search);
}


function browseDirFromBreadCrumbBar(id) {
    var dir = '';
    for (var i = 0; i <= id; i++) {
        dir += browserCurDirs[i] + '/';
    }
    markLoading('browser');
    loadFromServer('dir', dir);
}


function browseDir(id) {
    var dir = '';
    if (id !== undefined) {
        dir += browserCurDir + browserDirs[id] + '/';
    }
    markLoading('browser');
    loadFromServer('dir', dir);
}


function browseDirByStr(str) {
    markLoading('browser');
    loadFromServer('dir', str + '/');
    tabShowing = 0;
    showTab(1);
}


function getPlayingDir() {
    if (playingTrack !== '') {
        var path = playingTrack.substr(0, playingTrack.lastIndexOf('/')) + '/';
        markLoading('browser');
        loadFromServer('dir', path);
        tabShowing = 0;
        showTab(1);
    }
}


function loadFromServer(param, varia) {
    dataframeTime = 15;
    loading = true;
    gebi('dffunc').value = param;
    gebi('dfdata').value = varia;
    gebi('dfform').submit();
}


function checkDataframe() {
    if (loading) {
        if (dataframeTime > 0) {
            dataframeTime--;
        } else {
            loading = false;
            markLoading(false);
            try {
                if (window.frames['dataframe'] && window.frames['dataframe'].window) {
                    window.frames['dataframe'].window.location.replace('about:blank');
                }
            } catch (e) {
                console.error("Error accessing iframe:", e);
            }
            alert('Server not responding');
        }
    }
    setTimeout(function() {
        checkDataframe();
    }, 1000);
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
        if (id == 1) {
            gebi('frameBrowser').style.display = 'inline';
            gebi('framePlaylist').style.display = 'none';
            gebi('frameSearch').style.display = 'none';
            gebi('tabBrowser').style.background = '#ffffff';
            gebi('tabPlaylist').style.background = '#aaaaaa';
            gebi('tabSearch').style.background = '#aaaaaa';
        }
        if (id == 2) {
            gebi('frameBrowser').style.display = 'none';
            gebi('framePlaylist').style.display = 'inline';
            gebi('frameSearch').style.display = 'none';
            gebi('tabBrowser').style.background = '#aaaaaa';
            gebi('tabPlaylist').style.background = '#ffffff';
            gebi('tabSearch').style.background = '#aaaaaa';
        }
        if (id == 3) {
            gebi('frameBrowser').style.display = 'none';
            gebi('framePlaylist').style.display = 'none';
            gebi('frameSearch').style.display = 'inline';
            gebi('tabBrowser').style.background = '#aaaaaa';
            gebi('tabPlaylist').style.background = '#aaaaaa';
            gebi('tabSearch').style.background = '#ffffff';
        }
    }
}

// Add modal for folder selection
var folderSelectModal = null;
var selectedFolders = [];

function showFolderSelectDialog() {
    selectedFolders = [];
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
    loadFromServer('getAllDirs', '');
}

function toggleFolderSelection(folder) {
    const index = selectedFolders.indexOf(folder);
    const checkboxId = 'checkbox_' + folder.replace(/[^a-zA-Z0-9]/g, '_');
    const checkbox = document.getElementById(checkboxId);

    if (index === -1) {
        selectedFolders.push(folder);
        if(checkbox) checkbox.checked = true;

    } else {
        selectedFolders.splice(index, 1);
        if(checkbox) checkbox.checked = false;
    }
}

function addSelectedFoldersToPlaylist() {
    if (selectedFolders.length === 0) {
        alert('Please select at least one folder');
        return;
    }
    closeFolderSelectDialog();
    markLoading('browser');
    loadFromServer('getAllMp3InDirs', JSON.stringify(selectedFolders));
}

function closeFolderSelectDialog() {
    if (folderSelectModal) folderSelectModal.style.display = 'none';
}

function getAllDirsData(data) {
    if (!folderSelectModal) return;
    const folderListDiv = document.getElementById('folderSelectList');
    if (data[0] !== 'ok') {
        folderListDiv.innerHTML = 'Failed to load folders.';
        return;
    }
    var html = '<b>Select folders:</b><br><ul style="max-height:50vh;overflow:auto;padding-left:1em;list-style-type:none;">';
    for (var i = 0; i < data[1].length; i++) {
        var folder = data[1][i];
        var displayName = (folder === '' ? 'Home' : 'Home/' + folder);
        var checkboxId = 'checkbox_' + folder.replace(/[^a-zA-Z0-9]/g, '_');
        html += '<li style="margin:0.5em 0;" onclick="toggleFolderSelection(\'' + folder.replace(/'/g, "\\'") + '\')"><label style="display:flex;align-items:center;cursor:pointer;"><input type="checkbox" id="' + checkboxId + '" style="margin-right:0.5em;" readOnly> ' + displayName + '</label></li>';
    }
    html += '</ul>';
    folderListDiv.innerHTML = html;
}

function getAllMp3Data(data) {
    loading = false;
    markLoading(false);
    if (data[0] == 'ok') {
        for (var i = 0; i < data[1].length; i++) {
            if (inPlaylist(data[1][i]) === 0) {
                playlistTracks.push(data[1][i]);
            }
        }
        updateAllLists();
    } else {
        alert('Failed to add files: ' + data[1]);
    }
}
