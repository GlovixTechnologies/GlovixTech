// Logger configuration
// In development: keep all console methods active for debugging
// In production: suppress verbose logging but keep errors visible

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

if (!isDev) {
    // Production: only suppress debug and info, keep warn/error for diagnostics
    console.debug = () => { };
    console.info = () => { };
    // Keep console.log, console.warn, console.error active
    // so we can actually see what's going wrong
}
