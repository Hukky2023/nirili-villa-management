# Nirili Villa Management

Private source repository for the self-hosted hotel and restaurant application.

Live site: https://nirili-villa.nirili-management.workers.dev

## Development

Use Node.js 22.13+ and pnpm. Clone this repository, then run `pnpm install --frozen-lockfile`. The application targets Cloudflare Workers and D1 with binding DB. See SELF-HOSTING.md for the initial setup and database migration limitations.

Run `pnpm build` before initial deployment from a clone: compiled dist/ is deliberately not committed. Then run `node self-host-config.mjs YOUR_DATABASE_UUID` and deploy with `pnpm exec wrangler deploy --config wrangler.selfhost.json`. Only an authorized Cloudflare account can deploy. Existing operators must use their existing database ID and preserve existing secrets; do not run the fresh-account setup again on an existing installation.

## Working together

Each collaborator uses their own GitHub account. Clone this repository, create a branch for a change, commit and push it, then open a pull request for review. Pull the latest main branch before starting new work. Repository access does not grant Cloudflare access. Deployments are manual; pushing code here does not update the website automatically.

Keep passwords, encryption keys, .dev.vars, environment files, database backups and generated ADMIN-LOGIN.txt outside Git. Source SQL migrations are included; production data and credentials are not. Store private operational backups separately.

## Included snapshot

Self-hosting export based on source commit 7178c6c3232bfd529e3df8d5f6a93fa8a14bf430, plus the Admin password-change fix supplied on 13 September 2026. The fix verifies the current Admin password and revokes sessions. This repository does not confirm that the fix has been deployed to the live site. Demo dashboard values and default records remain in this source and must be reviewed before relying on operational totals.

Automatic deployment through Cloudflare Workers Builds.
