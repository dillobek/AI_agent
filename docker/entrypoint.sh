#!/bin/sh
set -e

# Applies any pending Prisma migrations before the API starts accepting
# traffic. `migrate deploy` (not `migrate dev`) is the correct command for
# non-interactive/production environments — it never prompts and never
# generates new migrations, it only applies ones already committed to
# prisma/migrations/.
echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting API..."
exec node dist/main.js
