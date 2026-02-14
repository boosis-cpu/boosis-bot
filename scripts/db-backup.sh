#!/bin/bash

# Configuración
BACKUP_DIR="/app/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/boosis_db_${TIMESTAMP}.sql"

# Asegurar que el directorio de backup existe
mkdir -p ${BACKUP_DIR}

echo "Starting DB Backup..."

# Ejecutar pg_dump
# Si el script corre fuera del container, usamos docker exec
# Si corre dentro del container (vía cron), usamos pg_dump directamente
if [ -f /.dockerenv ]; then
    pg_dump -h db -U ${DB_USER} ${DB_NAME} > ${BACKUP_FILE}
else
    docker exec boosis-db pg_dump -U boosis_admin boosis_db > ./backups/boosis_db_${TIMESTAMP}.sql
fi

if [ $? -eq 0 ]; then
    echo "Backup successful: ${BACKUP_FILE}"
    # Mantener solo los últimos 7 días de backups
    find ${BACKUP_DIR} -name "boosis_db_*.sql" -mtime +7 -delete
else
    echo "Backup failed!"
    exit 1
fi
