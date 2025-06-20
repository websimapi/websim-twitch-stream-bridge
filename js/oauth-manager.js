class OAuthManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.oauthToken = null;
        this.userId = null;
        this.bridgeCommunicator = null;
        this.oauthIframe = document.getElementById('oauthIframe');
        this.tokenDisplay = document.getElementById('tokenDisplay');
        this.tokenField = document.getElementById('tokenField');
    }

    setBridgeCommunicator(bridgeCommunicator) {
        this.bridgeCommunicator = bridgeCommunicator;
    }

    async initiateOAuth(clientId) {
        if (!clientId) {
            this.uiManager.showToast('Please enter a Client ID first', 'error');
            return;
        }

        const redirectUri = 'http://localhost';
        const scope = encodeURIComponent('channel:manage:broadcast');
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
        
        // Show iframe and load OAuth URL
        this.oauthIframe.style.display = 'block';
        this.oauthIframe.src = authUrl;
        
        // Monitor iframe for URL changes
        const checkIframeUrl = setInterval(() => {
            try {
                const iframeUrl = this.oauthIframe.contentWindow.location.href;
                if (iframeUrl.startsWith('http://localhost/#access_token=')) {
                    const urlHash = iframeUrl.split('#')[1];
                    const params = new URLSearchParams(urlHash);
                    const accessToken = params.get('access_token');
                    
                    if (accessToken) {
                        this.oauthToken = accessToken;
                        this.displayToken(accessToken);
                        this.fetchTwitchUserId(clientId);
                        
                        this.uiManager.setAuthStatus('Successfully authorized! You can now change stream title and category.', 'success');
                        this.uiManager.authorizeBtn.textContent = 'Re-authorize';
                        
                        // Hide iframe after successful auth
                        this.oauthIframe.style.display = 'none';
                        clearInterval(checkIframeUrl);
                    }
                }
            } catch (error) {
                // Cross-origin errors are expected until redirect
            }
        }, 1000);
        
        // Clear interval after 5 minutes to prevent memory leaks
        setTimeout(() => {
            clearInterval(checkIframeUrl);
        }, 300000);
    }

    displayToken(token) {
        // Mask the token for display
        const maskedToken = token.substring(0, 8) + '*'.repeat(token.length - 16) + token.substring(token.length - 8);
        this.tokenField.value = maskedToken;
        this.tokenDisplay.style.display = 'block';
    }

    async fetchTwitchUserId(clientId) {
        if (!this.oauthToken || !clientId) return;
        
        try {
            const response = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${this.oauthToken}`,
                    'Client-ID': clientId
                }
            });
            const data = await response.json();
            
            if (data.data && data.data.length > 0) {
                this.userId = data.data[0].id;
                if (this.bridgeCommunicator) {
                    await this.bridgeCommunicator.storeOAuthToken(this.oauthToken, this.userId);
                }
            } else {
                this.uiManager.showToast('Could not fetch Twitch User ID.', 'error');
            }
        } catch(e) {
            console.error('Error fetching Twitch User ID:', e);
            this.uiManager.showToast('Error fetching Twitch User ID.', 'error');
        }
    }

    async checkOAuthCompletion() {
        if (!this.bridgeCommunicator) return;
        
        try {
            const data = await this.bridgeCommunicator.getOAuthToken();
            
            if (data.success && data.token) {
                this.oauthToken = data.token;
                this.userId = data.userId;
                this.uiManager.setAuthStatus('Successfully authorized! You can now change stream title and category.', 'success');
                this.uiManager.authorizeBtn.textContent = 'Re-authorize';
            }
        } catch (error) {
            console.error('Error checking OAuth completion:', error);
        }
    }

    getAuthData() {
        return {
            token: this.oauthToken,
            userId: this.userId
        };
    }

    hasValidAuth() {
        return !!(this.oauthToken && this.userId);
    }
}