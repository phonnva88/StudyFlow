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
