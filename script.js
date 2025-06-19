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

        const redirectUri = encodeURIComponent('http://localhost:3001/oauth/callback');
        const scope = encodeURIComponent('channel:manage:broadcast');
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
        
        // Open OAuth window
        const authWindow = window.open(authUrl, 'twitchAuth', 'width=600,height=700,scrollbars=yes,resizable=yes');
        
        // Listen for auth completion
        const checkAuth = setInterval(() => {
            try {
                if (authWindow.closed) {
                    clearInterval(checkAuth);
                    this.checkOAuthCompletion();
                }
            } catch (error) {
                // Handle cross-origin issues
            }
        }, 1000);
    }

    async checkOAuthCompletion() {
        try {
            const response = await fetch('http://localhost:3001/oauth/token');
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
                    "start": "node server.js",
                    "dev": "nodemon server.js"
                },
                "dependencies": {
                    "express": "^4.18.2",
                    "cors": "^2.8.5",
                    "multer": "^1.4.5-lts.1",
                    "fluent-ffmpeg": "^2.1.2",
                    "axios": "^1.6.0"
                },
                "devDependencies": {
                    "nodemon": "^3.0.1"
                }
            }, null, 2),

            'server.js': `const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const { spawn } = require('child_process');
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

// Serve OAuth callback page
app.get('/oauth/callback', (req, res) => {
    res.send(\`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Twitch Authorization</title>
    </head>
    <body>
        <h2>Processing authorization...</h2>
        <script>
            // Extract token from URL fragment
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            
            if (accessToken) {
                // Send token to server
                fetch('/oauth/store-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: accessToken })
                }).then(() => {
                    document.body.innerHTML = '<h2>Authorization successful! You can close this window.</h2>';
                    setTimeout(() => window.close(), 2000);
                });
            } else {
                document.body.innerHTML = '<h2>Authorization failed. Please try again.</h2>';
            }
        </script>
    </body>
    </html>
    \`);
});

// Store OAuth token
app.post('/oauth/store-token', async (req, res) => {
    const { token } = req.body;
    oauthToken = token;
    
    // Get user info
    try {
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': \`Bearer \${token}\`,
                'Client-Id': 'temp' // Will be replaced with actual client ID
            }
        });
        
        if (userResponse.data.data.length > 0) {
            userId = userResponse.data.data[0].id;
        }
    } catch (error) {
        console.error('Error getting user info:', error.message);
    }
    
    res.json({ success: true });
});

// Get stored OAuth token
app.get('/oauth/token', (req, res) => {
    res.json({ 
        success: !!oauthToken, 
        token: oauthToken,
        userId: userId
    });
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
        if (category) {
            const gameResponse = await axios.get(\`https://api.twitch.tv/helix/games?name=\${encodeURIComponent(category)}\`, {
                headers: {
                    'Authorization': \`Bearer \${oauthToken}\`,
                    'Client-Id': clientId
                }
            });
            
            if (gameResponse.data.data.length > 0) {
                gameId = gameResponse.data.data[0].id;
            }
        }
        
        // Update channel info
        const updateData = {};
        if (title) updateData.title = title;
        if (gameId) updateData.game_id = gameId;
        
        const response = await axios.patch(\`https://api.twitch.tv/helix/channels?broadcaster_id=\${userId}\`, updateData, {
            headers: {
                'Authorization': \`Bearer \${oauthToken}\`,
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

A local Node.js server that acts as a bridge between the browser-based stream capture and Twitch's RTMP servers.

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg installed on your system

## Installation

1. Extract this folder to your desired location
2. Open a terminal in this folder
3. Run: \`npm install\`

## Usage

1. Start the server: \`npm start\`
2. The server will run on http://localhost:3001
3. Use the web interface to configure and start streaming

## Setting up Twitch OAuth

1. Go to https://dev.twitch.tv/console/apps
2. Create a new application
3. Set OAuth Redirect URL to: http://localhost:3001/oauth/callback
4. Copy the Client ID to the web interface
5. Click "Authorize with Twitch" to enable title/category changes

## FFmpeg Installation

### Windows
Download from https://ffmpeg.org/download.html and add to PATH

### macOS
\`brew install ffmpeg\`

### Linux
\`sudo apt install ffmpeg\` (Ubuntu/Debian)

## Configuration

The server automatically handles:
- RTMP connection to Twitch
- Video/audio encoding and streaming
- Stream data relay from browser
- OAuth authentication for API access
- Stream title and category updates

## Troubleshooting

- Ensure FFmpeg is installed and in PATH
- Check firewall settings for port 3001
- Verify Twitch stream key is correct
- Check Twitch dashboard for stream status
- Make sure OAuth redirect URL matches exactly
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