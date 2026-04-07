# 🚀 SDP Pipeline Studio — Complete Guide

> **"Explain it like I'm 5"** — A simple, visual, end-to-end explanation of how this application works.

---

## 📖 Table of Contents

1. [What Is This App?](#1-what-is-this-app)
2. [The Big Picture (One Image)](#2-the-big-picture)
3. [The Two Parts of This App](#3-the-two-parts-of-this-app)
4. [How to Start the App](#4-how-to-start-the-app)
5. [The Pages You Can Visit](#5-the-pages-you-can-visit)
6. [Step-by-Step: Deploying a Pipeline](#6-step-by-step-deploying-a-pipeline)
7. [What Happens Behind the Scenes During Deployment](#7-what-happens-behind-the-scenes-during-deployment)
8. [The 6 Deployment Steps Explained](#8-the-6-deployment-steps-explained)
9. [How Real-Time Progress Works (SSE)](#9-how-real-time-progress-works-sse)
10. [Where Are Files Deployed To?](#10-where-are-files-deployed-to)
11. [Environment Variable Substitution](#11-environment-variable-substitution)
12. [Folder Structure Explained](#12-folder-structure-explained)
13. [Tech Stack Summary](#13-tech-stack-summary)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What Is This App?

Imagine you have a **toy factory** 🏭. Every day, the factory needs instructions:
- *"How to collect the raw materials"* (extract data)
- *"How to shape the toys"* (transform data)
- *"Where to put the finished toys"* (load data)

This app is like a **remote control** 🎮 for that factory. Instead of you manually going to each machine and placing instructions, you:

1. **Tell the app** what data you want to process (e.g., "I want data from MongoDB for the 'codeiq' application")
2. **Press "Deploy"** 🚀
3. The app **automatically**:
   - Downloads the right instruction files from Git (like downloading a recipe)
   - Connects to remote servers via SSH (like calling the factory floor)
   - Creates the right folders on those servers
   - Uploads all the instruction files to the right places
   - Everything happens in real-time and you watch the progress live

**In technical terms:** This is an **ETL Pipeline Deployer**. ETL stands for **E**xtract, **T**ransform, **L**oad. The app deploys pipeline scripts (Python files, DAG files, Spark jobs) to Apache Airflow and Hadoop/Spark servers.

---

## 2. The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR COMPUTER (Browser)                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              SDP Pipeline Studio (React App)              │  │
│  │                                                           │  │
│  │  1. You fill in: Organization, App Name, Database Info    │  │
│  │  2. You click "Deploy Pipeline"                           │  │
│  │  3. You watch real-time progress bars 📊                  │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                      │
│                          │ HTTP requests (/api/...)              │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │          Backend Server (Node.js + Express)               │  │
│  │          Running on http://localhost:4000                  │  │
│  └───────┬──────────────┬────────────────────┬───────────────┘  │
│          │              │                    │                   │
└──────────┼──────────────┼────────────────────┼──────────────────┘
           │              │                    │
           ▼              ▼                    ▼
    ┌──────────┐   ┌────────────┐     ┌────────────────┐
    │ Git      │   │ Airflow    │     │ Staging Server │
    │ Server   │   │ Server     │     │ (Spark Jobs)   │
    │          │   │            │     │                │
    │ Has all  │   │ Where DAGs │     │ Where Spark    │
    │ template │   │ & scripts  │     │ .py files go   │
    │ files    │   │ are placed │     │                │
    └──────────┘   └────────────┘     └────────────────┘
   git.techsophy    sdpplyafw01        sdpplydn01
      .com         .techsophy.com     .techsophy.com
```

**Simple version:**
1. You type settings in the browser
2. Browser tells the backend server what to do
3. Backend server does the heavy work:
   - Downloads files from Git
   - Connects to remote servers via SSH
   - Uploads files to those servers
4. Backend sends live progress updates back to the browser

---

## 3. The Two Parts of This App

This app has **TWO separate programs** that work together:

### 🖥️ Part A: The Frontend (what you see)

| Detail | Value |
|--------|-------|
| **What** | A website/web app in your browser |
| **Tech** | React 19 + TypeScript + Tailwind CSS |
| **Port** | http://localhost:3000 |
| **Folder** | `sdp-pipeline-studio/src/` |
| **Job** | Show forms, buttons, progress bars. Send your choices to the backend. |

Think of this as the **TV remote** — it has buttons and a screen, but it doesn't actually change the TV channel by itself. It sends signals.

### ⚙️ Part B: The Backend (what does the work)

| Detail | Value |
|--------|-------|
| **What** | A server running on your computer |
| **Tech** | Node.js + Express + SSH2 |
| **Port** | http://localhost:4000 |
| **File** | `sdp-pipeline-studio/server/index.js` |
| **Job** | Clone Git repos, SSH into servers, create folders, upload files |

Think of this as the **TV itself** — it receives signals from the remote and actually changes channels.

### How They Talk To Each Other

```
Browser (port 3000)  ──── /api/deploy ────►  Backend (port 4000)
                     ◄─── SSE events ──────
```

The frontend sends **HTTP requests** to the backend (like `POST /api/deploy`).
The backend sends **live updates** back using SSE (Server-Sent Events) — like a radio station broadcasting.

Vite (the frontend's dev server) has a **proxy** configured: any request to `/api/...` from the browser automatically gets forwarded to `http://localhost:4000`. So the browser thinks it's talking to itself, but behind the scenes, the request goes to the backend.

---

## 4. How to Start the App

You need to start **BOTH** the frontend and backend:

### Terminal 1 — Start the Backend:
```powershell
cd c:\etl-pipeline-deployer\sdp-pipeline-studio\server
node index.js
```
You'll see:
```
  ======================================================
  SDP Pipeline Studio - API Server v2.0
  Running on http://localhost:4000
  Real SSH deployment enabled
  ======================================================
```

### Terminal 2 — Start the Frontend:
```powershell
cd c:\etl-pipeline-deployer\sdp-pipeline-studio
npm run dev
```
You'll see:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

### Now open your browser to: http://localhost:3000

> **Shortcut:** You can also run `npm start` which starts both at once using `concurrently`.

---

## 5. The Pages You Can Visit

The app has **6 pages**. Think of them like rooms in a house:

| # | Page | URL Path | What It Does |
|---|------|----------|--------------|
| 1 | **Dashboard** | `/` | Home page. Shows stats, charts, recent deployments. Like a scoreboard. |
| 2 | **New Pipeline** | `/pipeline` | ⭐ THE MAIN PAGE. This is where you configure and deploy pipelines. |
| 3 | **Deployments** | `/deployments` | History of all past deployments. Search, filter, export to CSV. |
| 4 | **Deployment Detail** | `/deployments/:id` | Detailed view of one specific deployment. |
| 5 | **Monitoring** | `/monitoring` | Shows health status of servers (Airflow, Staging, HDFS, S3, Hive, Git). |
| 6 | **Settings** | `/settings` | Profile, server config, appearance, notifications, security, data management. |

### The Layout (Every Page Has This)

```
┌──────────────────────────────────────────────────────────────┐
│ [Sidebar]              │  [Header: Page Title + Notifs]      │
│                        │─────────────────────────────────────│
│  🚀 SDP Pipeline      │                                     │
│     Studio v2.0        │                                     │
│                        │                                     │
│  📊 Dashboard          │        [ PAGE CONTENT ]             │
│  🚀 New Pipeline       │                                     │
│  📋 Deployments        │        (changes based on            │
│  📈 Monitoring         │         which page you're on)       │
│  ⚙️ Settings           │                                     │
│                        │                                     │
│  ── Infrastructure ──  │                                     │
│  🟢 Airflow            │                                     │
│  🟢 Staging            │                                     │
│                        │                                     │
│  👤 Admin User         │                                     │
│     admin              │                                     │
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar** (left): Navigation links + server status indicators (green/red dots)
- **Header** (top): Shows current page title + search + theme toggle (☀️/🌙) + notifications bell 🔔
- **Main Content** (center): Changes based on which page you're viewing

---

## 6. Step-by-Step: Deploying a Pipeline

This is the **main feature** of the app. Here's exactly what happens when you deploy:

### Step 1: Go to "New Pipeline" page

Click **"New Pipeline"** in the sidebar (or visit `/pipeline`).

### Step 2: Fill in the Configuration (Wizard Step 1 of 3: "Configure")

You see a form with TWO cards side by side:

**Left Card — Basic Information:**
- **Organization Name** — e.g., `techsophy`, `awgment` (auto-lowercased, spaces → underscores)
- **Application Name** — e.g., `codeiq`, `biometric`
- **Source Type** — Choose "Database" or "S3"
  - If **Database**: Choose MongoDB, PostgreSQL, or MySQL
  - If **S3**: Just enter bucket name
- **Git Authentication** (optional toggle) — GitLab username + Personal Access Token

**Right Card — Source Connection:**
- If **MongoDB**: Connection string, database name, collection name
- If **PostgreSQL/MySQL**: Username, password, host, port, database name, table names
- If **S3**: Bucket name, S3 path
- **Test Connection** button — Checks if your database is reachable (TCP ping)

### Step 3: Click "Validate & Continue"

The app checks:
- ✅ Organization name filled in?
- ✅ Application name filled in?
- ✅ Database details complete?
- ✅ Git token starts with `glpat-`? (if enabled)

If all good → moves to **Step 2 of 3: "Review"**

### Step 4: Review Your Configuration (Wizard Step 2 of 3: "Review")

Shows a summary of:
- Your organization + app name
- Database type and connection info
- **All target paths** where files will be deployed:
  - DAG Files → `/mnt/dags_root/<org>/`
  - Task Scripts → `/mnt/task_scripts_root/<org>/<app>/<dbType>/`
  - S3 CSVs → `s3://gayatri2datalake/pms/dl_source/<org>/<app>/<dbType>/csvs/`
  - HDFS Dumpzone → `/dumpzone/<org>/<app>/<dbType>/csvs/`
  - Spark Jobs → `/home/tsloader/spark_jobs/<org>/raw/general/csvtohudi/<app>/`
- Expected file counts (directories, TaskScripts, DAGs, Spark jobs)

### Step 5: Click "Deploy Pipeline" 🚀 (Wizard Step 3 of 3: "Deploy")

**This is where the magic happens!**

The screen switches to show:
- A **progress bar** (0% → 100%)
- **6 deployment steps** with live status:
  - ⏳ Pending (gray) → 🔄 Running (blue, animated) → ✅ Success (green) / ❌ Error (red)

You watch each step complete in real-time. The heading changes based on result:
- 🚀 "Deploying Pipeline..." (while running)
- 🎉 "Deployment Complete!" (all succeeded)
- ❌ "Deployment Failed" (all failed)
- ⚠️ "Deployment Partial (4/6 succeeded)" (some failed)

After completion, you see a **Deployment Summary** with file counts per step.

---

## 7. What Happens Behind the Scenes During Deployment

When you click **"Deploy Pipeline"**, here's exactly what happens, message by message:

```
     Browser                              Backend Server
        │                                      │
        │  POST /api/deploy                    │
        │  {org, app, dbType, dbConfig, ...}   │
        │─────────────────────────────────────►│
        │                                      │
        │  Response: {deploymentId: "abc-123"} │
        │◄─────────────────────────────────────│
        │                                      │
        │  GET /api/deploy/abc-123/stream      │  (SSE connection opens)
        │─────────────────────────────────────►│
        │                                      │
        │  SSE: {step:1, status:"running"}     │  ← Backend starts cloning Git
        │◄─────────────────────────────────────│
        │                                      │
        │  SSE: {step:1, status:"success"}     │  ← Clone finished!
        │◄─────────────────────────────────────│
        │                                      │
        │  SSE: {step:2, status:"running"}     │  ← Connecting SSH...
        │◄─────────────────────────────────────│
        │                                      │
        │  SSE: {step:2, status:"success"}     │  ← Connected!
        │◄─────────────────────────────────────│
        │                                      │
        │  ... (steps 3-6 same pattern) ...    │
        │                                      │
        │  SSE: {type:"complete", status:"success", metrics:{...}} │
        │◄─────────────────────────────────────│
        │                                      │
        │  (Browser closes SSE connection)     │
        │                                      │
```

### The Flow in Plain English:

1. **Browser sends `POST /api/deploy`** with all your config (org name, app name, database details)
2. **Backend creates a deployment ID** (like a ticket number: `abc-123`) and returns it immediately
3. **Backend starts the real deployment in the background** (async — doesn't block the response)
4. **Browser opens an SSE connection** to `/api/deploy/abc-123/stream` to get live updates
5. **Backend sends events** as each step starts, succeeds, or fails
6. **Browser updates the UI** in real-time (progress bars, status badges, logs)
7. **When done**, backend sends a `complete` event, browser closes the connection

### Event Buffering (Why No Events Are Lost)

There's a timing challenge: the backend starts working *immediately* after `POST /api/deploy`, but the browser needs a moment to open the SSE connection. What if Step 1 finishes before the browser connects?

**Solution: Event Buffering** 🔄

```
Backend: "Step 1 running"  → saves to buffer + sends live (no one listening yet)
Backend: "Step 1 success"  → saves to buffer + sends live (still no listener)
Browser: Opens SSE connection
Backend: "Here are all buffered events you missed!" → replays buffer
Browser: "Oh! Step 1 is already done, let me update the UI"
Backend: "Step 2 running"  → sends live (browser is listening now)
```

This way, even if the browser connects late, it gets ALL events — nothing is lost.

---

## 8. The 6 Deployment Steps Explained

### Step 1: 📦 Clone Repository

**What:** Downloads the template code from a Git server.

**How:**
- The backend runs `git clone --branch dev --depth 1 <url>` to download the repository
- It tries multiple repo name patterns (e.g., `codeiq_ingest`, `s3_ingest`) until one works
- Files are cloned into a temporary folder on YOUR computer
- The clone is shallow (`--depth 1`) so it's fast — only the latest version

**Where from:** `https://git.techsophy.com/datalake/source_<org>/<app>_ingest.git`

**What's inside the repo:**
```
<cloned_repo>/
├── TaskScripts/          ← Python scripts for data processing
│   ├── GenerateCSV/
│   ├── ExportCSVS3ToS3/
│   ├── PushToHDFS/
│   ├── SchemaOnly/
│   ├── FullSchema/
│   ├── python_libs/
│   └── RawZone/          ← Spark jobs
├── Dags/                 ← Airflow DAG definition files
│   ├── dag_file_1.py
│   └── dag_file_2.py
└── ...
```

### Step 2: 🔌 Connect to Airflow Server

**What:** Opens an SSH connection to the Airflow server.

**How:**
- Uses the SSH2 library to connect to `sdpplyafw01.techsophy.com` (port 22)
- Login: username `hadoop`, password `welcome1`
- Runs `whoami` to verify the connection works
- This connection stays open and is reused for Steps 3, 4, and 5

**Think of it like:** Calling the factory and saying "Hello, this is hadoop, let me in."

### Step 3: 📁 Create Directories

**What:** Creates 12 folders on the Airflow server where files will be placed.

**How:**
- Runs a **single** SSH command: `mkdir -p dir1 dir2 dir3 ...` (creates all 12 at once)
- Then verifies they exist with `ls -d dir1 dir2 ...`

**Directories created:**
```
/mnt/task_scripts_root/<org>/
/mnt/task_scripts_root/<org>/<app>/
/mnt/task_scripts_root/<org>/<app>/<dbType>/
/mnt/task_scripts_root/<org>/<app>/<dbType>/GenerateCSV/
/mnt/task_scripts_root/<org>/<app>/<dbType>/ExportCSVS3ToS3/
/mnt/task_scripts_root/<org>/<app>/<dbType>/PushToHDFS/
/mnt/task_scripts_root/<org>/<app>/<dbType>/PushToHDFS/PushCSVs/
/mnt/task_scripts_root/<org>/<app>/<dbType>/PushToHDFS/PushYamls/
/mnt/task_scripts_root/<org>/<app>/<dbType>/SchemaOnly/
/mnt/task_scripts_root/<org>/<app>/<dbType>/FullSchema/
/mnt/task_scripts_root/<org>/<app>/<dbType>/python_libs/
/mnt/dags_root/<org>/
```

### Step 4: 📜 Deploy TaskScripts

**What:** Uploads Python scripts (`.py`, `.yaml`, `.yml`) from the cloned repo to the Airflow server.

**How:**
1. Reads each file from the cloned repo's `TaskScripts/` folder
2. **Substitutes environment variables** in each file (see [Section 11](#11-environment-variable-substitution))
3. Opens ONE SFTP session (file transfer channel over SSH)
4. Uploads files in **parallel batches of 5** for speed
5. Closes the SFTP session

**From → To:**
```
Local: <cloned_repo>/TaskScripts/GenerateCSV/script.py
  ↓  (substitute variables + upload via SFTP)
Remote: /mnt/task_scripts_root/<org>/<app>/<dbType>/GenerateCSV/script.py
```

**Subdirectories processed:**
- `GenerateCSV/` — Scripts to extract data and generate CSV files
- `ExportCSVS3ToS3/` — Scripts to move CSVs between S3 buckets
- `PushToHDFS/PushCSVs/` — Scripts to push CSV files to Hadoop HDFS
- `PushToHDFS/PushYamls/` — Scripts to push YAML configs to HDFS
- `SchemaOnly/` — Schema extraction scripts
- `FullSchema/` — Full schema scripts
- `python_libs/` — Shared Python libraries

### Step 5: 📋 Deploy DAGs

**What:** Uploads Airflow DAG files to the Airflow server.

**How:**
1. Reads all `.py` and `.json` files from the cloned repo's `Dags/` folder
2. Substitutes environment variables in each file
3. Opens ONE SFTP session, uploads all DAGs in parallel
4. Closes the SFTP session

**From → To:**
```
Local: <cloned_repo>/Dags/dag_codeiq_mongodb.py
  ↓  (substitute variables + upload via SFTP)
Remote: /mnt/dags_root/<org>/dag_codeiq_mongodb.py
```

**What are DAGs?** DAG = Directed Acyclic Graph. In Apache Airflow, a DAG file defines the workflow — "first do Task A, then Task B, then Task C." It's like a recipe that tells Airflow what order to run the pipeline steps.

### Step 6: ⚡ Deploy Spark Jobs

**What:** Uploads Spark Python scripts to a DIFFERENT server (the Staging server).

**How:**
1. Looks for Spark files in `TaskScripts/RawZone/<app>/` (tries multiple path patterns)
2. Opens a NEW SSH connection to the Staging server (`sdpplydn01.techsophy.com`, user `tsloader`)
3. Creates the target directory via SSH
4. Opens SFTP, uploads all `.py` files in parallel
5. Runs `chmod +x` on uploaded files (makes them executable)
6. Closes connection

**From → To:**
```
Local: <cloned_repo>/TaskScripts/RawZone/codeiq/ingestToHudi.py
  ↓  (replace org/app names + upload via SFTP + chmod +x)
Remote: /home/tsloader/spark_jobs/<org>/raw/general/csvtohudi/<app>/ingestToHudi.py
```

**Note:** This step connects to a DIFFERENT server than Steps 2-5. Steps 2-5 use the **Airflow server**, Step 6 uses the **Staging server**.

**Why "skipped" sometimes?** If the Git repo doesn't have a `TaskScripts/RawZone/` folder, this step is skipped with a success message — it's optional.

---

## 9. How Real-Time Progress Works (SSE)

**SSE = Server-Sent Events**

Think of it like a **radio station** 📻:
- The backend is the radio station (broadcasts events)
- The browser is the radio (receives events)
- The "frequency" is the URL `/api/deploy/<id>/stream`

```javascript
// Browser side (simplified):
const eventSource = new EventSource('/api/deploy/abc-123/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data = { type: 'step', step: 3, status: 'success', message: 'Created 12 directories' }
  // Update the UI based on this data
};
```

```javascript
// Backend side (simplified):
function sendSSE(deploymentId, data) {
  // Save to buffer (in case browser connects late)
  eventBuffers.get(deploymentId).push(data);
  
  // Send to browser if connected
  const res = activeStreams.get(deploymentId);
  if (res) {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  }
}
```

### Event Types:

| Event Type | When | Example Data |
|------------|------|-------------|
| `connected` | Browser opens SSE connection | `{type: "connected", deploymentId: "abc-123"}` |
| `step` (running) | A step starts | `{type: "step", step: 1, status: "running", message: "Cloning..."}` |
| `step` (success) | A step finishes OK | `{type: "step", step: 1, status: "success", message: "Cloned!", metrics: {...}}` |
| `step` (error) | A step fails | `{type: "step", step: 1, status: "error", message: "Clone failed: ..."}` |
| `complete` | All done | `{type: "complete", status: "success", metrics: {totalFiles: 15, ...}}` |

---

## 10. Where Are Files Deployed To?

### Server Map:

| Server | Hostname | IP | User | Purpose |
|--------|----------|-----|------|---------|
| **Airflow** | sdpplyafw01.techsophy.com | 65.21.48.174 | hadoop | DAGs + TaskScripts |
| **Staging** | sdpplydn01.techsophy.com | 65.21.1.173 | tsloader | Spark Jobs |
| **HDFS NameNode** | sdpplynn01.techsophy.com | — | hadoop | Hadoop filesystem |
| **Hive Metastore** | sdpplystg01.techsophy.com | — | hadoop | Hive metadata DB |
| **Git** | git.techsophy.com | — | — | Source code repos |
| **S3** | gayatri2datalake (ap-south-2) | — | — | AWS S3 storage |

### File Placement Map:

```
Airflow Server (sdpplyafw01):
├── /mnt/dags_root/<org>/
│   ├── dag_app_mongodb.py              ← DAG files (Step 5)
│   ├── dag_app_config.json
│   └── ...
└── /mnt/task_scripts_root/<org>/<app>/<dbType>/
    ├── GenerateCSV/                     ← Task scripts (Step 4)
    │   └── generate_csv_script.py
    ├── ExportCSVS3ToS3/
    │   └── export_csv.py
    ├── PushToHDFS/
    │   ├── PushCSVs/push_csvs.py
    │   └── PushYamls/push_yamls.py
    ├── SchemaOnly/schema.py
    ├── FullSchema/full_schema.py
    └── python_libs/utils.py

Staging Server (sdpplydn01):
└── /home/tsloader/spark_jobs/<org>/raw/general/csvtohudi/<app>/
    └── ingestMultipleCSVWithACKToHDFS.py    ← Spark jobs (Step 6)
```

---

## 11. Environment Variable Substitution

This is a crucial part. The files in the Git repo are **templates** — they have **placeholders** that get replaced with real values before uploading.

### How It Works:

**Before (file in Git repo):**
```python
CONNECTION_STRING = "$SOURCE_DB_CONNECTION_STRING"
DB_NAME = "$SOURCE_DB_NAME"
S3_BUCKET = "$AWS_SOURCE_BUCKET_NAME"
CSV_PATH = "pms/dl_source/techsophy/codeiq/mongodb/csvs/"
DUMPZONE = "/dumpzone/techsophy/codeiq/mongodb/csvs/"
```

**After (file uploaded to server — org=`mycompany`, app=`myapp`, dbType=`postgres`):**
```python
CONNECTION_STRING = "postgresql://user:pass@host:5432/mydb"
DB_NAME = "mydb"
S3_BUCKET = "gayatri2datalake"
CSV_PATH = "pms/dl_source/mycompany/myapp/postgres/csvs/"
DUMPZONE = "/dumpzone/mycompany/myapp/postgres/csvs/"
```

### Categories of Replacements:

| Category | Placeholder | Replaced With |
|----------|-------------|---------------|
| **Org/App** | `<organization>`, `<org>`, `techsophy` | Your organization name |
| **Org/App** | `<application>`, `<app>`, `codeiq` | Your application name |
| **Org/App** | `<db_type>`, `<dbtype>` | Your database type |
| **AWS** | `$AWS_SOURCE_ACCESS_KEY_ID` | Real AWS access key |
| **AWS** | `$AWS_SOURCE_SECRET_ACCESS_KEY` | Real AWS secret key |
| **AWS** | `$AWS_SOURCE_BUCKET_NAME` | `gayatri2datalake` |
| **HDFS** | `$HDFS_URI` | `hdfs://sdpplynn01.techsophy.com:9820` |
| **HDFS** | `$HDFS_USER` | `hadoop` |
| **Hive** | `$HIVE_JDBC_URL` | `jdbc:postgresql://sdpplystg01...` |
| **DB** | `$SOURCE_DB_CONNECTION_STRING` | Your MongoDB connection string |
| **DB** | `$SOURCE_DB_USERNAME`, `$SOURCE_DB_PASSWORD` | Your RDBMS credentials |
| **Paths** | Hardcoded `techsophy/codeiq` paths | Your `org/app` paths |

### Why Do This?

The Git repo has ONE set of template files that work for EVERY organization and application. Instead of creating separate files for each client, you just swap out the variables. It's like a **mail merge** — same letter, different names.

---

## 12. Folder Structure Explained

```
sdp-pipeline-studio/
├── package.json              ← Project config (dependencies, scripts)
├── vite.config.ts            ← Vite config (dev server on port 3000, proxy to port 4000)
├── tsconfig.json             ← TypeScript config
├── tailwind.config.js        ← Tailwind CSS design tokens
├── index.html                ← Single HTML page (React mounts here)
│
├── server/                   ← ⚙️ BACKEND (Node.js)
│   ├── package.json          ← Backend dependencies (express, ssh2, cors)
│   └── index.js              ← 🔥 THE ENTIRE BACKEND (1093 lines)
│                               Contains: SSH helpers, Git clone, SFTP upload,
│                               env var substitution, all API routes, SSE streaming,
│                               deployment pipeline logic
│
├── src/                      ← 🖥️ FRONTEND (React + TypeScript)
│   ├── main.tsx              ← Entry point (renders <App /> into index.html)
│   ├── App.tsx               ← Router setup (maps URLs to pages)
│   ├── index.css             ← Global CSS + Tailwind imports
│   │
│   ├── pages/                ← 📄 PAGES (one per route)
│   │   ├── Dashboard.tsx     ← Home page with stats + charts
│   │   ├── PipelineConfig.tsx← ⭐ MAIN PAGE: 3-step deploy wizard (960 lines)
│   │   ├── Deployments.tsx   ← Deployment history list
│   │   ├── DeploymentDetail.tsx ← Single deployment detail view
│   │   ├── Monitoring.tsx    ← Server health monitoring
│   │   └── Settings.tsx      ← App settings (profile, servers, theme, etc.)
│   │
│   ├── components/           ← 🧩 REUSABLE UI COMPONENTS
│   │   ├── Layout/
│   │   │   ├── Layout.tsx    ← Page shell (sidebar + header + content)
│   │   │   ├── Sidebar.tsx   ← Left navigation + server status
│   │   │   └── Header.tsx    ← Top bar (title, search, notifications)
│   │   └── ui/
│   │       └── index.tsx     ← Card, StatCard, ProgressBar, StatusBadge,
│   │                            Stepper, SectionHeader, EmptyState, Skeleton
│   │
│   ├── stores/               ← 🗃️ STATE MANAGEMENT (Zustand)
│   │   └── index.ts          ← All stores: Auth, Theme, Pipeline, Deployment,
│   │                            Notification, ServerStatus, Dashboard
│   │
│   ├── types/                ← 📝 TYPESCRIPT TYPES
│   │   └── index.ts          ← All interfaces: PipelineConfig, DeploymentStep,
│   │                            MongoDBConfig, RDBMSConfig, etc.
│   │
│   ├── config/               ← ⚙️ CONSTANTS
│   │   └── constants.ts      ← Server configs, DB types, HDFS config,
│   │                            deployment step definitions
│   │
│   └── services/             ← 🌐 API CLIENT
│       └── api.ts            ← Axios wrapper: checkServerHealth,
│                                validatePipelineConfig, getDashboardStats, etc.
│
├── public/                   ← Static assets (favicon, etc.)
└── dist/                     ← Build output (generated by `npm run build`)
```

---

## 13. Tech Stack Summary

### Frontend Technologies:

| Technology | Version | What It Does |
|-----------|---------|--------------|
| **React** | 19.0 | UI library — builds the interface from components |
| **TypeScript** | 5.7 | Type-safe JavaScript — catches errors before runtime |
| **Vite** | 6.0 | Dev server + build tool — fast hot-reload during development |
| **Tailwind CSS** | 3.4 | Utility-first CSS — `className="text-white bg-brand-500"` |
| **Zustand** | 5.0 | State management — stores data that persists across pages |
| **React Router** | 7.1 | URL routing — maps `/pipeline` to PipelineConfig page |
| **Framer Motion** | 11.15 | Animations — smooth transitions, page slides |
| **Recharts** | 2.15 | Charts — area charts, bar charts on Dashboard |
| **React Hot Toast** | 2.4 | Toast notifications — "Deployment Complete!" popups |
| **Heroicons** | 2.2 | Icons — 🚀 ⚙️ 📊 icons throughout the app |
| **Axios** | 1.7 | HTTP client — calls backend APIs |
| **date-fns** | 4.1 | Date formatting utilities |
| **clsx** | 2.1 | Conditional CSS class joining |

### Backend Technologies:

| Technology | What It Does |
|-----------|--------------|
| **Node.js** | JavaScript runtime — runs the server |
| **Express** | Web framework — handles HTTP routes (`/api/deploy`, etc.) |
| **SSH2** | SSH client — connects to Airflow/Staging servers securely |
| **child_process** | Runs `git clone` command on your machine |
| **fs** | Reads files from the cloned Git repo |
| **net** | TCP socket — used for "Test Connection" feature |
| **crypto** | Generates unique deployment IDs (UUIDs) |
| **cors** | Allows frontend (port 3000) to talk to backend (port 4000) |

### State Management (Zustand Stores):

| Store | What It Holds |
|-------|---------------|
| **useAuthStore** | Current user info (name, email, role). Persisted in localStorage. |
| **useThemeStore** | Dark/light mode toggle. Persisted in localStorage. |
| **usePipelineStore** | Current pipeline config (org, app, db details). Reset on new deployment. |
| **useDeploymentStore** | Deployment state: isDeploying, steps[], history[]. Persisted in localStorage. |
| **useNotificationStore** | Notification list + unread count. |
| **useServerStatusStore** | Airflow/Staging server online/offline status. |
| **useDashboardStore** | Dashboard statistics and chart data. |

---

## 14. Troubleshooting

### "I see old deployment data when I open the app"

The deployment history is stored in your browser's `localStorage`. To clear it:
- Open browser DevTools (F12) → Application → Local Storage → delete keys starting with `sdp-`
- Or click **"New Deployment"** button to reset the current deployment

### "Port 4000 is already in use" (EADDRINUSE)

Another process is using port 4000. Find and kill it:
```powershell
# Find what's using port 4000
netstat -ano | findstr :4000

# Kill the process (replace <PID> with the number from above)
taskkill /PID <PID> /F
```

### "CORS error" or "Failed to fetch"

The backend isn't running. Make sure `node index.js` is running in the server folder.

### "SSH connection failed"

- Check if the Airflow/Staging server is reachable from your network
- Verify VPN is connected (if required)
- Check the password in `server/index.js` is correct

### "Git clone failed"

- The repo may not exist for that org/app combination
- Check Git credentials if using private repos
- Verify `git` is installed on your machine

### "Deployment shows 0% with all steps failed"

This was a known bug (now fixed). If you see it:
1. Check the browser console for errors
2. Restart the backend server
3. Clear localStorage and try again

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│          SDP PIPELINE STUDIO CHEAT SHEET        │
├─────────────────────────────────────────────────┤
│                                                 │
│  START:                                         │
│    Terminal 1: cd server && node index.js        │
│    Terminal 2: npm run dev                       │
│    Browser:    http://localhost:3000             │
│                                                 │
│  DEPLOY A PIPELINE:                             │
│    1. Click "New Pipeline"                      │
│    2. Fill org + app + database details         │
│    3. Click "Validate & Continue"               │
│    4. Review settings                           │
│    5. Click "Deploy Pipeline" 🚀                │
│    6. Watch the 6 steps complete                │
│                                                 │
│  THE 6 STEPS:                                   │
│    1. Clone Repository (from Git)               │
│    2. Connect Server (SSH to Airflow)           │
│    3. Create Directories (12 folders)           │
│    4. Deploy TaskScripts (.py, .yaml files)     │
│    5. Deploy DAGs (Airflow workflow files)       │
│    6. Deploy Spark Jobs (to staging server)     │
│                                                 │
│  SERVERS:                                       │
│    Airflow:  sdpplyafw01 (hadoop/welcome1)      │
│    Staging:  sdpplydn01  (tsloader/tsLoader)    │
│    Git:      git.techsophy.com                  │
│                                                 │
│  API ENDPOINTS:                                 │
│    POST /api/deploy          → Start deployment │
│    GET  /api/deploy/:id/stream → SSE progress   │
│    POST /api/test-connection → Test DB connect  │
│    GET  /api/servers/:s/health → Server health  │
│    GET  /api/dashboard/stats → Dashboard data   │
│    GET  /api/deployments     → History          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

*Document generated for SDP Pipeline Studio v2.0*
*Last updated: March 2026*
