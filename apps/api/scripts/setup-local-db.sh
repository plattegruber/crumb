#!/bin/bash
cd "$(dirname "$0")/.."
npx wrangler d1 execute dough-db --local --file=src/db/migrations/0001_initial_schema.sql
echo "Local D1 database initialized with schema."
