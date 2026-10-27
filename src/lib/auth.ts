import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export const newRoomId = () => randomBytes(16).toString("hex");
export const newHostCredential = () => randomBytes(32).toString("hex");
export const hashCredential = (credential: string) =>
  createHash("sha256").update(credential).digest("hex");
export const hostCookie = (id: string) => `studyflow-host-${id}`;
export function isHost(credential: string | undefined, hash: string): boolean {
  if (
    !credential ||
    !/^[a-f0-9]{64}$/.test(credential) ||
    !/^[a-f0-9]{64}$/.test(hash)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(hashCredential(credential), "hex"),
    Buffer.from(hash, "hex"),
  );
}
