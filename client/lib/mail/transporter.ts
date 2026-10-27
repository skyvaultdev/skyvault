import { createTransport, type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

// Transporter único reaproveitado por toda a aplicação — antes cada rota
// (pedidos, entrega digital, login por código) chamava createTransport()
// a cada envio, abrindo uma conexão SMTP nova toda vez. `pool: true`
// mantém um pool pequeno de conexões vivas entre chamadas.
export function getMailTransporter(): Transporter {
  if (!cachedTransporter) {
    cachedTransporter = createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER!,
        pass: process.env.EMAIL_PASS!,
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      // Sem isso, um SMTP lento/inacessível trava sendMail() por minutos
      // (chegou a levar 2min em produção) — e como vários call sites
      // esperavam essa promise antes de responder, a requisição HTTP
      // inteira travava junto. 10s é generoso pro Gmail normal, mas corta
      // rápido um SMTP fora do ar.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }
  return cachedTransporter;
}
