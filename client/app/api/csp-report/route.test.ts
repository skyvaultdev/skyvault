import { describe, it, expect, vi, afterEach } from "vitest";

const captureCspViolationMock = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({
  captureCspViolation: captureCspViolationMock,
}));

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
    captureCspViolationMock.mockClear();
  });

  it("devolve 204 sem corpo e loga o relatório recebido (formato report-uri clássico)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const violated = {
      "csp-report": {
        "violated-directive": "script-src",
        "blocked-uri": `https://evil-${Date.now()}.example`,
      },
    };

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

  it("item C2: manda a violação pro Sentry (via captureCspViolation)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const uniqueUri = `https://evil-c2-${Date.now()}-${Math.random()}.example`;
    const violated = { "csp-report": { "violated-directive": "script-src", "blocked-uri": uniqueUri } };

    await POST(reportRequest(violated));

    expect(captureCspViolationMock).toHaveBeenCalledWith(
      expect.objectContaining({ directive: "script-src", blockedUri: uniqueUri })
    );
  });

  it("item C2: a MESMA violação (directive+blocked-uri) duas vezes seguidas só manda pro Sentry uma vez (rate limit por fingerprint)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const uniqueUri = `https://evil-repetido-${Date.now()}-${Math.random()}.example`;
    const violated = { "csp-report": { "violated-directive": "style-src", "blocked-uri": uniqueUri } };

    await POST(reportRequest(violated));
    await POST(reportRequest(violated));

    expect(captureCspViolationMock).toHaveBeenCalledTimes(1);
  });
});
