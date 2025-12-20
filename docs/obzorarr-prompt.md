# Obzorarr - Complete Project Summary

## Overview

**Obzorarr** is a self-hosted "Year in Review" application for Plex Media Server administrators. It generates beautiful, Spotify Wrapped-style summaries of viewing statistics for an entire Plex server and its individual users. The application features a Soviet/communist aesthetic theme, is designed for easy deployment via Docker, and prioritizes modularity, accuracy, and a stunning visual experience.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | SvelteKit + Svelte 5 |
| Language | TypeScript (strict mode, 100% coverage) |
| Styling | UnoCSS + unocss-preset-shadcn |
| UI Components | shadcn-svelte |
| Theming | tweakcn (modular, maintainable themes) |
| Database | Bun native SQLite |
| Animations | Motion One + GSAP |
| Authentication | Plex OAuth |
| AI Integration | OpenAI-compatible endpoints (optional) |

---

## Core Features

### 1. Data Collection

- Fetches play history from Plex Media Server API using the OpenAPI spec provided
- Supports full calendar year range (January 1 00:00 → December 31 23:59)
- Incremental sync system: stores last sync timestamp and only fetches new data since then
- Backfill support for historical data when app is set up mid-year
- Modular date range handling for multi-year support
- Raw history stored in SQLite for reprocessing and accuracy

### 2. Year in Review Pages

#### Viewing Modes
- **Story Mode**: Full-screen slides, tap/click to progress (Instagram Stories / Spotify Wrapped style), immersive animations
- **Scroll Mode**: Single long page with scroll-triggered animations, easier to skim
- User can toggle between modes; admin can set default

#### Content Types
- **Server-wide Wrapped**: Aggregate stats for the entire server
- **Per-user Wrapped**: Individual stats for each user on the server

#### Statistics & Slides (Modular, Extensible)
- Total watch time (hours/days)
- Top movies, shows, and artists (for music libraries)
- Most-watched genres
- Watch time distribution by month
- Watch time distribution by time of day
- Percentile ranking ("You were in the top X% of viewers")
- Longest binge session
- First and last content watched of the year
- Server-wide: most popular content, total collective hours, peak viewing times
- Additional slides easily addable via modular architecture

#### Custom Slides
- Admin can create custom slides with full Markdown support
- Rendered in the same beautiful, modern style as generated slides
- Use cases: server anniversary messages, thank-you notes, announcements

#### Fun Facts
- **With AI**: Generates randomized, contextual fun facts using OpenAI-compatible API
- **Without AI**: Falls back to a comprehensive predefined list of real-world comparisons and fun statistics

### 3. Authentication & Authorization

#### Plex OAuth Integration
- Users authenticate via Plex OAuth
- Server membership verified (user must be a member of the Plex server)
- Admin status detected (server owner)

#### Access Control Hierarchy
| Role | Capabilities |
|------|--------------|
| **Admin (Server Owner)** | Full access: admin panel, all settings, all users' wrapped pages, sync controls |
| **Server Member** | View own wrapped, view server-wide wrapped (if permitted), share settings (if permitted) |
| **Public Visitor** | View public wrapped pages or pages shared via link |

### 4. Sharing System

#### Share Modes
| Mode | Description |
|------|-------------|
| **Public** | Anyone can view via direct URL (default) |
| **Private (OAuth)** | Only authenticated Plex server members can view |
| **Private with Link** | Anyone with the unique link can view (token-based URL) |

#### Permission Model
- Admin sets global default sharing mode for all users
- Admin can grant individual users permission to control their own sharing settings
- Admin can override or restrict individual users as needed
- Per-user settings cannot exceed permissions granted by admin

### 5. Anonymization Options

For server-wide statistics (e.g., "Top 10 Users"):
- Show real usernames
- Show anonymized names (e.g., "User #1", "User #2")
- Hybrid: anonymized for others, but viewing user sees their own name highlighted
- Per-stat granular control available

