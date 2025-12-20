# Requirements Document

## Introduction

Obzorarr is a self-hosted "Year in Review" application for Plex Media Server administrators. It generates Spotify Wrapped-style summaries of viewing statistics for an entire Plex server and its individual users. The application features a Soviet/communist aesthetic theme, is designed for Docker deployment, and prioritizes modularity, accuracy, and a stunning visual experience.

## Glossary

- **Plex_Server**: The Plex Media Server instance from which viewing history is fetched
- **Admin**: The Plex server owner with full access to all features and settings
- **Server_Member**: An authenticated user who is a member of the Plex server
- **Public_Visitor**: An unauthenticated visitor viewing public or shared content
- **Wrapped_Page**: A Year in Review summary page displaying viewing statistics
- **Story_Mode**: Full-screen slide-based viewing experience with tap/click navigation
- **Scroll_Mode**: Single long page with scroll-triggered animations
- **Sync_Service**: The background service that fetches and stores play history from Plex
- **Share_Token**: A unique token enabling private link sharing of wrapped pages
- **Custom_Slide**: An admin-created slide with Markdown content
- **Fun_Fact**: A contextual comparison or statistic about viewing habits

## Requirements

### Requirement 1: Plex OAuth Authentication

**User Story:** As a user, I want to authenticate via Plex OAuth, so that I can securely access my viewing statistics without creating a separate account.

#### Acceptance Criteria

1. WHEN a user clicks the login button, THE Auth_Service SHALL redirect to Plex OAuth authorization endpoint
2. WHEN Plex OAuth returns a valid token, THE Auth_Service SHALL verify the user is a member of the configured Plex server
3. WHEN a user is verified as the server owner, THE Auth_Service SHALL grant admin privileges
4. WHEN a user is verified as a server member but not owner, THE Auth_Service SHALL grant member privileges
5. IF a user is not a member of the configured Plex server, THEN THE Auth_Service SHALL deny access and display an error message
6. WHEN a session is established, THE Auth_Service SHALL store the session securely with appropriate expiration
7. WHEN a user logs out, THE Auth_Service SHALL invalidate the session and clear stored tokens

### Requirement 2: Play History Data Collection

**User Story:** As an admin, I want the system to collect play history from my Plex server, so that accurate viewing statistics can be generated.

#### Acceptance Criteria

1. WHEN a sync is triggered, THE Sync_Service SHALL fetch play history from the Plex API endpoint `/status/sessions/history/all`
2. WHEN fetching history, THE Sync_Service SHALL use pagination headers `X-Plex-Container-Start` and `X-Plex-Container-Size` to retrieve all records
3. WHEN storing history records, THE Sync_Service SHALL persist `historyKey`, `ratingKey`, `title`, `type`, `viewedAt`, `accountID`, `librarySectionID`, and `thumb` fields
4. WHEN a sync completes, THE Sync_Service SHALL store the timestamp of the most recent `viewedAt` value
5. WHEN a subsequent sync runs, THE Sync_Service SHALL only fetch records with `viewedAt` greater than the last sync timestamp
6. WHEN the application is set up mid-year, THE Sync_Service SHALL support backfilling historical data from January 1st of the current year
7. IF the Plex API returns an error, THEN THE Sync_Service SHALL log the error and retry with exponential backoff
8. WHEN storing records, THE Sync_Service SHALL use SQLite as the database engine

### Requirement 3: Sync Management

**User Story:** As an admin, I want to manage data synchronization, so that I can control when and how viewing history is collected.

#### Acceptance Criteria

1. WHEN an admin clicks the manual sync button, THE Admin_Panel SHALL trigger an immediate sync operation
2. WHEN a sync is in progress, THE Admin_Panel SHALL display a progress indicator showing records processed
3. WHEN an admin configures a cron schedule, THE Sync_Service SHALL automatically run syncs at the specified intervals
4. WHEN a sync completes, THE Admin_Panel SHALL display the sync status including records synced and any errors
5. THE Admin_Panel SHALL display a history log of previous sync operations with timestamps and results

### Requirement 4: Statistics Calculation

**User Story:** As a user, I want my viewing statistics calculated accurately, so that I can see meaningful insights about my watching habits.

#### Acceptance Criteria

