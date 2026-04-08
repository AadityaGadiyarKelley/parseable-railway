# Parseable + Vector on Railway

An open-source log observability stack you can deploy on Railway in minutes.  
Includes **Parseable** (log storage + search UI), **Vector** (log shipper), and a **demo todo app** that sends logs automatically.

## Architecture

```
Your App (demo-app or your own)
        │
        │  HTTP POST to /logs
        ▼
  ┌─────────────┐       HTTP ingest        ┌──────────────┐
  │   Vector    │  ─────────────────────►  │  Parseable   │
  │  (port 9292)│                          │  (port $PORT)│
  └─────────────┘                          └──────────────┘
                                                  │
                                                  ▼
                                          Search UI + SQL queries
```

Every action your app takes is logged to Vector, which batches and forwards to Parseable every 5 seconds. Logs are stored permanently on a Railway Volume.

---

## Services

| Service      | Description                                                    |
|--------------|----------------------------------------------------------------|
| `parseable`  | Log storage and query UI — runs in local-store mode            |
| `vector`     | Receives log events from your app, forwards to Parseable       |
| `demo-app`   | Example Node.js todo app that sends logs to Vector             |

---

## Deploy on Railway

### Step 1 — Deploy Parseable

1. New Project → **GitHub Repo** → select this repo
2. Root directory: leave empty (uses root `Dockerfile`)
3. Go to **Variables** and add:
   ```
   P_ADDR=0.0.0.0:$PORT
   P_USERNAME=admin
   P_PASSWORD=admin
   P_FS_DIR=/data/parseable
   P_STAGING_DIR=/data/staging
   ```
4. Go to **Settings → Networking** → Generate Domain on port **8000**
5. Attach a **Volume**: click `+ Add` in the project → Volume → mount path `/data` → attach to this service

### Step 2 — Create the log stream

Parseable does not auto-create streams. Run this once after Parseable is active:

```bash
curl -X PUT https://<your-parseable-url>/api/v1/logstream/railway-logs \
  -u admin:admin
```

### Step 3 — Deploy Vector

1. New Service → **GitHub Repo** → same repo
2. Root directory: `vector`
3. Go to **Variables** and add:
   ```
   PARSEABLE_URL=https://<your-parseable-url>
   P_USERNAME=admin
   P_PASSWORD=admin
   LOG_STREAM=railway-logs
   ```
4. Go to **Settings → Networking** → Generate Domain on port **9292**

### Step 4 — Deploy the demo app (optional)

1. New Service → **GitHub Repo** → same repo
2. Root directory: `demo-app`
3. Go to **Variables** and add:
   ```
   VECTOR_URL=https://<your-vector-url>/logs
   PARSEABLE_UI_URL=https://<your-parseable-url>
   ```
4. Go to **Settings → Networking** → Generate Domain on port **8080**

---

## Environment Variables

### Parseable

| Variable        | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `P_ADDR`        | Set to `0.0.0.0:$PORT` — Railway injects PORT dynamically     |
| `P_USERNAME`    | Admin username for the UI and API (default: `admin`)           |
| `P_PASSWORD`    | Admin password — **change before going to production**         |
| `P_FS_DIR`      | Where logs are stored — set to `/data/parseable` with a Volume |
| `P_STAGING_DIR` | Temporary staging dir — set to `/data/staging`                 |

### Vector

| Variable        | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `PARSEABLE_URL` | Full URL of your Parseable service                             |
| `P_USERNAME`    | Must match Parseable's `P_USERNAME`                            |
| `P_PASSWORD`    | Must match Parseable's `P_PASSWORD`                            |
| `LOG_STREAM`    | Parseable stream name (default: `railway-logs`)                |

### Demo App

| Variable           | Description                                                 |
|--------------------|-------------------------------------------------------------|
| `VECTOR_URL`       | Full URL of Vector's `/logs` endpoint                       |
| `PARSEABLE_UI_URL` | Link shown in the app UI pointing to your Parseable instance|

---

## Sending logs from your own app

Point your app at Vector's public URL:

**Node.js**
```js
function log(level, message, extra = {}) {
  fetch("https://<your-vector-url>/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ level, message, service: "my-app", ...extra }])
  }).catch(() => {});
}
```

**Python**
```python
import requests, threading

def log(level, message, **extra):
    def send():
        requests.post("https://<your-vector-url>/logs",
            json=[{"level": level, "message": message, "service": "my-app", **extra}])
    threading.Thread(target=send, daemon=True).start()
```

**curl**
```bash
curl -X POST https://<your-vector-url>/logs \
  -H "Content-Type: application/json" \
  -d '[{"message": "hello", "level": "info", "service": "my-app"}]'
```

---

## Querying logs in Parseable

Open the Parseable UI and click **Explore** to run SQL queries:

```sql
-- All logs
select * from "railway-logs"

-- Only errors
select * from "railway-logs" where level = 'warn'

-- Logs from a specific service
select * from "railway-logs" where service = 'demo-app'

-- Recent deletions
select * from "railway-logs" where message like '%deleted%'
```

> **Tip:** Change the time range selector (10m / 1h / 1d) at the top if you get no results.

---

## Local Testing with Docker Compose

```bash
# Start the stack
docker compose up --build

# Create the log stream
curl -X PUT http://localhost:8000/api/v1/logstream/railway-logs -u admin:admin

# Send a test log
curl -X POST http://localhost:9292/logs \
  -H "Content-Type: application/json" \
  -d '[{"message": "hello from local", "service": "my-app", "level": "info"}]'

# Open Parseable UI at http://localhost:8000
```

---

## Notes

- Parseable runs in **local-store mode** — no S3 or object storage needed.
- Vector batches logs every **5 seconds** before forwarding — a small delay is expected.
- Railway's Log Drain (auto-collect logs from all services) requires the **Pro plan**. On the free tier, apps send logs directly to Vector's HTTP endpoint.
- Stream metadata is recreated automatically after redeploys but you need to run the `PUT /logstream` command once after first deploy.
- The Parseable base image is distroless — `P_ADDR` must be set as an environment variable, not via a shell command.
