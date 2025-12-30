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

Obzorarr is a **"Plex Wrapped"** application that syncs viewing history from your Plex Media Server and generates yearly statistics with an animated slideshow presentation - similar to Spotify Wrapped. It doesn't require Tautulli; it only relies on the [Plex API](https://developer.plex.tv/pms/).

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
      - PLEX_SERVER_URL=http://plex-url-here:32400
      - PLEX_TOKEN=your-plex-token-here
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

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
