class UIManager {
    constructor() {
        this.initializeElements();
        this.bindFormEvents();
    }

    initializeElements() {
        // Form elements
        this.streamKey = document.getElementById('streamKey');
        this.streamTitle = document.getElementById('streamTitle');
        this.category = document.getElementById('category');
        this.quality = document.getElementById('quality');
        this.framerate = document.getElementById('framerate');
        this.includeSystemAudio = document.getElementById('includeSystemAudio');
        this.includeMicrophone = document.getElementById('includeMicrophone');
        this.clientId = document.getElementById('clientId');

        // OAuth elements
        this.oauthSection = document.getElementById('oauthSection');
        this.authorizeBtn = document.getElementById('authorizeBtn');
        this.authStatus = document.getElementById('authStatus');
        this.updateStreamInfo = document.getElementById('updateStreamInfo');

        // Capture elements
        this.selectScreen = document.getElementById('selectScreen');
        this.selectedSource = document.getElementById('selectedSource');
        this.changeSource = document.getElementById('changeSource');
        this.preview = document.getElementById('preview');
        this.previewOverlay = document.querySelector('.preview-overlay');

        // Control elements
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.testConnection = document.getElementById('testConnection');
        this.startStream = document.getElementById('startStream');
        this.stopStream = document.getElementById('stopStream');

        // Stats elements
        this.statsPanel = document.getElementById('statsPanel');
        this.streamDuration = document.getElementById('streamDuration');
        this.streamBitrate = document.getElementById('streamBitrate');
        this.framesDropped = document.getElementById('framesDropped');

        // Other elements
        this.downloadBtn = document.getElementById('downloadBtn');
        this.toast = document.getElementById('toast');
    }

    bindFormEvents() {
        this.streamKey.addEventListener('input', () => this.onFormChange());
        this.streamTitle.addEventListener('input', () => this.onFormChange());
        this.clientId.addEventListener('input', () => this.onClientIdChange());
    }

    onFormChange() {
        if (this.onFormChangeCallback) {
            this.onFormChangeCallback();
        }
    }

    onClientIdChange() {
        const clientId = this.clientId.value.trim();
        if (clientId.length > 0) {
            this.authorizeBtn.style.display = 'block';
            this.authStatus.textContent = 'Enter Client ID and click Authorize to enable title/category changes';
            this.authStatus.className = 'auth-status';
        } else {
            this.authorizeBtn.style.display = 'none';
            this.authStatus.textContent = '';
        }
        this.onFormChange();
    }

    setAuthStatus(message, type = '') {
        this.authStatus.textContent = message;
        this.authStatus.className = `auth-status ${type}`;
    }

    setConnectionStatus(connected, streaming = false) {
        if (connected) {
            this.statusDot.classList.add('connected');
            this.statusText.textContent = streaming ? 'Streaming' : 'Connected';
            if (streaming) {
                this.statusDot.classList.add('streaming');
            }
        } else {
            this.statusDot.classList.remove('connected', 'streaming');
            this.statusText.textContent = 'Not Connected';
        }
    }

    setStreamingState(isStreaming) {
        if (isStreaming) {
            this.startStream.classList.add('hidden');
            this.stopStream.classList.remove('hidden');
            this.statsPanel.classList.remove('hidden');
        } else {
            this.startStream.classList.remove('hidden');
            this.stopStream.classList.add('hidden');
            this.statsPanel.classList.add('hidden');
        }
    }

    updateStats(duration, bitrate, framesDropped) {
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        this.streamDuration.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.streamBitrate.textContent = `${bitrate} kbps`;
        this.framesDropped.textContent = framesDropped.toString();
    }

    showToast(message, type = 'info') {
        this.toast.textContent = message;
        this.toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 4000);
    }

    validateForm(hasStreamKey, hasTitle, hasMediaSource, isConnected, isStreaming, hasAuth, hasClientId) {
        const isValid = hasStreamKey && hasTitle && hasMediaSource && isConnected;
        this.startStream.disabled = !isValid || isStreaming;
        // Allow updating stream info if we have auth, client ID, and title - streaming status doesn't matter
        this.updateStreamInfo.disabled = !hasAuth || !hasClientId || !hasTitle;
        
        console.log('Form validation:', {
            hasAuth,
            hasClientId,
            hasTitle,
            updateStreamInfoDisabled: this.updateStreamInfo.disabled
        });
    }

    setMediaSourceSelected(sourceName) {
        this.previewOverlay.style.display = 'none';
        this.selectedSource.classList.remove('hidden');
        this.selectedSource.querySelector('.source-name').textContent = sourceName;
    }

    clearMediaSource() {
        this.preview.srcObject = null;
        this.previewOverlay.style.display = 'flex';
        this.selectedSource.classList.add('hidden');
    }

    getFormData() {
        return {
            streamKey: this.streamKey.value.trim(),
            streamTitle: this.streamTitle.value.trim(),
            category: this.category.value.trim(),
            quality: this.quality.value,
            framerate: parseInt(this.framerate.value),
            includeSystemAudio: this.includeSystemAudio.checked,
            includeMicrophone: this.includeMicrophone.checked,
            clientId: this.clientId.value.trim()
        };
    }
}