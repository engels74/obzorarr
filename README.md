<p align="center">
  <img src="src/lib/assets/obzorarr-icon.svg" alt="Obzorarr Logo" width="256" height="256">
</p>

<h1 align="center">Obzorarr</h1>

<p align="center">
  <strong>Year in Review for Plex Media Server</strong>
</p>

<p align="center">
  <a href="https://github.com/engels74/obzorarr/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/bun-%23000000.svg?logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <a href="https://deepwiki.com/engels74/obzorarr"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

---

## What is Obzorarr?

Obzorarr is a **"Wrapped for Plex"** application that syncs viewing history from your Plex Media Server and generates yearly statistics with an animated slideshow presentation - similar to Spotify Wrapped. It doesn't require Tautulli; it only relies on the [Plex API](https://developer.plex.tv/pms/).

## Features

<p align="center">
  <img src="public/readme/gifs/wrapped-demo.gif" alt="Wrapped Demo" width="700">
</p>

- **Yearly Statistics** — Total watch time, top movies, shows, and genres
- **Animated Slideshow** — Beautiful, interactive presentation of your viewing habits
- **Watch Patterns** — Monthly and hourly distribution charts
- **Percentile Rankings** — See how you compare to other users on your server
- **Plex OAuth** — Secure authentication with your Plex account
- **Automatic Sync** — Scheduled background sync of viewing history
- **AI Fun Facts** — Optional AI-generated personalized insights

## Issues & Support

