#!/bin/sh
set -eu
# Apply pending DB migrations, then hand off to Nest as PID 1.
npx prisma migrate deploy
exec node dist/main.js
