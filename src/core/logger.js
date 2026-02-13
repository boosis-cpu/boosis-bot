const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Simple logger without external dependencies for now to ensure compatibility
const levels = {
    info: { label: 'INFO' },
    success: { label: 'SUCCESS' },
    warn: { label: 'WARN' },
    error: { label: 'ERROR' },
    debug: { label: 'DEBUG' }
};

function log(level, message, data = '') {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const dateStamp = now.toISOString().split('T')[0];
    const config = levels[level] || levels.info;

    const formattedMessage = `[${timestamp}] [${config.label}] ${message}`;

    // Console log
    console.log(formattedMessage);
    if (data) console.log(data);

    // File log (System Audit)
    const logLine = `${dateStamp} ${formattedMessage} ${data ? JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(path.join(logDir, 'system.log'), logLine);
}

module.exports = {
    info: (msg, data) => log('info', msg, data),
    success: (msg, data) => log('success', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    debug: (msg, data) => log('debug', msg, data)
};