Found a bug or have a feature request? Please submit issues and feature requests to the **[obzorarr-docker repository](https://github.com/engels74/obzorarr-docker/issues)** rather than this repository. This ensures your report reaches the maintainers monitoring issue tracking across the project.

## Screenshots

<details>
<summary><strong>Admin Dashboard</strong></summary>
<br>

|                                     Dashboard                                      |                                     Settings                                      |                                Sync Management                                |
| :--------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------: | :---------------------------------------------------------------------------: |
| <img src="public/readme/screenshots/admin-dashboard/01-dashboard.png" width="400"> | <img src="public/readme/screenshots/admin-dashboard/02-settings.png" width="400"> | <img src="public/readme/screenshots/admin-dashboard/03-sync.png" width="400"> |

<p align="center">
  <img src="public/readme/gifs/admin-demo.gif" alt="Admin Demo" width="600">
</p>

</details>

<details>
<summary><strong>Wrapped Presentation</strong></summary>
<br>

|                                    Total Time                                     |                                    Top Movies                                     |
| :-------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------: |
| <img src="public/readme/screenshots/wrapped-pages/01-total-time.png" width="500"> | <img src="public/readme/screenshots/wrapped-pages/02-top-movies.png" width="500"> |

|                                    Top Shows                                     |                                    Genres                                     |
| :------------------------------------------------------------------------------: | :---------------------------------------------------------------------------: |
| <img src="public/readme/screenshots/wrapped-pages/03-top-shows.png" width="500"> | <img src="public/readme/screenshots/wrapped-pages/04-genres.png" width="500"> |

|                                Percentile Ranking                                 |                                    Fun Facts                                    |
| :-------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------: |
| <img src="public/readme/screenshots/wrapped-pages/05-percentile.png" width="500"> | <img src="public/readme/screenshots/wrapped-pages/06-fun-fact.png" width="500"> |

|                                    Summary                                     |                                       Share                                        |
| :----------------------------------------------------------------------------: | :--------------------------------------------------------------------------------: |
| <img src="public/readme/screenshots/wrapped-pages/07-summary.png" width="500"> | <img src="public/readme/screenshots/wrapped-pages/08-share-modal.png" width="500"> |

</details>

## Tech Stack

| Component | Technology             |
| --------- | ---------------------- |
| Runtime   | Bun                    |
| Framework | SvelteKit + Svelte 5   |
| Database  | SQLite (Drizzle ORM)   |
| Styling   | UnoCSS + shadcn-svelte |
| Animation | GSAP + Motion          |

## Quick Start

### Docker (Recommended) — [Image Repo](https://github.com/engels74/obzorarr-docker)

```yaml
services:
  obzorarr:
    container_name: obzorarr
    image: ghcr.io/engels74/obzorarr-docker
    ports:
      - 3000:3000
    environment:
      - PUID=1000
      - PGID=1000
      - UMASK=002
      - TZ=Etc/UTC
      # Optional: lock Plex connection at the env layer. You can also leave
      # these unset and configure the server from the admin UI after onboarding.
      # - PLEX_SERVER_URL=http://plex-url-here:32400
      # - PLEX_TOKEN=your-plex-token-here
    volumes:
      - /<host_folder_config>:/config
```

Replace `/<host_folder_config>` with your desired config path. Access the web UI at `http://localhost:3000` to complete setup.

### From Source

```bash
git clone https://github.com/engels74/obzorarr.git
cd obzorarr
cp .env.example .env
bun install
bun run dev
```

> **Note on `.env` in local dev.** `bun run dev` does **not** auto-load `.env`, so any
> `PLEX_SERVER_URL` / `OPENAI_*` values you put there are ignored — local dev configures the
> server through onboarding and the admin UI (values stored in the SQLite DB). Environment-variable
> precedence (and the "Locked by environment variable" UI) applies to **Docker/production**, where
> the container passes the vars into the process. To exercise env-precedence locally (e.g. to see an
> env-locked field render its `ENV` badge), run `bun run dev:env`, which loads `.env` via
> `--env-file`.

## Reverse proxy header trust

For a single public origin, set `ORIGIN` to the exact browser-facing origin, including any
non-default port. The pinned Bun adapter uses it to construct SvelteKit's `request.url` before
Obzorarr's hooks run, and Obzorarr also uses it as the environment-controlled CSRF origin:

```env
ORIGIN=https://obzorarr.example.com
```

`TRUST_PROXY` is a separate, optional in-app URL rewrite. When enabled, Obzorarr replaces the
SvelteKit event URL's host and protocol from `X-Forwarded-Host` and `X-Forwarded-Proto`; it does
not change `request.url` or client-IP handling. Leave it disabled when `ORIGIN` or the adapter's
normal Host handling already gives Obzorarr the correct public origin.

Enable `TRUST_PROXY=true` only when Obzorarr cannot be reached around the proxy and the last
trusted hop removes or overwrites visitor-supplied values for both headers. A matching diagnostic
shows that the values are consistent with the browser origin; it cannot prove the proxy boundary
from one request. Environment-controlled changes require an Obzorarr restart.

Use the onboarding or **Admin → Settings → Security** diagnostic to compare the browser,
forwarded, and effective app origins. Provider guidance in the diagnostic reflects differing
defaults: Caddy manages both headers by default, while Nginx, Nginx Proxy Manager, and Apache
need provider-specific handling. Client-IP trust is configured separately through the Bun
adapter's `ADDRESS_HEADER` and `XFF_DEPTH` settings.
## Plex identity reconciliation

Plex watch-history account IDs are PMS-local identifiers, not Plex Home identities. The server owner is always attributed to local `accountId=1`; do not infer or change that value from a Plex account ID. Shared-user attribution is created only when the accepted Plex share and the PMS `/accounts` response correlate on the exact account identity. A Plex Home member, a login user, or a historical play row alone is not sufficient evidence of that mapping.

During each normal sync, Obzorarr reads Plex's accepted-shares endpoint. Plex currently returns the complete accepted-share collection as one unpaged JSON array. Pagination or count metadata is accepted only when it proves the returned array is complete; contradictory metadata, malformed entries, duplicate identities, a failed request, or a non-array response makes the result partial or failed. A complete reconciliation also requires the owner identity, the local PMS accounts response, and proof that the configured server is owned by the authenticated Plex account.

Only a complete reconciliation replaces the snapshot. Partial or failed observations retain the prior mapping rows and proof; they do not remove users or guess new matches. A complete snapshot removes mappings for shares that are no longer accepted. If a share is removed, its public lookup stops resolving once that snapshot is applied; after re-entitlement, run a normal sync and wait for a new complete snapshot. Never repair this by manually changing account IDs or blindly backfilling history.

Mappings and their proof expire after 24 hours. They are also invalidated when the effective Plex URL/token configuration or PMS machine authority changes. Environment-controlled Plex settings override DB settings; changing either authority requires restarting with the intended configuration, then completing a normal sync to establish a fresh proof. If the authority changes during reconciliation, the work is discarded rather than applied.

Public Wrapped lookup deliberately uses the same generic not-found/denial response for an unknown identifier, a non-public profile, and a missing or stale identity mapping. This avoids revealing which condition applies. Treat the response as an authorization outcome, not evidence that a particular Plex user exists.

### Safe reconciliation after deployment

1. Ensure no sync is running, and take a consistent backup of the SQLite database and configuration before changing Plex authority.
2. Confirm the effective Plex configuration in the admin UI without copying credentials into tickets, shell history, or logs. Account for environment-locked settings before editing DB-backed settings.
3. Restart after any environment authority change. Run one normal incremental sync from the admin sync flow; reconciliation runs before history processing. Do not start a year backfill to repair identities.
4. Confirm the sync completed and use ordinary read-only UI/public lookup checks with non-sensitive test identities. A generic public denial is expected when mapping freshness or public eligibility is absent.
5. On an unexpected attribution change, stop further syncs, restore the backed-up database/configuration as a matched pair, restart, and rerun the normal sync only after the effective authority is verified. Do not merge rows or manufacture mappings.

For disposable HTTP QA only, create a new empty database path and run:

```bash
DATABASE_PATH=/path/to/new/disposable/wrapped-lookup-e2e.db bun run qa:wrapped-lookup
```

`qa:wrapped-lookup` refuses a missing path, production-looking paths, and pre-existing database paths. It must never be pointed at a production, staging, development, or retained backup database.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
