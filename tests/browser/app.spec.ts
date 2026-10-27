import { test, expect } from "@playwright/test";
import type { DiscoverableRoom } from '../../src/lib/discovery';

function discoveryRooms(): DiscoverableRoom[] {
  return [
    { id: 'a'.repeat(32), title: 'Coding Together', hostName: 'Ada', visibility: 'PUBLIC', status: 'ACTIVE', participantCount: 2, maxParticipants: 6, createdAt: Date.now() - 10000, expiresAt: Date.now() + 3600000 },
    { id: 'b'.repeat(32), title: 'Quiet Library', hostName: 'Minh', visibility: 'PUBLIC', status: 'EMPTY', participantCount: 0, maxParticipants: 6, createdAt: Date.now() - 20000, expiresAt: Date.now() + 3600000 },
    { id: 'c'.repeat(32), title: 'Math Marathon', hostName: 'Sam', visibility: 'PUBLIC', status: 'FULL', participantCount: 6, maxParticipants: 6, createdAt: Date.now() - 30000, expiresAt: Date.now() + 3600000 },
  ];
}
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

test('Explore searches, filters, sorts, identifies full rooms, and navigates to the existing nickname join flow', async ({ page }) => {
  const rooms = discoveryRooms();
  await page.route('**/api/rooms', route => route.fulfill({ json: { rooms } }));
  await page.route(`**/api/rooms/${rooms[0].id}`, route => route.fulfill({ json: { ...rooms[0], state: 'LIVE', isHost: false } }));
  await page.route(`**/api/rooms/${rooms[0].id}/token`, route => route.fulfill({ status: 409, json: { error: 'This study room is full. Wait for someone to leave and try again.' } }));
  await page.goto('/explore');
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('article', { name: 'Coding Together' })).toContainText('2/6 participants');
  await expect(page.getByRole('button', { name: 'Room full' })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('explore-desktop.png'), fullPage: true });
  await page.getByLabel('Search rooms by title').fill('CODING');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Search rooms by title').fill('does not exist');
  await expect(page.getByRole('heading', { name: 'No matching rooms' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await page.getByRole('button', { name: 'Empty', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article').first()).toContainText('Quiet Library');
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Available', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article', { name: 'Math Marathon' })).toHaveCount(0);
  await page.getByRole('button', { name: 'All Rooms', exact: true }).click();
  await page.getByLabel('Sort rooms').selectOption('most');
  await expect(page.getByRole('article').first()).toContainText('Math Marathon');
  await page.getByLabel('Sort rooms').selectOption('least');
  await expect(page.getByRole('article').first()).toContainText('Quiet Library');
  await page.getByLabel('Sort rooms').selectOption('newest');
  await expect(page.getByRole('article').first()).toContainText('Coding Together');
  await page.getByRole('link', { name: 'Join Room: Coding Together', exact: true }).click();
  await expect(page).toHaveURL(`/room/${rooms[0].id}`);
  await page.getByLabel('Your nickname').fill('Bob');
  await page.getByRole('button', { name: 'Join study room' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'study room is full' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Explore Rooms' }).click();
  await expect(page).toHaveURL('/explore');
});

test('Explore polls presence without resetting search and handles a failed refresh', async ({ page }) => {
  await page.clock.install();
  let rooms = discoveryRooms();
  let unavailable = false;
  await page.route('**/api/rooms', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'Service unavailable. Try again.' } })
    : route.fulfill({ json: { rooms } }));
  await page.goto('/explore');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByLabel('Search rooms by title').fill('coding');
  rooms = [{ ...rooms[0], status: 'FULL', participantCount: 6 }];
  await page.clock.fastForward(12000);
  await expect(page.getByRole('article')).toContainText('6/6 participants');
  await expect(page.getByLabel('Search rooms by title')).toHaveValue('coding');
  unavailable = true;
  await page.clock.fastForward(12000);
  await expect(page.getByRole('alert').filter({ hasText: 'Service unavailable' })).toBeVisible();
  await expect(page.getByText('Showing the last known counts.', { exact: false })).toBeVisible();
  unavailable = false;
  rooms = [{ ...rooms[0], status: 'EMPTY', participantCount: 0 }];
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('article')).toContainText('0/6 participants');
  await expect(page.getByRole('link', { name: 'Join Room: Coding Together' })).toBeVisible();
});

test('Explore has loading and empty states and usable navigation/cards on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/rooms', async route => { await ready; await route.fulfill({ json: { rooms: [] } }); });
  await page.goto('/explore');
  await expect(page.getByRole('status')).toContainText('Finding study rooms');
  release();
  await expect(page.getByRole('heading', { name: 'A little company starts with you.' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/rooms', route => route.fulfill({ json: { rooms: discoveryRooms() } }));
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('explore-mobile.png'), fullPage: true });
  await page.getByRole('navigation').getByRole('link', { name: 'Create Room' }).click();
  await expect(page.getByLabel('Room title')).toBeVisible();
});

test('Explore reports API setup errors with a retry action', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('alert').filter({ hasText: 'Streaming is not configured yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
