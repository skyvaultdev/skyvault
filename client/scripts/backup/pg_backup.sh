#!/usr/bin/env bash
set -euo pipefail

# Backup do Postgres em formato custom (-Fc/--format=custom) — já vem
# comprimido e permite restore seletivo (uma tabela só, por exemplo),
# diferente de um dump em texto puro. Lê as mesmas env vars que o app usa
# (ver client/.env.local em dev; configure as mesmas no ambiente que rodar
# isto, tipicamente via cron — ver docs/ops/backup.md).
#
# Uso: DB_HOST=... DB_USER=... DB_NAME=... DB_PASSWORD=... ./pg_backup.sh
# (BACKUP_DIR e BACKUP_RETENTION_DAYS são opcionais, com default abaixo)

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

DB_HOST="${DB_HOST:?defina DB_HOST}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:?defina DB_USER}"
DB_NAME="${DB_NAME:?defina DB_NAME}"
# DB_PASSWORD vai via PGPASSWORD (lido pelo próprio pg_dump), nunca como
# argumento de linha de comando — argumentos de processo ficam visíveis
# pra qualquer outro usuário do mesmo host via `ps`/Task Manager.
export PGPASSWORD="${DB_PASSWORD:?defina DB_PASSWORD}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

echo "[pg_backup] iniciando backup de ${DB_NAME}@${DB_HOST}:${DB_PORT} -> ${BACKUP_FILE}"
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=custom \
  --file="$BACKUP_FILE"

echo "[pg_backup] backup concluído ($(du -h "$BACKUP_FILE" | cut -f1))."

# Retenção: só apaga arquivos do próprio padrão de nome deste script
# (${DB_NAME}_*.dump) dentro de BACKUP_DIR — nunca mexe em outra coisa que
# esteja na mesma pasta.
echo "[pg_backup] removendo backups de ${DB_NAME} com mais de ${RETENTION_DAYS} dias em ${BACKUP_DIR}..."
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete

echo "[pg_backup] concluído."
