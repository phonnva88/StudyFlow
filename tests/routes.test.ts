import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getRecord } from "../src/lib/room-store";
import { GET as getRoom } from "../src/app/api/rooms/[roomId]/route";
import { POST as token } from "../src/app/api/rooms/[roomId]/token/route";
import { POST as start } from "../src/app/api/rooms/[roomId]/start/route";
import { POST as end } from "../src/app/api/rooms/[roomId]/end/route";
import { POST as create } from "../src/app/api/rooms/route";
import { hostCookie, hashCredential, newHostCredential } from "../src/lib/auth";
import { TokenVerifier } from "livekit-server-sdk";

// Contract tests use the real SDKs and handlers with stubbed external HTTP services.
// They do not validate actual Upstash Lua execution or LiveKit transport.
test("room API contracts: credential privacy, shared publishing, unique identities, forged admin roles, lifecycle, rate limiting, CSRF", async (t) => {
  Object.assign(process.env, {
    LIVEKIT_URL: "wss://test.livekit.cloud",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret-with-at-least-32-characters",
    UPSTASH_REDIS_REST_URL: "https://test.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-only",
  });
  const id = "a".repeat(32);
  const credential = newHostCredential();
  const record = {
    id,
    title: "Math",
    hostName: "Ada",
    hostHash: hashCredential(credential),
    state: "CREATED",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  let count = 0;
  let providerCap = 6;
  let connected = 0;
  let recordExists = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes("test.livekit.cloud")) {
        if (String(url).endsWith('/ListRooms')) return Response.json({ rooms: [{ name: `studyflow-${id}`, numParticipants: connected }] });
        if (String(url).endsWith('/ListParticipants')) return Response.json({ participants: Array.from({ length: connected }, (_, i) => ({ identity: `participant-${i}`, sid: `PA_${i}` })) });
        assert.ok(String(url).endsWith("/CreateRoom"));
        const config = JSON.parse(String(init?.body));
        assert.equal(config.maxParticipants, 6);
        return Response.json({ name: config.name, sid: "RM_test", maxParticipants: providerCap });
      }
      assert.match(String(url), /^https:\/\/test.upstash.io/);
      const parsed = JSON.parse(String(init?.body));
      function command(args: unknown[]) {
        const cmd = String(args[0]).toLowerCase();
        let result: unknown;
        if (cmd === "get") result = recordExists ? JSON.stringify(record) : null;
        else if (cmd === "eval") {
          const script = String(args[1]);
          if (script.includes("INCR")) result = ++count;
          else if (record.state === "ENDED" && args.at(-1) !== "ENDED")
            result = -1;
          else {
            record.state = String(args.at(-1));
            result = 1;
          }
        } else throw new Error(`Unexpected Redis command: ${cmd}`);
        return { result: result };
      }
      return Response.json(
        Array.isArray(parsed[0]) ? parsed.map(command) : command(parsed),
      );
    },
  );
  const context = { params: Promise.resolve({ roomId: id }) };
  const request = (action: string, host = false, data: unknown = {}) =>
    new NextRequest(`http://localhost/api/rooms/${id}${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost",
        ...(host ? { cookie: `${hostCookie(id)}=${credential}` } : {}),
      },
      body: JSON.stringify(data),
    });
  assert.equal((await getRecord(id)).hostHash, record.hostHash);
  let response = await getRoom(
    new NextRequest(`http://localhost/api/rooms/${id}`),
    context,
  );
  const publicData = await response.json();
  assert.equal(publicData.isHost, false);
  assert.equal(publicData.hostHash, undefined);
  response = await token(
    request("/token", false, {
      nickname: "Viewer",
      role: "host",
      isHost: true,
    }),
    context,
  );
  assert.equal(response.status, 200);
  const viewer = await response.json();
  assert.equal(viewer.isHost, false);
  const verifier = new TokenVerifier(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );
  assert.equal((await verifier.verify(viewer.token)).video?.canPublish, true);
  const hostRequest = request("/token", true, { nickname: "Ignored" });
  assert.equal(hostRequest.cookies.get(hostCookie(id))?.value, credential);
  response = await token(hostRequest, context);
  const host = await response.json();
  assert.equal(host.isHost, true);
  const claims = await verifier.verify(host.token);
  assert.equal(claims.name, "Ada");
  assert.equal(claims.video?.canPublish, true);
  assert.match(claims.sub!, /^participant-[a-f0-9-]+$/);
  const secondHost = await (await token(request("/token", true, { nickname: "Ada" }), context)).json();
  assert.notEqual((await verifier.verify(secondHost.token)).sub, claims.sub);
  assert.notEqual((await verifier.verify(viewer.token)).sub, claims.sub);
  assert.deepEqual((await verifier.verify(viewer.token)).video, claims.video);
  assert.equal(claims.roomConfig?.maxParticipants, 6);
  providerCap = 100;
  assert.equal((await token(request("/token", false, { nickname: "Legacy" }), context)).status, 409);
  providerCap = 6;
  connected = 6;
  response = await token(request('/token', false, { nickname: 'Seventh', participantCount: 0 }), context);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /full/i);
  connected = 5;
  assert.equal((await token(request('/token', false, { nickname: 'Sixth' }), context)).status, 200);
  connected = 0;
  recordExists = false;
  assert.equal((await token(request("/token", false, { nickname: "Missing" }), context)).status, 404);
  recordExists = true;
  assert.equal((await start(request("/start"), context)).status, 403);
  assert.equal((await end(request("/end"), context)).status, 403);
  assert.equal((await start(request("/start", true), context)).status, 200);
  assert.equal(record.state, "LIVE");
  record.state = "ENDED";
  assert.equal(
    (await token(request("/token", true, { nickname: "Ada" }), context)).status,
    410,
  );
  assert.equal(
    (await token(request("/token", false, { nickname: "Viewer" }), context))
      .status,
    410,
  );
  assert.equal((await start(request("/start", true), context)).status, 410);
  assert.equal(
    (
      await getRoom(
        new NextRequest(`http://localhost/api/rooms/${id}`),
        context,
      )
    ).status,
    410,
  );
  record.state = "LIVE";
  record.expiresAt = Date.now() - 1;
  assert.equal(
    (await token(request("/token", true, { nickname: "Ada" }), context)).status,
    410,
  );
  record.expiresAt = Date.now() + 3600000;
  count = 40;
  assert.equal(
    (await token(request("/token", false, { nickname: "Viewer" }), context))
      .status,
    429,
  );
  const foreign = new NextRequest("http://localhost/api/rooms", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal((await create(foreign)).status, 403);
});

