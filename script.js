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

        const redirectUri = 'http://localhost:3001/oauth/callback';
        const scope = 'channel:manage:broadcast';
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
        
        // Open OAuth window
        const authWindow = window.open(authUrl, 'twitchAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');
        
        // Listen for message from popup
        const messageListener = async (event) => {
            if (event.source !== authWindow) {
                return;
            }

            if (event.data.type === 'oauth_success' && event.data.token) {
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
            } else if (event.data.type === 'oauth_error') {
                this.showToast('Authorization failed. Please try again.', 'error');
                window.removeEventListener('message', messageListener);
                if (authWindow) {
                    authWindow.close();
                }
            }
        };
        window.addEventListener('message', messageListener);

        // Handle window closed without completion
        const checkClosed = setInterval(() => {
            if (authWindow.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', messageListener);
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
                fetch('http://localhost:3001/oauth/store-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: this.oauthToken, userId: this.userId })
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
            const response = await fetch('http://localhost:3001/oauth/check-token');
            const data = await response.json();
            
            if (data.success && data.token) {
                this.oauthToken = data.token;
                this.userId = data.userId;
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
                    title: this.streamTitle.value,
                    category: this.category.value,
                    clientId: this.clientId.value,
                    oauthToken: this.oauthToken
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
                audioBitsPerSecond: 128000
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
                    title: this.streamTitle.value,
                    category: this.category.value,
                    quality: this.quality.value,
                    framerate: parseInt(this.framerate.value)
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
        try {
            const response = await fetch('http://localhost:3001/update-stream-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: this.clientId.value,
                    oauthToken: this.oauthToken,
                    userId: this.userId,
                    title: this.streamTitle.value,
                    category: this.category.value
                })
            });

            const result = await response.json();
            if (result.success) {
                this.showToast('Stream info updated successfully!', 'success');
            } else {
                this.showToast(`Failed to update stream info: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error updating stream info:', error);
            this.showToast('Error updating stream info', 'error');
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
                body: formData
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
                    "express": "^4.18.2",
                    "fluent-ffmpeg": "^2.1.2",
                    "multer": "^1.4.5-lts.1"
                },
                "devDependencies": {
                    "nodemon": "^3.0.1"
                }
            }, null, 2),

            'server.js': `const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let ffmpegProcess = null;
let oauthToken = null;
let userId = null;

// OAuth callback page - captures token from URL fragment
app.get('/oauth/callback', (req, res) => {
    res.send(\`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Twitch Authorization</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin: 0;
            }
            .container {
                background: rgba(255, 255, 255, 0.1);
                padding: 30px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
                max-width: 500px;
                margin: 0 auto;
            }
            .spinner {
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 3px solid white;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>
            function handleAuth() {
                // Check if this is the redirect with token in fragment
                const hash = window.location.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get('access_token');
                const error = params.get('error');

                if (error) {
                    console.error('OAuth error:', error);
                    if (window.opener) {
                        window.opener.postMessage({ type: 'oauth_error', error: error }, '*');
                    }
                    document.getElementById('status').innerHTML = '<h2 style="color: #ff6b6b;">Authorization failed: ' + error + '</h2><p>You can close this window.</p>';
                    return;
                }

                if (accessToken) {
                    console.log('Access token received:', accessToken);
                    
                    // Store token on server
                    fetch('/oauth/store-token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ token: accessToken })
                    }).then(response => response.json())
                      .then(data => {
                          if (data.success) {
                              // Notify parent window
                              if (window.opener) {
                                  window.opener.postMessage({ 
                                      type: 'oauth_success', 
                                      token: accessToken 
                                  }, '*');
                              }
                              document.getElementById('status').innerHTML = '<h2 style="color: #4ecdc4;">✅ Authorization Successful!</h2><p>You can close this window now.</p>';
                              setTimeout(() => window.close(), 2000);
                          } else {
                              throw new Error('Failed to store token');
                          }
                      })
                      .catch(error => {
                          console.error('Error storing token:', error);
                          document.getElementById('status').innerHTML = '<h2 style="color: #ff6b6b;">Error storing authorization</h2><p>Please try again.</p>';
                      });
                } else {
                    document.getElementById('status').innerHTML = '<h2>Waiting for authorization...</h2><p>Please complete the authorization process.</p>';
                }
            }
            
            // Run when page loads
            document.addEventListener('DOMContentLoaded', handleAuth);
        </script>
    </head>
    <body>
        <div class="container">
            <div id="status">
                <div class="spinner"></div>
                <h2>Processing Authorization...</h2>
                <p>Please wait while we complete your Twitch authorization.</p>
            </div>
        </div>
    </body>
    </html>
    \`);
});

// Store OAuth token
app.post('/oauth/store-token', (req, res) => {
    const { token } = req.body;
    if (token) {
        oauthToken = token;
        console.log('OAuth token stored successfully');
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Token required' });
    }
});

// Check for stored token
app.get('/oauth/check-token', (req, res) => {
    if (oauthToken && userId) {
        res.json({ success: true, token: oauthToken, userId: userId });
    } else if (oauthToken) {
        res.json({ success: true, token: oauthToken });
    } else {
        res.json({ success: false });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Test RTMP connection
app.post('/test-rtmp', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, error: 'Stream key is required.' });
    }

    const rtmpUrl = \`rtmp://live.twitch.tv/app/\${streamKey}\`;
    let responseSent = false;
    let testProcess;

    const sendResponse = (data) => {
        if (!responseSent) {
            responseSent = true;
            clearTimeout(timeout);
            if (testProcess) {
                try { testProcess.kill('SIGKILL'); } catch(e) { console.error('Error killing test process:', e.message); }
            }
            res.json(data);
        }
    };

    const timeout = setTimeout(() => {
        sendResponse({ success: false, error: 'Connection timeout. Check network or firewall.' });
    }, 10000);

    try {
        testProcess = ffmpeg()
            .input('testsrc=duration=5:size=128x72:rate=10')
            .inputFormat('lavfi')
            .outputOptions([
                '-t 5',
                '-f flv'
            ])
            .output(rtmpUrl)
            .on('start', (command) => console.log('RTMP test started:', command))
            .on('end', () => {
                console.log('RTMP test finished successfully.');
                sendResponse({ success: true });
            })
            .on('error', (err, stdout, stderr) => {
                if (responseSent) return;
                console.error('RTMP test failed:', err.message);
                console.error('ffmpeg stderr:', stderr);
                sendResponse({ success: false, error: 'Connection failed. Check stream key or if you are already live.' });
            });
        
        testProcess.run();
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
});

// Update stream info via Twitch API
app.post('/update-stream-info', async (req, res) => {
    const { clientId, oauthToken, userId, title, category } = req.body;
    
    if (!clientId || !oauthToken || !userId) {
        return res.status(400).json({ success: false, error: 'Missing required parameters.' });
    }

    try {
        let gameId = null;
        
        // Get game ID if category is provided
        if (category && category.trim()) {
            const gameResponse = await axios.get(\`https://api.twitch.tv/helix/games?name=\${encodeURIComponent(category.trim())}\`, {
                headers: {
                    'Authorization': \`Bearer \${oauthToken}\`,
                    'Client-Id': clientId
                }
            });
            
            if (gameResponse.data.data.length > 0) {
                gameId = gameResponse.data.data[0].id;
            } else {
                console.log(\`Game category "\${category}" not found, using Just Chatting as fallback\`);
                // Try "Just Chatting" as fallback
                const fallbackResponse = await axios.get('https://api.twitch.tv/helix/games?name=Just%20Chatting', {
                    headers: {
                        'Authorization': \`Bearer \${oauthToken}\`,
                        'Client-Id': clientId
                    }
                });
                if (fallbackResponse.data.data.length > 0) {
                    gameId = fallbackResponse.data.data[0].id;
                }
            }
        }
        
        // Update channel info
        const updateData = {};
        if (title && title.trim()) updateData.title = title.trim();
        if (gameId) updateData.game_id = gameId;
        
        if (Object.keys(updateData).length === 0) {
            return res.json({ success: true, message: 'No changes to make.' });
        }
        
        const response = await axios.patch(\`https://api.twitch.tv/helix/channels?broadcaster_id=\${userId}\`, updateData, {
            headers: {
                'Authorization': \`Bearer \${oauthToken}\`,
                'Client-Id': clientId,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Stream info updated successfully:', updateData);
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

    const { streamKey, quality = '720p', framerate = 30 } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, error: 'Stream key is required.' });
    }
    
    const rtmpUrl = \`rtmp://live.twitch.tv/app/\${streamKey}\`;
    console.log('Starting stream to:', rtmpUrl);

    // Get quality settings
    const getQualitySettings = (quality) => {
        switch(quality) {
            case '1080p':
                return { width: '1920', height: '1080', bitrate: '4500k', maxrate: '4500k', bufsize: '9000k' };
            case '720p':
                return { width: '1280', height: '720', bitrate: '2500k', maxrate: '2500k', bufsize: '5000k' };
            case '480p':
                return { width: '854', height: '480', bitrate: '1000k', maxrate: '1000k', bufsize: '2000k' };
            default:
                return { width: '1280', height: '720', bitrate: '2500k', maxrate: '2500k', bufsize: '5000k' };
        }
    };

    const settings = getQualitySettings(quality);

    try {
        // Use spawn instead of fluent-ffmpeg for better stdin control
        const ffmpegArgs = [
            '-f', 'webm',
            '-i', 'pipe:0',
            
            // Video encoding settings optimized for Twitch
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-level', '3.1',
            
            // Video quality settings
            '-b:v', settings.bitrate,
            '-maxrate', settings.maxrate,
            '-bufsize', settings.bufsize,
            '-pix_fmt', 'yuv420p',
            
            // Keyframe settings (Twitch recommends keyframes every 2 seconds)
            '-g', String(framerate * 2),
            '-keyint_min', String(framerate),
            '-sc_threshold', '0',
            
            // Video filters for scaling
            '-vf', \`scale=\${settings.width}:\${settings.height}:force_original_aspect_ratio=decrease,pad=\${settings.width}:\${settings.height}:(ow-iw)/2:(oh-ih)/2,fps=\${framerate}\`,
            
            // Audio encoding settings
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', '2',
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
        
        ffmpegProcess.stdin.on('error', (err) => {
            console.error('FFmpeg stdin error:', err.message);
        });

        ffmpegProcess.stdout.on('data', (data) => {
            console.log('FFmpeg stdout:', data.toString());
        });

        ffmpegProcess.stderr.on('data', (data) => {
            console.log('FFmpeg stderr:', data.toString());
        });

        ffmpegProcess.on('close', (code) => {
            console.log(\`FFmpeg process exited with code \${code}\`);
            ffmpegProcess = null;
        });

        ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg process error:', err.message);
            ffmpegProcess = null;
        });

        res.json({ success: true, message: 'Stream started.' });
    } catch (error) {
        console.error('Error starting FFmpeg:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Receive stream data chunk
app.post('/stream-data', upload.single('chunk'), (req, res) => {
    if (!ffmpegProcess) {
        return res.status(400).json({ success: false, error: 'Stream not started.' });
    }
    
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No data received.' });
    }

    try {
        if (ffmpegProcess.stdin && ffmpegProcess.stdin.writable && !ffmpegProcess.stdin.destroyed) {
            ffmpegProcess.stdin.write(req.file.buffer);
            res.json({ success: true });
        } else {
            console.error('FFmpeg stdin is not writable');
            res.status(500).json({ success: false, error: 'FFmpeg input stream is not writable.' });
        }
    } catch (error) {
        console.error('Error writing to FFmpeg stdin:', error.message);
        res.status(500).json({ success: false, error: 'Error writing stream data.' });
    }
});

// Stop the stream
app.post('/stop-stream', (req, res) => {
    if (ffmpegProcess) {
        console.log('Stopping FFmpeg process.');
        try {
            if (ffmpegProcess.stdin && ffmpegProcess.stdin.writable && !ffmpegProcess.stdin.destroyed) {
                ffmpegProcess.stdin.end();
            }
            ffmpegProcess.kill('SIGTERM');
            setTimeout(() => {
                if (ffmpegProcess) {
                    ffmpegProcess.kill('SIGKILL');
                }
            }, 5000);
        } catch(e) {
            console.error('Error stopping ffmpeg:', e.message);
        }
        ffmpegProcess = null;
        res.json({ success: true, message: 'Stream stopped.' });
    } else {
        res.status(400).json({ success: false, error: 'Stream is not running.' });
    }
});

app.listen(port, () => {
    console.log(\`Twitch Stream Bridge server running on port \${port}\`);
});
`,

            'README.md': `# Twitch Stream Bridge

A browser-based application that allows you to capture any browser tab/window with audio and stream it directly to Twitch via RTMP. The system consists of a web interface for configuration and a local Node.js server that handles the RTMP streaming to Twitch.

## 🚀 Features

- **Browser Tab/Screen Capture**: Capture any browser tab, application window, or entire screen
- **Audio Support**: Include system audio and/or microphone in your stream
- **Direct Twitch Integration**: Stream directly to Twitch via RTMP
- **Stream Management**: Change stream title and category through Twitch API integration
- **Real-time Preview**: See what you're streaming before going live
- **Quality Control**: Choose resolution (480p/720p/1080p) and frame rate (24/30/60 FPS)
- **Stream Statistics**: Monitor stream duration, bitrate, and performance

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

1. **Node.js** (v14 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: \\\`node --version\\\` and \\\`npm --version\\\`

2. **FFmpeg** (Required for video encoding and streaming)
   
   **Windows:**
   - Download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - Extract the files and add the \\\`bin\\\` folder to your system's PATH environment variable
   - Verify: Open Command Prompt and run \\\`ffmpeg -version\\\`
   
   **macOS:**
   - Using Homebrew: \\\`brew install ffmpeg\\\`
   - Verify: \\\`ffmpeg -version\\\`
   
   **Linux (Ubuntu/Debian):**
   - \\\`sudo apt update && sudo apt install ffmpeg\\\`
   - Verify: \\\`ffmpeg -version\\\`

### Twitch Requirements

1. **Twitch Account** with streaming enabled
2. **Twitch Stream Key**
   - Go to [Twitch Creator Dashboard](https://dashboard.twitch.tv/)
   - Navigate to Settings → Stream
   - Copy your "Primary Stream key"

3. **Twitch Developer Application** (Optional - for title/category changes)
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
   - Click "Register Your Application"
   - Application Name: \\\`Your App Name\\\` (e.g., "My Browser Streamer")
   - OAuth Redirect URLs: \\\`http://localhost:3001/oauth/callback\\\`
   - Category: "Application Integration"
   - Copy the **Client ID** after creation

## 🛠️ Installation

1. **Extract the Project**
   Extract the downloaded ZIP file to your desired location

2. **Install Dependencies**
   Open terminal/command prompt in the project folder and run:
   \\\`\\\`\\\`
   npm install
   \\\`\\\`\\\`

3. **Start the Server**
   \\\`\\\`\\\`
   npm start
   \\\`\\\`\\\`

4. **Open the Web Interface**
   Open your browser and go to the HTML file or serve it locally

## 🎮 Usage

### Basic Setup

1. **Configure Stream Settings**
   - Enter your Twitch Stream Key
   - Set your preferred stream title
   - Choose quality and frame rate settings

2. **Select Screen/Tab to Capture**
   - Click "Select Screen/Tab" button
   - Choose what you want to stream from the browser picker
   - Configure audio options (system audio, microphone, or both)

3. **Test Connection**
   - Click "Test Connection" to verify your stream key works
   - Wait for confirmation

4. **Start Streaming**
   - Click "Start Stream" to begin broadcasting
   - Monitor stream statistics in real-time
   - Click "Stop Stream" when finished

### Advanced Features

#### Stream Title & Category Management

1. **Get Twitch Client ID**
   - Create a Twitch Developer Application
   - Copy your Client ID

2. **Authorize Application**
   - Enter your Client ID in the web interface
   - Click "Authorize with Twitch"
   - Complete the OAuth flow in the popup window

3. **Update Stream Info**
   - Once authorized, you can change stream title and category
   - Changes will be applied when you start streaming

## 🔧 Configuration

### Quality Settings

- **1080p**: Best quality, requires strong internet connection (4.5 Mbps upload)
- **720p**: Good balance of quality and performance (2.5 Mbps upload)
- **480p**: Lower quality, suitable for slower connections (1 Mbps upload)

### Frame Rate Options

- **60 FPS**: Smooth motion, best for gaming content
- **30 FPS**: Standard streaming frame rate
- **24 FPS**: Cinematic frame rate

### Audio Configuration

- **System Audio**: Captures all sounds from your computer
- **Microphone**: Captures audio from your microphone
- **Both**: Mixes system audio and microphone (recommended for commentary)

## 🐛 Troubleshooting

### Common Issues

1. **"FFmpeg not found" error**
   - Ensure FFmpeg is installed and added to your system PATH
   - Restart your terminal/command prompt after installation

2. **Stream connection fails**
   - Verify your stream key is correct
   - Check if you're already streaming on Twitch
   - Ensure your internet connection is stable

3. **Audio not working**
   - Grant browser permissions for microphone access
   - Check system audio settings
   - Try refreshing the page and reselecting your screen

4. **Poor stream quality**
   - Lower the quality setting (720p → 480p)
   - Reduce frame rate (60 → 30 FPS)
   - Check your internet upload speed

5. **OAuth authorization fails**
   - Ensure your Twitch Client ID is correct
   - Make sure the OAuth redirect URL matches exactly
   - Try clearing browser cache and cookies

### Performance Tips

- Close unnecessary applications to free up system resources
- Use a wired internet connection for better stability
- Monitor CPU usage - if high, lower quality settings
- Ensure adequate upload bandwidth for your chosen quality

## 📝 Technical Details

### System Requirements

- **OS**: Windows 10+, macOS 10.14+, or Linux
- **RAM**: 4GB minimum, 8GB recommended
- **CPU**: Multi-core processor recommended
- **Internet**: Upload speed matching your quality setting
- **Browser**: Chrome, Firefox, or Edge (supports screen capture API)

### Network Requirements

- **480p**: 1+ Mbps upload
- **720p**: 2.5+ Mbps upload  
- **1080p**: 4.5+ Mbps upload

### Supported Formats

- **Video**: WebM (VP8/VP9), converted to H.264 for Twitch
- **Audio**: Opus, converted to AAC for Twitch
- **Output**: FLV stream via RTMP to Twitch servers

## 🤝 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify all prerequisites are installed correctly
3. Check the browser console for error messages
4. Ensure the Node.js server is running without errors

## 📄 License

This project is provided as-is for educational and personal use.

## 🔗 Useful Links

- [Twitch Creator Dashboard](https://dashboard.twitch.tv/)
- [Twitch Developer Console](https://dev.twitch.tv/console/apps)
- [FFmpeg Download](https://ffmpeg.org/download.html)
- [Node.js Download](https://nodejs.org/)
- [OBS Studio](https://obsproject.com/) - Alternative streaming software
        };
    }

    /* ...existing code... */
}