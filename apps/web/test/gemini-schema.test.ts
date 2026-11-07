import { describe, expect, it } from "vitest";
import { allowedTools } from "@all/dialog";

describe("Gemini OpenAI-compatible function schemas", () => {
  it("all phone booking tools have explicit string enum types", () => {
    const tools = allowedTools("consult", "1a");
    expect(tools.map(x => x.name)).toContain("create_lead");
    for (const t of tools) {
      const validate = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const value = node as Record<string, unknown>;
        if (Array.isArray(value.enum)) {
          expect(value.type, `missing type in ${t.name}`).toBe("string");
          expect(value.enum.every(x => typeof x === "string")).toBe(true);
        }
        for (const child of Object.values(value)) {
          if (child && typeof child === "object") {
            if (Array.isArray(child)) child.forEach(validate); else validate(child);
          }
        }
      };
      validate(t.parameters);
    }
  });
  it("get_hours date schema avoids format values unsupported by some Gemini modes", () => {
    const tool = allowedTools("consult", "1a").find(t => t.name === "get_hours");
    const params = tool?.parameters as { properties: { date: Record<string, unknown> } };
    expect(params.properties.date).toMatchObject({ type: "string" });
    expect(params.properties.date).not.toHaveProperty("format", "date");
  });
});
