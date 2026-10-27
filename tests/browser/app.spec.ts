import { test, expect } from "@playwright/test";
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
