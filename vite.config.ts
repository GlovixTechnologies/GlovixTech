
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, process.cwd(), '');

    const aiEndpoint = env.VITE_AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';

    console.log('----------------------------------------');
    console.log('VITE PROXY CONFIGURATION');
    console.log(`Target: ${aiEndpoint}`);
    console.log('----------------------------------------');

    return {
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: 5174,
            allowedHosts: true,
            headers: {
                // Use credentialless to allow loading external images
                'Cross-Origin-Embedder-Policy': 'credentialless',
                'Cross-Origin-Opener-Policy': 'same-origin',
            },
            proxy: {
                // Simple, robust proxy mapping
                '/api/ai/chat': {
                    target: aiEndpoint,
                    changeOrigin: true,
                    secure: false,
                    rewrite: () => '', // Remove the path entirely, forwarding to the target URL
                    configure: (proxy, _options) => {
                        proxy.on('error', (err, _req, _res) => {
                            console.log('proxy error', err);
                        });
                    },
                },
            },
        },
        build: {
            sourcemap: false,
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                },
            },
        },
    };
});
