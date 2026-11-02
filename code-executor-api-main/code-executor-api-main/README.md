# Code Executor API

Backend for the Code Executor application. It provides account and project APIs and queues code execution jobs for a separate worker.

## Source code and live links

- **API source:** this repository. Add the public or shared GitHub URL here when the repository is published.
- **Frontend source:** [Code Executor Frontend](../../code-executor-master/code-executor-master/README.md) (local workspace link).
- **Live app / API:** not deployed yet.

## Requirements

- Docker Engine with Docker Compose
- Docker Compose access to `/var/run/docker.sock` for the execution worker (on Windows, run Docker Desktop with its Linux container engine)

The Compose stack starts PostgreSQL, Redis, the API, and the worker. PostgreSQL tables are initialized from `db/init.sql` on the first database volume creation. Code execution also records events in an AWS DynamoDB table named `CodeExecutionEvents` in `ap-southeast-2`; create that table with a string partition key named `eventId` and provide AWS credentials with access to it. The API and worker use the standard AWS SDK credential environment variables.

## Run locally with Docker Compose

From this directory, create the runtime environment files:

```bash
cp .env.production.example .env.production
cp .env.production.example .env
```

Edit both files and replace the example values with strong, unique secrets. `.env` supplies Compose's `POSTGRES_PASSWORD` interpolation; `.env.production` supplies the API's `JWT_SECRET` and AWS credentials. The Compose file passes the database password to the API and worker. Keep both files private; they are ignored by Git. Do not commit real keys or passwords.

Start the services:

```bash
docker compose up --build
```

The API listens on `http://localhost:5000`. The worker executes queued programs in Docker containers, so Docker must remain available while jobs run. Stop the stack with `Ctrl+C`; use `docker compose down` to stop and remove the containers. Persistent database and Redis data are kept in named volumes.

## Run the Node services directly

For development without the Compose stack, install Node.js 20 or later, PostgreSQL, Redis, and Docker. Create a private `.env` file using the variable names below, initialize the database with `db/init.sql`, then run the API and worker in separate terminals:

```bash
npm ci
npm start
```

```bash
npm run worker
```

## Environment variables

| Variable | Purpose | Default / example |
| --- | --- | --- |
| `PORT` | API listening port | `5000` |
| `JWT_SECRET` | Signs authentication tokens; set a long random secret | No secure default; required for authentication |
| `DATABASE_URL` | Optional PostgreSQL connection string | If omitted, the `DB_*` variables are used |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | Set privately; do not commit |
| `DB_NAME` | PostgreSQL database | `code_executor` |
| `DB_SSL` | Enable PostgreSQL SSL when using `DATABASE_URL` | `true` or `false` |
| `REDIS_URL` | Redis connection URL | Compose uses `redis://redis:6379`; local default is not configured |
| `JOBS_DIR` | Worker scratch directory | `temp` under the API project |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS SDK credentials for the DynamoDB event table | Supply privately; never commit |
| `AWS_SESSION_TOKEN` | Optional temporary AWS credential token | Supply when using temporary credentials |

The `.env.production.example` file is a template only. Copy it and replace the placeholder values before running; it contains no usable credentials.

## Available commands

| Command | Description |
| --- | --- |
| `npm start` | Start the HTTP API and Socket.IO server |
| `npm run worker` | Start the background code execution worker |
| `npm test` | Run the API test suite |

## Project layout

- `routes/`, `middleware/`, `services/`: HTTP routes and application services
- `workers/worker.js`: queued code execution worker
- `config/`: database, Redis, queue, and language configuration
- `db/init.sql`: PostgreSQL schema initialized by Compose
- `docker-compose.yml`: local API, worker, PostgreSQL, and Redis stack
