class ProjectGenerator {
    constructor() {
        this.loadJSZip();
        this.loadTemplates();
    }

    loadJSZip() {
        if (!window.JSZip) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            document.head.appendChild(script);
        }
    }

    async loadTemplates() {
        try {
            // Import templates dynamically
            const [serverModule, packageModule, readmeModule] = await Promise.all([
                import('./templates/server-template.js'),
                import('./templates/package-template.js'),
                import('./templates/readme-template.js')
            ]);

            this.serverTemplate = serverModule.serverTemplate;
            this.packageTemplate = packageModule.packageTemplate;
            this.readmeTemplate = readmeModule.readmeTemplate;
        } catch (error) {
            console.error('Error loading templates:', error);
            // Fallback to embedded templates if dynamic import fails
            this.initializeFallbackTemplates();
        }
    }

    initializeFallbackTemplates() {
        // Minimal fallback templates in case dynamic imports fail
        this.serverTemplate = 'console.log("Template loading failed - please check console");';
        this.packageTemplate = { "name": "twitch-stream-bridge", "version": "1.0.0" };
        this.readmeTemplate = '# Twitch Stream Bridge\n\nTemplate loading failed.';
    }

    async downloadProject() {
        // Wait for templates to load
        if (!this.serverTemplate) {
            await this.loadTemplates();
        }

        const files = this.createNodeProjectFiles();
        
        // Wait for JSZip to load if needed
        while (!window.JSZip) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const zip = new JSZip();
        
        for (const [filename, content] of Object.entries(files)) {
            zip.file(filename, content);
        }
        
        try {
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'twitch-stream-bridge.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating download:', error);
        }
    }

    createNodeProjectFiles() {
        return {
            'package.json': JSON.stringify(this.packageTemplate, null, 2),
            'server.js': this.serverTemplate,
            'README.md': this.readmeTemplate
        };
    }
}