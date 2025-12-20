# Implementation Plan: Obzorarr

## Overview

This plan implements Obzorarr incrementally, starting with project setup and core infrastructure, then building out features layer by layer. Each task builds on previous work with no orphaned code.

## Tasks

- [x] 1. Project Setup and Core Infrastructure
  - [x] 1.1 Initialize SvelteKit project with Bun
    - Run `bun create svelte@latest` with TypeScript, strict mode
    - Configure `tsconfig.json` with `noUncheckedIndexedAccess: true`
    - Set up `bunfig.toml` for testing
    - _Requirements: 15.1, 15.2_

  - [x] 1.2 Configure UnoCSS and shadcn-svelte
    - Install UnoCSS with `unocss-preset-shadcn` and `presetAnimations`
    - Initialize shadcn-svelte with Soviet/communist theme colors
    - Set up `uno.config.ts` with presets
    - _Requirements: 16.1, 16.4_

  - [x] 1.3 Set up Drizzle ORM with Bun SQLite
    - Create `src/lib/server/db/client.ts` with WAL mode
    - Create `src/lib/server/db/schema.ts` with all tables
    - Create `drizzle.config.ts`
    - Run initial migration
    - _Requirements: 2.8_

  - [x] 1.4 Write property test for database round-trip
    - **Property 21: Statistics Serialization Round-Trip**
    - **Validates: Requirements 17.4**

- [x] 2. Checkpoint - Verify project builds and tests pass
  - Ensure `bun run build` succeeds
  - Ensure `bun test` runs
  - Ask user if questions arise

- [ ] 3. Plex API Client
  - [x] 3.1 Create Plex client module
    - Create `src/lib/server/plex/client.ts`
    - Implement `plexRequest<T>()` with proper headers
    - Use `$env/static/private` for PLEX_TOKEN
    - _Requirements: 2.1_

  - [x] 3.2 Implement paginated history fetch
    - Implement `fetchAllHistory()` with pagination
    - Handle `X-Plex-Container-Start` and `X-Plex-Container-Size`
    - _Requirements: 2.2_

  - [x] 3.3 Write property test for pagination completeness
    - **Property 4: Pagination Completeness**
    - **Validates: Requirements 2.2**

- [x] 4. Authentication System
  - [x] 4.1 Implement Plex OAuth flow
    - Create `src/lib/server/auth/plex-oauth.ts`
    - Implement `initiateOAuth()` and `handleCallback()`
    - Create `src/routes/auth/plex/+server.ts` endpoint
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 Implement session management
    - Create `src/lib/server/auth/session.ts`
    - Implement session creation, validation, invalidation
    - Store sessions in SQLite
    - _Requirements: 1.6, 1.7_

  - [x] 4.3 Create auth hook
    - Implement `src/hooks.server.ts` with auth handle
    - Populate `event.locals.user`
    - Protect `/admin` routes
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 4.4 Write property tests for auth
    - **Property 1: Role Assignment Correctness**
    - **Property 2: Non-Member Access Denial**
    - **Property 3: Session Invalidation**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7**

- [x] 5. Checkpoint - Auth flow works end-to-end
  - Test OAuth redirect and callback
  - Verify session creation and admin detection
  - Ask user if questions arise

- [x] 6. Sync Service
  - [x] 6.1 Implement sync service core
    - Create `src/lib/server/sync/service.ts`
    - Implement `startSync()` with backfill support
    - Store records in `play_history` table
    - Track sync status in `sync_status` table
    - _Requirements: 2.1, 2.3, 2.6_

  - [x] 6.2 Implement incremental sync
    - Track `lastViewedAt` timestamp
    - Filter subsequent syncs by timestamp
    - _Requirements: 2.4, 2.5_

  - [x] 6.3 Implement sync scheduler with Croner
    - Create `src/lib/server/sync/scheduler.ts`
    - Use Croner with overrun protection
    - _Requirements: 3.3_

  - [x] 6.4 Write property tests for sync
    - **Property 5: History Record Field Completeness**
    - **Property 6: Sync Timestamp Tracking**
    - **Property 7: Incremental Sync Filtering**
    - **Validates: Requirements 2.3, 2.4, 2.5**

