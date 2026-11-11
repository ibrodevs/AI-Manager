import { beforeEach, expect, it, vi } from "vitest";
const { session, getLead } = vi.hoisted(() => ({ session: vi.fn(), getLead: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: session }));
vi.mock("@/lib/data/repo", () => ({ getLead, getCall: vi.fn(), getContact: vi.fn(), getConversation: vi.fn(), getIntegrationLogs: vi.fn() }));
import { DjangoError } from "../lib/django";
import { GET } from "../app/api/read/[kind]/[id]/route";
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ member: { role: "owner" } }); });
it.each([401, 403, 404, 503])("preserves Django status %s in the browser detail route", async (status) => {
  getLead.mockRejectedValue(new DjangoError("test error", status));
  const response = await GET(new Request("http://localhost/api/read/lead/test"), { params: Promise.resolve({ kind: "lead", id: "test" }) });
  expect(response.status).toBe(status);
});
it("returns 401 without reading Django data when the session is absent", async () => {
  session.mockResolvedValue(null);
  const response = await GET(new Request("http://localhost/api/read/lead/test"), { params: Promise.resolve({ kind: "lead", id: "test" }) });
  expect(response.status).toBe(401); expect(getLead).not.toHaveBeenCalled();
});
