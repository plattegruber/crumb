import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Health endpoint", () => {
  it("GET /health returns 200 with status ok", async () => {
    const response = await SELF.fetch("http://localhost/health");
    expect(response.status).toBe(200);

    const body = await response.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });
});
