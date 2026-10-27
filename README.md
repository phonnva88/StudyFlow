# StudyFlow

StudyFlow gives students and study groups a online room to study together: a host can share a camera, microphone, or screen while invited viewers watch and chat. It is for people who want a little company and focus during a study session.

## Installation

Use Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
# Fill in the five variables using your own projects.
npm run dev
```

Open the application on port 3000. Browser media APIs need HTTPS or localhost. Missing service configuration produces an explicit setup error.

### LiveKit Cloud

1. Create a project at https://cloud.livekit.io/.
2. Copy its secure WebSocket URL, API key, and API secret into `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env.local`.
3. Use **LiveKit Cloud**, not a self-hosted server: end-session cleanup uses Cloud token-revocation support. Allow outbound HTTPS to the project hostname from the application server, and LiveKit Cloud WebRTC/WSS traffic from clients.
4. The application creates rooms through the official server SDK. No webhook or custom signaling server is required.

### Durable shared storage

Create one Redis database at https://console.upstash.com/. Copy its REST URL and REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. These are server-only credentials. All deployments that should share room state must use the same database. Do not replace Redis with a process-local Map or disk file.

## Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel; select the Next.js framework preset and the repository root directory. Use a Node.js 22 or 24 runtime.
2. Set all five environment variables from `.env.example` in Vercel project settings. Add them separately to Preview and Production as needed; redeploy after setting or changing them. Never prefix secrets with `NEXT_PUBLIC_`.
3. Use `npm ci` to install and `npm run build` to build. No custom server, persistent filesystem, or Vercel WebSocket server is needed. LiveKit carries media and chat directly.
4. Ensure the hosting plan permits the end route's `maxDuration = 60` seconds. End-stream cleanup deliberately waits 17 seconds to drain previously minted join tokens; do not lower the route timeout below this window. Deploy on HTTPS.
5. Open the actual deployment and run the real-service acceptance check below. A local build alone is not a verified deployment.

The host credential is a room-scoped HttpOnly, SameSite=Strict cookie (Secure in production). A host must create and reopen the room on the **same origin and browser profile**. Sending a link never sends host access. Losing the cookie loses host access; this MVP has no account recovery. Avoid changing deployment domains during a session. Preview deployment protection must permit invited viewers.

## Usage and lifecycle

- Enter a nickname and title, then create a room. The host enters the studio without automatically requesting camera or microphone permission.
- Turn devices on individually. **Go live** enables a camera if neither camera nor screen is active, then marks the session LIVE. Microphone starts muted; enable it using the Mic control. Sharing system/tab audio depends on browser and selected capture source.
- Copy the viewer invitation link. Viewers choose a nickname and can subscribe and send chat, but their signed tokens prohibit all media publishing and metadata changes. Only the host cookie authorizes start/end API calls.
- Camera preview and screen sharing use official LiveKit components and SDKs. Browsers may require clicking “enable livestream audio” for autoplay. Screen sharing works best on desktop Chromium; mobile support varies by platform.
- A transient host disconnect does not end the room. Viewers see a waiting state, and the host can refresh or rejoin using the cookie. Only the host identity's tracks are rendered.
- End stream marks the Redis record ENDED **before** provider cleanup, immediately denies new tokens, removes active participants with Cloud token revocation, waits for 15-second unused join JWTs to expire (plus 2 seconds of margin), removes participants again, then deletes the media room. Previously minted but unused JWTs cannot recreate the deleted room after this drain. End is idempotent and can be retried if provider cleanup fails. Cleanup requires a healthy LiveKit API and the route to finish executing.
- Rooms expire after 12 hours. All metadata requests and token issuance fail closed after expiry. Connected clients poll every five seconds and disconnect on expiry/end; Redis expiry itself is not a scheduled server-side media deletion job.
- Chat has no durable history. Messages arrive only for connected participants; the UI retains the latest 200 messages during that connection. React escapes message text. Messages are limited to 500 characters; outgoing sends are throttled to one per second, and receivers independently discard excessive messages from each identity. This is basic spam mitigation, not server-enforced LiveKit data bandwidth policing.

## Security and operational limits

Room IDs contain 128 random bits. Host credentials contain 256 random bits and only SHA-256 hashes are stored in Redis. APIs ignore submitted roles. Join JWTs expire after 15 seconds (the established WebRTC session remains connected; LiveKit manages reconnection tokens). Host identity is fixed per room, so one host device is supported. Nicknames are not verified identities and may be duplicated.

Same-origin checks protect mutating APIs. Atomic Redis scripts prevent resurrecting ENDED records and implement shared rate limits: 5 creates and 40 token requests per minute per client IP on Vercel. Outside Vercel, a shared `local` bucket avoids trusting arbitrary forwarded headers; configure a trusted proxy strategy if deploying elsewhere. Redis failure never grants access. Get-room responses omit the credential hash and all API results are uncached.

An end action immediately revokes application access, but completion of media-side revocation depends on LiveKit Cloud. Network failures, a platform function interruption, or a provider-issued reconnection token require provider-side verification and potentially retrying cleanup. Do not treat deleting a room or expiring a Redis record as independently revoking all provider-issued tokens. The acceptance check must include replaying an old token after end against your Cloud project. A production system needing guaranteed cleanup after unattended expiry/provider outages should add a scheduled reconciler; this MVP does not claim that guarantee.

There is no global application login or billing protection. Invite-only means an unpredictable shareable URL, not password-protected membership. Anyone with a link can join while active. Apply project spending limits and platform-level abuse protection before public promotion. No media or chat content is stored by this application.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Browser checks below expect the five app service variables to be absent:
npx playwright install chromium
npm run test:e2e
# Or use an existing system Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

`npm test` verifies random credentials, input validation, cryptographically signed token grants, and API authorization/lifecycle contracts using stubbed external HTTP responses. It does **not** prove real Redis Lua execution or real LiveKit transport. Browser tests run against the production build and cover landing form errors, mobile overflow, invalid rooms, and cross-origin rejection. Do not point the browser tests at a configured production service; the form test expects missing credentials.

### Real-service acceptance (required before calling streaming verified)

1. Create a room on the HTTPS deployment. As host, test camera permission granted/denied, microphone audio, preview, camera/mic toggles, and desktop screen sharing (with and without captured audio).
2. Open the link in **two independent viewer browser profiles/devices**. Confirm both see and hear the host; use headphones to avoid feedback. Confirm chat works in both directions and no history is fabricated on a fresh join.
3. Inspect a viewer token and try publishing via the LiveKit SDK: the provider must reject camera, microphone, and screen tracks. POST start/end without the host cookie and submit forged `role`/`isHost` fields: no privilege escalation should be possible.
4. Refresh the host page: the same browser retains host control. Open the same URL in a private profile: it must remain a viewer. Interrupt host networking temporarily, reconnect, and confirm the room was not marked ENDED.
5. End the livestream. Confirm all viewers disconnect, both new joins and old URLs are rejected, and an already-minted join/reconnect token cannot recreate the media room after cleanup. Confirm Cloud revocation behavior for your project. If cleanup fails, retry the end API from the host browser or remove the media room through the LiveKit console.
6. Check mobile playback/chat, browser autoplay recovery, and screen sharing support on the intended platforms. Confirm rooms cannot issue tokens after the 12-hour expiry and check the intended Vercel function duration in deployment logs.

## Project layout

- `src/app`: landing page, room page, and server-only route handlers.
- `src/components`: host/viewer interface, media controls, live chat.
- `src/lib`: validation, cookie authentication, Redis lifecycle/rate limits, LiveKit tokens.
- `tests`: security and API contracts; `tests/browser`: production browser checks.

The repository includes complete integrations and a local production build can run without credentials. Actual room creation, WebRTC, Upstash execution, token revocation, and Vercel deployment still need real credentials and the acceptance check above.
