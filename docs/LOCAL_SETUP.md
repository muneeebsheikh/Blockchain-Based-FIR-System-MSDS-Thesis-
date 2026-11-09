# Local prerequisites

Environment setup for the **MS thesis FIR integrity** research implementation (`code/`).

- **Node.js** LTS or current (project tested with Node 22+).
- **Git**
- **PostgreSQL** (local install). Create a database and user for development.

Example (adjust names/passwords):

```sql
CREATE DATABASE fir_blockchain;
CREATE USER fir_dev WITH ENCRYPTED PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE fir_blockchain TO fir_dev;
```

If your PostgreSQL version requires schema grants for the `public` schema, connect to `fir_blockchain` and run:

```sql
GRANT ALL ON SCHEMA public TO fir_dev;
```

Use the connection string in `code/backend/.env` (see `env.example`).
