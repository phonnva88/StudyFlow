import { test, expect } from "@playwright/test";
test('original music catalog serves seekable audio with matching duration', async ({ page, request }) => {
  const response = await request.get('/api/music/tracks');
  expect(response.ok()).toBe(true);
  const {tracks} = await response.json();
  expect(tracks.length).toBe(2);
  await page.goto('/');
  for (const track of tracks) {
    expect(track.licenseInfo).toContain('CC0');
    const partial = await request.get(track.audioUrl, {headers: {Range: 'bytes=0-43'}});
    expect(partial.status()).toBe(206);
    expect((await partial.body()).subarray(0, 4).toString()).toBe('RIFF');
    const duration = await page.evaluate((url: string) => new Promise<number>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onloadedmetadata = () => { resolve(audio.duration); audio.src = ''; };
      audio.onerror = () => reject(new Error('Audio asset failed to load'));
    }), track.audioUrl);
    expect(duration).toBeCloseTo(track.durationSeconds, 1);
  }
});
test("landing form validates and reports missing server configuration honestly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little company. A lot of focus." }),
  ).toBeVisible();
  await page.getByLabel("Your nickname").fill("Ada");
  await page.getByLabel("Room title").fill("Calculus study session");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Streaming is not configured yet" }),
  ).toContainText("Streaming is not configured yet");
  await expect(
    page.getByRole("button", { name: "Create Room", exact: true }),
  ).toBeEnabled();
});
test("mobile landing has no horizontal overflow and usable form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Your nickname")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("invalid room has a clear unavailable state", async ({ page }) => {
  await page.goto("/room/not-a-room");
  await expect(
    page.getByRole("heading", { name: "Room unavailable" }),
  ).toBeVisible();
});
test("mutating APIs reject cross-origin requests before accessing services", async ({
  request,
}) => {
  const response = await request.post("/api/rooms", {
    headers: { origin: "https://attacker.example" },
    data: { nickname: "Mallory", title: "No" },
  });
  expect(response.status()).toBe(403);
});

test("collaborative join keeps devices off and displays admission errors", async ({ page }) => {
  const id = "a".repeat(32);
  await page.addInitScript(() => {
    Reflect.set(window, "deviceRequests", 0);
    navigator.mediaDevices.getUserMedia = async () => {
      Reflect.set(window, "deviceRequests", Reflect.get(window, "deviceRequests") + 1);
      throw new Error("Joining must not request devices");
    };
  });
  await page.route(`**/api/rooms/${id}`, route => route.fulfill({ json: {
    id, title: "Group study", hostName: "Alice", state: "LIVE", isHost: false,
    expiresAt: Date.now() + 3600000,
  } }));
  await page.route(`**/api/rooms/${id}/token`, async route => {
    expect(route.request().postDataJSON()).toEqual({ nickname: "Bob" });
    await route.fulfill({ status: 409, json: { error: "This room uses an older configuration. Please create a new study room." } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/room/${id}`);
  await expect(page.getByRole("heading", { name: "Group study" })).toBeVisible();
  await expect(page.getByText("Up to 6 people can join.", { exact: false })).toBeVisible();
  await page.getByLabel("Your nickname").fill("Bob");
  await page.getByRole("button", { name: "Join study room" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "older configuration" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "deviceRequests"))).toBe(0);
  await expect(page.getByRole("button", { name: "Join study room" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('explore searches, filters, sorts and links to the existing join flow', async ({ page }) => {
  const base = { hostName: 'Alice', maxParticipants: 6, visibility: 'PUBLIC', expiresAt: Date.now() + 3600000 };
  await page.route('**/api/rooms', route => route.fulfill({ json: { rooms: [
    { ...base, id: 'a'.repeat(32), title: 'Calculus together', createdAt: 3, status: 'ACTIVE', participantCount: 2 },
    { ...base, id: 'b'.repeat(32), title: 'Coding club', createdAt: 2, status: 'FULL', participantCount: 6 },
    { ...base, id: 'c'.repeat(32), title: 'Quiet reading', createdAt: 1, status: 'EMPTY', participantCount: 0 },
  ] } }));
  await page.goto('/explore');
  const cards = page.getByLabel('Public study rooms');
  await expect(cards.getByRole('link', { name: 'Join Room' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Room full' })).toBeDisabled();
  await page.getByLabel('Search rooms').fill('CALCULUS');
  await expect(cards.getByRole('link', { name: 'Join Room' })).toHaveAttribute('href', `/room/${'a'.repeat(32)}`);
  await page.getByLabel('Search rooms').fill('not here');
  await expect(page.getByText('No matching rooms.', { exact: false })).toBeVisible();
  await page.getByLabel('Search rooms').clear();
  await page.getByLabel('Show', { exact: true }).selectOption('EMPTY');
  await expect(cards).toContainText('Quiet reading');
  await expect(cards).not.toContainText('Coding club');
  await page.getByLabel('Show', { exact: true }).selectOption('ALL');
  await page.getByLabel('Sort by').selectOption('MOST');
  await expect(cards.locator('[data-slot="card-title"]').first()).toHaveText('Coding club');
  await page.getByLabel('Sort by').selectOption('LEAST');
  await expect(cards.locator('[data-slot="card-title"]').first()).toHaveText('Quiet reading');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('explore handles empty data, upstream errors and retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/rooms', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: 'Presence unavailable. Try again.' } : { rooms: [] } }));
  await page.goto('/explore');
  await expect(page.getByText('Presence unavailable. Try again.')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('There are no public rooms yet.', { exact: false })).toBeVisible();
});
