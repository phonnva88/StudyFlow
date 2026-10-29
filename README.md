# StudyFlow

StudyFlow gives students, study groups, and friends a public or private online room to study together. Up to six people can independently share their webcam, microphone, and screen, watch each other, chat, and listen to shared music without accounts or host approval for streaming.

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

No new environment variables are required for Phase 2:

- `LIVEKIT_URL`: your LiveKit Cloud project's `wss://` URL.
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: server-side LiveKit credentials.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: one shared Upstash Redis database's REST credentials.

Use **LiveKit Cloud**, since ending rooms uses Cloud token revocation. Allow HTTPS to the project hostname from the application server and LiveKit WebRTC/WSS traffic from browsers. All deployments sharing rooms must use the same Redis database. Keep all credentials server-side; never use `NEXT_PUBLIC_` prefixes.

## Collaborative study rooms

1. Enter a nickname and room title, choose Public or Private visibility, then create the room and select **Enter room**.
2. Copy the invitation link. Other people enter their nicknames and select **Join study room**.
3. Every participant can toggle their own camera, microphone, and screen share. All devices start **off**; joining does not request camera/microphone permission.
4. Cameras appear once per participant, with names, microphone status, and placeholders for disabled cameras. Screen shares appear prominently above the camera grid. Multiple screen shares coexist with camera streams.
5. Chat uses reliable LiveKit Data Messages. Names come from server-issued participant tokens. There is no persistent chat history; clients retain up to 200 messages per connection.
6. **Leave** disconnects only you, stops your local tracks, and leaves the room open, including when the creator leaves. A temporary network interruption uses LiveKit's automatic reconnection; a terminal disconnect allows manual rejoining with a fresh token.
7. Only the creator sees **End room**. Ending permanently closes admission and disconnects everyone. The creator can retry media cleanup if a provider error interrupts it.

Screen sharing uses LiveKit's `getDisplayMedia` integration. It works best in desktop Chromium; browsers without support show an explanation and disable sharing. Capturing system/tab audio depends on the browser and selected source. Browsers may require **Enable room audio** before remote audio plays. Use headphones when testing multiple devices.

## Capacity and authorization

Phase 2 deliberately uses the simpler **six connected participants total**, including the creator and people with all devices off. There is no watch-only overflow or publisher-slot queue.

LiveKit enforces `maxParticipants: 6` at connection admission, including concurrent joins. Slots are freed when LiveKit processes a disconnect; unexpected network loss can temporarily retain a slot during reconnection. A seventh connection is rejected by LiveKit. Issuing a JWT does not reserve a slot. Every join verifies that the provider room has the correct cap, and signed tokens include the same room configuration so automatic room recreation also keeps the limit. Existing Phase 1 rooms with a different provider cap are rejected with a message to create a new room.

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
# Browser tests require the five app service variables to be absent:
npx playwright install chromium
npm run test:e2e
# Or use an existing Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Unit/API tests verify signed grants, unique identities, creator-only administration, six-person provider configuration, rejection of legacy uncapped rooms, validation, expiry, rate limits, and ending. External HTTP services are stubbed; these checks do not prove real Redis Lua execution, LiveKit capacity admission, or media transport. Browser checks cover the landing/join flow, mobile layout, missing configuration, and cross-origin rejection.

### Real-service acceptance

Use an HTTPS deployment with actual LiveKit Cloud and Upstash credentials:

1. Create a new room. Join as Alice, Bob, and Charlie using separate browser profiles/devices. Confirm camera/mic permission is not requested until each enables the relevant control.
2. Enable all three webcams and microphones. Confirm everyone sees three distinct camera tiles with the correct nicknames and microphone states, and hears other participants without local audio feedback. Toggle one person's camera/mic independently; only their own track changes.
3. Have Bob share a screen while everyone keeps their cameras on. Have Charlie share another screen. Confirm both screens appear above the camera grid and either participant can stop their own share without affecting the other tracks.
4. Send chat messages in all directions. Try denied permissions, unavailable devices, unsupported mobile screen sharing, and browser audio autoplay recovery.
5. Join up to six clients. Race additional joins; confirm only six connect. Leave one client and confirm another can join after LiveKit releases the slot. Repeat with abrupt network loss and reconnection. Confirm placeholders and participant tiles update on joins/leaves, with no duplicate camera tiles.
6. Leave as creator: other participants must remain connected and keep streaming. Rejoin in the same browser to recover End room controls; another profile must not have those controls. POST start/end without the creator cookie or forge role fields: no administrative privileges should be granted.
7. End the room: everyone must disconnect; fresh joins and old join/reconnection tokens must not recreate the session after cleanup. Retry ending if provider cleanup fails. Verify expiry, mobile layout, and Vercel function duration as well.

## Project layout

- `src/app`: landing/room pages and server-only API route handlers.
- `src/components/studio.tsx`: multi-participant camera grid, screen shares, device controls, and creator-only ending.
- `src/components/chat.tsx`: existing reliable LiveKit data chat.
- `src/components/ui`: shadcn/ui component source; theme tokens live in `src/app/globals.css`.
- `src/lib`: validation, creator-cookie authorization, Redis state/rate limits, and LiveKit configuration/tokens.
- `tests`: security/API contracts; `tests/browser`: production browser checks.

## Public room discovery (Phase 3)

Open `/explore` from Home or a room to browse public study rooms. Search titles, filter All / Active / Empty / Available, and sort newest / most / least participants. Cards show creator, creation time, LiveKit participant count, six-person capacity, and ACTIVE / EMPTY / FULL status. Full takes precedence; webcam and screen tracks are not counted as extra people. Join Room opens the existing nickname/join flow.

Public visibility is an explicit creation option. Existing rooms and older API clients without visibility remain Private. Private rooms are unlisted and the existing unpredictable invitation URL is a bearer capability: anyone given that link can join; this is not a verified-membership or password system. No private IDs or creator credentials are exposed in the listing API.

`GET /api/rooms` exhausts Redis SCAN, deduplicates keys and batch-loads metadata. Expired, ended, deleted and private rooms are excluded. LiveKit ListRooms provides presence, with metadata rechecked afterward. A valid application room with no media room is EMPTY and stays discoverable. Provider failures return an error rather than invented counts. The browser polls every 12 seconds. Token issuance rechecks room validity and capacity, with LiveKit admission enforcing concurrent joins. No new environment variables, migration, or process-local storage is used. This MVP scans active metadata per request; larger deployments should add a public-room index with server pagination/search.

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
