
// Simple logger without external dependencies for now to ensure compatibility
const levels = {
    info: { label: 'INFO' },
    success: { label: 'SUCCESS' },
    warn: { label: 'WARN' },
    error: { label: 'ERROR' },
    debug: { label: 'DEBUG' }
};

function log(level, message, data = '') {
    const timestamp = new Date().toLocaleTimeString();
    const config = levels[level] || levels.info;

    console.log(`[${timestamp}] [${config.label}] ${message}`);
    if (data) {
        console.log(data);
    }
}

module.exports = {
    info: (msg, data) => log('info', msg, data),
    success: (msg, data) => log('success', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    debug: (msg, data) => log('debug', msg, data)
};
