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

Obzorarr is a **"Plex Wrapped"** application that syncs viewing history from your Plex Media Server and generates yearly statistics with an animated slideshow presentation—similar to Spotify Wrapped.

## Features

- **Yearly Statistics** — Total watch time, top movies, shows, and genres
- **Animated Slideshow** — Beautiful, interactive presentation of your viewing habits
- **Watch Patterns** — Monthly and hourly distribution charts
- **Percentile Rankings** — See how you compare to other users on your server
- **Plex OAuth** — Secure authentication with your Plex account
- **Automatic Sync** — Scheduled background sync of viewing history
- **AI Fun Facts** — Optional AI-generated personalized insights

## Tech Stack

| Component | Technology             |
| --------- | ---------------------- |
| Runtime   | Bun                    |
| Framework | SvelteKit + Svelte 5   |
| Database  | SQLite (Drizzle ORM)   |
| Styling   | UnoCSS + shadcn-svelte |
| Animation | GSAP + Motion          |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/engels74/obzorarr.git
cd obzorarr

# Copy and configure environment
cp .env.example .env
# Edit .env with your Plex server URL and token

# Start with bun
bun install
bun run dev
```

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
