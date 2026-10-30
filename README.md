# StudyFlow

StudyFlow gives students, study groups, and friends public or invite-only rooms to study together. Browse **Explore Rooms** at `/explore`, choose a room, enter a nickname, and join. Up to six people can independently share their webcam, microphone, and screen, watch each other, and chat without accounts or host approval.

Built with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, official LiveKit React components, LiveKit Cloud, and Upstash Redis. Media and chat are not recorded or stored.

## Installation

Use Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
# Fill in the five variables using your own projects.
npm run dev
```

Open port 3000. Camera/microphone APIs need HTTPS or localhost. Missing service configuration produces an explicit setup error; there is no demo backend.

### Service configuration

Phase 3 reuses the same five environment variables; no new services or variables are required:

- `LIVEKIT_URL`: your LiveKit Cloud project's `wss://` URL.
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: server-side LiveKit credentials.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: one shared Upstash Redis database's REST credentials.

Use **LiveKit Cloud**, since ending rooms uses Cloud token revocation. Allow HTTPS to the project hostname from the application server and LiveKit WebRTC/WSS traffic from browsers. All deployments sharing rooms must use the same Redis database. Keep all credentials server-side; never use `NEXT_PUBLIC_` prefixes.

## Collaborative study rooms

1. Enter a nickname and room title, choose **Public** (the default) or **Invite-only**, create a room, then select **Enter room**. Public rooms appear in Explore immediately, even before anyone joins.
2. Copy the invitation link. Other people enter their nicknames and select **Join study room**.
3. Every participant can toggle their own camera, microphone, and screen share. All devices start **off**; joining does not request camera/microphone permission.
4. Cameras appear once per participant, with names, microphone status, and placeholders for disabled cameras. Screen shares appear prominently above the camera grid. Multiple screen shares coexist with camera streams.
5. Chat uses reliable LiveKit Data Messages. Names come from server-issued participant tokens. There is no persistent chat history; clients retain up to 200 messages per connection.
6. **Leave** disconnects only you, stops your local tracks, and leaves the room open, including when the creator leaves. A temporary network interruption uses LiveKit's automatic reconnection; a terminal disconnect allows manual rejoining with a fresh token.
7. Only the creator sees **End room**. Ending permanently closes admission and disconnects everyone. The creator can retry media cleanup if a provider error interrupts it.

Screen sharing uses LiveKit's `getDisplayMedia` integration. It works best in desktop Chromium; browsers without support show an explanation and disable sharing. Capturing system/tab audio depends on the browser and selected source. Browsers may require **Enable room audio** before remote audio plays. Use headphones when testing multiple devices.

## Public room discovery

Home, Explore Rooms, and Create Room navigation is available on desktop and mobile, including inside rooms. Explore shows titles, creator nicknames, creation times, participant counts and capacity. Join Room opens the existing room nickname/admission flow; it uses the same multi-streamer interface and starts all devices off.

- Search matches room titles without case sensitivity. Filters are All Rooms, Active (any connected participants, including full rooms), Empty, and Available (not full). Sort by newest, most participants, or least participants.
- Redis room records are authoritative for existence, visibility, ending, and 12-hour expiry. Discovery scans all `studyflow:room:*` keys with cursor-based `SCAN` and batched `MGET`; it uses no process-local metadata or secondary index. This deliberately favors a small-room MVP over additional infrastructure. For a much larger room directory, add a persistent index and server-side search/pagination together.
- LiveKit `ListRooms` supplies authoritative participant counts, independently of media tracks. A participant with camera/mic off still counts, and screen sharing does not add another participant. LiveKit maintains unique connection identities during reconnection. A new admission uses a new UUID; multiple tabs count as separate participants, even with the same nickname.
- Counts refresh 12 seconds after each completed request, with no overlapping polls. Polling stops on unmount. Missing LiveKit rooms count as EMPTY while their Redis records remain valid; joining recreates their media room with the six-person cap. Provider errors show a retry action and label any retained counts as last known instead of inventing zero counts.
- FULL takes precedence over ACTIVE. Ended, expired, deleted, and invite-only rooms are excluded. Expiry is checked on each request; Redis TTL removes metadata automatically, without an application scheduler. LiveKit empty-room cleanup never ends an application room.
- Existing Phase 1/2 records lack visibility and remain invite-only. Existing identifiers and invitation URLs are unchanged; they are never silently published. Invite-only rooms use the existing unguessable 128-bit invitation URL as a bearer capability: anyone given that link is authorized to read metadata and join, but cannot end the room. Keep those links private. There is no account-based private-room access system.

