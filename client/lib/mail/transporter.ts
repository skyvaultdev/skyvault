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
    });
  }
  return cachedTransporter;
}
