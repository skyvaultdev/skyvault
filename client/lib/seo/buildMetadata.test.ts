import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "./buildMetadata";

describe("serializeJsonLd", () => {
  it("escapa <, > e & pra não fechar a tag <script> nem abrir uma nova", () => {
    const malicious = { name: '</script><script>alert(document.cookie)</script>' };
    const html = serializeJsonLd(malicious);

    expect(html.toLowerCase()).not.toContain("</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("o conteúdo continua recuperável como o JSON original (só HTML-safe, não corrompido)", () => {
    const original = { name: '</script><script>alert(1)</script>', price: "10.00" };
    const html = serializeJsonLd(original);
    const parsedBack = JSON.parse(html);
    expect(parsedBack).toEqual(original);
  });

  it("escapa & (ex: nome de produto 'Black & White') sem quebrar o parse", () => {
    const html = serializeJsonLd({ name: "Black & White" });
    expect(html).toContain("\\u0026");
    expect(JSON.parse(html).name).toBe("Black & White");
  });

  it("não deixa escapes residuais em conteúdo sem caracteres perigosos", () => {
    const html = serializeJsonLd({ name: "Produto Normal", price: 10 });
    expect(html).toBe('{"name":"Produto Normal","price":10}');
  });
});