1. WHEN calculating statistics for a year, THE Stats_Engine SHALL use records where `viewedAt` falls between January 1 00:00:00 and December 31 23:59:59 of that year
2. THE Stats_Engine SHALL calculate total watch time by summing duration of all viewed items
3. THE Stats_Engine SHALL identify top movies by counting unique movie plays per title
4. THE Stats_Engine SHALL identify top shows by counting episode plays grouped by show
5. THE Stats_Engine SHALL identify top genres by aggregating play counts per genre
6. THE Stats_Engine SHALL calculate watch time distribution by month
7. THE Stats_Engine SHALL calculate watch time distribution by hour of day
8. THE Stats_Engine SHALL calculate percentile ranking comparing user watch time to all server users
9. THE Stats_Engine SHALL identify the longest binge session (consecutive plays within 30 minutes)
10. THE Stats_Engine SHALL identify the first and last content watched in the year
11. FOR server-wide statistics, THE Stats_Engine SHALL aggregate data across all users

### Requirement 5: Wrapped Page Display - Story Mode

**User Story:** As a user, I want to view my wrapped in an immersive story format, so that I can enjoy a Spotify Wrapped-like experience.

#### Acceptance Criteria

1. WHEN Story_Mode is active, THE Wrapped_Page SHALL display statistics as full-screen slides
2. WHEN a user taps or clicks, THE Wrapped_Page SHALL advance to the next slide with animation
3. WHEN a user swipes left or taps the right edge, THE Wrapped_Page SHALL advance to the next slide
4. WHEN a user swipes right or taps the left edge, THE Wrapped_Page SHALL return to the previous slide
5. THE Wrapped_Page SHALL display a progress indicator showing current position in the slide sequence
6. WHEN transitioning between slides, THE Wrapped_Page SHALL apply smooth animations using Motion One or GSAP
7. THE Wrapped_Page SHALL be responsive and optimized for mobile devices

### Requirement 6: Wrapped Page Display - Scroll Mode

**User Story:** As a user, I want to view my wrapped in a scrollable format, so that I can easily skim through all my statistics.

#### Acceptance Criteria

1. WHEN Scroll_Mode is active, THE Wrapped_Page SHALL display all statistics on a single scrollable page
2. WHEN a statistic section enters the viewport, THE Wrapped_Page SHALL trigger scroll-based animations
3. THE Wrapped_Page SHALL maintain the same visual styling as Story_Mode
4. WHEN a user toggles between modes, THE Wrapped_Page SHALL preserve their position in the content

### Requirement 7: Sharing System

**User Story:** As a user, I want to share my wrapped page, so that I can show my viewing statistics to others.

#### Acceptance Criteria

1. WHEN share mode is set to Public, THE Wrapped_Page SHALL be accessible to anyone via the direct URL
2. WHEN share mode is set to Private OAuth, THE Wrapped_Page SHALL only be accessible to authenticated Plex server members
3. WHEN share mode is set to Private Link, THE Wrapped_Page SHALL generate a unique Share_Token and be accessible only via the token URL
4. WHEN an admin sets a global default share mode, THE System SHALL apply it to all users who haven't customized their settings
5. WHEN an admin grants a user permission to control sharing, THE User SHALL be able to change their own share settings
6. WHEN a user's share settings exceed admin-granted permissions, THE System SHALL enforce the admin's restrictions

### Requirement 8: Anonymization Options

**User Story:** As an admin, I want to control how usernames appear in server-wide statistics, so that I can protect user privacy.

#### Acceptance Criteria

1. WHEN anonymization is set to "real names", THE Wrapped_Page SHALL display actual Plex usernames
2. WHEN anonymization is set to "anonymous", THE Wrapped_Page SHALL display generic identifiers like "User #1"
3. WHEN anonymization is set to "hybrid", THE Wrapped_Page SHALL show the viewing user their own name while anonymizing others
4. WHEN an admin configures per-stat anonymization, THE System SHALL apply different anonymization rules to different statistics

### Requirement 9: Custom Slides

**User Story:** As an admin, I want to create custom slides, so that I can add personalized messages to the wrapped experience.

#### Acceptance Criteria

1. WHEN an admin creates a custom slide, THE Admin_Panel SHALL provide a Markdown editor
2. WHEN a custom slide is saved, THE System SHALL validate the Markdown syntax
3. WHEN rendering custom slides, THE Wrapped_Page SHALL apply the same styling as generated slides
4. WHEN an admin reorders slides, THE System SHALL persist the new order
5. WHEN an admin toggles a slide off, THE System SHALL exclude it from the wrapped experience

### Requirement 10: Fun Facts Generation

