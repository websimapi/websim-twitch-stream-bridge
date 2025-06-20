const readmeTemplate = `# Twitch Stream Bridge

A local Node.js server that acts as a bridge between the browser-based stream capture and Twitch's RTMP servers.

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg installed on your system and available in your system's PATH

## Installation

1.  Extract this folder to your desired location.
2.  Open a terminal or command prompt in this folder.
3.  Run: \`npm install\`

## Usage

1.  Start the server: \`npm start\`
2.  The server will run on http://localhost:3001.
3.  Open the \`index.html\` file in your browser to configure and start streaming.

## Setting up Twitch OAuth

To enable changing the stream title and category directly from the app, you need to set up Twitch authentication.

1.  Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and log in.
2.  Click "Register Your Application".
3.  Give your application a Name (e.g., "My Browser Streamer").
4.  For **OAuth Redirect URLs**, add the following URL:
    -   \`http://localhost:3001/oauth/callback-implicit\`
5.  Choose a Category (e.g., "Application Integration").
6.  Click "Create".
7.  On the next page, you will see a **Client ID**. Copy this value.
8.  Paste the Client ID into the "Twitch Client ID" field in the web interface.
9.  Click "Authorize with Twitch" and approve the connection in the popup window.

## FFmpeg Installation

FFmpeg is required for encoding the stream. You must install it and ensure it's in your system's PATH.

### Windows
-   Download from [ffmpeg.org](https://ffmpeg.org/download.html).
-   Extract the files and add the \`bin\` folder to your system's PATH environment variable.

### macOS
-   If you have Homebrew: \`brew install ffmpeg\`

### Linux (Ubuntu/Debian)
-   \`sudo apt update && sudo apt install ffmpeg\`

## Troubleshooting

-   **"Could not connect to Node.js bridge"**: Make sure the Node.js server is running (\`npm start\`) and not blocked by a firewall.
-   **"Connection failed. Check stream key..."**: Verify your Twitch stream key is correct and that you are not already live from another source.
-   **"Authorization failed"**: Ensure the OAuth Redirect URL in your Twitch Application settings is exactly \`http://localhost:3001/oauth/callback-implicit\`.
-   **FFmpeg errors in the console**: Make sure FFmpeg is installed correctly and accessible from your terminal (try running \`ffmpeg -version\`).
`;

export { readmeTemplate };