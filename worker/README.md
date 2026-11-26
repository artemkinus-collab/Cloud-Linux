# Cloud Linux Worker API

Cloudflare Worker API for the static Cloud Linux interface.

## Required variables and secrets

Set these in **Cloudflare Dashboard → Workers & Pages → cloud-linux-api → Settings → Variables and Secrets**.

### Variables
- `REPO_OWNER` = `artemkinus-collab`
- `REPO_NAME` = `Cloud-Linux`
- Allowed origin is fixed in `worker.js` as `https://artemkinus-collab.github.io`; no Cloudflare variable is needed for it.

### Secrets
- `GITHUB_TOKEN` — fine-grained GitHub token with Actions Read and write, Contents Read-only, Metadata Read-only.
- `ARTEM_PASSWORD` — the single password shared by the two accepted login names, `root` and `artem`.
- `OTP_CODE` — the fixed OTP value configured by the owner.
- `SESSION_SECRET` — a long random secret used only to sign one-hour session tokens. Never put it in the website or GitHub repository.

The login form accepts either `root` or `artem`; both use the same `ARTEM_PASSWORD` and `OTP_CODE`. A successful login returns a signed session token that remains only in browser memory. Reloading the page or logging out requires signing in again.

## Routes
- `POST /api/login` — verifies username, password and OTP; returns a signed session.
- `GET /api/health` — checks protected GitHub access.
- `GET /api/runs` — latest 10 workflow runs.
- `POST /api/dispatch` — starts the fixed diagnostics workflow on `main`.
- `GET /api/runs/:id/jobs` — job and step states.

All routes except login require a valid signed session. The GitHub token, password, OTP and session-signing secret stay server-side.

## Deploy
Update `worker.js` in the Cloudflare Worker editor and deploy it. Then set the variables and secrets listed above. GitHub Pages deploys the static site automatically when its Pages workflow runs.

## Security notes
- This is not a general-purpose remote shell.
- The fixed OTP is a convenience, not strong multi-factor authentication; anyone who learns it can reuse it.
- Use a unique password and rotate it if it has been shared.
- The Worker currently uses short-lived signed sessions; a reload or logout clears the browser-held token.
- The Worker enforces the exact GitHub Pages origin hardcoded in `worker.js`.
