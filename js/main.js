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

    validateForm() {
        const formData = this.uiManager.getFormData();
        const hasStreamKey = formData.streamKey.length > 0;
        const hasTitle = formData.streamTitle.length > 0;
        const hasMediaSource = this.mediaCapture.hasMediaSource();
        const isConnected = this.bridgeCommunicator.getConnectionStatus();
        const isStreaming = this.streamManager.isCurrentlyStreaming();
        
        this.uiManager.validateForm(hasStreamKey, hasTitle, hasMediaSource, isConnected, isStreaming);
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