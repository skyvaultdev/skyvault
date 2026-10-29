import { describe, it, expect, afterAll } from "vitest";
import { getOrCreatePool } from "@/lib/database/pool";

const { GET } = await import("./route");

afterAll(async () => {
  await getOrCreatePool().end();
});

describe("GET /api/health — item B4: inclui o status do Redis", () => {
  it("devolve ok:true e redis:not_configured (sem REDIS_URL neste ambiente de teste)", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.redis).toBe("not_configured");
  });
});
