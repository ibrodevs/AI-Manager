import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCookie, revalidate } = vi.hoisted(() => ({ getCookie: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { djangoAction, djangoFetch } from "../lib/django";

beforeEach(() => { vi.clearAllMocks(); getCookie.mockImplementation((key) => key === "all_django_session" ? { value: "test-session" } : key === "company" ? { value: "test-company" } : undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Django transport errors never produce successful actions", () => {
  it("forwards the session and tenant through server headers without caching", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: "saved" })); vi.stubGlobal("fetch", fetch);
    expect(await djangoFetch("/read/getCompany/")).toEqual({ id: "saved" });
    const init = fetch.mock.calls[0]![1];
    expect(init.headers.get("Authorization")).toBe("Bearer test-session");
    expect(init.headers.get("X-Company-ID")).toBe("test-company");
    expect(init.cache).toBe("no-store");
  });
  it.each([401, 403, 404, 409, 500, 503])("rejects HTTP %s without success or revalidation", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "test error" }, { status })));
    const result = await djangoAction("createLead", [{}]);
    expect(result.ok).toBe(false); expect(revalidate).not.toHaveBeenCalled();
    if (status >= 500) expect(result).toEqual({ ok: false, error: "Сервер временно недоступен. Повторите попытку." });
  });
  it("reports unavailable Django to reads and actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection refused")));
    await expect(djangoFetch("/read/getCompany/")).rejects.toMatchObject({ status: 503 });
    expect((await djangoAction("createLead", [{}])).ok).toBe(false);
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream HTML")));
    expect((await djangoAction("createLead", [{}])).ok).toBe(false);
  });
});

it("does not allow mock authentication in production even with the legacy flag", async () => {
  vi.resetModules(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("DATA_SOURCE", "mock"); vi.stubEnv("ALLOW_MOCK_AUTH", "1");
  const { mockAuthAllowed } = await import("../lib/env");
  expect(mockAuthAllowed).toBe(false);
});
