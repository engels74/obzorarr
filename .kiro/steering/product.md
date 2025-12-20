# Obzorarr - Product Overview

Obzorarr is a self-hosted "Year in Review" application for Plex Media Server administrators. It generates Spotify Wrapped-style summaries of viewing statistics for an entire Plex server and its individual users.

## Core Value Proposition

- Beautiful, animated viewing statistics summaries
- Server-wide and per-user wrapped pages
- Soviet/communist aesthetic theme (unique identity in the *arr ecosystem)
- Docker-first deployment for easy self-hosting

## Key Features

- **Data Collection**: Incremental sync from Plex API with backfill support
- **Viewing Modes**: Story Mode (Instagram Stories-style) and Scroll Mode
- **Sharing**: Public, Private OAuth, or Private Link sharing options
- **Admin Panel**: Full control over sync, users, slides, themes, and settings
- **Multi-Year Archive**: Historical wrapped pages accessible by year
- **Fun Facts**: AI-generated or predefined contextual comparisons
- **Custom Slides**: Admin-created Markdown slides

## User Roles

| Role | Access |
|------|--------|
| Admin (Server Owner) | Full access to admin panel, all users' wrapped, all settings |
| Server Member | Own wrapped, server-wide wrapped (if permitted), share settings (if permitted) |
| Public Visitor | Public wrapped pages or pages shared via link |

## URL Structure

- `/` - Public landing page
- `/admin/*` - Admin panel
- `/wrapped/{year}` - Server-wide wrapped
- `/wrapped/{year}/u/{identifier}` - Per-user wrapped
- `/auth/plex` - OAuth callback
