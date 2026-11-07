import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import type { DemoAudio } from "../lib/demo-recordings";
const scenarios = JSON.parse(readFileSync(new URL("../lib/demo-scenarios.json", import.meta.url), "utf8")) as { id: string }[];
const assets = JSON.parse(readFileSync(new URL("../lib/demo-audio.generated.json", import.meta.url), "utf8")) as Record<string, DemoAudio>;
const DEMO_RECORDINGS = scenarios.map((s) => ({ ...s, audio: assets[s.id] }));

// A test tone exercises Chromium's real decoder/clock. It is never presented as speech.
function tone() {
  const n = 24000 * 3, wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(2500 * Math.sin(i * 2 * Math.PI * 440 / 24000)), 44 + i * 2);
  return wav;
}

test("public demos expose their availability and fit mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Послушайте, как AI общается с вашими клиентами" })).toBeVisible();
  const cards = page.getByTestId("demo-recording");
  await expect(cards).toHaveCount(2);
  for (const [i, recording] of DEMO_RECORDINGS.entries()) {
    if (!recording.audio) {
      await expect(cards.nth(i).getByRole("status")).toHaveText("Аудиозапись недоступна");
      await expect(cards.nth(i).getByRole("button", { name: "Воспроизвести", exact: true })).toBeDisabled();
      await expect(cards.nth(i).getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
    }
  }
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("native decoder drives time, pause, seek, speed, exclusivity and completion", async ({ page }) => {
  await page.route("**/e2e-audio.wav", (route) => {
    const wav = tone();
    const range = route.request().headers()["range"]?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: "audio/wav", headers: {
      "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${wav.length}` } : {}),
    }, body: wav.subarray(start, end + 1) });
  });
  await page.goto("/");
  const source = readFileSync(new URL("../lib/call-playback.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  await page.addScriptTag({ content: `window.playbackTest = (() => { const exports = {}; ${js}; return exports; })();` });
  await page.evaluate(() => {
    const w = window as unknown as { playbackTest: { createCallPlayback: (audio: HTMLAudioElement) => unknown }; audioTest: unknown };
    const a = new Audio("/e2e-audio.wav"), b = new Audio("/e2e-audio.wav");
    w.audioTest = { a, b, first: w.playbackTest.createCallPlayback(a), second: w.playbackTest.createCallPlayback(b) };
  });
  // Deliberate browser user gesture; no override of HTMLMediaElement.play/currentTime.
  await page.getByRole("heading").first().click();
  const run = (expression: string) => page.evaluate(`window.audioTest.${expression}`);
  await expect.poll(() => run("first.snapshot().durationMs")).toBe(3000);
  await run("first.setPlaying(true)");
  await expect.poll(() => run("first.snapshot().pos")).toBeGreaterThan(100);
  await run("first.setPlaying(false)");
  const paused = await run("first.snapshot().pos");
  await page.waitForTimeout(350);
  expect(await run("first.snapshot().pos")).toBe(paused);
  await run("first.seek(1500)");
  await expect.poll(() => run("a.currentTime")).toBeCloseTo(1.5, 1);
  await run("first.setRate(1.5)"); expect(await run("a.playbackRate")).toBe(1.5);
  await run("first.setPlaying(true)"); await run("second.setPlaying(true)");
  await expect.poll(() => run("first.snapshot().playing")).toBe(false);
  await expect.poll(() => run("second.snapshot().playing")).toBe(true);
  await run("second.seek(2800)");
  await expect.poll(() => run("second.snapshot().playing")).toBe(false);
  expect(await run("second.snapshot().pos")).toBe(3000);
  await run("second.setPlaying(true)");
  await expect.poll(() => run("b.currentTime")).toBeLessThan(1);
  await run("first.dispose()"); await run("second.dispose()");
});

for (const [index, recording] of DEMO_RECORDINGS.entries()) {
  test(`public speech: ${recording.id}`, async ({ page, request }) => {
    test.skip(!recording.audio, "Full demo recording is not configured.");
    const audio = recording.audio!;
    const response = await request.get(audio.audioUrl);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(bytes.byteLength).toBeGreaterThan(10000);
    expect(response.headers()["content-type"]).toContain("audio/mpeg");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(audio.sha256);
    await page.goto("/");
    const card = page.getByTestId("demo-recording").nth(index);
    const slider = card.getByRole("slider");
    await card.getByRole("button", { name: "Воспроизвести", exact: true }).click();
    await expect.poll(async () => Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(100);
    await card.getByRole("button", { name: "Пауза", exact: true }).click();
    await card.locator('[data-seq="1"] button').click();
    await expect.poll(async () => Math.abs(Number(await slider.getAttribute("aria-valuenow")) - audio.turns[1]!.startMs)).toBeLessThan(20);
    await expect(card.locator('[data-seq="1"] button')).toHaveAttribute("aria-current", "true");
    await slider.focus(); await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    const duration = Number(await slider.getAttribute("aria-valuemax"));
    expect(Math.abs(duration - audio.durationMs)).toBeLessThan(200);
    const bounds = await slider.boundingBox();
    await slider.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect.poll(async () => Math.abs(Number(await slider.getAttribute("aria-valuenow")) - duration / 2)).toBeLessThan(100);
    await card.getByRole("button", { name: "Скорость", exact: true }).click();
    await expect(card.getByRole("button", { name: "Скорость", exact: true })).toHaveText("1.25×");
    await slider.focus(); await page.keyboard.press("End"); await page.keyboard.press("ArrowLeft");
    await card.getByRole("button", { name: "Воспроизвести", exact: true }).click();
    await expect(card.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Воспроизвести", exact: true })).toBeVisible({ timeout: 10000 });
    await card.getByRole("button", { name: "Послушать ещё раз", exact: true }).click();
    await expect(card.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    expect(Number(await slider.getAttribute("aria-valuenow"))).toBeLessThan(2000);
    const other = page.getByTestId("demo-recording").nth(1 - index);
    await other.getByRole("button", { name: "Воспроизвести", exact: true }).click();
    await expect(other.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Воспроизвести", exact: true })).toBeVisible();
  });
}

test("failed MP3 load cannot advance the public player", async ({ page }) => {
  const recording = DEMO_RECORDINGS.find((x) => x.audio);
  test.skip(!recording, "No recording configured");
  await page.route(`**${recording!.audio!.audioUrl}`, (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/");
  const card = page.getByTestId("demo-recording").nth(DEMO_RECORDINGS.indexOf(recording!));
  await expect(card.getByRole("status")).toContainText("Не удалось загрузить аудиозапись");
  await expect(card.getByRole("button", { name: "Воспроизвести", exact: true })).toBeDisabled();
  await card.getByRole("slider").focus(); await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await expect(card.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});
