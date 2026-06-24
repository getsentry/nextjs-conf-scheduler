#!/bin/bash
set -e

ENV_FILE=".env.local"

echo "Configuring Neon/Postgres database..."

if [ -f "$ENV_FILE" ] && grep -q "^DATABASE_URL=" "$ENV_FILE"; then
  echo "DATABASE_URL already exists in $ENV_FILE"
else
  echo ""
  echo "Create a Neon database, then paste the pooled connection string."
  echo "Neon dashboard: https://console.neon.tech"
  echo "Expected format: postgres://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
  echo ""
  read -r -p "DATABASE_URL: " DB_URL

  if [ -z "$DB_URL" ]; then
    echo "No DATABASE_URL provided; aborting."
    exit 1
  fi

  if [ -f "$ENV_FILE" ]; then
    grep -v -E "^(DATABASE_URL|POSTGRES_URL|TURSO_)=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi

  cat >> "$ENV_FILE" << EOF
DATABASE_URL=$DB_URL
EOF
fi

echo ""
echo "Done! Neon/Postgres configured."
echo "Next steps:"
echo "  pnpm db:push   # Enable pgvector and apply schema"
echo "  pnpm db:seed   # Seed AI Engineer World's Fair 2026 data"
echo "  pnpm db:embed  # Generate semantic search embeddings"
echo "  pnpm dev       # Start app"
