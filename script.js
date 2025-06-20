// Load JSZip library
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
document.head.appendChild(script);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new TwitchStreamBridge();
});