### 6. Historical User Handling

- Users removed from server mid-year remain in server-wide statistics
- Their individual wrapped pages remain accessible if they re-authenticate via Plex (re-invited or rejoin)
- Watch history from their time on the server is preserved

### 7. Multi-Year Archive

- Support for viewing previous years' wrapped (e.g., `/wrapped/2023`, `/wrapped/2024`)
- Admin controls which years are visible/accessible
- Processed stats archived per year for fast retrieval
- Raw history retained for reprocessing if needed

---

## Admin Panel

### Dashboard
- Beautiful, modern landing page with server overview
- Quick stats: total users, total watch time, sync status
- Recent activity feed

### Sync Management
- Manual sync trigger button
- Configurable cron schedule for automatic sync
- Sync status and history log
- Progress indicator for large backfills

### User Management
- List of all server users
- Per-user permission settings (sharing controls)
- Per-user anonymization overrides
- Preview any user's wrapped page

### Slide Configuration
- Toggle individual slides on/off
- Reorder slides
- Custom slide editor (Markdown)
- Preview mode for changes

### Theme Configuration
- tweakcn theme picker
- Applies server-wide to all wrapped pages
- Live preview

### API Configuration
- Plex server URL and token
- OpenAI-compatible endpoint settings (base URL, API key, model)
- Toggle AI features on/off

### Year & Archive Settings
- Select active year for current wrapped
- Enable/disable previous year archives
- Per-year visibility controls

---

## User-Facing Pages

### Public Landing Page
- Beautiful, modern design matching the Soviet/communist theme
- Explains what Obzorarr is
- Prompts Plex OAuth login
- Accessible before authentication

### Wrapped Experience
- Unique URL per user per year (e.g., `/wrapped/2024/u/{userId}` or `/wrapped/2024/u/{shareToken}`)
- Server-wide wrapped at `/wrapped/2024` or `/wrapped/2024/server`
- Toggle between Story Mode and Scroll Mode
- Share button with appropriate options based on permissions
- Responsive design (mobile-friendly for story mode especially)

---

## URL Structure

| Path | Description |
|------|-------------|
| `/` | Public landing page |
| `/admin` | Admin panel (requires admin auth) |
| `/admin/sync` | Sync management |
| `/admin/users` | User management |
| `/admin/slides` | Slide configuration |
| `/admin/settings` | API keys, theme, general settings |
| `/wrapped/{year}` | Server-wide wrapped for a given year |
| `/wrapped/{year}/u/{identifier}` | Per-user wrapped (identifier = userId or shareToken) |
| `/auth/plex` | Plex OAuth callback handling |

---

## Deployment

### Primary Method: Docker
- Single container deployment
- Configuration via environment variables and/or mounted config file
- SQLite database persisted via volume mount
- Reverse proxy friendly (Traefik, nginx, Caddy, etc.)
- Works behind existing Plex admin infrastructure

### Configuration Options
- Plex server URL and authentication token
- OpenAI-compatible API settings (optional)
- Base URL / path prefix for reverse proxy setups
- Cron schedule for automatic sync
- Default theme selection

---

## Design Principles

1. **Modularity**: Stats, slides, themes, and data fetching are all modular and easily extensible
2. **Accuracy**: Incremental sync with backfill ensures complete, accurate data
3. **Admin-first**: Easy setup, granular control, minimal maintenance
4. **Beautiful UX**: Modern, polished, animated experience rivaling Spotify Wrapped
5. **Privacy-conscious**: Granular anonymization and sharing controls
6. **Self-host friendly**: Docker-first, works with existing reverse proxy setups

---

## Summary

Obzorarr transforms Plex watch history into a visually stunning, shareable Year in Review experience. Administrators get powerful controls over data sync, user permissions, anonymization, and customization. Users get a delightful, animated summary of their viewing year with optional social sharing. The Soviet/communist aesthetic gives it a unique, memorable identity that fits within the *arr ecosystem.
