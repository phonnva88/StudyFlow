import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newRoomId,
  newHostCredential,
  hashCredential,
  isHost,
} from "../src/lib/auth";
import { text, roomId, chatText } from "../src/lib/validation";
import { issueToken } from "../src/lib/livekit";
import { TokenVerifier } from "livekit-server-sdk";

test("unpredictable IDs and host credentials; only matching credential authenticates", () => {
  const id = newRoomId();
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.notEqual(id, newRoomId());
  const credential = newHostCredential();
  assert.match(credential, /^[a-f0-9]{64}$/);
  const hash = hashCredential(credential);
  assert.notEqual(hash, credential);
  assert.equal(isHost(credential, hash), true);
  for (const bad of [undefined, "", newHostCredential(), "host", hash])
    assert.equal(isHost(bad, hash), false);
});
test("validation rejects oversized, blank, malformed, and control-character inputs", () => {
  assert.equal(text("  Ada  ", "Nickname", 32), "Ada");
  for (const value of [null, {}, "", " ", "x".repeat(33), "a\nb"])
    assert.throws(() => text(value, "Nickname", 32));
  assert.throws(() => roomId("../../secret"));
  assert.throws(() => roomId("host=true"));
  assert.equal(roomId(newRoomId()).length, 32);
  assert.equal(chatText(" hello "), "hello");
  for (const value of ["", " ", "x".repeat(501), {}, null])
    assert.equal(chatText(value), null);
});
test("signed viewer tokens cannot publish media, administer rooms, or change metadata", async () => {
  process.env.LIVEKIT_URL = "wss://test.livekit.cloud";
  process.env.LIVEKIT_API_KEY = "test-key";
  process.env.LIVEKIT_API_SECRET = "test-secret-with-at-least-32-characters";
  process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-only";
  const id = newRoomId();
  const verify = new TokenVerifier(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
  const viewer = await verify.verify(
    await issueToken(id, "Viewer", false, "viewer-test"),
  );
  assert.equal(viewer.video?.room, `studyflow-${id}`);
  assert.equal(viewer.video?.canPublish, false);
  assert.equal(viewer.video?.canSubscribe, true);
  assert.equal(viewer.video?.canPublishData, true);
  assert.equal(viewer.video?.canUpdateOwnMetadata, false);
  assert.notEqual(viewer.video?.roomAdmin, true);
  assert.notEqual(viewer.video?.roomCreate, true);
  assert.equal(JSON.parse(viewer.metadata!).role, "viewer");
  assert.ok(viewer.exp! - viewer.nbf! <= 60);
  const host = await verify.verify(
    await issueToken(id, "Host", true, `host-${id}`),
  );
  assert.equal(host.video?.canPublish, true);
  assert.deepEqual(host.video?.canPublishSources, [
    "camera",
    "microphone",
    "screen_share",
    "screen_share_audio",
  ]);
  assert.equal(JSON.parse(host.metadata!).role, "host");
});
