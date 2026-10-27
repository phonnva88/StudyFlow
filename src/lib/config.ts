import { HttpError } from "./validation";
export function configuration() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !key || !secret || !redisUrl || !redisToken) {
    throw new HttpError(
      503,
      "Streaming is not configured yet. Add the LiveKit and Upstash environment variables on the server.",
    );
  }
  if (!url.startsWith("wss://") || !redisUrl.startsWith("https://"))
    throw new HttpError(503, "Secure LiveKit and Redis URLs are required.");
  return { url, key, secret, redisUrl, redisToken };
}