### API

- `GET /api/rooms`: returns `{ rooms: [...] }` for all valid PUBLIC records, newest first, with `id`, `title`, `hostName`, `visibility`, `status` (`ACTIVE`, `EMPTY`, `FULL`), `participantCount`, `maxParticipants`, `createdAt`, and `expiresAt`. Timestamps are Unix milliseconds. Host credentials/hashes, provider room details, and LiveKit API credentials are never serialized. Rate limited to 30 requests/minute per trusted client IP.
- `GET /api/rooms/[roomId]`: returns the same room metadata plus the existing lifecycle `state` and cookie-derived `isHost`. Knowing an invite-only URL authorizes this read. Missing/expired/ended rooms return 404/410. Discovery status is separate from the stored CREATED/LIVE/ENDED lifecycle state.
- `POST /api/rooms`: accepts `{ nickname, title, visibility?: "PUBLIC" | "PRIVATE" }`. Omitted visibility defaults to PUBLIC; invalid values are rejected. Returns the existing `{ id, url }` and room-scoped creator cookie.
- `POST /api/rooms/[roomId]/token`: revalidates existence, expiry, provider configuration, and current unique LiveKit participant count before signing. Full rooms return 409 with a clear message. LiveKit remains responsible for atomic connection admission when simultaneous token requests race. No slot is reserved by a token.

All responses are uncached. Existing creator-only start/end authorization and same-origin mutation checks remain in place.

## Capacity and authorization

Phase 2 deliberately uses the simpler **six connected participants total**, including the creator and people with all devices off. There is no watch-only overflow or publisher-slot queue.

LiveKit enforces `maxParticipants: 6` at connection admission, including concurrent joins. Slots are freed when LiveKit processes a disconnect; unexpected network loss can temporarily retain a slot during reconnection. A seventh connection is rejected by LiveKit. Issuing a JWT does not reserve a slot. Every join checks current presence and verifies that the provider room has the correct cap, and signed tokens include the same room configuration so automatic room recreation also keeps the limit. Existing Phase 1 rooms with a different provider cap are rejected with a message to create a new room.

All participants receive `canPublish`, `canSubscribe`, and `canPublishData`, limited to camera, microphone, screen video, and screen audio sources. They cannot administer the LiveKit room or change their metadata. Every join, including the creator's, receives a new server-generated UUID identity; nicknames are display names and can be duplicated. Submitted roles and identities do not grant privileges.

Ending the room still requires its creator's room-scoped HttpOnly, SameSite=Strict cookie (Secure in production). The cookie works only on the original origin/browser profile; losing it loses creator controls. Media publishing rights are equal for everyone and do not depend on this cookie.

Room URLs contain 128 random bits; creator credentials contain 256 random bits and only SHA-256 hashes are stored. Same-origin checks, input validation, uncached API responses, and shared Redis request limits protect the API. Token issuance is limited to 40 requests/minute per trusted Vercel client IP; creation to 5/minute. Outside Vercel, a shared fallback bucket avoids trusting arbitrary proxy headers. Nicknames are not verified identities. Anyone with the link can join while the room is active; configure provider spending limits before public promotion.

Rooms expire after 12 hours. APIs stop issuing tokens after expiry/end; connected browsers poll every five seconds and disconnect when closed. Ending marks Redis ENDED before revoking LiveKit participants, waits for unused 15-second join tokens to expire (plus two seconds), disconnects remaining participants, then deletes the provider room. Ending is idempotent and can be retried. Provider outages or unattended expiry still need operational cleanup; this MVP has no scheduled reconciler. Redis expiry alone does not revoke connected media sessions.

## Deploy to Vercel

