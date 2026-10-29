#!/usr/bin/env bash
set -euo pipefail

# Item d do deploy na Square Cloud — builda e empacota só o que o
# container precisa pra RODAR (npm run start -> next start), não pra
# rebuildar: .next (saída do build), public (estáticos servidos direto),
# package.json + package-lock.json (pra Square Cloud rodar `npm install`
# e instalar exatamente as mesmas versões testadas — sem o lockfile,
# "npm install" sem versão travada pode puxar uma versão diferente da
# testada), next.config.ts (next start RELÊ isso em runtime — tem
# headers()/redirects() dinâmicos, não é só config de build) e
# squarecloud.app (manifesto da plataforma).
#
# EXCLUÍDO DE PROPÓSITO: node_modules (instalado pela própria Square
# Cloud a partir do package-lock.json — zip sem isso é bem menor e não
# carrega binário nenhum pré-compilado pra dentro da plataforma) e
# qualquer .env* (segredo nenhum entra no zip — tudo via painel de
# variáveis de ambiente da Square Cloud, ver docs/deploy/squarecloud.md).
#
# Uso: ./scripts/deploy/build_and_zip.sh [nome-do-zip-de-saída]
# (default: deploy.zip, na raiz de client/)

cd "$(dirname "$0")/../.."  # garante que roda a partir de client/

OUT_ZIP="${1:-deploy.zip}"

echo "[build_and_zip] npm ci (instala as mesmas versões do lockfile)..."
npm ci

echo "[build_and_zip] npx next build..."
npx next build

echo "[build_and_zip] empacotando $OUT_ZIP..."
rm -f "$OUT_ZIP"

# -y preserva symlinks como symlinks (Next pode criar alguns em .next/
# em alguns setups) em vez de copiar o conteúdo — mais fiel ao build real.
zip -ry "$OUT_ZIP" \
  .next \
  public \
  package.json \
  package-lock.json \
  next.config.ts \
  squarecloud.app \
  -x ".next/cache/*"  # cache de build do Next não precisa ir pro deploy — só infla o zip

echo "[build_and_zip] conferindo que nada sensível entrou no zip..."
if unzip -l "$OUT_ZIP" | grep -qE '(^|/)\.env'; then
  echo "[build_and_zip] ERRO: encontrei um arquivo .env dentro do zip — abortando, NÃO envie isso." >&2
  exit 1
fi
if unzip -l "$OUT_ZIP" | grep -q "node_modules/"; then
  echo "[build_and_zip] ERRO: node_modules acabou entrando no zip — abortando." >&2
  exit 1
fi

echo "[build_and_zip] OK — $OUT_ZIP pronto ($(du -h "$OUT_ZIP" | cut -f1))."
echo "[build_and_zip] lembrete: configure as variáveis de ambiente no painel da Square Cloud ANTES de subir — ver docs/deploy/squarecloud.md."
