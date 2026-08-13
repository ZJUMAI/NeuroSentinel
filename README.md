# NeuroSentinel

An intelligent agent platform for evaluating compound neurotoxicity using *Caenorhabditis elegans* (*C. elegans*).

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, tRPC, TanStack Query, Tailwind CSS, shadcn/ui, and Wouter
- **Backend**: Node.js, Express, tRPC, Drizzle ORM, MySQL, Zhipu AI (GLM), and Jose (JWT)
- **Optional capabilities**: Docker-based integration with supporting analysis services such as MinIO (object storage), ImageJ, Deep-Worm-Tracker, and Neorual

---

## Project Structure

```
NeuroSentinel/
├── client/                      # Frontend (React + Vite)
├── server/                      # Backend (Express, tRPC, Agent, and RAG)
├── shared/                      # Types and constants shared by the frontend and backend
├── drizzle/                     # Database schema and SQL migrations
├── imagej-service/              # Docker build context for worm image analysis
├── deep-worm-tracker-service/   # Docker build context for worm video tracking
├── neorual-service/             # Docker build context for Neorual microscopy analysis
├── neorual-analysis/            # Neorual configuration and model files (see .gitignore for Model/)
├── start.ps1                    # Windows: start Docker dependencies and run pnpm dev
├── .env.example                 # Environment variable template (copy to .env and configure)
└── README.md
```

---

## Getting Started

### 1. Install Dependencies and Configure the Database

```bash
pnpm install
cp .env.example .env
```

Make sure **MySQL** is running and `DATABASE_URL` points to a writable database, then run:

```bash
pnpm db:push
```

### 2. Start the Application

- **Node.js development server only** (requires MySQL; start optional services as needed):

  ```bash
  pnpm dev
  ```

  The application is available at <http://localhost:3000> by default.

- **One-command Windows startup** (checks Docker, attempts to start containers for MinIO, ImageJ, Deep-Worm-Tracker, Neorual, and other services, and then runs `pnpm dev`):

  ```powershell
  .\start.ps1
  ```

### 3. Complete the Required Configuration

Configure each item as needed. See the comments in `.env.example` for variables not listed below.

| Requirement | Description |
|-------------|-------------|
| **Required to run** | Set `DATABASE_URL`, `ZHIPU_API_KEY`, and `JWT_SECRET` in `.env`. Authentication and chat will not work correctly if any of them is missing. |
| **MySQL** | Create a local or remote database and ensure the configured account has DDL and DML permissions. `pnpm db:push` applies the migrations in `drizzle/`. |
| **Docker and `start.ps1`** | To start MinIO, ImageJ, and other services automatically, install and launch Docker Desktop. Otherwise, run only `pnpm dev` and start the required containers manually or skip the related tools. |
| **File uploads (S3/MinIO)** | Configure `S3_*` to enable uploads. For local MinIO, create a bucket named after `S3_BUCKET` in the MinIO console and configure the access credentials. |
| **OAuth login** | If `SKIP_AUTH=true` is not enabled and Google or GitHub login is required, configure `http://localhost:3000/api/oauth/callback` in the OAuth provider console. In production, replace it with your HTTPS domain, then set the corresponding `GOOGLE_*` or `GITHUB_*` variables. |
| **ImageJ / Deep-Worm-Tracker / Neorual** | Each service must be reachable before its tools can be used. Build the containers with `start.ps1`, or deploy them separately and set `IMAGEJ_API_URL`, `DEEP_WORM_TRACKER_API_URL`, and `NEORUAL_API_URL` to their actual endpoints. For Neorual, also follow the instructions in `neorual-service` and `neorual-analysis` to prepare `Model` and related files. `neorual-analysis/Model/` is excluded from Git by default. |
| **Analytics (Umami)** | Optionally set `VITE_ANALYTICS_*`. If omitted, the frontend does not load the analytics script. |

---

## Demo Video

[▶️ View the NeuroSentinel demo video](demo/demovideo.mp4)

---

## License

MIT