1. Import the repository with the Next.js preset and repository root. Use Node.js 22 or 24.
2. Configure all five server-side variables for each intended Preview/Production environment, then redeploy.
3. Use `npm ci` and `npm run build`. No separate backend, custom WebSocket server, or database migration is needed.
4. Keep the end route's `maxDuration = 60`; its token drain deliberately waits 17 seconds. Ensure your plan supports this duration.
5. Use HTTPS and allow invited users through any preview deployment protection. Keep the creator on the same origin/browser profile.
6. Run the real-service acceptance checks below before calling multi-streaming verified.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Browser tests run an isolated production server on port 3100 with service variables blank:
npx playwright install chromium
npm run test:e2e
# Or use an existing Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Unit/API tests verify signed grants, unique identities, creator-only administration, six-person provider configuration, rejection of legacy uncapped rooms, validation, expiry, rate limits, and ending. Discovery checks cover multiple Redis scan pages, duplicate scan results, missing media rooms, public/private/legacy visibility, full-room preflight, and provider outages. External HTTP services are stubbed; these checks do not prove real Redis Lua execution, LiveKit capacity admission, or media transport. Browser checks cover landing/join flows, search/filter/sort, polling and retry, mobile layouts, missing configuration, and cross-origin rejection. Mock rooms exist only in tests.

### Real-service acceptance

Use an HTTPS deployment with actual LiveKit Cloud and Upstash credentials:

1. Create a new room. Join as Alice, Bob, and Charlie using separate browser profiles/devices. Confirm camera/mic permission is not requested until each enables the relevant control.
2. Enable all three webcams and microphones. Confirm everyone sees three distinct camera tiles with the correct nicknames and microphone states, and hears other participants without local audio feedback. Toggle one person's camera/mic independently; only their own track changes.
3. Have Bob share a screen while everyone keeps their cameras on. Have Charlie share another screen. Confirm both screens appear above the camera grid and either participant can stop their own share without affecting the other tracks.
4. Send chat messages in all directions. Try denied permissions, unavailable devices, unsupported mobile screen sharing, and browser audio autoplay recovery.
5. Join up to six clients. Race additional joins; confirm only six connect. Leave one client and confirm another can join after LiveKit releases the slot. Repeat with abrupt network loss and reconnection. Confirm placeholders and participant tiles update on joins/leaves, with no duplicate camera tiles.
6. Leave as creator: other participants must remain connected and keep streaming. Rejoin in the same browser to recover End room controls; another profile must not have those controls. POST start/end without the creator cookie or forge role fields: no administrative privileges should be granted.
7. End the room: everyone must disconnect; fresh joins and old join/reconnection tokens must not recreate the session after cleanup. Retry ending if provider cleanup fails. Verify expiry, mobile layout, and Vercel function duration as well.
8. Create public and invite-only rooms. Verify only public rooms appear in Explore, including rooms nobody has entered. Leave a public room empty and confirm it remains listed. Rejoin it from Explore after provider cleanup. Confirm counts update within a poll after joins/leaves, including users with devices off and users sharing multiple tracks. Fill six slots and confirm FULL; try joining from a stale card and confirm the admission error. End or expire the room and confirm it disappears. Existing invite-only links should continue working without appearing in Explore.

## Project layout

- `src/app`: landing/room pages and server-only API route handlers.
- `src/app/explore` and `src/components/explore-rooms.tsx`: public room discovery, polling, search/filter/sort; `room-card.tsx` and `site-header.tsx` provide reusable cards/navigation.
- `src/components/studio.tsx`: multi-participant camera grid, screen shares, device controls, and creator-only ending.
- `src/components/chat.tsx`: existing reliable LiveKit data chat.
- `src/components/ui`: shadcn/ui component source; theme tokens live in `src/app/globals.css`.
- `src/lib`: validation, creator-cookie authorization, Redis state/rate limits, LiveKit configuration/tokens, and discovery presence/DTOs.
- `tests`: security/API contracts; `tests/browser`: production browser checks.

## Public room discovery (Phase 3)

Open `/explore` from Home or a room to browse public study rooms. Search titles, filter All / Active / Empty / Available, and sort newest / most / least participants. Cards show creator, creation time, LiveKit participant count, six-person capacity, and ACTIVE / EMPTY / FULL status. Full takes precedence; webcam and screen tracks are not counted as extra people. Join Room opens the existing nickname/join flow.

Public visibility is an explicit creation option. Existing rooms and older API clients without visibility remain Private. Private rooms are unlisted and the existing unpredictable invitation URL is a bearer capability: anyone given that link can join; this is not a verified-membership or password system. No private IDs or creator credentials are exposed in the listing API.

`GET /api/rooms` exhausts Redis SCAN, deduplicates keys and batch-loads metadata. Expired, ended, deleted and private rooms are excluded. LiveKit ListRooms provides presence, with metadata rechecked afterward. A valid application room with no media room is EMPTY and stays discoverable. Provider failures return an error rather than invented counts. The browser polls every 12 seconds. Token issuance rechecks room validity and capacity, with LiveKit admission enforcing concurrent joins. No new environment variables, migration, or process-local storage is used. This MVP scans active metadata per request; larger deployments should add a public-room index with server pagination/search.

