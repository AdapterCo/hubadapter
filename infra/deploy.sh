#!/bin/bash
# =============================================================================
# Script de Deploy Automático — AdapterHub VPS
# =============================================================================

set -e

echo "🚀 Iniciando deploy do AdapterHub..."

# 1. Verifica se a rede traefik9 existe no Docker
if ! docker network inspect traefik9 >/dev/null 2>&1; then
  echo "⚠️ Rede traefik9 não encontrada. Criando rede..."
  docker network create traefik9
fi

# 2. Copia o arquivo de ambiente se não existir
if [ ! -f .env ]; then
  echo "📝 Criando arquivo .env a partir de infra/.env.production.example..."
  cp infra/.env.production.example .env
fi

# 3. Executa build e sobe os containers
echo "📦 Compilando imagens e subindo containers com Docker Compose..."
docker compose -f infra/docker-compose.yml --env-file .env up -d --build

echo "⚡ Rodando o seed inicial do banco (Admin + IDMAQs)..."
docker exec -i adapterhub-web node prisma/seed.js || true

echo "✅ Deploy concluído com sucesso!"
echo "🌐 Acesse: https://hub.adapterco.com.br"
