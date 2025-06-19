class TwitchStreamBridge {
    constructor() {
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.isStreaming = false;
        this.isConnected = false;
        this.streamStartTime = null;
        this.statsInterval = null;
        this.oauthToken = null;
        this.userId = null;
        
        this.initializeElements();
        this.bindEvents();
        this.checkNodeBridgeConnection();
        this.checkOAuthToken();
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

    bindEvents() {
        this.selectScreen.addEventListener('click', () => this.selectMediaSource());
        this.changeSource.addEventListener('click', () => this.selectMediaSource());
        this.testConnection.addEventListener('click', () => this.testNodeBridgeConnection());
        this.startStream.addEventListener('click', () => this.startStreaming());
        this.stopStream.addEventListener('click', () => this.stopStreaming());
        this.downloadBtn.addEventListener('click', () => this.downloadNodeProject());

        // Form validation
        this.streamKey.addEventListener('input', () => this.validateForm());
        this.streamTitle.addEventListener('input', () => this.validateForm());
        this.clientId.addEventListener('input', () => this.handleClientIdChange());
        this.category.addEventListener('input', () => this.validateForm());
        
        // OAuth
        this.authorizeBtn.addEventListener('click', () => this.initiateOAuth());
    }

    handleClientIdChange() {
        const clientId = this.clientId.value.trim();
        if (clientId.length > 0) {
            this.authorizeBtn.style.display = 'block';
            this.authStatus.textContent = 'Enter Client ID and click Authorize to enable title/category changes';
            this.authStatus.className = 'auth-status';
        } else {
            this.authorizeBtn.style.display = 'none';
            this.authStatus.textContent = '';
        }
        this.validateForm();
    }

    initiateOAuth() {
        const clientId = this.clientId.value.trim();
        if (!clientId) {
            this.showToast('Please enter a Client ID first', 'error');
            return;
        }

        const redirectUri = 'http://localhost:3001/oauth/callback-implicit';
        const scope = encodeURIComponent('channel:manage:broadcast');
        const state = Math.random().toString(36).substring(7); // Basic CSRF protection
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&state=${state}`;
        
        // Open OAuth window
        const authWindow = window.open(authUrl, 'twitchAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');
        
        // Listen for message from popup
        const messageListener = async (event) => {
            // Basic security checks
            if (event.origin !== "http://localhost:3001") {
                return;
            }
            if (event.source !== authWindow) {
                return;
            }
            if (event.data.type !== 'oauth_token' || !event.data.token || event.data.state !== state) {
                if (event.data.state !== state) {
                    this.showToast('OAuth state mismatch. Possible CSRF attack.', 'error');
                }
                return;
            }

            this.oauthToken = event.data.token;
            await this.fetchTwitchUserId();
            
            this.authStatus.textContent = 'Successfully authorized! You can now change stream title and category.';
            this.authStatus.className = 'auth-status success';
            this.authorizeBtn.textContent = 'Re-authorize';
            this.validateForm();
            
            window.removeEventListener('message', messageListener);
            if (authWindow) {
                authWindow.close();
            }
        };
        window.addEventListener('message', messageListener);

        // Fallback check
        const checkAuth = setInterval(() => {
            try {
                if (authWindow && authWindow.closed) {
                    clearInterval(checkAuth);
                    window.removeEventListener('message', messageListener);
                    // Give a small delay for the server to process, then check
                    setTimeout(() => this.checkOAuthCompletion(), 1000);
                }
            } catch (error) {
                // Handle cross-origin issues
            }
        }, 1000);
    }

    async fetchTwitchUserId() {
        if (!this.oauthToken || !this.clientId.value.trim()) return;
        try {
            const response = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${this.oauthToken}`,
                    'Client-ID': this.clientId.value.trim()
                }
            });
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                this.userId = data.data[0].id;
                // Store on server for persistence across reloads
                await fetch('http://localhost:3001/oauth/store-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: this.oauthToken, userId: this.userId, clientId: this.clientId.value.trim() })
                });
            } else {
                 this.showToast('Could not fetch Twitch User ID.', 'error');
            }
        } catch(e) {
            console.error('Error fetching Twitch User ID:', e);
            this.showToast('Error fetching Twitch User ID.', 'error');
        }
    }

    async checkOAuthCompletion() {
        try {
            const response = await fetch('http://localhost:3001/oauth/token');
            const data = await response.json();
            
            if (data.success && data.token) {
                this.oauthToken = data.token;
                this.userId = data.userId;
                this.clientId.value = data.clientId; // Load client ID as well
                
                this.handleClientIdChange(); // Update UI based on loaded client ID
                this.authStatus.textContent = 'Successfully authorized! You can now change stream title and category.';
                this.authStatus.className = 'auth-status success';
                this.authorizeBtn.textContent = 'Re-authorize';
                this.validateForm();
            }
        } catch (error) {
            console.error('Error checking OAuth completion:', error);
        }
    }

    checkOAuthToken() {
        // Check if we have a stored OAuth token
        this.checkOAuthCompletion();
    }

    async selectMediaSource() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: parseInt(this.framerate.value) }
                },
                audio: this.includeSystemAudio.checked
            });

            // Add microphone if requested
            if (this.includeMicrophone.checked) {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const audioContext = new AudioContext();
                    const destination = audioContext.createMediaStreamDestination();
                    
                    // Mix system audio and microphone
                    if (stream.getAudioTracks().length > 0) {
                        const systemSource = audioContext.createMediaStreamSource(stream);
                        systemSource.connect(destination);
                    }
                    
                    const micSource = audioContext.createMediaStreamSource(micStream);
                    micSource.connect(destination);
                    
                    // Replace audio track
                    stream.getAudioTracks().forEach(track => stream.removeTrack(track));
                    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
                } catch (error) {
                    this.showToast('Could not access microphone', 'error');
                }
            }

            this.mediaStream = stream;
            this.preview.srcObject = stream;
            this.preview.play();

            this.previewOverlay.style.display = 'none';
            this.selectedSource.classList.remove('hidden');
            this.selectedSource.querySelector('.source-name').textContent = 'Screen/Tab Selected';

            this.validateForm();

            // Handle stream end
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                this.mediaStream = null;
                this.preview.srcObject = null;
                this.previewOverlay.style.display = 'flex';
                this.selectedSource.classList.add('hidden');
                this.validateForm();
            });

        } catch (error) {
            console.error('Error selecting media source:', error);
            this.showToast('Failed to select screen/tab', 'error');
        }
    }

    async checkNodeBridgeConnection() {
        try {
            const response = await fetch('http://localhost:3001/health');
            if (response.ok) {
                this.setConnectionStatus(true);
            } else {
                this.setConnectionStatus(false);
            }
        } catch (error) {
            this.setConnectionStatus(false);
        }
    }

    async testNodeBridgeConnection() {
        this.testConnection.disabled = true;
        this.testConnection.textContent = 'Testing...';

        try {
            const response = await fetch('http://localhost:3001/test-rtmp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamKey: this.streamKey.value,
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('Connection test successful!', 'success');
                this.setConnectionStatus(true);
            } else {
                this.showToast(`Connection failed: ${result.error}`, 'error');
                this.setConnectionStatus(false);
            }
        } catch (error) {
            this.showToast('Could not connect to Node.js bridge', 'error');
            this.setConnectionStatus(false);
        }

        this.testConnection.disabled = false;
        this.testConnection.textContent = 'Test Connection';
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.statusDot.classList.add('connected');
            this.statusText.textContent = 'Connected';
        } else {
            this.statusDot.classList.remove('connected', 'streaming');
            this.statusText.textContent = 'Not Connected';
        }
        
        this.validateForm();
    }

    validateForm() {
        const hasStreamKey = this.streamKey.value.trim().length > 0;
        const hasTitle = this.streamTitle.value.trim().length > 0;
        const hasMediaSource = this.mediaStream !== null;
        
        const isValid = hasStreamKey && hasTitle && hasMediaSource && this.isConnected;
        this.startStream.disabled = !isValid || this.isStreaming;
    }

    async startStreaming() {
        if (!this.mediaStream) {
            this.showToast('No media source selected', 'error');
            return;
        }

        try {
            // Update stream info if we have OAuth token
            if (this.oauthToken && this.clientId.value.trim()) {
                await this.updateStreamInfo();
            }

            // Configure MediaRecorder
            const options = {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: this.getVideoBitrate(),
            };

            this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.sendDataToNodeBridge(event.data);
                }
            };

            // Start recording
            this.mediaRecorder.start(1000); // Send data every second

            // Notify Node.js bridge to start RTMP stream
            const response = await fetch('http://localhost:3001/start-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamKey: this.streamKey.value,
                    quality: this.quality.value,
                    framerate: parseInt(this.framerate.value),
                    // Pass audio settings to node
                    hasAudio: this.mediaStream.getAudioTracks().length > 0,
                })
            });

            if (!response.ok) {
                throw new Error('Failed to start RTMP stream');
            }

            this.isStreaming = true;
            this.streamStartTime = Date.now();
            
            this.startStream.classList.add('hidden');
            this.stopStream.classList.remove('hidden');
            this.statsPanel.classList.remove('hidden');
            
            this.statusDot.classList.add('streaming');
            this.statusText.textContent = 'Streaming';
            
            this.startStatsUpdates();
            this.showToast('Stream started successfully!', 'success');

        } catch (error) {
            console.error('Error starting stream:', error);
            this.showToast('Failed to start stream', 'error');
        }
    }

    async updateStreamInfo() {
        // This method will now be called from startStreaming, but the actual API call is made from the server.
        // We can just ensure the data is correct here before starting.
        const title = this.streamTitle.value.trim();
        const category = this.category.value.trim();

        if (!title) {
            this.showToast('Stream title cannot be empty.', 'error');
            return;
        }

        try {
             const response = await fetch('http://localhost:3001/update-stream-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    category: category
                })
            });
            const result = await response.json();
            if (result.success) {
                this.showToast('Stream info updated on Twitch!', 'success');
            } else {
                this.showToast(`Failed to update stream info: ${result.error}`, 'error');
            }
        } catch (error) {
             console.error('Error updating stream info:', error);
             this.showToast('Error sending update request to bridge.', 'error');
        }
    }

    async stopStreaming() {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }

            // Notify Node.js bridge to stop RTMP stream
            await fetch('http://localhost:3001/stop-stream', { method: 'POST' });

            this.isStreaming = false;
            this.streamStartTime = null;
            
            this.startStream.classList.remove('hidden');
            this.stopStream.classList.add('hidden');
            this.statsPanel.classList.add('hidden');
            
            this.statusDot.classList.remove('streaming');
            this.statusText.textContent = 'Connected';
            
            this.stopStatsUpdates();
            this.showToast('Stream stopped', 'success');

        } catch (error) {
            console.error('Error stopping stream:', error);
            this.showToast('Error stopping stream', 'error');
        }
    }

    async sendDataToNodeBridge(data) {
        try {
            const formData = new FormData();
            formData.append('chunk', data);
            
            await fetch('http://localhost:3001/stream-data', {
                method: 'POST',
                body: data, // Send blob directly
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            });
        } catch (error) {
            console.error('Error sending data to bridge:', error);
            // Could implement retry logic here
        }
    }

    getVideoBitrate() {
        const quality = this.quality.value;
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
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        this.streamDuration.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Mock bitrate and frame drops for now
        this.streamBitrate.textContent = `${(this.getVideoBitrate() / 1000).toFixed(0)} kbps`;
        this.framesDropped.textContent = '0';
    }

    downloadNodeProject() {
        // Create the Node.js project files
        const files = this.createNodeProjectFiles();
        
        // Create ZIP
        const JSZip = window.JSZip || this.loadJSZip();
        const zip = new JSZip();
        
        for (const [filename, content] of Object.entries(files)) {
            zip.file(filename, content);
        }
        
        zip.generateAsync({ type: 'blob' }).then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'twitch-stream-bridge.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    loadJSZip() {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(script);
        return new Promise(resolve => {
            script.onload = () => resolve(window.JSZip);
        });
    }

    createNodeProjectFiles() {
        return {
            'package.json': JSON.stringify({
                "name": "twitch-stream-bridge",
                "version": "1.0.0",
                "description": "Local bridge for streaming browser content to Twitch",
                "main": "server.js",
                "scripts": {
                    "start": "node server.js"
                },
                "dependencies": {
                    "axios": "^1.6.0",
                    "cors": "^2.8.5",
                    "express": "^4.18.2"
                },
                "devDependencies": {
                    "nodemon": "^3.0.1"
                }
            }, null, 2),

            'server.js': `const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const axios = require('axios');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());
// Use a raw body parser for the stream data
app.use('/stream-data', express.raw({ type: 'application/octet-stream', limit: '100mb' }));

let ffmpegProcess = null;
let twitchAuth = {
    token: null,
    userId: null,
    clientId: null
};

// This is the page Twitch redirects to. It will send the token to the main app window.
app.get('/oauth/callback-implicit', (req, res) => {
    res.send(\`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Twitch Authorization</title>
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');
                const state = params.get('state');

                if (window.opener && accessToken) {
                    // Send message to parent window with the token and state for verification
                    window.opener.postMessage({ type: 'oauth_token', token: accessToken, state: state }, 'http://localhost');
                } else {
                    document.body.innerHTML = '<h2>Authorization successful! You can now close this window.</h2>';
                }
            });
        </script>
    </head>
    <body>
        <h2>Processing authorization... Please wait.</h2>
    </body>
    </html>
    \`);
});

// Endpoint to store token, userID, and clientID for persistence
app.post('/oauth/store-token', (req, res) => {
    const { token, userId, clientId } = req.body;
    if (token && userId && clientId) {
        twitchAuth = { token, userId, clientId };
        console.log('Stored Twitch Auth details.');
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Token, UserID, and ClientID are required.' });
    }
});

// Endpoint for the main app to check for a stored token on startup
app.get('/oauth/token', (req, res) => {
    if (twitchAuth.token && twitchAuth.userId && twitchAuth.clientId) {
        res.json({ success: true, ...twitchAuth });
    } else {
        res.json({ success: false });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Test RTMP connection by trying to stream a 2-second test pattern
app.post('/test-rtmp', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, error: 'Stream key is required.' });
    }

    const rtmpUrl = \`rtmp://live.twitch.tv/app/\${streamKey}\`;
    const ffmpegArgs = [
        '-f', 'lavfi',
        '-i', 'testsrc=duration=2:size=128x72:rate=10',
        '-t', '2',
        '-f', 'flv',
        rtmpUrl
    ];

    console.log('RTMP test started:', 'ffmpeg', ffmpegArgs.join(' '));
    const testProcess = spawn('ffmpeg', ffmpegArgs);
    let responseSent = false;
    let ffmpegOutput = '';

    const sendResponse = (data) => {
        if (!responseSent) {
            responseSent = true;
            try { testProcess.kill('SIGKILL'); } catch(e) {}
            res.json(data);
        }
    };
    
    testProcess.stderr.on('data', (data) => {
        ffmpegOutput += data.toString();
    });

    testProcess.on('close', (code) => {
        if (code === 0) {
            console.log('RTMP test finished successfully.');
            sendResponse({ success: true });
        } else {
            console.error(\`RTMP test failed with code \${code}. FFmpeg output:\\n\${ffmpegOutput}\`);
            sendResponse({ success: false, error: 'Connection failed. Check stream key or if you are already live.' });
        }
    });

    testProcess.on('error', (err) => {
        console.error('RTMP test process error:', err.message);
        sendResponse({ success: false, error: 'FFmpeg process error. Is ffmpeg installed and in your PATH?' });
    });

    setTimeout(() => {
        if (!responseSent) {
            sendResponse({ success: false, error: 'Connection timeout. Check network or firewall.' });
        }
    }, 10000); // 10-second timeout for the test
});

// Update stream info via Twitch API
app.post('/update-stream-info', async (req, res) => {
    const { title, category } = req.body;
    const { token, userId, clientId } = twitchAuth;
    
    if (!token || !userId || !clientId) {
        return res.status(400).json({ success: false, error: 'Not authorized with Twitch. Cannot update info.' });
    }

    try {
        let gameId = null;
        if (category) {
            const gameResponse = await axios.get(\`https://api.twitch.tv/helix/games?name=\${encodeURIComponent(category)}\`, {
                headers: { 'Authorization': \`Bearer \${token}\`, 'Client-Id': clientId }
            });
            if (gameResponse.data.data.length > 0) {
                gameId = gameResponse.data.data[0].id;
            } else {
                 console.warn(\`Could not find game ID for category: \${category}\`);
            }
        }
        
        const updateData = {};
        if (title) updateData.title = title;
        if (gameId) updateData.game_id = gameId;
        else if(category) { // If category was provided but not found, don't try to set it
             // Twitch API requires a valid game_id. We can't set it to null or an empty string.
             // You might want to update the title only in this case.
        }
        
        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true, message: 'No information to update.' });
        }
        
        await axios.patch(\`https://api.twitch.tv/helix/channels?broadcaster_id=\${userId}\`, updateData, {
            headers: {
                'Authorization': \`Bearer \${token}\`,
                'Client-Id': clientId,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({ success: true, message: 'Stream info updated successfully.' });
    } catch (error) {
        console.error('Error updating stream info:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.message || error.message 
        });
    }
});

// Start the main stream
app.post('/start-stream', (req, res) => {
    if (ffmpegProcess) {
        return res.status(400).json({ success: false, error: 'Stream is already running.' });
    }

    const { streamKey, quality = '720p', framerate = 30, hasAudio } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, error: 'Stream key is required.' });
    }
    
    const rtmpUrl = \`rtmp://live.twitch.tv/app/\${streamKey}\`;
    console.log('Starting stream to:', rtmpUrl);

    const getQualitySettings = (q) => ({
        '1080p': { bitrate: '4500k', maxrate: '6000k', bufsize: '9000k' },
        '720p': { bitrate: '3000k', maxrate: '3500k', bufsize: '6000k' },
        '480p': { bitrate: '1500k', maxrate: '2000k', bufsize: '3000k' },
    }[q] || { bitrate: '3000k', maxrate: '3500k', bufsize: '6000k' });

    const settings = getQualitySettings(quality);

    const ffmpegArgs = [
        // Input from stdin
        '-f', 'webm',
        '-i', 'pipe:0',
        
        // Video Codec
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-b:v', settings.bitrate,
        '-maxrate', settings.maxrate,
        '-bufsize', settings.bufsize,
        '-g', String(framerate * 2), // Keyframe interval
        '-keyint_min', String(framerate),
        '-sc_threshold', '0',
        
        // Video filters for scaling
        '-vf', \`scale=\${settings.width}:\${settings.height}:force_original_aspect_ratio=decrease,pad=\${settings.width}:\${settings.height}:(ow-iw)/2:(oh-ih)/2,fps=\${framerate}\`,
        
        // Audio Codec
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '44100',
        '-aac_coder', 'twoloop',
        
        // Threading and performance
        '-threads', '0',
        '-thread_type', 'slice',
        
        // Output format
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        
        rtmpUrl
    ];

    console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    
    ffmpegProcess.stderr.on('data', (data) => console.log('FFmpeg stderr:', data.toString()));
    ffmpegProcess.on('close', (code) => {
        console.log(\`FFmpeg process exited with code \${code}\`);
        ffmpegProcess = null;
    });
    ffmpegProcess.on('error', (err) => {
        console.error('Failed to start FFmpeg process:', err);
        ffmpegProcess = null;
    });

    res.json({ success: true, message: 'Stream started.' });
});

// Receive stream data chunk
app.post('/stream-data', (req, res) => {
    if (ffmpegProcess && ffmpegProcess.stdin && !ffmpegProcess.stdin.writableEnded) {
        ffmpegProcess.stdin.write(req.body, (err) => {
            if (err) {
                console.error('Error writing to FFmpeg stdin:', err.message);
            }
        });
        res.sendStatus(200);
    } else {
        res.status(400).json({ success: false, error: 'Stream not running or stdin not writable.' });
    }
});

// Stop the stream
app.post('/stop-stream', (req, res) => {
    if (ffmpegProcess) {
        console.log('Stopping FFmpeg process.');
        if (ffmpegProcess.stdin && !ffmpegProcess.stdin.writableEnded) {
            ffmpegProcess.stdin.end();
        }
        // Give it a moment to end gracefully before killing
        setTimeout(() => {
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
            }
        }, 1000);
        ffmpegProcess = null;
        res.json({ success: true, message: 'Stream stopped.' });
    } else {
        res.status(400).json({ success: false, error: 'Stream is not running.' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(\`Twitch Stream Bridge server running at http://localhost:\${port}\`);
});
`,

            'README.md': `# Twitch Stream Bridge

A local Node.js server that acts as a bridge between the browser-based stream capture and Twitch's RTMP servers.

## Prerequisites

-   **Node.js**: Version 16 or higher recommended.
-   **FFmpeg**: Must be installed on your system and available in your system's PATH.

## 1. FFmpeg Installation

FFmpeg is required for encoding the stream. You must install it and ensure it's in your system's PATH. You can test this by opening a terminal/command prompt and running \`ffmpeg -version\`.

-   **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html). Extract the files and add the \`bin\` folder to your system's PATH environment variable.
-   **macOS (using Homebrew)**: \`brew install ffmpeg\`
-   **Linux (Ubuntu/Debian)**: \`sudo apt update && sudo apt install ffmpeg\`

## 2. Server Setup

1.  Extract the downloaded \`.zip\` folder to a location on your computer.
2.  Open a terminal or command prompt and navigate into the extracted folder.
3.  Run the following command to install the necessary dependencies:
    \`\`\`bash
    npm install
    \`\`\`
4.  Once installation is complete, start the server:
    \`\`\`bash
    npm start
    \`\`\`
5.  The server will now be running at \`http://localhost:3001\`. Keep this terminal window open while you are streaming.

## 3. Twitch Application Setup (for Title/Category Control)

To enable changing the stream title and category directly from the web interface, you must register a Twitch Application.

1.  Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and log in.
2.  Click **"Register Your Application"**.
3.  Fill out the form:
    -   **Name**: Give your application a unique name (e.g., "My Browser Streamer").
    -   **OAuth Redirect URLs**: This is the most important step. Add the following URL *exactly* as it appears here:
        -   \`http://localhost:3001/oauth/callback-implicit\`
    -   **Category**: Choose "Application Integration".
4.  Click **"Create"**.
5.  On the application's page, you will see a **Client ID**. Copy this value. You will need it for the web interface.

## 4. Streaming

1.  With the Node.js server running, open the \`index.html\` file in your web browser.
2.  **Fill in the Stream Configuration:**
    -   **Twitch Stream Key**: Paste your stream key from your Twitch Creator Dashboard.
    -   **Twitch Client ID**: Paste the Client ID you copied from the Twitch Developer Console in the previous step.
    -   Click **"Authorize with Twitch"** and approve the connection in the popup window.
    -   Enter your desired **Stream Title** and **Category**.
    -   Select your preferred quality and frame rate.
3.  **Select a Source:**
    -   Click **"Select Screen/Tab"** and choose the window, tab, or screen you wish to stream. A preview will appear.
4.  **Go Live:**
    -   The **"Start Stream"** button will become active once all fields are filled, a source is selected, and the bridge is connected. Click it to begin streaming to Twitch.

## Troubleshooting

-   **"Could not connect to Node.js bridge"**: Ensure the Node.js server is running (the \`npm start\` command is active in your terminal) and not blocked by a firewall.
-   **Connection Test Fails**: Double-check that your Twitch Stream Key is correct. Also, ensure you are not already streaming to Twitch from another application (like OBS).
-   **Authorization Fails**: Verify that the **OAuth Redirect URL** in your Twitch Application settings is *exactly* \`http://localhost:3001/oauth/callback-implicit\`. Any small difference will cause an error.
-   **FFmpeg errors in the server console**: Make sure FFmpeg is installed correctly and that its location is in your system's PATH.
`
        };
    }

    showToast(message, type = 'info') {
        this.toast.textContent = message;
        this.toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 4000);
    }
}

// Load JSZip library
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
document.head.appendChild(script);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new TwitchStreamBridge();
});