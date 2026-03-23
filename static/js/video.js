/// <reference path='./both.js' />


function initPlayer() {
    if (!mpegts.isSupported()) {
        console.warn('mpegts not supported');
        return;
    }

    let videoElement = document.querySelector('#videoElement');
    let loadingOverlay = document.querySelector('#loadingOverlay');
    let loadingText = document.querySelector('#loadingText');
    let flvPlayer = null;
    let retryInterval = null;
    let isRetrying = false;
    let overlayHidden = false;

    function hideLoadingOverlay() {
        if (loadingOverlay && !overlayHidden) {
            loadingOverlay.style.display = 'none';
            overlayHidden = true;
        }
    }

    function showLoadingOverlay() {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            overlayHidden = false;
        }
    }

    function updateLoadingText(text) {
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    function cleanupPlayer() {
        if (flvPlayer) {
            try {
                flvPlayer.pause();
                flvPlayer.unload();
                flvPlayer.detachMediaElement();
                flvPlayer.destroy();
            } catch (e) {
                console.warn('Error cleaning up player:', e);
            }
            flvPlayer = null;
        }
    }

    function stopRetrying() {
        if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
        }
        isRetrying = false;
    }

    function startPlayer() {
        console.log('Initializing player...');
        cleanupPlayer();
        showLoadingOverlay();

        flvPlayer = mpegts.createPlayer({
            type: 'flv',
            url: '/live'
        }, {
            isLive: true,
            liveBufferLatencyChasing: true,
            autoCleanupSourceBuffer: true,
        });

        flvPlayer.attachMediaElement(videoElement);

        flvPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            console.error('Player error:', errorType, errorDetail, errorInfo);

            if (!isRetrying) {
                if (errorType === mpegts.ErrorTypes.NETWORK_ERROR) {
                    updateLoadingText('Connection lost. Retrying...');
                } else if (errorType === mpegts.ErrorTypes.MEDIA_ERROR) {
                    updateLoadingText('Media error. Retrying...');
                }
                startRetrying();
            }
        });

        flvPlayer.load();

        // Hide overlay and start playback once we have data
        function onCanPlay() {
            console.log('Stream ready to play');
            hideLoadingOverlay();
            stopRetrying();
            videoElement.play().catch(err => {
                console.log('Play failed:', err);
            });
        }

        function onTimeUpdate() {
            // If we're getting time updates, the stream is playing
            if (videoElement.currentTime > 0) {
                hideLoadingOverlay();
                stopRetrying();
            }
        }

        videoElement.addEventListener('canplay', onCanPlay, { once: true });
        videoElement.addEventListener('playing', () => {
            console.log('Stream is playing');
            hideLoadingOverlay();
            stopRetrying();
        }, { once: true });
        videoElement.addEventListener('timeupdate', onTimeUpdate);

        videoElement.addEventListener('loadedmetadata', () => {
            console.log('Stream metadata loaded');
            videoElement.play().catch(err => {
                console.log('Autoplay blocked:', err);
            });
        }, { once: true });

        videoElement.addEventListener('error', (e) => {
            console.error('Video error:', e);
            if (!isRetrying) {
                updateLoadingText('Connection lost. Reconnecting...');
                startRetrying();
            }
        });
    }

    function startRetrying() {
        if (isRetrying) return;

        isRetrying = true;
        showLoadingOverlay();
        console.log('Starting retry mechanism...');

        retryInterval = setInterval(() => {
            console.log('Retrying connection...');
            startPlayer();
        }, 5000);
    }

    // Initial load
    startPlayer();

    // Check if stream is taking too long to load initially
    setTimeout(() => {
        if (!overlayHidden) {
            if (!isRetrying) {
                updateLoadingText('Waiting for stream to start...');
                startRetrying();
            }
        }
    }, 5000);
}

window.addEventListener('load', initPlayer);
