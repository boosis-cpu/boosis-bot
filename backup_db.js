const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./src/core/logger');

const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `boosis_db_backup_${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);

    // If running in Docker, we need to exec pg_dump in the db container
    // If running locally, we use pg_dump directly
    const cmd = process.env.NODE_ENV === 'production'
        ? `docker exec boosis-db pg_dump -U ${process.env.DB_USER} ${process.env.DB_NAME} > ${filepath}`
        : `pg_dump -U ${process.env.DB_USER} -h ${process.env.DB_HOST} ${process.env.DB_NAME} > ${filepath}`;

    logger.info(`Iniciando respaldo de base de datos...`);

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            logger.error(`Error en respaldo: ${error.message}`);
            return;
        }
        logger.success(`Respaldo completado con éxito: ${filename}`);

        // Mantener solo los últimos 7 respaldos
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('boosis_db_backup_'))
            .sort();

        if (files.length > 7) {
            fs.unlinkSync(path.join(backupDir, files[0]));
            logger.info(`Eliminado respaldo antiguo: ${files[0]}`);
        }
    });
}

// Permitir ejecución manual
if (require.main === module) {
    backup();
}

module.exports = backup;
stone
