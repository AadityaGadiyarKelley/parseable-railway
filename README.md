# Parseable + Vector on Railway

A one-click Railway template that deploys [Parseable](https://www.parseable.com/) (open-source log observability) and [Vector](https://vector.dev/) (log shipper) together.  
Logs from all your Railway services flow into Parseable automatically via Railway's built-in log drain.

## Architecture

```
Railway services (stdout/stderr)
        │
        │  Railway Log Drain (HTTP POST)
        ▼
  ┌─────────────┐       HTTP ingest        ┌──────────────┐
  │   Vector    │  ─────────────────────►  │  Parseable   │
  │  (port 9292)│                          │  (port $PORT)│
  └─────────────┘                          └──────────────┘
```

## Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template)

> **Note:** Replace the button URL above with your published template URL after pushing this repo to GitHub and creating a Railway template.

---

## Services

| Service    | Description                                          |
|------------|------------------------------------------------------|
| `parseable`| Log storage and query UI — runs in local-store mode  |
| `vector`   | Receives Railway log drain events, ships to Parseable|

---

## Environment Variables

### Parseable

| Variable        | Default        | Description                                              |
|-----------------|----------------|----------------------------------------------------------|
| `PORT`          | set by Railway | Bind port (Railway injects this automatically)           |
| `P_USERNAME`    | `admin`        | Admin username for the UI and API                        |
| `P_PASSWORD`    | `admin`        | **Change this before going to production**               |
| `P_FS_DIR`      | `/parseable/data` | Where Parseable stores log data (local-store mode)    |
| `P_STAGING_DIR` | `/parseable/staging` | Temporary staging directory                        |
| `RUST_LOG`      | `warn`         | Log verbosity (`info`, `warn`, `error`)                  |

### Vector

| Variable        | Default                       | Description                                         |
|-----------------|-------------------------------|-----------------------------------------------------|
| `PARSEABLE_URL` | *(required)*                  | Full URL of your Parseable service, e.g. `https://parseable-production.up.railway.app` |
| `P_USERNAME`    | `admin`                       | Must match Parseable's `P_USERNAME`                 |
| `P_PASSWORD`    | `admin`                       | Must match Parseable's `P_PASSWORD`                 |
| `LOG_STREAM`    | `railway-logs`                | Parseable stream name (created automatically)       |
| `VECTOR_PORT`   | `9292`                        | Port Vector listens on for the Railway log drain    |

---

## Setup After Deploy

### 1. Set Parseable credentials

In the Parseable service → **Variables**, change:
```
P_USERNAME=your-username
P_PASSWORD=a-strong-password
```

### 2. Wire up Vector → Parseable

In the Vector service → **Variables**, add:
```
PARSEABLE_URL=https://<your-parseable-service>.up.railway.app
P_USERNAME=your-username
P_PASSWORD=a-strong-password
```

### 3. Create the Parseable log stream

Parseable does not auto-create streams. Run this once after Parseable is deployed:

```bash
curl -X PUT https://<your-parseable-service>.up.railway.app/api/v1/logstream/railway-logs \
  -u your-username:your-password
```

Or use the Parseable UI → **Streams → Create Stream** and name it `railway-logs`  
(or whatever value you set for `LOG_STREAM`).

### 4. Configure the Railway Log Drain

1. Open your Railway **Project Settings → Log Drain**
2. Add a new drain:
   - **Type:** HTTP
   - **URL:** `https://<your-vector-service>.up.railway.app/logs`
3. Save — Railway will now POST all service logs to Vector in real time.

### 6. Open Parseable UI

Navigate to `https://<your-parseable-service>.up.railway.app` and log in.  
Query the `railway-logs` stream to see your logs.

---

## Local Testing with Docker Compose

Test the full stack locally before deploying to Railway.

### 1. Create a `.env` file

```env
P_USERNAME=admin
P_PASSWORD=admin
PARSEABLE_URL=http://parseable:8000
LOG_STREAM=railway-logs
```

### 2. Create `docker-compose.yml`

```yaml
version: "3.9"
services:
  parseable:
    build: .
    ports:
      - "8000:8000"
    environment:
      PORT: "8000"
      P_USERNAME: admin
      P_PASSWORD: admin
      P_FS_DIR: /parseable/data
      P_STAGING_DIR: /parseable/staging
    volumes:
      - parseable_data:/parseable/data
      - parseable_staging:/parseable/staging

  vector:
    build:
      context: .
      dockerfile: vector/Dockerfile
    ports:
      - "9292:9292"
      - "8686:8686"   # Vector API / health
    environment:
      PARSEABLE_URL: http://parseable:8000
      P_USERNAME: admin
      P_PASSWORD: admin
      LOG_STREAM: railway-logs
    depends_on:
      - parseable

volumes:
  parseable_data:
  parseable_staging:
```

### 3. Start the stack

```bash
docker compose up --build
```

### 4. Create the log stream

Parseable does not auto-create streams. Run this once after the stack is up:

```bash
curl -X PUT http://localhost:8000/api/v1/logstream/railway-logs \
  -u admin:admin
```

### 5. Send a test log

```bash
curl -X POST http://localhost:9292/logs \
  -H "Content-Type: application/json" \
  -d '[{"message": "hello from local test", "service": "my-app", "level": "info"}]'
```

### 7. Verify in Parseable

- Open `http://localhost:8000`
- Log in with `admin` / `admin`
- Query the `railway-logs` stream — your test event should appear within ~5 seconds.

---

## Data Persistence

By default, Railway services use **ephemeral storage** — data is lost on redeploy.  
To persist logs, attach a [Railway Volume](https://docs.railway.com/reference/volumes) to the Parseable service and mount it at `/parseable/data`.

---

## Notes

- Parseable runs in **local-store mode** — no S3, MinIO, or object storage needed.
- The Parseable stream (`railway-logs` by default) is created automatically on first log ingest.
- Vector's internal logs are also shipped to Parseable under the same stream with `source = "vector-internal"` for easy filtering.
