import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";

// Uses seed_demo (DEBUG only). No provider calls and no production credentials.
const password = process.env.E2E_OWNER_PASSWORD ?? "local-e2e-password-only";
const email = process.env.E2E_OWNER_EMAIL ?? "demo.owner@example.com";
const backend = process.env.E2E_DJANGO_URL ?? "http://127.0.0.1:8000/api/v1";
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let token = "";
const run = Date.now().toString(36);
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest(); const offset = mac[19]! & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
test.describe.configure({ mode: "serial" });
test("Django: password + required TOTP enrolment, session survives reload", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const otp = page.getByLabel("Код из приложения аутентификации");
  await expect(otp).toBeVisible();
  const secret = process.env.E2E_TOTP_SECRET ?? await page.locator("code").textContent();
  expect(secret).toBeTruthy();
  await otp.fill(totp(secret!.trim()));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Обзор", exact: true })).toBeVisible();
  cookies = await context.cookies(); token = cookies.find((c) => c.name === "all_django_session")!.value;
});
test.beforeEach(async ({ context }) => { if (cookies.length) await context.addCookies(cookies); });
test("Django: create lead in UI, reload, verify via independent REST read", async ({ page, request }) => {
  await page.goto("/app/leads?create=1");
  const title = `Django UI ${run}`;
  await page.getByLabel("Описание", { exact: true }).fill(title);
  await page.getByLabel("Телефон", { exact: true }).fill("+996555000301");
  await page.getByLabel("Имя", { exact: true }).fill("Тестовый клиент");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.waitForURL(/open=/); await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();
  const response = await request.get(`${backend}/leads/`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).results.some((x: { title: string }) => x.title === title)).toBeTruthy();
});
test("Django: all enabled cabinet screens render using real API data", async ({ page }) => {
  for (const path of ["calls", "contacts", "knowledge", "assistant", "inbox", "calendar", "analytics", "team", "billing", "settings/company", "settings/notifications", "settings/security", "integrations"]) {
    const response = await page.goto(`/app/${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
  }
  await page.screenshot({ path: "test-results/django-cabinet.png", fullPage: true });
});
test("Django: lead status update persists and records history", async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${token}` };
  const leads = await (await request.get(`${backend}/read/listLeads/`, { headers })).json();
  const lead = leads.find((x: { title: string }) => x.title === `Django UI ${run}`);
  expect(lead).toBeTruthy();
  await page.goto(`/app/leads?open=${lead.id}`);
  await page.getByTestId("lead-card").getByRole("button", { name: "Закрыть успешно", exact: true }).click();
  await expect.poll(async () => (await (await request.get(`${backend}/leads/${lead.id}/`, { headers })).json()).status).toBe("won");
  await page.reload();
  const detail = await (await request.get(`${backend}/read/getLead/?id=${lead.id}`, { headers })).json();
  expect(detail.events.some((x: { action: string; after?: { status: string } }) => x.action === "status" && x.after?.status === "won")).toBeTruthy();
});
test("Django: publish knowledge, keep snapshot immutable and rollback through UI", async ({ page, request }) => {
  const headers = { Authorization: `Bearer ${token}` };
  async function state() { return (await request.get(`${backend}/read/getQuestionnaire/`, { headers })).json(); }
  const before = await state();
  await page.goto("/app/knowledge");
  const name = page.locator('[id="f-company.name"]');
  await name.fill(`Published ${run}`);
  await expect.poll(async () => (await state()).fields["company.name"]).toBe(`Published ${run}`);
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect.poll(async () => (await state()).published.version).toBe(before.draft.version);
  await name.fill(`Draft ${run}`);
  await expect.poll(async () => (await state()).fields["company.name"]).toBe(`Draft ${run}`);
  const exported = await (await request.get(`${backend}/export/`, { headers })).json();
  const published = exported.questionnaires.find((q: { version: number }) => q.version === before.draft.version);
  expect(published.snapshot.fields["company.name"]).toBe(`Published ${run}`);
  await page.getByRole("button", { name: "Откатить", exact: true }).click();
  await page.getByRole("menuitem").filter({ hasText: `v${before.published.version} ·` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Откатить", exact: true }).click();
  await expect.poll(async () => (await state()).published.version).toBe(before.draft.version + 1);
  expect((await state()).fields["company.name"]).toBe(before.fields["company.name"]);
});
test("Django: assistant reads published price and saves a real lead", async ({ page, request }) => {
  await page.goto("/app/assistant");
  await page.getByTestId("start-text").click();
  async function say(text: string) {
    const n = await page.locator('[data-speaker="ai"]').count();
    await page.getByTestId("chat-input").fill(text); await page.getByTestId("chat-send").click();
    await expect(page.locator('[data-speaker="ai"]')).toHaveCount(n + 1);
    return await page.locator('[data-speaker="ai"]').last().innerText();
  }
  expect(await say("Сколько стоит замена масла?")).toMatch(/1\s?500/);
  await say("Хочу записаться на замену масла завтра");
  const reply = await say("Меня зовут Азамат, телефон +996 555 000 302");
  expect(reply).toMatch(/заявк[аи]|уточн/i);
  const r = await request.get(`${backend}/read/listLeads/`, { headers: { Authorization: `Bearer ${token}` } });
  const leads = await r.json();
  const lead = leads.find((x: { source: string; contactPhone: string }) => x.source === "chat" && x.contactPhone === "+996555000302");
  expect(lead).toBeTruthy();
  const dialog = await (await request.get(`${backend}/read/getConversation/?id=${lead.sourceId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(dialog.messages.some((m: { author: string }) => m.author === "ai")).toBeTruthy();
  const unknown = await say("Сколько стоит ремонт космического корабля?");
  expect(unknown).toMatch(/уточн|администратор|подскажите.*услуг|нет.*информац/i);
  expect(unknown).not.toMatch(/\d[\d\s]*сом/);
});
test("Django: settings persist through UI and do not enable a phone line", async ({ page, request }) => {
  await page.goto("/app/settings/company");
  const form = page.locator("form").first();
  const name = form.locator("input").first();
  await name.fill(`Демо Мотор ${run}`);
  await form.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.reload(); await expect(name).toHaveValue(`Демо Мотор ${run}`);
  const r = await request.get(`${backend}/read/getCompany/`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await r.json()).aiMode).toBe("off");
});
test("Django: invalid password does not create a session", async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Пароль", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByTestId("login-error")).toHaveText("Неверный email или пароль.");
  expect((await ctx.cookies()).some((c) => c.name === "all_django_session")).toBeFalsy();
  await ctx.close();
});

test("Django: accountant UI and API cannot access CRM", async ({ browser, request }) => {
  const invitedEmail = `e2e.accountant.${run}@example.com`;
  const invitation = await request.post(`${backend}/commands/inviteMember/`, {
    headers: { Authorization: `Bearer ${token}` }, data: { args: [{ contact: invitedEmail, role: "accountant" }] },
  });
  expect(invitation.ok()).toBeTruthy();
  const inviteToken = (await invitation.json()).inviteUrl.split("/invite/")[1];
  const accepted = await request.post(`${backend}/auth/accept-invite/`, { data: { token: inviteToken, password, name: "E2E Accountant" } });
  expect(accepted.status()).toBe(201);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(invitedEmail);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/billing$/);
    await page.goto("/app/leads"); await expect(page).toHaveURL(/\/app\/billing$/);
    const accountantToken = (await ctx.cookies()).find((c) => c.name === "all_django_session")!.value;
    expect((await request.get(`${backend}/leads/`, { headers: { Authorization: `Bearer ${accountantToken}` } })).status()).toBe(403);
    expect((await ctx.request.get("/api/read/lead/00000000-0000-4000-8000-000000000000")).status()).toBe(403);
  } finally { await ctx.close(); }
});

test("Django: logout revokes the backend session and cabinet access", async ({ page, request, context }) => {
  await page.goto("/app");
  const session = await (await request.get(`${backend}/auth/session/`, { headers: { Authorization: `Bearer ${token}` } })).json();
  await page.getByRole("button").filter({ hasText: session.member.name }).click();
  await page.getByRole("menuitem", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((c) => c.name === "all_django_session")).toBeFalsy();
  expect((await request.get(`${backend}/auth/session/`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  await page.goto("/app"); await expect(page).toHaveURL(/\/login/);
});
