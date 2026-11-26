# Cloud Linux Worker API

Cloudflare Worker API for the static Cloud Linux interface.

## Required variables and secrets

Cloudflare Dashboard → Workers & Pages → `cloud-linux-api` → Settings → Variables and Secrets.

### Variables
- `REPO_OWNER` = `artemkinus-collab`
- `REPO_NAME` = `Cloud-Linux`

The allowed browser origin is fixed in `worker.js`: `https://artemkinus-collab.github.io`.

### Secrets
- `GITHUB_TOKEN` — fine-grained token restricted to this repository, with **Actions: Read and write**, **Contents: Read-only**, and **Metadata: Read-only**.
- `ARTEM_PASSWORD` — the shared password for the accepted names `root` and `artem`.
- `OTP_CODE` — configured fixed OTP value.
- `SESSION_SECRET` — long random secret used to sign one-hour sessions. Never put it in the website or repository.

Both accepted login names use the same password and OTP. Sessions are held only in browser memory; reloading the page or logging out requires signing in again.

## API routes

- `POST /api/login` — verifies credentials and returns a signed session.
- `GET /api/health` — checks GitHub repository access.
- `GET /api/runs` — latest 10 workflow runs.
- `POST /api/dispatch` — starts the fixed workflow on `main`, with one of three validated profiles: `full`, `storage`, or `runtime`.
- `GET /api/runs/:id/jobs` — job and step states.
- `GET /api/runs/:id/artifacts` — report artifact metadata.
- `GET /api/artifacts/:id/download` — streams a ZIP artifact after session validation.

All routes except login require a valid signed session. Artifact IDs are numeric and passed to the fixed repository's GitHub Actions artifact endpoint; no arbitrary URL is accepted from the browser.

## Deploy

1. Publish the repository changes; GitHub Pages updates from the repository workflow.
2. In Cloudflare Dashboard open `cloud-linux-api`, replace its code with `worker.js` from this repository, and click **Deploy**.
3. Confirm the Worker variables and secrets above are present.
4. Sign in, run `run storage` or `run runtime`, then open **История** to inspect steps and download the ZIP report.

## Security and scope

- This is a restricted diagnostics console, not a general-purpose remote shell or VPS.
- The workflow uses a fresh GitHub-hosted runner, checks out the public repository read-only, and runs only fixed diagnostic commands. Runner changes disappear when the job ends.
- No user-provided command is passed to a shell; commands such as `sudo`, package installation, file deletion, and arbitrary scripts are not supported.
- The fixed OTP is a convenience rather than strong MFA. Use a unique password and rotate any credential previously shared in chat.
- Reports are retained for 3 days by GitHub Actions.