**User Story:** As a user, I want to see fun facts about my viewing habits, so that I can enjoy contextual comparisons and interesting statistics.

#### Acceptance Criteria

1. WHEN AI is enabled and configured, THE Fun_Facts_Service SHALL generate contextual fun facts using the OpenAI-compatible API
2. WHEN AI is disabled or unavailable, THE Fun_Facts_Service SHALL use predefined fun fact templates
3. THE Fun_Facts_Service SHALL generate comparisons like "You watched X hours, equivalent to Y flights to Tokyo"
4. WHEN generating fun facts, THE Fun_Facts_Service SHALL randomize selections to provide variety

### Requirement 11: Admin Panel

**User Story:** As an admin, I want a comprehensive admin panel, so that I can manage all aspects of the application.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a dashboard with server overview, total users, total watch time, and sync status
2. THE Admin_Panel SHALL provide user management with per-user permission settings
3. THE Admin_Panel SHALL provide slide configuration with toggle, reorder, and preview capabilities
4. THE Admin_Panel SHALL provide theme configuration using tweakcn
5. THE Admin_Panel SHALL provide API configuration for Plex server URL, token, and OpenAI settings
6. THE Admin_Panel SHALL provide year and archive settings for multi-year support
7. WHEN an admin previews a user's wrapped, THE Admin_Panel SHALL display it without affecting the user's settings

### Requirement 12: Multi-Year Archive

**User Story:** As a user, I want to view previous years' wrapped pages, so that I can revisit my viewing history over time.

#### Acceptance Criteria

1. THE System SHALL support URLs in the format `/wrapped/{year}` for server-wide and `/wrapped/{year}/u/{identifier}` for per-user wrapped
2. WHEN an admin enables a previous year's archive, THE System SHALL make it accessible to users
3. THE System SHALL retain raw history data for reprocessing if statistics algorithms change
4. WHEN calculating statistics for archived years, THE Stats_Engine SHALL use the same algorithms as current year

### Requirement 13: Historical User Handling

**User Story:** As an admin, I want removed users' data preserved, so that server-wide statistics remain accurate.

#### Acceptance Criteria

1. WHEN a user is removed from the Plex server, THE System SHALL retain their viewing history for server-wide statistics
2. WHEN a previously removed user re-authenticates, THE System SHALL restore access to their individual wrapped page
3. THE System SHALL preserve watch history from a user's time on the server regardless of current membership status

### Requirement 14: URL Routing

**User Story:** As a user, I want intuitive URLs, so that I can easily navigate and share wrapped pages.

#### Acceptance Criteria

1. THE Router SHALL serve the public landing page at `/`
2. THE Router SHALL serve the admin panel at `/admin` with sub-routes for `/admin/sync`, `/admin/users`, `/admin/slides`, `/admin/settings`
3. THE Router SHALL serve server-wide wrapped at `/wrapped/{year}`
4. THE Router SHALL serve per-user wrapped at `/wrapped/{year}/u/{identifier}` where identifier is userId or shareToken
5. THE Router SHALL handle Plex OAuth callback at `/auth/plex`

### Requirement 15: Docker Deployment

**User Story:** As an admin, I want to deploy via Docker, so that I can easily set up and maintain the application.

#### Acceptance Criteria

1. THE Application SHALL be deployable as a single Docker container
2. THE Application SHALL accept configuration via environment variables
3. THE Application SHALL persist the SQLite database via a volume mount
4. THE Application SHALL support reverse proxy configurations with configurable base URL
5. THE Application SHALL provide a Dockerfile that builds the complete application

### Requirement 16: Theme System

**User Story:** As an admin, I want to customize the visual theme, so that the wrapped pages match my server's branding.

#### Acceptance Criteria

1. THE Theme_System SHALL use tweakcn for theme management
2. WHEN an admin selects a theme, THE System SHALL apply it server-wide to all wrapped pages
3. THE Admin_Panel SHALL provide a live preview of theme changes
4. THE Theme_System SHALL maintain the Soviet/communist aesthetic as the default theme

### Requirement 17: Data Serialization

**User Story:** As a developer, I want data properly serialized, so that statistics can be stored and retrieved accurately.

#### Acceptance Criteria

1. WHEN storing statistics to the database, THE System SHALL serialize them as JSON
2. WHEN retrieving statistics from the database, THE System SHALL deserialize JSON back to typed objects
3. THE Pretty_Printer SHALL format statistics objects as valid JSON strings
4. FOR ALL valid statistics objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)
