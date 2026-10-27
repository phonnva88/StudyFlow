# StudyFlow

StudyFlow gives students, study groups, and friends a private online room to study together. Up to six people can independently share their webcam, microphone, and screen, watch each other, and chat without accounts or host approval.

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

1. Enter a nickname and room title to create a room, then select **Enter room**.
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
