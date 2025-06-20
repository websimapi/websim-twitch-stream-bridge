const serverTemplate = `const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let ffmpegProcess = null;
let oauthToken = null;
let userId = null;

// OAuth callback page - handle root path for OAuth redirect
app.get('/', (req, res) => {
    const clientId = req.query.client_id;
    res.send(\`<!DOCTYPE html>
<html>
<head>
    <title>Twitch Authorization</title>
    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');

            if (accessToken) {
                try {
                    // Send token to server first
                    const storeResponse = await fetch('/oauth/store-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: accessToken })
                    });
                    
                    if (storeResponse.ok) {
                        window.location.href = '/success';
                    } else {
                        throw new Error('Failed to store token');
                    }
                } catch (err) {
                    console.error('Error processing authorization:', err);
                    document.body.innerHTML = '<h2>Error processing authorization: ' + err.message + '</h2>';
                }
            } else {
                document.body.innerHTML = '<h2>Missing access token</h2>';
            }
        });
    </script>
</head>
<body>
    <h2>Processing authorization... Please wait.</h2>
</body>
</html>\`);
});

app.get('/success', (req, res) => {
    res.send(\`<!DOCTYPE html>
<html>
<head>
    <title>Authorization Complete</title>
    <script>
        setTimeout(() => {
            window.close();
        }, 2000);
    </script>
</head>
<body>
    <h2>Authorization successful! You can close this window or it will close automatically.</h2>
</body>
</html>\`);
});

// OAuth callback page
app.get('/oauth/callback-implicit', (req, res) => {
    res.send(\`<!DOCTYPE html>
<html>
<head>
    <title>Twitch Authorization</title>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');

            if (window.opener && accessToken) {
                window.opener.postMessage({ type: 'oauth_token', token: accessToken }, '*');
                window.close();
            } else {
                document.body.innerHTML = '<h2>Authorization successful! Please close this window.</h2>';
            }
        });
    </script>
</head>
<body>
    <h2>Processing authorization... Please wait.</h2>
</body>
</html>\`);
});

app.post('/oauth/store-token', async (req, res) => {
    const { token, userId: providedUserId } = req.body;
    console.log('📡 OAuth token received:', {
        tokenLength: token ? token.length : 0,
        userId: providedUserId || 'Not provided',
        timestamp: new Date().toISOString()
    });
    
    if (token) {
        oauthToken = token;
        if (providedUserId) {
            userId = providedUserId;
        }
        
        console.log('✅ OAuth token stored successfully');
        res.json({ success: true });
    } else {
        console.log('❌ OAuth token storage failed - missing token');
        res.status(400).json({ success: false, error: 'Token required' });
    }
});

app.get('/oauth/token', (req, res) => {
    if (oauthToken && userId) {
        res.json({ success: true, token: oauthToken, userId: userId });
    } else {
        res.json({ success: false });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

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

app.post('/update-stream-info', async (req, res) => {
    const { clientId, oauthToken, userId, title, category } = req.body;
    
    console.log('🔄 Stream info update requested:', {
        clientId: clientId ? clientId.substring(0, 8) + '...' : 'Not provided',
        hasToken: !!oauthToken,
        userId: userId || 'Not provided',
        title: title || 'Not provided',
        category: category || 'Not provided',
        timestamp: new Date().toISOString()
    });
    
    if (!clientId || !oauthToken || !userId) {
        console.log('❌ Stream info update failed - missing required parameters');
        return res.status(400).json({ success: false, error: 'Missing required parameters.' });
    }

    try {
        let gameId = null;
        
        if (category) {
            console.log('🎮 Looking up game ID for category:', category);
            const gameResponse = await axios.get(\`https://api.twitch.tv/helix/games?name=\${encodeURIComponent(category)}\`, {
                headers: {
                    'Authorization': \`Bearer \${oauthToken}\`,
                    'Client-Id': clientId
                }
            });
            
            if (gameResponse.data.data.length > 0) {
                gameId = gameResponse.data.data[0].id;
                console.log('✅ Found game ID:', gameId, 'for category:', category);
            } else {
                console.log('⚠️ No game found for category:', category);
            }
        }
        
        const updateData = {};
        if (title) updateData.title = title;
        if (gameId) updateData.game_id = gameId;
        
        console.log('📤 Sending update to Twitch API:', updateData);
        
        const response = await axios.patch(\`https://api.twitch.tv/helix/channels?broadcaster_id=\${userId}\`, updateData, {
            headers: {
                'Authorization': \`Bearer \${oauthToken}\`,
                'Client-Id': clientId,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Stream info updated successfully');
        res.json({ success: true, message: 'Stream info updated successfully.' });
    } catch (error) {
        console.error('❌ Error updating stream info:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.message || error.message 
        });
    }
});

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
        const ffmpegArgs = [
            '-f', 'webm',
            '-i', 'pipe:0',
            
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-level', '3.1',
            
            '-b:v', settings.bitrate,
            '-maxrate', settings.maxrate,
            '-bufsize', settings.bufsize,
            '-pix_fmt', 'yuv420p',
            
            '-g', String(framerate * 2),
            '-keyint_min', String(framerate),
            '-sc_threshold', '0',
            
            '-vf', \`scale=\${settings.width}:\${settings.height}:force_original_aspect_ratio=decrease,pad=\${settings.width}:\${settings.height}:(ow-iw)/2:(oh-ih)/2,fps=\${framerate}\`,
            
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ac', '2',
            '-ar', '44100',
            '-aac_coder', 'twoloop',
            
            '-threads', '0',
            '-thread_type', 'slice',
            
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
`;

export { serverTemplate };