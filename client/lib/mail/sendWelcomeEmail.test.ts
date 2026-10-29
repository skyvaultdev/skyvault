import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail/transporter", () => ({
  getMailTransporter: () => ({ sendMail: (args: unknown) => sendMailMock(args) }),
}));

const loadStoreBrandingMock = vi.fn();
vi.mock("@/lib/mail/emailTemplate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./emailTemplate")>();
  return { ...actual, loadStoreBranding: () => loadStoreBrandingMock() };
});

const { sendWelcomeEmail } = await import("./sendWelcomeEmail");

beforeEach(() => {
  sendMailMock.mockReset().mockResolvedValue(undefined);
  loadStoreBrandingMock.mockReset();
});

describe("sendWelcomeEmail", () => {
  it("manda o email com o nome do cliente e o nome da loja no corpo", async () => {
    loadStoreBrandingMock.mockResolvedValue({
      storeName: "Minha Lojinha",
      primaryColor: "#7c3aed",
      secondaryColor: "#ffffff",
      logoHtml: "",
    });

    const result = await sendWelcomeEmail({ to: "cliente@teste.com", name: "Fulano" });
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();

    const call = sendMailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(call.to).toBe("cliente@teste.com");
    expect(call.subject).toContain("Minha Lojinha");
    expect(call.html).toContain("Fulano");
    expect(call.html).toContain("Minha Lojinha");
  });

  it("usa saudação genérica quando não tem nome", async () => {
    loadStoreBrandingMock.mockResolvedValue({
      storeName: "Minha Lojinha",
      primaryColor: "#7c3aed",
      secondaryColor: "#ffffff",
      logoHtml: "",
    });

    const result = await sendWelcomeEmail({ to: "cliente2@teste.com" });
    expect(result).toBe(true);
    const call = sendMailMock.mock.calls[0][0] as { html: string };
    expect(call.html).toContain("Olá!");
  });

  it("não lança e devolve false quando não há store_settings", async () => {
    loadStoreBrandingMock.mockResolvedValue(null);
    const result = await sendWelcomeEmail({ to: "cliente3@teste.com" });
    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("não lança e devolve false quando o SMTP falha", async () => {
    loadStoreBrandingMock.mockResolvedValue({
      storeName: "Minha Lojinha",
      primaryColor: "#7c3aed",
      secondaryColor: "#ffffff",
      logoHtml: "",
    });
    sendMailMock.mockRejectedValueOnce(new Error("SMTP indisponível"));

    const result = await sendWelcomeEmail({ to: "cliente4@teste.com" });
    expect(result).toBe(false);
  });
});
