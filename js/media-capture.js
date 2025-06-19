class MediaCapture {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.mediaStream = null;
    }

    async selectMediaSource() {
        try {
            const formData = this.uiManager.getFormData();
            
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: formData.framerate }
                },
                audio: formData.includeSystemAudio
            });

            if (formData.includeMicrophone) {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const audioContext = new AudioContext();
                    const destination = audioContext.createMediaStreamDestination();
                    
                    if (stream.getAudioTracks().length > 0) {
                        const systemSource = audioContext.createMediaStreamSource(stream);
                        systemSource.connect(destination);
                    }
                    
                    const micSource = audioContext.createMediaStreamSource(micStream);
                    micSource.connect(destination);
                    
                    stream.getAudioTracks().forEach(track => stream.removeTrack(track));
                    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
                } catch (error) {
                    this.uiManager.showToast('Could not access microphone', 'error');
                }
            }

            this.mediaStream = stream;
            this.uiManager.preview.srcObject = stream;
            this.uiManager.preview.play();
            this.uiManager.setMediaSourceSelected('Screen/Tab Selected');

            stream.getVideoTracks()[0].addEventListener('ended', () => {
                this.clearMediaSource();
            });

            return stream;

        } catch (error) {
            console.error('Error selecting media source:', error);
            this.uiManager.showToast('Failed to select screen/tab', 'error');
            return null;
        }
    }

    clearMediaSource() {
        this.mediaStream = null;
        this.uiManager.clearMediaSource();
    }

    getMediaStream() {
        return this.mediaStream;
    }

    hasMediaSource() {
        return this.mediaStream !== null;
    }
}

