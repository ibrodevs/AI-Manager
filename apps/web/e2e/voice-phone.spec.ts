import { expect, test } from "@playwright/test";

/**
 * Browser regression: Web Speech can finalize each three-digit phone group
 * separately. The AI must not interrupt the client after the first group.
 */
test("dictated phone remains buffered until all groups are spoken", async ({ page }) => {
  const email = process.env.E2E_OWNER_EMAIL ?? "demo.owner@example.com";
  const password = process.env.E2E_OWNER_PASSWORD ?? "";
  test.skip(!password, "The E2E demo account is not configured");

  await page.addInitScript(() => {
    type FakeUtterance = { onend?: (() => void) | null };
    class MockRecognition {
      lang = "ru-RU"; continuous = true; interimResults = true;
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      start() { /* browser speech starts listening */ }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
      emitFinal(transcript: string) {
        this.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript }], { isFinal: true })],
        });
      }
    }
    const recognition = new MockRecognition();
    const w = window as unknown as {
      SpeechRecognition: typeof MockRecognition;
      webkitSpeechRecognition: typeof MockRecognition;
      __phoneTestRec: MockRecognition;
      SpeechSynthesisUtterance: new (text: string) => FakeUtterance;
    };
    w.SpeechRecognition = MockRecognition;
    w.webkitSpeechRecognition = MockRecognition;
    w.__phoneTestRec = recognition;
    // Force all constructor calls to reuse the single mock instance.
    w.SpeechRecognition = class extends MockRecognition {
      constructor() { super(); return recognition; }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        lang = "ru-RU"; rate = 1; voice = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak(u: FakeUtterance) { setTimeout(() => u.onend?.(), 20); },
      },
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20000 });
  await page.goto("/app/assistant");
  await page.getByTestId("start-voice").click();
  const speaker = page.locator('[data-speaker="caller"]');
  const emit = (part: string) => page.evaluate((text) => {
    (window as unknown as { __phoneTestRec: { emitFinal: (value: string) => void } }).__phoneTestRec.emitFinal(text);
  }, part);
  await emit("Мой номер +996");
  await page.waitForTimeout(3000);
  await expect(speaker).toHaveCount(0);
  await emit("700 123");
  await page.waitForTimeout(3000);
  await expect(speaker).toHaveCount(0);
  await emit("456");
  await expect(speaker).toHaveCount(1, { timeout: 10000 });
  await expect(speaker.first()).toContainText("+996700123456");
});
