# Cloud Linux Worker API

This Cloudflare Worker is a small authenticated proxy between the static HTML terminal and GitHub Actions.

## Required Worker secrets / variables
- `GITHUB_TOKEN` — fine-grained GitHub PAT for this private repository; repository permissions: Actions **Read and write**, Contents **Read-only**, Metadata **Read-only**.
- `ACCESS_KEY` — a new long random key used by the UI. Do not reuse your GitHub password.
- `REPO_OWNER` = `artemkinus-collab`
- `REPO_NAME` = `Cloud-Linux`
- `ALLOWED_ORIGIN` = exact origin where the HTML UI is hosted, e.g. `https://<your-worker-or-pages-domain>` (set after hosting; for local testing you can temporarily leave it unset).

## Routes
- `GET /api/health` — verifies protected GitHub access.
- `GET /api/runs` — latest 10 workflow runs.
- `POST /api/dispatch` — starts the fixed diagnostics workflow on `main`.
- `GET /api/runs/:id/jobs` — job and step states.

Every route requires `X-CloudLinux-Key`. The GitHub token remains server-side.

## Deploy
Create a Cloudflare Worker, paste `worker.js`, add the variables/secrets above, then deploy. Configure the UI with the Worker URL and the same ACCESS_KEY.

## Security limits
This is not a general-purpose remote shell. It intentionally does not accept arbitrary shell commands. GitHub-hosted runners are temporary and are destroyed after each job. Never expose the Worker without a strong ACCESS_KEY and an origin restriction.
