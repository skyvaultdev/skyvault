import { describe, it, expect, vi, afterEach } from "vitest";

const { POST } = await import("./route");

function reportRequest(body: unknown) {
  return new Request("https://example.com/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/csp-report" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/csp-report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve 204 sem corpo e loga o relatório recebido (formato report-uri clássico)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const violated = { "csp-report": { "violated-directive": "script-src", "blocked-uri": "https://evil.example" } };

    const res = await POST(reportRequest(violated));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(
      "[csp-report]",
      expect.stringContaining("script-src")
    );
  });

  it("não derruba a rota com um corpo que não é JSON válido", async () => {
    const req = new Request("https://example.com/api/csp-report", {
      method: "POST",
      headers: { "Content-Type": "application/csp-report" },
      body: "isso não é json",
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
  });
});
