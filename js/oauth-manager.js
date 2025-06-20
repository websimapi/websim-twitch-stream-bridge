class OAuthManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.oauthToken = null;
        this.userId = null;
        this.bridgeCommunicator = null;
    }

    setBridgeCommunicator(bridgeCommunicator) {
        this.bridgeCommunicator = bridgeCommunicator;
    }

    async initiateOAuth(clientId) {
        if (!clientId) {
            this.uiManager.showToast('Please enter a Client ID first', 'error');
            return;
        }

        const redirectUri = `http://localhost:3001`;
        const scope = 'channel:manage:broadcast';
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
        
        const authWindow = window.open(authUrl, 'twitchAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');
        
        // Start polling for OAuth completion
        this.startOAuthPolling(clientId);
        
        const messageListener = async (event) => {
            if (event.source !== authWindow) {
                return;
            }

            if (event.data.type === 'oauth_token' && event.data.token) {
                this.oauthToken = event.data.token;
                await this.fetchTwitchUserId(clientId);
                
                this.uiManager.setAuthStatus('Successfully authorized! You can now change stream title and category.', 'success');
                this.uiManager.authorizeBtn.textContent = 'Re-authorize';
                
                window.removeEventListener('message', messageListener);
                if (authWindow) {
                    authWindow.close();
                }
            }
        };
        window.addEventListener('message', messageListener);

        const checkAuth = setInterval(() => {
            try {
                if (authWindow && authWindow.closed) {
                    clearInterval(checkAuth);
                    window.removeEventListener('message', messageListener);
                }
            } catch (error) {
                // Handle cross-origin issues
            }
        }, 1000);
    }

    startOAuthPolling(clientId) {
        // Poll every 2 seconds for OAuth completion
        const pollInterval = setInterval(async () => {
            try {
                const data = await this.bridgeCommunicator.getOAuthToken();
                
                if (data.success && data.token) {
                    clearInterval(pollInterval);
                    this.oauthToken = data.token;
                    this.userId = data.userId;
                    this.uiManager.setAuthStatus('Successfully authorized! You can now change stream title and category.', 'success');
                    this.uiManager.authorizeBtn.textContent = 'Re-authorize';
                    
                    // Trigger form validation to enable the Update Stream Info button
                    if (this.uiManager.onFormChangeCallback) {
                        this.uiManager.onFormChangeCallback();
                    }
                    
                    this.uiManager.showToast('OAuth token received - you can now update stream info!', 'success');
                }
            } catch (error) {
                console.error('Error polling for OAuth completion:', error);
            }
        }, 2000);
        
        // Stop polling after 5 minutes to prevent infinite polling
        setTimeout(() => {
            clearInterval(pollInterval);
        }, 300000);
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