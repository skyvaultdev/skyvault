import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { checkCsrf, isCsrfExcludedPath, MUTATING_METHODS } from "./csrfGuard";

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: "POST", headers });
}

describe("lib/security/csrfGuard — isCsrfExcludedPath", () => {
  it("exclui webhooks, csp-report e internal", () => {
    expect(isCsrfExcludedPath("/api/webhooks/mercadopago")).toBe(true);
    expect(isCsrfExcludedPath("/api/csp-report")).toBe(true);
    expect(isCsrfExcludedPath("/api/internal/sync-user")).toBe(true);
  });

  it("não exclui uma rota mutável normal", () => {
    expect(isCsrfExcludedPath("/api/checkout/create-order")).toBe(false);
  });
});

describe("lib/security/csrfGuard — MUTATING_METHODS", () => {
  it("cobre POST/PUT/PATCH/DELETE, não GET", () => {
    expect(MUTATING_METHODS.has("POST")).toBe(true);
    expect(MUTATING_METHODS.has("PUT")).toBe(true);
    expect(MUTATING_METHODS.has("PATCH")).toBe(true);
    expect(MUTATING_METHODS.has("DELETE")).toBe(true);
    expect(MUTATING_METHODS.has("GET")).toBe(false);
  });
});

describe("lib/security/csrfGuard — checkCsrf", () => {
  it("sem Origin e sem Sec-Fetch-Site: não suspeito (não é navegador)", () => {
    const r = checkCsrf(req("https://loja.example.com/api/checkout/create-order"));
    expect(r.suspicious).toBe(false);
  });

  it("Sec-Fetch-Site=same-origin: não suspeito", () => {
    const r = checkCsrf(
      req("https://loja.example.com/api/checkout/create-order", { "sec-fetch-site": "same-origin" })
    );
    expect(r.suspicious).toBe(false);
  });

  it("Sec-Fetch-Site=none (navegação direta): não suspeito", () => {
    const r = checkCsrf(req("https://loja.example.com/api/checkout/create-order", { "sec-fetch-site": "none" }));
    expect(r.suspicious).toBe(false);
  });

  it("Sec-Fetch-Site=cross-site: suspeito", () => {
    const r = checkCsrf(
      req("https://loja.example.com/api/checkout/create-order", { "sec-fetch-site": "cross-site" })
    );
    expect(r.suspicious).toBe(true);
  });

  it("Sec-Fetch-Site=same-site (subdomínio diferente, mesmo domínio raiz): suspeito", () => {
    const r = checkCsrf(
      req("https://loja1.example.com/api/checkout/create-order", { "sec-fetch-site": "same-site" })
    );
    expect(r.suspicious).toBe(true);
  });

  it("sem Sec-Fetch-Site, Origin bate com o host da própria requisição (multi-tenant): não suspeito", () => {
    const r = checkCsrf(
      req("https://loja-a.example.com/api/checkout/create-order", {
        origin: "https://loja-a.example.com",
        host: "loja-a.example.com",
      })
    );
    expect(r.suspicious).toBe(false);
  });

  it("sem Sec-Fetch-Site, Origin de OUTRA loja (outro host): suspeito — não existe lista fixa, é sempre relativo à própria requisição", () => {
    const r = checkCsrf(
      req("https://loja-a.example.com/api/checkout/create-order", {
        origin: "https://loja-b.example.com",
        host: "loja-a.example.com",
      })
    );
    expect(r.suspicious).toBe(true);
  });

  it("Origin mal formada: suspeito", () => {
    const r = checkCsrf(req("https://loja.example.com/api/x", { origin: "não-é-uma-url" }));
    expect(r.suspicious).toBe(true);
  });
});
