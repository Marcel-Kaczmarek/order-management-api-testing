#!/bin/sh
# Creates a least-privilege, read-only role that the QA framework uses for
# database validation. The application itself keeps using the owner role.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${QA_DB_READONLY_USER} LOGIN PASSWORD '${QA_DB_READONLY_PASSWORD}';
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${QA_DB_READONLY_USER};
GRANT USAGE ON SCHEMA public TO ${QA_DB_READONLY_USER};
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public GRANT SELECT ON TABLES TO ${QA_DB_READONLY_USER};
ALTER ROLE ${QA_DB_READONLY_USER} SET default_transaction_read_only = on;
SQL
