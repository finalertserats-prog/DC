# Data Commander — Run Instructions

## Prerequisites (one-time checks before starting)

### 1. PostgreSQL
Must be running with the `data_explorer` database and `data_explorer_user` accessible.
```bash
psql -d data_explorer -c "SELECT 1;"
```
If the user is missing:
```bash
psql -d data_explorer -c "CREATE USER data_explorer_user WITH PASSWORD 'explorer123';"
psql -d data_explorer -c "GRANT ALL PRIVILEGES ON DATABASE data_explorer TO data_explorer_user;"
psql -d data_explorer -c "GRANT ALL ON SCHEMA public TO data_explorer_user;"
psql -d data_explorer -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO data_explorer_user;"
psql -d data_explorer -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO data_explorer_user;"
```

### 2. Redis
Must be running on `localhost:6379`.
```bash
redis-cli ping   # should return PONG
```
If not running:
```bash
brew services start redis
```

### 3. Native Node modules (macOS — run once after cloning or moving the repo)
```bash
cd /Users/yashaswiram/work_codes/Data_Commander/backend && npm rebuild bcrypt
```

---

## Start All Services

```bash
cd /Users/yashaswiram/work_codes/Data_Commander
pm2 delete all
pm2 start ecosystem.config.js
pm2 status
```

---

## Service Map

| PM2 Name                  | Type       | URL / Port                  |
|---------------------------|------------|-----------------------------|
| `data-explorer-backend`   | Node/HTTPS | https://localhost:5000      |
| `data-explorer-frontend`  | Vite dev   | http://localhost:5173       |
| `etl-pipeline-server`     | Node       | http://localhost:4000       |
| `etl-pipeline-frontend`   | Vite dev   | http://localhost:3000       |
| `superset-dataviz-backend`| Python     | http://localhost:8000       |
| `superset-dataviz-frontend`| Vite dev  | http://localhost:5174       |
| `data-disposition-backend`| Python     | http://localhost:3978       |
| `sdp-metadata-backend`    | Node       | https://localhost:5000 (own port in .env) |
| `sdp-metadata-frontend`   | Vite dev   | http://localhost:5175       |

**Main app (Data Commander):** https://localhost:5173

---

## Known Fixes Already Applied

- `ecosystem.config.js` — all `cwd` paths use `/Users/yashaswiram/work_codes/Data_Commander/`
- `backend/node_modules/bcrypt` — rebuilt for macOS arm64
- `superset-dataviz/frontend/node_modules` — clean reinstalled for macOS (rollup native)
- `data-disposition/gateway_app/api/tab_routes.py` — router prefix changed from `/tabs/api` to `/api` to match frontend calls
- `data-disposition` + `superset-dataviz` Python deps — installed with relaxed version pins (cffi/cryptography/snowflake conflict)
- PostgreSQL `data_explorer_user` — created and granted table permissions

---

## Stop All Services

```bash
pm2 delete all
```
