class StreamManager {
    constructor(uiManager, bridgeCommunicator) {
        this.uiManager = uiManager;
        this.bridgeCommunicator = bridgeCommunicator;
        this.mediaRecorder = null;
        this.isStreaming = false;
        this.streamStartTime = null;
        this.statsInterval = null;
    }

    async startStreaming(mediaStream, oauthData) {
        if (!mediaStream) {
            this.uiManager.showToast('No media source selected', 'error');
            return false;
        }

        try {
            const formData = this.uiManager.getFormData();

            // Update stream info if we have OAuth token
            if (oauthData.token && formData.clientId) {
                await this.updateStreamInfo(formData, oauthData);
            }

            // Configure MediaRecorder
            const options = {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: this.getVideoBitrate(formData.quality),
                audioBitsPerSecond: 128000
            };

            this.mediaRecorder = new MediaRecorder(mediaStream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.bridgeCommunicator.sendStreamData(event.data);
                }
            };

            this.mediaRecorder.start(1000);

            const success = await this.bridgeCommunicator.startStream(formData);
            if (!success) {
                throw new Error('Failed to start RTMP stream');
            }

            this.isStreaming = true;
            this.streamStartTime = Date.now();
            
            this.uiManager.setStreamingState(true);
            this.uiManager.setConnectionStatus(true, true);
            this.startStatsUpdates();
            this.uiManager.showToast('Stream started successfully!', 'success');

            return true;

        } catch (error) {
            console.error('Error starting stream:', error);
            this.uiManager.showToast('Failed to start stream', 'error');
            return false;
        }
    }

    async stopStreaming() {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }

            await this.bridgeCommunicator.stopStream();

            this.isStreaming = false;
            this.streamStartTime = null;
            
            this.uiManager.setStreamingState(false);
            this.uiManager.setConnectionStatus(true, false);
            this.stopStatsUpdates();
            this.uiManager.showToast('Stream stopped', 'success');

        } catch (error) {
            console.error('Error stopping stream:', error);
            this.uiManager.showToast('Error stopping stream', 'error');
        }
    }

    async updateStreamInfo(formData, oauthData) {
        try {
            const success = await this.bridgeCommunicator.updateStreamInfo({
                clientId: formData.clientId,
                oauthToken: oauthData.token,
                username: formData.username,
                title: formData.streamTitle,
                category: formData.category
            });

            return success;
        } catch (error) {
            console.error('Error updating stream info:', error);
            return false;
        }
    }

    getVideoBitrate(quality) {
        const bitrateMap = {
            '1080p': 6000000,
            '720p': 3000000,
            '480p': 1500000
        };
        return bitrateMap[quality] || 3000000;
    }

    startStatsUpdates() {
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 1000);
    }

    stopStatsUpdates() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    updateStats() {
        if (!this.streamStartTime) return;

        const duration = Date.now() - this.streamStartTime;
        const formData = this.uiManager.getFormData();
        const bitrate = (this.getVideoBitrate(formData.quality) / 1000).toFixed(0);
        
        this.uiManager.updateStats(duration, bitrate, 0);
    }

    isCurrentlyStreaming() {
        return this.isStreaming;
    }
}