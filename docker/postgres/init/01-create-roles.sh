#!/bin/sh
set -eu

if [ "$APP_DB_USER" = "$POSTGRES_USER" ] || [ "$MIGRATION_DB_USER" = "$POSTGRES_USER" ] || [ "$APP_DB_USER" = "$MIGRATION_DB_USER" ]; then
  echo "App, migration, and bootstrap database users must be different." >&2
  exit 1
fi

psql \
  --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=migration_user="$MIGRATION_DB_USER" \
  --set=migration_password="$MIGRATION_DB_PASSWORD" \
  --set=database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'CREATE ROLE %I',
  :'app_user'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

ALTER ROLE :"app_user"
  LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

SELECT format(
  'CREATE ROLE %I',
  :'migration_user'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migration_user')
\gexec

ALTER ROLE :"migration_user"
  LOGIN PASSWORD :'migration_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

REVOKE CONNECT ON DATABASE :"database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database" TO :"app_user", :"migration_user";
ALTER SCHEMA public OWNER TO :"migration_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, :'migration_user')
FROM pg_tables
WHERE schemaname = 'public'
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', schemaname, sequencename, :'migration_user')
FROM pg_sequences
WHERE schemaname = 'public'
\gexec

GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";

ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
SQL