## Two room views

Before entering a study room, choose **Grid view** (the existing camera interface) or **First-person view**. The same buttons inside the room switch layouts without reconnecting LiveKit or resetting camera/microphone/screen sharing, chat or music. Room media controls and shared screens remain available in both views. Three.js loads only when first-person view is opened. That view requires WebGL; unsupported or lost graphics contexts show an error/retry action while Grid remains available.

In first-person view, click the scene to focus/capture the mouse, move with WASD/arrows and look with the mouse. Escape releases the cursor. E sits in a nearby available chair or stands up; F/click punches a nearby seated participant. Touch devices have drag-to-look and directional/action buttons. Every connected participant receives an authoritative chair initially, including Grid users; standing/walking position survives layout switches. The visible six-chair list also provides accessible interactions.

Punching is a room game rule available to all connected participants, including against the creator. The actor must be standing, the target seated and within 2.2m; punches have a three-second cooldown. A successful punch revokes/removes the target's LiveKit connection, freeing their chair and participant slot. It does not end the room or transfer creator privileges. The target can explicitly rejoin with a fresh identity through the existing join flow; this is not an account ban. The join form explains that the rule also applies to seated Grid users.

`GET/POST /api/rooms/[id]/space` use the existing signed room session (the join response's `musicSession`) and authoritative LiveKit membership. Redis Lua atomically assigns chairs, synchronizes present members, validates room lifetime, bounds, furniture collisions, movement speed (3.5m/s max), update rate, punch distance and cooldown. Server time is authoritative; body-supplied identities/ownership and peer messages cannot grant authority. Movement is predicted locally and sent at most about 4.5 times/second while changing; snapshots refresh roughly once/second while idle. One request is in flight at a time. Snapshots interpolate remote avatars. The state is room scoped and expires with the room. All interaction calls are limited to 420/minute/identity, and mutations require same-origin requests. A failed provider removal rolls back the target reservation so it does not silently free a connected user's chair.

The downloadable [Sketchfab library asset](https://sketchfab.com/3d-models/3d--library-01-2ad7f048f73c48fba9624bf62fb2d3bd) is not included or verified yet: the managed environment blocks the source. Until an official downloadable file and license are supplied, the playable first-person view shows its original built-in library. The local GLB loader and integration instructions are in `public/models/library/README.md`. Model-specific scale, spawn and collisions must be checked after receiving the actual asset. No new service credentials are required; Vercel uses the existing LiveKit/Redis configuration. The 3D renderer uses a browser canvas, not a second media session or a new realtime server.

## Virtual Study World (Phase 5)

Open `/world` from the navigation, enter a nickname, choose a color and select **Enter library**. The nickname/color are remembered in sessionStorage when browser storage is available. Phaser 3 is loaded only in the browser and only on this page. The 640×480 library uses original procedural pixel art: wooden floors, bookshelves, plants, eight desks, reception and an entrance. No third-party art assets are used.

Click the canvas to focus, then use WASD or arrow keys to walk. Walls and furniture block movement. Press E near a desk or reception; clicking/tapping works too. The room list below the canvas is an accessible mobile alternative. Desks use real public room data from `GET /api/rooms`, refreshed every 12 seconds. At most eight rooms are mapped, prioritizing available/active rooms when filling vacancies; existing rooms keep their desk slots across successful refreshes. Full rooms show a disabled join button. Removed/ended/private/expired rooms disappear on the next refresh. **View All Rooms** opens Explore. Joining opens the existing nickname/media flow at `/room/[id]`, which rechecks admission. Reception reuses the same creation form and API as Home, including Public/Private visibility and creator cookies.

Avatar presence reuses LiveKit Cloud in a separate, fixed `studyflow-world-library-v1` room. `POST /api/world/token` validates nicknames and a fixed color palette, requires same-origin requests, applies a Redis-backed limit of 10 joins/minute per trusted Vercel client IP, generates a new UUID identity, and issues a short-lived data-only join token. Publishing/subscribing to media, metadata changes and administrative privileges are disabled. Entering the world never requests camera/microphone permissions or publishes media. World identities and room participants are separate; leaving the world disconnects its presence connection.

The LiveKit room and signed room configuration enforce a maximum of 20 connections, including concurrent admission; token preflight supplies a friendly full error. This is a configured MVP limit, **not a verified 20-client production capacity claim**. LiveKit connection quotas and billing still apply. Positions are temporary Data Messages, not database writes. Movement is sent at most 10 times/second, with a two-second stationary heartbeat and reliable join/visibility snapshots. Remote movement is interpolated in Phaser without React frame updates. Receiver-side throttling, payload-size limits, bounds/collision validation, monotonically increasing sequence numbers and provider-supplied identities protect against malformed/reordered presence. Avatars disappear on disconnect or after ten seconds without valid presence. Reconnecting refreshes presence; hidden tabs stop local motion and resume snapshots on visibility changes. Phaser, keyboard handlers, timers and the LiveKit connection are disposed on exit. Throttled background tabs may temporarily lose their visible avatar until the next heartbeat.

No new environment variables, database migration, service account or multiplayer server is required. On Vercel, use the existing five LiveKit/Upstash variables and `npm run build`; allow the same LiveKit WebSocket/WebRTC traffic as study rooms. A missing/full/unavailable world shows a connection error and retry action; the room list and Explore remain usable where their APIs are available. Test two browser profiles on a configured HTTPS deployment: walk independently, verify remote motion and collision, reconnect/leave, and enter/create study rooms. Before advertising capacity, test 20 actual connections and a rejected 21st, plus mobile/background/network-loss behavior. Automated tests cover geometry, desk mapping, admission grants, validation, room UI, cleanup and lack of media capture; mocked services do not prove live transport or load capacity.

## Shared room music (Phase 4)

### YouTube and Spotify sources

In Room Music, choose YouTube or Spotify, enter a song title or artist, then press Search. Up to ten results show provider artwork, title, artist/channel and a link to the original provider. Request a YouTube result to add it to the shared queue, or open a Spotify result in the personal embed. Pasting provider links remains available. Search runs only on explicit submission, with loading, empty, error and retry states; changing the query/provider cancels stale results. YouTube title, channel and artwork are resolved on the server when a request is queued, so client-supplied metadata is never trusted. New queue/current items show this metadata too; existing items keep their saved metadata.

Playback uses the official, visible YouTube IFrame Player API, with the existing creator play/pause/skip controls and shared Redis timeline. Enable Room Music on each browser; YouTube may additionally require Play in its own player. Videos disabled for embedding, age/region restrictions, removed/private videos, ads, buffering, and autoplay policies can limit playback or synchronization. No audio is extracted, downloaded, or rebroadcast.

For search, configure server-only `YOUTUBE_API_KEY` (enable **YouTube Data API v3** in Google Cloud), and `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` from a Spotify developer application. Spotify app access, development-mode eligibility and quota are controlled by Spotify. No listener Spotify account is needed to search; playback/account restrictions still apply. Do not prefix credentials with `NEXT_PUBLIC_`. Add these variables to the deployment and redeploy. Missing credentials or provider access/quota failures return a clear setup/service error. Without search credentials, pasting links and existing playback still work; YouTube links without a configured key retain their video-ID label.

Search uses `GET /api/rooms/[id]/music/search?provider=youtube|spotify&q=...`, requiring the same signed room session and connected LiveKit participant as other music calls. Queries must be 2–100 characters. Limits are five searches/minute/participant and twenty/minute/room. YouTube searches are also capped at eighty per 24-hour window across the deployment because each official search costs 100 quota units; this reserves some of the default daily quota for metadata calls. These counters use the existing Redis database. Provider requests time out after eight seconds. Spotify access tokens stay on the server and are reused until shortly before expiry; tokens, secrets and raw provider errors are never sent to the client. No migration is needed.

YouTube duration is not invented or trusted from user input. When the creator's YouTube player reports the video ended, it advances the version-checked queue. Therefore automatic advance for YouTube requires the creator to remain connected with music enabled. Other listeners cannot advance global playback. Creator Skip remains available if an embed fails. Built-in WAV tracks retain server-timed advancement.

Spotify links open an official personal embed, supporting track/album/playlist/episode URLs. Spotify playback uses Spotify's controls and does not enter the synchronized room queue. Account/subscription, previews, regional availability and autoplay behavior depend on Spotify. Global room controls, local Room Music volume and mute do not control the Spotify embed. Use its own controls; pause other audio to avoid overlap. There is no Spotify extraction or claim of full-track synchronized playback.

The collapsible Room Music panel sits below chat. Everyone can search YouTube or Spotify by title/artist; YouTube results can be requested for the shared queue, while Spotify results open in a personal player. The creator starts playback, pauses/resumes, skips, or removes queued requests. The first song waits for the creator to press Play; subsequent songs advance automatically while clients poll. Tracks are FIFO, limited to 20 queued requests, with no duplicate queued/current track and five requests per connected identity per minute.

Music starts disabled for every listener. Select **Enable Room Music** to hear it. Each participant's volume and mute affect only their local music, independently of conversation audio. Use headphones to reduce microphone echo, and do not capture this tab's audio during screen sharing. The app never publishes its music element into LiveKit tracks. Browser autoplay restrictions, buffering and device limitations can still require another explicit enable action.

The included Quiet Orbit and Soft Morning are original 45-second ambient compositions synthesized for this project, without third-party samples. Their CC0 dedication and provenance are in `public/music/LICENSE.md`; regenerate the PCM WAV assets with `node scripts/render-study-music.mjs`. Built-in tracks are served by the application. To add built-in songs, place authorized files in `public/music`, add validated metadata to `src/lib/music-catalog.ts`, and keep evidence that the license permits public web playback and redistribution. Duration must match the asset. User supplied sources are restricted to validated YouTube links and Spotify's official embed; arbitrary audio URLs, uploads, and extraction APIs are not accepted. Maintainer added HTTPS tracks require review of rights, availability, and seeking/range support.

Redis Lua transactions maintain one logical music state and queue per room. Redis TIME defines the timeline. Transactions serialize requests and automatic advancement; version-checked creator controls reject stale/repeated commands. Snapshots are fetched every two seconds, with reliable LiveKit data notifications as refresh hints. Clients never trust a data message as authoritative state. New listeners seek to the server timeline, account for approximately half the request latency, ignore older versions/snapshots, and correct drift above one second. This targets roughly 1–2 second agreement on healthy connections, not sample-perfect playback. A stale snapshot or disconnected media session pauses local audio.

There is no background scheduler: after ten seconds without an authorized snapshot, the next request pauses the timeline at the last observed snapshot rather than advancing an unattended playlist. This conservative inactivity rule also applies when every browser is suspended/background-throttled. The creator presses Play to resume after returning. Refresh/reconnect gets the existing Redis state; another participant's departure does not reset it. State expires with the room's TTL and is atomically deleted when the room is ended.

Music credentials are signed, room-bound, expiring session tokens issued with the existing join response. Every music API checks the LiveKit identity is still present; nicknames/roles from requests do not establish identity or creator privileges. Attribution uses the provider's participant name. Global controls additionally require the creator cookie, and writes require same-origin requests. Session credentials stay in browser memory and never become LiveKit administrator credentials. Music keys are separate from discovery metadata and cannot appear in Explore.

APIs: `GET /api/music/tracks`, `GET /api/rooms/[id]/music`, `GET /api/rooms/[id]/music/search`, `POST /api/rooms/[id]/music/requests`, `POST /api/rooms/[id]/music/play|pause|skip`, and `DELETE /api/rooms/[id]/music/queue/[requestId]`. Room music calls use `Authorization: Bearer <musicSession>` from the join response; controls send `expectedVersion`. Playback uses the existing five service variables; provider search additionally uses the three optional credentials described above and in `.env.example`.

### Additional verification

`npm test` covers discovery privacy/presence, room-bound music credentials, trusted attribution and creator authorization. An optional test executes the actual Lua against disposable Redis (Docker is for tests only):

```sh
docker run -d --name studyflow-music-redis-test redis:7-alpine redis-server --save '' --appendonly no
STUDYFLOW_REDIS_TEST=1 npx tsx --test tests/music.test.ts
docker stop studyflow-music-redis-test
docker rm studyflow-music-redis-test
```

Verify on an HTTPS deployment using real LiveKit/Upstash credentials: public/private discovery including empty/full/ended rooms; search/filter/sort and mobile navigation; two or more participants requesting songs; creator-only controls; autoplay enable, local mute/volume, late-join alignment, pause/resume, skip, automatic next track, duplicate requests, buffering, reconnect and inactivity behavior. Also confirm multiple cameras, screen shares and chat remain functional while music plays. Automated service stubs and local Redis tests do not prove Cloud transport, multi-device audio alignment, or a Vercel deployment.
