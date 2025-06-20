// Refactored main application class - now much smaller and focused on coordination
class TwitchStreamBridge {
    constructor() {
        this.initializeManagers();
        this.bindEvents();
        this.checkInitialConnection();
    }

    initializeManagers() {
        this.uiManager = new UIManager();
        this.bridgeCommunicator = new BridgeCommunicator(this.uiManager);
        this.oauthManager = new OAuthManager(this.uiManager);
        this.mediaCapture = new MediaCapture(this.uiManager);
        this.streamManager = new StreamManager(this.uiManager, this.bridgeCommunicator);
        this.projectGenerator = new ProjectGenerator();

        // Set up cross-references
        this.oauthManager.setBridgeCommunicator(this.bridgeCommunicator);
        this.uiManager.onFormChangeCallback = () => this.validateForm();
    }

    bindEvents() {
        this.uiManager.selectScreen.addEventListener('click', () => this.handleSelectScreen());
        this.uiManager.changeSource.addEventListener('click', () => this.handleSelectScreen());
        this.uiManager.testConnection.addEventListener('click', () => this.handleTestConnection());
        this.uiManager.startStream.addEventListener('click', () => this.handleStartStream());
        this.uiManager.stopStream.addEventListener('click', () => this.handleStopStream());
        this.uiManager.downloadBtn.addEventListener('click', () => this.handleDownload());
        this.uiManager.authorizeBtn.addEventListener('click', () => this.handleAuthorize());
        this.uiManager.updateStreamInfo.addEventListener('click', () => this.handleUpdateStreamInfo());
    }

    async checkInitialConnection() {
        const connected = await this.bridgeCommunicator.checkConnection();
        this.uiManager.setConnectionStatus(connected);
        this.bridgeCommunicator.setConnectionStatus(connected);
        await this.oauthManager.checkOAuthCompletion();
        this.validateForm();
    }

    async handleSelectScreen() {
        await this.mediaCapture.selectMediaSource();
        this.validateForm();
    }

    async handleTestConnection() {
        this.uiManager.testConnection.disabled = true;
        this.uiManager.testConnection.textContent = 'Testing...';

        const formData = this.uiManager.getFormData();
        const success = await this.bridgeCommunicator.testConnection(formData);
        
        if (success) {
            this.uiManager.showToast('Connection test successful!', 'success');
            this.uiManager.setConnectionStatus(true);
            this.bridgeCommunicator.setConnectionStatus(true);
        } else {
            this.uiManager.showToast('Connection failed. Check stream key and network.', 'error');
            this.uiManager.setConnectionStatus(false);
            this.bridgeCommunicator.setConnectionStatus(false);
        }

        this.uiManager.testConnection.disabled = false;
        this.uiManager.testConnection.textContent = 'Test Connection';
        this.validateForm();
    }

    async handleStartStream() {
        const mediaStream = this.mediaCapture.getMediaStream();
        const oauthData = this.oauthManager.getAuthData();
        await this.streamManager.startStreaming(mediaStream, oauthData);
        this.validateForm();
    }

    async handleStopStream() {
        await this.streamManager.stopStreaming();
        this.validateForm();
    }

    async handleDownload() {
        await this.projectGenerator.downloadProject();
    }

    async handleAuthorize() {
        const formData = this.uiManager.getFormData();
        await this.oauthManager.initiateOAuth(formData.clientId);
        this.validateForm();
    }

    async handleUpdateStreamInfo() {
        const formData = this.uiManager.getFormData();
        const oauthData = this.oauthManager.getAuthData();
        
        if (!oauthData.token || !formData.clientId) {
            this.uiManager.showToast('Please authorize with Twitch first', 'error');
            return;
        }

        this.uiManager.updateStreamInfo.disabled = true;
        this.uiManager.updateStreamInfo.textContent = 'Updating...';

        const success = await this.streamManager.updateStreamInfo(formData, oauthData);
        
        this.uiManager.updateStreamInfo.disabled = false;
        this.uiManager.updateStreamInfo.textContent = 'Update Stream Info';
        
        if (success) {
            this.uiManager.showToast('Stream info updated successfully!', 'success');
        } else {
            this.uiManager.showToast('Failed to update stream info', 'error');
        }
    }

    validateForm() {
        const formData = this.uiManager.getFormData();
        const hasStreamKey = formData.streamKey.length > 0;
        const hasTitle = formData.streamTitle.length > 0;
        const hasUserId = formData.userId.length > 0;
        const hasMediaSource = this.mediaCapture.hasMediaSource();
        const isConnected = this.bridgeCommunicator.getConnectionStatus();
        const isStreaming = this.streamManager.isCurrentlyStreaming();
        const hasAuth = this.oauthManager.hasValidAuth();
        const hasClientId = formData.clientId.length > 0;
        
        this.uiManager.validateForm(hasStreamKey, hasTitle, hasMediaSource, isConnected, isStreaming, hasAuth, hasClientId);
    }
}

// Load JSZip library for project generation
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
document.head.appendChild(script);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new TwitchStreamBridge();
});