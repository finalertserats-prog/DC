# SDP Pipeline Studio

> **Enterprise ETL Pipeline Configuration & Deployment Platform**  
> Automated Airflow pipeline deployment with Git integration, real-time monitoring, and comprehensive audit trails.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6)
![Vite](https://img.shields.io/badge/Vite-6-646cff)

---

## ✨ Features

### 🚀 Pipeline Deployment
- **Multi-step wizard** for pipeline configuration with validation
- **Git integration** — auto-clones repositories based on org/app/db type
- **6-step deployment pipeline**: Clone → Connect → Directories → TaskScripts → DAGs → Spark Jobs
- **Real-time progress tracking** with animated stepper UI
- Support for **MongoDB, PostgreSQL, MySQL, and S3** sources

### 📊 Dashboard & Analytics
- Deployment trend charts (30-day)
- Organization leaderboard
- Success rate tracking
- Quick action cards for common workflows

### 📋 Deployment History
- Full deployment history with search, filter, and export
- Detailed deployment view with step-by-step logs
- CSV export functionality
- Deployment path visualization

### 🖥️ Infrastructure Monitoring
- Real-time server health checks (Airflow, Staging, HDFS, S3, Hive, Git)
- Latency monitoring and uptime tracking
- Connection configuration management

### ⚙️ Enterprise Settings
- User profile management with role-based access (Admin, Deployer, Viewer)
- Server configuration
- Appearance customization (Dark/Light theme, accent colors)
- Notification preferences (Email, Slack integration ready)
- Security settings (2FA, API keys, password management)
- Data management (export, clear history)

### 🎨 UI/UX
- **Glassmorphism design** with gradient accents
- **Framer Motion** animations throughout
- Fully responsive layout
- Custom scrollbars, tooltips, and modals
- Professional dark theme with brand colors

---

## 🏗️ Architecture

```
sdp-pipeline-studio/
├── src/
│   ├── components/
│   │   ├── Layout/          # Layout, Sidebar, Header
│   │   └── ui/              # Reusable UI components
│   ├── pages/
│   │   ├── Dashboard.tsx    # Analytics dashboard
│   │   ├── PipelineConfig.tsx # Wizard-based pipeline config
│   │   ├── Deployments.tsx  # History list
│   │   ├── DeploymentDetail.tsx # Individual deployment
│   │   ├── Monitoring.tsx   # Infrastructure health
│   │   └── Settings.tsx     # App settings
│   ├── stores/              # Zustand state management
│   ├── services/            # API service layer
│   ├── config/              # Constants & configuration
│   └── types/               # TypeScript type definitions
├── server/
│   └── index.js             # Express.js backend API
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS 3, Framer Motion |
| **State** | Zustand (persisted) |
| **Charts** | Recharts |
| **Routing** | React Router 7 |
| **Backend** | Express.js, SSH2 |
| **Notifications** | React Hot Toast |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Navigate to the project
cd sdp-pipeline-studio

# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Start both frontend + backend
npm start
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **API Server**: http://localhost:4000

### Development

```bash
# Frontend only
npm run dev

# Backend only
npm run server

# Both (recommended)
npm start
```

---

## 🔧 Configuration

### Server Settings
Server connections are configured in `src/config/constants.ts` and `server/index.js`.

### Environment Variables
Copy `.env.example` to `.env` and configure:

```env
VITE_API_URL=http://localhost:4000
PORT=4000
```

---

## 📦 Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory, ready for deployment to any static hosting service.

---

## 🛡️ Security Notes

- Passwords are **never** stored in frontend code
- Git tokens use Personal Access Tokens (PAT) with `read_repository` scope
- SSH connections are handled server-side only
- Role-based access control (RBAC) ready
- 2FA integration point available

---

## 📝 Migration from Streamlit

This application is a complete rewrite of the original Streamlit-based ETL Pipeline Deployer (`app.py`) with:

| Feature | Streamlit (v1) | React (v2) |
|---------|---------------|------------|
| UI Framework | Streamlit | React + Tailwind |
| State Management | Session State | Zustand (persisted) |
| Routing | Single page | Multi-page SPA |
| Deployment Tracking | None | Full history + export |
| Monitoring | Basic buttons | Real-time dashboard |
| Settings | Sidebar only | Full settings panel |
| Theme | Custom CSS | Tailwind dark/light |
| Animation | None | Framer Motion |
| API Architecture | Monolithic | Client-Server split |

---

**Built with ❤️ by Techsophy**
