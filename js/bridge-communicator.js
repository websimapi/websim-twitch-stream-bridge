class BridgeCommunicator {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isConnected = false;
    }

    async checkConnection() {
        try {
            const response = await fetch('http://localhost:3001/health');
            this.isConnected = response.ok;
            return this.isConnected;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    }

    async testConnection(formData) {
        try {
            const response = await fetch('http://localhost:3001/test-rtmp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamKey: formData.streamKey,
                    title: formData.streamTitle,
                    category: formData.category,
                    clientId: formData.clientId,
                    username: formData.username,
                    quality: formData.quality,
                    framerate: formData.framerate
                })
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            return false;
        }
    }

    async startStream(formData) {
        try {
            const response = await fetch('http://localhost:3001/start-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamKey: formData.streamKey,
                    title: formData.streamTitle,
                    category: formData.category,
                    quality: formData.quality,
                    framerate: formData.framerate
                })
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async stopStream() {
        try {
            await fetch('http://localhost:3001/stop-stream', { method: 'POST' });
            return true;
        } catch (error) {
            return false;
        }
    }

    async sendStreamData(data) {
        try {
            const formData = new FormData();
            formData.append('chunk', data);
            
            await fetch('http://localhost:3001/stream-data', {
                method: 'POST',
                body: formData
            });
        } catch (error) {
            console.error('Error sending data to bridge:', error);
        }
    }

    async storeOAuthToken(token, userId) {
        try {
            const response = await fetch('http://localhost:3001/oauth/store-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, userId })
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getOAuthToken() {
        try {
            const response = await fetch('http://localhost:3001/oauth/token');
            return await response.json();
        } catch (error) {
            return { success: false };
        }
    }

    async updateStreamInfo(data) {
        try {
            const response = await fetch('http://localhost:3001/update-stream-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            return false;
        }
    }

    getConnectionStatus() {
        return this.isConnected;
    }

    setConnectionStatus(status) {
        this.isConnected = status;
    }
}