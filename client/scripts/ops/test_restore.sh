#!/usr/bin/env bash
set -euo pipefail

# Item C4 — testa de ponta a ponta se um backup gerado por pg_backup.sh
# (../backup/pg_backup.sh) é restaurável de verdade: cria um banco
# descartável, restaura o dump mais recente (ou o indicado), roda
# verificações básicas (contagem de tabelas, linhas de tabelas críticas,
# RLS ativo, extensões instaladas) e destrói o banco no fim — sem
# depender de CREATEDB no ambiente de dev usado nesta sessão (não foi
# testado de ponta a ponta aqui por falta exatamente desse privilégio;
# roda isto com um role que TENHA CREATEDB, ou deixe DOCKER=1 subir um
# Postgres novo e descartável, onde quem conecta já é dono de tudo).
#
# Dois modos:
#
#   DOCKER=1 (padrão se DB_HOST não for definida) — sobe um container
#   postgres:18 descartável (precisa de Docker instalado), restaura nele,
#   destrói o container inteiro no final. Mais simples pra rodar numa
#   máquina de dev: não precisa de nenhum Postgres pré-existente.
#
#   Contra um Postgres já existente (defina DB_HOST) — usa esse servidor
#   pra criar/derrubar só um BANCO descartável (não um container), com um
#   role que tenha CREATEDB. É o modo usado no job de CI (ver
#   .github/workflows/ci.yml), reaproveitando o serviço postgres que já
#   sobe pra rodar os testes.
#
# Uso:
#   ./test_restore.sh                                    # Docker, backup mais recente de ./backups
#   BACKUP_FILE=./backups/skybase_20261029.dump ./test_restore.sh --docker
#   DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres \
#     BACKUP_FILE=/tmp/appdb.dump ./test_restore.sh

DOCKER_IMAGE="${DOCKER_IMAGE:-postgres:18}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TEST_DB_NAME="${TEST_DB_NAME:-restore_test}"
# Tabelas que DEVEM ter pelo menos a estrutura certa pra um restore ser
# considerado são — ajuste se o schema mudar de nome. Contagem de LINHAS
# só informativa (um backup de banco vazio tem 0 linhas e ainda é válido);
# o que realmente reprova o teste é a tabela/RLS/extensão não existir.
CRITICAL_TABLES=(stores users orders products chat_messages)
EXPECTED_EXTENSIONS=(citext)

USE_DOCKER="${DOCKER:-}"
if [[ "${1:-}" == "--docker" ]]; then USE_DOCKER=1; fi
if [[ -z "${DB_HOST:-}" && -z "$USE_DOCKER" ]]; then USE_DOCKER=1; fi

if [[ -z "${BACKUP_FILE:-}" ]]; then
  BACKUP_FILE="$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n1 || true)"
fi
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "[test_restore] ERRO: nenhum arquivo de backup encontrado (BACKUP_FILE não definido e nenhum .dump em $BACKUP_DIR)." >&2
  exit 1
fi
echo "[test_restore] usando backup: $BACKUP_FILE"

CONTAINER_NAME=""
cleanup() {
  local exit_code=$?
  if [[ -n "$CONTAINER_NAME" ]]; then
    echo "[test_restore] derrubando container $CONTAINER_NAME..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  elif [[ -n "${DB_HOST:-}" ]]; then
    echo "[test_restore] derrubando banco descartável $TEST_DB_NAME..."
    PGPASSWORD="$DB_PASSWORD" dropdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --if-exists "$TEST_DB_NAME" >/dev/null 2>&1 || true
  fi
  exit $exit_code
}
trap cleanup EXIT

if [[ -n "$USE_DOCKER" ]]; then
  command -v docker >/dev/null 2>&1 || { echo "[test_restore] ERRO: Docker não encontrado (DOCKER=1 exige docker instalado)." >&2; exit 1; }

  CONTAINER_NAME="test-restore-$$"
  DB_HOST="localhost"
  DB_PORT="$(shuf -i 20000-39999 -n1 2>/dev/null || echo 25432)"
  DB_USER="postgres"
  DB_PASSWORD="test-restore-password"

  echo "[test_restore] subindo $DOCKER_IMAGE descartável (porta $DB_PORT)..."
  docker run -d --name "$CONTAINER_NAME" \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" \
    -p "${DB_PORT}:5432" \
    "$DOCKER_IMAGE" >/dev/null

  echo "[test_restore] aguardando o Postgres aceitar conexões..."
  for i in $(seq 1 30); do
    if PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 1
    if [[ "$i" == 30 ]]; then
      echo "[test_restore] ERRO: Postgres não ficou pronto a tempo." >&2
      exit 1
    fi
  done
fi

: "${DB_HOST:?defina DB_HOST (ou use DOCKER=1)}"
DB_PORT="${DB_PORT:-5432}"
: "${DB_USER:?defina DB_USER}"
: "${DB_PASSWORD:?defina DB_PASSWORD}"
export PGPASSWORD="$DB_PASSWORD"

echo "[test_restore] criando banco descartável $TEST_DB_NAME..."
dropdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --if-exists "$TEST_DB_NAME"
createdb --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" "$TEST_DB_NAME"

echo "[test_restore] restaurando $BACKUP_FILE em $TEST_DB_NAME..."
pg_restore --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$TEST_DB_NAME" --no-owner --no-privileges "$BACKUP_FILE"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TEST_DB_NAME -t -A"

echo "[test_restore] verificando..."
FAILED=0

TABLE_COUNT=$($PSQL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
echo "  tabelas em public: $TABLE_COUNT"
if [[ "$TABLE_COUNT" -lt 1 ]]; then
  echo "  [FALHA] nenhuma tabela restaurada." >&2
  FAILED=1
fi

for t in "${CRITICAL_TABLES[@]}"; do
  EXISTS=$($PSQL -c "SELECT to_regclass('public.$t') IS NOT NULL")
  if [[ "$EXISTS" != "t" ]]; then
    echo "  [FALHA] tabela crítica '$t' não existe no restore." >&2
    FAILED=1
    continue
  fi
  COUNT=$($PSQL -c "SELECT COUNT(*) FROM $t")
  echo "  $t: $COUNT linha(s)"
done

RLS_COUNT=$($PSQL -c "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relrowsecurity")
echo "  tabelas com RLS ativa: $RLS_COUNT"
if [[ "$RLS_COUNT" -lt 1 ]]; then
  echo "  [FALHA] nenhuma tabela com RLS ativa — schema multi-tenant não restaurado corretamente." >&2
  FAILED=1
fi

for ext in "${EXPECTED_EXTENSIONS[@]}"; do
  FOUND=$($PSQL -c "SELECT COUNT(*) FROM pg_extension WHERE extname = '$ext'")
  echo "  extensão '$ext': $([[ "$FOUND" -gt 0 ]] && echo presente || echo AUSENTE)"
  if [[ "$FOUND" -lt 1 ]]; then
    echo "  [FALHA] extensão esperada '$ext' não está no restore." >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "[test_restore] FALHOU — restore não passou em uma ou mais verificações." >&2
  exit 1
fi

echo "[test_restore] OK — restore válido."
