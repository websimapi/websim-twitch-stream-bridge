const packageTemplate = {
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
};

export { packageTemplate };