- [x] 7. Statistics Engine
  - [x] 7.1 Implement watch time calculator
    - Create `src/lib/server/stats/calculators/watch-time.ts`
    - Sum durations for total watch time
    - _Requirements: 4.2_

  - [x] 7.2 Implement ranking calculator
    - Create `src/lib/server/stats/calculators/ranking.ts`
    - Calculate top movies, shows, genres
    - _Requirements: 4.3, 4.4, 4.5_

  - [x] 7.3 Implement distribution calculators
    - Create `src/lib/server/stats/calculators/distributions.ts`
    - Calculate monthly and hourly distributions
    - _Requirements: 4.6, 4.7_

  - [x] 7.4 Implement percentile calculator
    - Calculate user percentile rank
    - _Requirements: 4.8_

  - [x] 7.5 Implement binge detector
    - Create `src/lib/server/stats/calculators/binge-detector.ts`
    - Find longest consecutive session (30min gap)
    - _Requirements: 4.9_

  - [x] 7.6 Implement first/last watch finder
    - Find first and last content of year
    - _Requirements: 4.10_

  - [x] 7.7 Create stats engine facade
    - Create `src/lib/server/stats/engine.ts`
    - Implement `calculateUserStats()` and `calculateServerStats()`
    - Add caching to `cached_stats` table
    - _Requirements: 4.1, 4.11_

  - [x] 7.8 Write property tests for stats
    - **Property 8: Year Date Range Filtering**
    - **Property 9: Watch Time Aggregation**
    - **Property 10: Ranking Correctness**
    - **Property 11: Monthly Distribution Completeness**
    - **Property 12: Hourly Distribution Completeness**
    - **Property 13: Percentile Calculation**
    - **Property 14: Binge Session Detection**
    - **Validates: Requirements 4.1-4.9**

- [x] 8. Checkpoint - Stats engine complete
  - Verify all calculators work with test data
  - Ensure caching works correctly
  - Ask user if questions arise

- [x] 9. Sharing System
  - [x] 9.1 Implement sharing service
    - Create `src/lib/server/sharing/service.ts`
    - Implement share settings CRUD
    - Generate unique share tokens
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 9.2 Implement access control
    - Check share mode in route guards
    - Validate share tokens
    - Enforce admin permissions
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 9.3 Write property tests for sharing
    - **Property 15: Share Mode Access Control**
    - **Property 16: Share Token Uniqueness**
    - **Property 17: Permission Enforcement**
    - **Validates: Requirements 7.1-7.6**

- [x] 10. Anonymization System
  - [x] 10.1 Implement anonymization service
    - Create anonymization logic for usernames
    - Support real/anonymous/hybrid modes
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 10.2 Write property test for anonymization
    - **Property 18: Anonymization Mode Display**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 11. Slide System
  - [x] 11.1 Create slide components
    - Create `src/lib/components/slides/` directory
    - Implement TotalTimeSlide, TopMoviesSlide, TopShowsSlide
    - Implement GenresSlide, DistributionSlide, PercentileSlide
    - Implement BingeSlide, FirstLastSlide, FunFactSlide
    - Use Motion with `$effect` cleanup
    - _Requirements: 5.6_

  - [x] 11.2 Implement slide configuration
    - Create slide config table operations
    - Support enable/disable and reordering
    - _Requirements: 9.4, 9.5_

  - [x] 11.3 Implement custom slides
    - Create CustomSlide component with Markdown rendering
    - Create admin editor for custom slides
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 11.4 Write property tests for slides
    - **Property 19: Slide Order Persistence**
    - **Property 20: Disabled Slide Exclusion**
    - **Validates: Requirements 9.4, 9.5**

- [x] 12. Wrapped Page - Story Mode
  - [x] 12.1 Create StoryMode component
    - Create `src/lib/components/wrapped/StoryMode.svelte`
    - Implement full-screen slide display
    - Add tap/click/swipe navigation
    - Add progress indicator
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 12.2 Add slide transitions
    - Implement smooth animations between slides
    - Use Motion for hardware acceleration
    - _Requirements: 5.6_

