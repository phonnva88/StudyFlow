export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function text(value: unknown, label: string, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new HttpError(
      400,
      `${label} must be between 1 and ${max} characters without control characters.`,
    );
  }
  return value.trim();
}
export function roomId(value: string): string {
  if (!/^[a-f0-9]{32}$/.test(value))
    throw new HttpError(404, "Room not found.");
  return value;
}
export function chatText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message && message.length <= 500 ? message : null;
}

export function visibility(value: unknown): "PUBLIC" | "PRIVATE" {
  if (value === undefined) return "PRIVATE"; // Older clients remain unlisted.
  if (value !== "PUBLIC" && value !== "PRIVATE")
    throw new HttpError(400, "Choose Public or Private room visibility.");
  return value;
}
