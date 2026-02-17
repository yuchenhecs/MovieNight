/// <reference path='./both.js' />


function initPlayer() {
    if (!mpegts.isSupported()) {
        console.warn('mpegts not supported');
        return;
    }

    let videoElement = document.querySelector('#videoElement');
    let loadingOverlay = document.querySelector('#loadingOverlay');
    let loadingText = document.querySelector('#loadingText');
    let isReady = false;
    let playRequested = false;
    let flvPlayer = null;
    let retryInterval = null;
    let isRetrying = false;
    let hasAttemptedPlay = false;

    function hideLoadingOverlay() {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
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
        hasAttemptedPlay = false;
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
        isReady = false;

        flvPlayer = mpegts.createPlayer({
            type: 'flv',
            url: '/live'
        }, {
            isLive: true,
            liveBufferLatencyChasing: true,
            autoCleanupSourceBuffer: true,
        });

        flvPlayer.attachMediaElement(videoElement);

        // Listen for mpegts.js errors BEFORE loading
        flvPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
            console.error('Player error:', errorType, errorDetail, errorInfo);

            if (errorType === mpegts.ErrorTypes.NETWORK_ERROR) {
                if (!isRetrying) {
                    updateLoadingText('Connection lost. Retrying...');
                    startRetrying();
                }
            } else if (errorType === mpegts.ErrorTypes.MEDIA_ERROR) {
                if (!isRetrying) {
                    updateLoadingText('Media error. Retrying...');
                    startRetrying();
                }
            }
        });

        // Now load the stream
        flvPlayer.load();

        // Mark as ready when video can play
        videoElement.addEventListener('loadedmetadata', () => {
            console.log('Stream metadata loaded');
            // Only try to play once we have metadata
            if (!hasAttemptedPlay) {
                hasAttemptedPlay = true;
                videoElement.play().catch(err => {
                    console.log('Autoplay blocked:', err);
                });
            }
        }, { once: true });

        videoElement.addEventListener('canplay', () => {
            console.log('Stream ready to play');
            isReady = true;
            hideLoadingOverlay();
            stopRetrying();

            // If user clicked play while loading, play now
            if (playRequested) {
                console.log('Playing video (deferred from early click)');
                videoElement.play();
                playRequested = false;
            }
        }, { once: true });

        // Intercept play attempts and defer if not ready
        videoElement.addEventListener('play', (e) => {
            if (!isReady) {
                console.log('Play requested but stream not ready yet, will play when ready');
                playRequested = true;
                e.preventDefault();
                videoElement.pause();
            }
        });

        // Handle video errors
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
        console.log('Starting retry mechanism...');

        // Retry every 5 seconds
        retryInterval = setInterval(() => {
            console.log('Retrying connection...');
            startPlayer();
        }, 5000);
    }

    // Initial load
    startPlayer();

    // Check if stream is taking too long to load initially
    setTimeout(() => {
        if (!isReady && loadingOverlay && loadingOverlay.style.display !== 'none') {
            if (!isRetrying) {
                updateLoadingText('Waiting for stream to start...');
                startRetrying();
            }
        }
    }, 5000);
}

window.addEventListener('load', initPlayer);
