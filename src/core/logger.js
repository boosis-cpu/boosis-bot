const EventEmitter = require('events');

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
        const timestamp = new Date().toLocaleTimeString();
        const config = this.levels[level] || this.levels.info;
        const formattedMessage = `[${timestamp}] [${config.label}] ${message}`;

        console.log(formattedMessage);
        if (data) {
            console.log(data);
        }

        // Emit event for real-time streaming
        this.emit('log', {
            timestamp,
            level: config.label,
            message,
            data
        });
    }

    info(msg, data) { this.log('info', msg, data); }
    success(msg, data) { this.log('success', msg, data); }
    warn(msg, data) { this.log('warn', msg, data); }
    error(msg, data) { this.log('error', msg, data); }
    debug(msg, data) { this.log('debug', msg, data); }
}

module.exports = new Logger();
