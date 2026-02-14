
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

class Logger extends EventEmitter {
    constructor() {
        super();
        this.levels = {
            info: { label: 'INFO' },
            success: { label: 'SUCCESS' },
            warn: { label: 'WARN' },
            error: { label: 'ERROR' },
            debug: { label: 'DEBUG' }
        };
    }

    log(level, message, data = '') {
        const now = new Date();
        const timestamp = now.toLocaleTimeString();
        const dateStamp = now.toISOString().split('T')[0];
        const config = this.levels[level] || this.levels.info;

        const formattedMessage = `[${timestamp}] [${config.label}] ${message}`;

        // 1. Console Output
        console.log(formattedMessage);
        if (data) {
            console.log(data);
        }

        // 2. File Output (System Audit)
        try {
            const logLine = `${dateStamp} ${formattedMessage} ${data ? JSON.stringify(data) : ''}\n`;
            fs.appendFileSync(path.join(logDir, 'system.log'), logLine);
        } catch (e) {
            // Silently fail file write to avoid crashing the bot
        }

        // 3. EventEmitter for Real-time Dashboard (Skip DEBUG logs)
        if (level !== 'debug') {
            this.emit('log', {
                timestamp,
                level: config.label,
                message,
                data
            });
        }
    }

    info(msg, data) { this.log('info', msg, data); }
    success(msg, data) { this.log('success', msg, data); }
    warn(msg, data) { this.log('warn', msg, data); }
    error(msg, data) { this.log('error', msg, data); }
    debug(msg, data) { this.log('debug', msg, data); }
}

module.exports = new Logger();