test("creation reserves a provider room and stores only a hashed credential in Redis", async (t) => {
  Object.assign(process.env, {
    LIVEKIT_URL: "wss://test.livekit.cloud",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret-with-at-least-32-characters",
    UPSTASH_REDIS_REST_URL: "https://test.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-only",
  });
  let saved: Record<string, unknown> | undefined;
  let providerName = "";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body));
      if (String(url).includes("test.livekit.cloud")) {
        assert.ok(String(url).endsWith("/CreateRoom"));
        providerName = parsed.name;
        assert.equal(parsed.maxParticipants, 6);
        return Response.json({ name: parsed.name, sid: "RM_test", maxParticipants: 6 });
      }
      function command(args: unknown[]) {
        if (String(args[0]).toLowerCase() === "eval") return { result: 1 };
        assert.equal(String(args[0]).toLowerCase(), "set");
        saved = JSON.parse(String(args[2]));
        assert.ok(args.some((x) => String(x).toLowerCase() === "nx"));
        assert.ok(args.some((x) => String(x).toLowerCase() === "ex"));
        return { result: "OK" };
      }
      return Response.json(
        Array.isArray(parsed[0]) ? parsed.map(command) : command(parsed),
      );
    },
  );
  const response = await create(
    new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nickname: "Ada", title: "Study hour" }),
    }),
  );
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.id, /^[a-f0-9]{32}$/);
  assert.equal(result.url, `/room/${result.id}`);
  assert.equal(providerName, `studyflow-${result.id}`);
  assert.equal(saved?.id, result.id);
  assert.equal(saved?.state, "CREATED");
  assert.equal(saved?.visibility, "PUBLIC");
  const cookie = response.cookies.get(hostCookie(result.id))!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "strict");
  assert.equal(cookie.path, `/api/rooms/${result.id}`);
  assert.equal(saved?.hostHash, hashCredential(cookie.value));
  assert.ok(!JSON.stringify(saved).includes(cookie.value));
  assert.ok(!JSON.stringify(result).includes(cookie.value));
});

test("end marks a tombstone before revoking participants and deleting the media room", async (t) => {
  Object.assign(process.env, {
    LIVEKIT_URL: "wss://test.livekit.cloud",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret-with-at-least-32-characters",
    UPSTASH_REDIS_REST_URL: "https://test.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-only",
  });
  const id = "b".repeat(32);
  const credential = newHostCredential();
  const record = {
    id,
    title: "End test",
    hostName: "Ada",
    hostHash: hashCredential(credential),
    state: "LIVE",
    expiresAt: Date.now() + 3600000,
  };
  const calls: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      const data = JSON.parse(String(init?.body));
      if (String(url).includes("test.livekit.cloud")) {
        const method = String(url).split("/").at(-1)!;
        calls.push(method);
        assert.equal(
          record.state,
          "ENDED",
          "tombstone must be durable before provider changes",
        );
        if (method === "ListRooms")
          return Response.json({
            rooms: [{ name: `studyflow-${id}`, sid: "RM_test" }],
          });
        if (method === "ListParticipants")
          return Response.json({
            participants: [{ identity: `host-${id}`, sid: "PA_test" }],
          });
        if (method === "RemoveParticipant")
          assert.ok(
            Number(data.revokeTokenTs) >= Math.floor(Date.now() / 1000),
          );
        return Response.json({});
      }
      function command(args: unknown[]) {
        if (String(args[0]).toLowerCase() === "get")
          return { result: JSON.stringify(record) };
        assert.equal(String(args[0]).toLowerCase(), "eval");
        record.state = String(args.at(-1));
        return { result: 1 };
      }
      return Response.json(
        Array.isArray(data[0]) ? data.map(command) : command(data),
      );
    },
  );
  const request = new NextRequest(`http://localhost/api/rooms/${id}/end`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      cookie: `${hostCookie(id)}=${credential}`,
    },
  });
  const began = Date.now();
  const response = await end(request, {
    params: Promise.resolve({ roomId: id }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "ENDED");
  assert.equal(record.state, "ENDED");
  assert.equal(calls.filter((x) => x === "RemoveParticipant").length, 2);
  assert.equal(calls.at(-1), "DeleteRoom");
  assert.ok(
    Date.now() - began >= 17000,
    "all unused join tokens must expire before deletion",
  );
});
