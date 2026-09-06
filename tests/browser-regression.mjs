import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.CRM_TEST_URL || "http://localhost:3017";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const artifacts = process.env.CRM_TEST_ARTIFACTS || "/tmp/triton-browser-check";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email", { exact: true }).fill("test-a@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Test-only-password-123!");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/dashboard");
  const data = await (await context.request.get(`${base}/api/data`)).json();
  assert.equal(data.clients.length, 1);
  assert.equal(data.clients[0].id, "test-a-client");
  const cross = await context.request.post(`${base}/api/data`, { data: { action: "policy.update", payload: { id: "test-b-policy", patch: { notes: "must not save" } } } });
  assert.ok([400, 403, 404].includes(cross.status()), `cross-tenant status ${cross.status()}`);
  const invalidCreate = await context.request.post(`${base}/api/data`, { data: {
    action: "client.create",
    payload: {
      client: { id: "atomic-client-invalid", firstName: "Atomic", lastName: "Invalid", email: "atomic-invalid@example.invalid" },
      relationships: [{ id: "atomic-rel-invalid", fromClientId: "atomic-client-invalid", toClientId: "test-b-client", relationship: "Spouse" }],
    },
  } });
  assert.ok([400, 403, 404].includes(invalidCreate.status()));
  assert.equal((await (await context.request.get(`${base}/api/data`)).json()).clients.some((client) => client.id === "atomic-client-invalid"), false);
  const validCreate = await context.request.post(`${base}/api/data`, { data: {
    action: "client.create",
    payload: {
      client: { id: "atomic-client-valid", firstName: "Atomic", lastName: "Valid", email: "atomic-valid@example.invalid" },
      relationships: [{ id: "atomic-rel-valid", fromClientId: "atomic-client-valid", toClientId: "test-a-client", relationship: "Spouse" }],
    },
  } });
  assert.equal(validCreate.status(), 200);
  const afterAtomicCreate = await (await context.request.get(`${base}/api/data`)).json();
  assert.ok(afterAtomicCreate.clients.some((client) => client.id === "atomic-client-valid"));
  assert.ok(afterAtomicCreate.relationships.some((relationship) => relationship.id === "atomic-rel-valid"));
  await context.request.post(`${base}/api/data`, { data: { action: "client.delete", payload: { id: "atomic-client-valid" } } });
  await page.locator('button[title="Investment amount details"]').first().click();
  const investmentDialog = page.getByRole("dialog");
  await investmentDialog.waitFor();
  assert.ok(await investmentDialog.getByText(/Scheduled contributions/).count());
  await page.screenshot({ path: `${artifacts}/investment-desktop.png` });
  await page.keyboard.press("Escape");
  await page.goto(`${base}/clients/test-a-client`);
  await page.getByRole("button", { name: "Add Follow-up", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Summary/).fill("Saved only after database confirmation");
  let rejectCreate = true;
  await page.route("**/api/data", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON().action === "followup.create" && rejectCreate) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Simulated save failure" }) });
    }
    return route.continue();
  });
  await dialog.getByRole("button", { name: /Save|Add follow-up/i }).last().click();
  await page.getByText("Simulated save failure", { exact: false }).waitFor();
  assert.equal(await dialog.getByLabel(/Summary/).inputValue(), "Saved only after database confirmation");
  assert.equal((await (await context.request.get(`${base}/api/data`)).json()).followUps.length, 0);
  rejectCreate = false;
  await dialog.getByRole("button", { name: /Save|Add follow-up/i }).last().click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal((await (await context.request.get(`${base}/api/data`)).json()).followUps.length, 1);
  await page.reload();
  await page.getByText("Saved only after database confirmation", { exact: true }).first().waitFor();
  await page.goto(`${base}/settings`);
  await page.getByRole("button", { name: /^Automation/ }).click();
  await page.getByRole("heading", { name: "Recent deliveries" }).waitFor();
  await page.screenshot({ path: `${artifacts}/automation-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${artifacts}/automation-mobile.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile page overflows");
  console.log("Browser regression passed: tenant isolation, failed save retains input, retry persists, AUM details, desktop/mobile automation UI.");
} finally { await browser.close(); }