- [x] 13. Wrapped Page - Scroll Mode
  - [x] 13.1 Create ScrollMode component
    - Create `src/lib/components/wrapped/ScrollMode.svelte`
    - Display all stats on scrollable page
    - _Requirements: 6.1_

  - [x] 13.2 Add scroll-triggered animations
    - Use GSAP ScrollTrigger with `$effect` cleanup
    - Animate sections on viewport entry
    - _Requirements: 6.2_

  - [x] 13.3 Implement mode toggle
    - Create ModeToggle component
    - Preserve position when switching modes
    - _Requirements: 6.3, 6.4_

- [x] 14. Wrapped Routes
  - [x] 14.1 Create wrapped page routes
    - Create `src/routes/wrapped/[year]/+page.svelte` for server wrapped
    - Create `src/routes/wrapped/[year]/u/[identifier]/+page.svelte` for user wrapped
    - Implement load functions with access control
    - _Requirements: 12.1, 14.3, 14.4_

  - [x] 14.2 Write property test for URL routing
    - **Property 22: URL Route Parsing**
    - **Validates: Requirements 12.1, 14.3, 14.4**

- [x] 15. Checkpoint - Wrapped pages functional
  - Test story mode navigation
  - Test scroll mode animations
  - Verify access control works
  - Ask user if questions arise

- [x] 16. Admin Panel
  - [x] 16.1 Create admin layout and dashboard
    - Create `src/routes/admin/+layout.svelte`
    - Create dashboard with server overview
    - Show total users, watch time, sync status
    - _Requirements: 11.1, 14.2_

  - [x] 16.2 Create sync management page
    - Create `src/routes/admin/sync/+page.svelte`
    - Add manual sync button
    - Show sync history and status
    - Add cron schedule configuration
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 16.3 Create user management page
    - Create `src/routes/admin/users/+page.svelte`
    - List all server users
    - Per-user permission settings
    - Preview user wrapped
    - _Requirements: 11.2, 11.7_

  - [x] 16.4 Create slide configuration page
    - Create `src/routes/admin/slides/+page.svelte`
    - Toggle slides on/off
    - Reorder slides
    - Custom slide editor
    - _Requirements: 11.3_

  - [x] 16.5 Create settings page
    - Create `src/routes/admin/settings/+page.svelte`
    - Plex server configuration
    - OpenAI API configuration
    - Theme selection with tweakcn
    - Year/archive settings
    - _Requirements: 11.4, 11.5, 11.6_

- [x] 17. Fun Facts Service
  - [x] 17.1 Implement fun facts service
    - Create `src/lib/server/funfacts/service.ts`
    - Create predefined templates
    - Implement AI generation (optional)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 18. Landing Page
  - [x] 18.1 Create public landing page
    - Create `src/routes/+page.svelte`
    - Soviet/communist themed design
    - Explain Obzorarr
    - Plex OAuth login button
    - _Requirements: 14.1_

- [x] 19. Historical User Handling
  - [x] 19.1 Implement data preservation
    - Ensure removed users' history is retained
    - Allow re-auth to restore access
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 19.2 Write property test for data preservation
    - **Property 23: Historical Data Preservation**
    - **Validates: Requirements 13.1, 13.3**

- [x] 20. Docker Deployment
  - [x] 20.1 Create Dockerfile
    - Multi-stage build with Bun (oven/bun:1-alpine)
    - Non-root user, health checks, volume support
    - Copy built application
    - Set up volume for SQLite
    - _Requirements: 15.1, 15.3, 15.5_

  - [x] 20.2 Create docker-compose.yml
    - Configure environment variables
    - Set up volume mounts
    - Health checks and restart policy
    - _Requirements: 15.2, 15.4_

  - [x] 20.3 Create GitHub Actions CI/CD workflow
    - Multi-platform builds (amd64, arm64)
    - Push to GHCR on main/tags
    - BuildKit cache for faster builds

- [x] 21. Final Checkpoint
  - Run all tests
  - Verify Docker build works
  - Test full user flow
  - Ask user if questions arise

## Notes

- All property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
