"use server";

import { createTransport } from "nodemailer";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDB } from "../../../lib/database/db";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const transporter = createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    }
  });

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const db = await getDB();
  await db.query(`DELETE FROM email_verification WHERE email = $1`, [email]);

  await transporter.verify();
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Autenticação de E-mail - SKY VAULT",
    html: `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Confirmação de Login</title>
      </head>

    <body style="margin:0; padding:0; background-color:#0b0b0f; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0b0f; padding:40px 0;">
        <tr>
          <td align="center">

            <table width="100%" cellpadding="0" cellspacing="0"
              style="max-width:480px; background-color:#111827; border-radius:12px; overflow:hidden;">

              <tr>
                <td style="background-color:#4c1d95; padding:24px; text-align:center;">
                  <h1 style="margin:0; color:#ffffff; font-size:22px; letter-spacing:1px;">
                    SKY VAULT
                  </h1>
                  <p style="margin:8px 0 0; color:#e9d5ff; font-size:12px;">
                    Segurança de acesso
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:32px; color:#e5e7eb;">
                  <h2 style="padding:24px; text-align:center; color:#a78bfa; font-size:20px;">
                    Confirme seu login
                  </h2>

                  <p style="margin:0 0 12px; font-size:14px; line-height:1.6; color:#d1d5db;">
                    Detectamos uma tentativa de login na sua conta.
                  </p>

                  <p style="margin:0 0 22px; font-size:14px; line-height:1.6; color:#d1d5db;">
                    Se foi você, cole o codigo no site. O código expirará em 10 minutos..
                  </p>

                  <div style="text-align:center; margin:28px 0;">
                    <div  style="background-color:#7c3aed; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:700; display:inline-block;">
                      ${code}
                    </div>
                  </div>

                  <p style= "padding:24px; text-align:center; margin:18px 0 0; font-size:13px; line-height:1.6; color:#9ca3af;">
                    Se não foi você, por favor ignore este e-mail.</p>
                    </span>
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background-color:#020617; padding:20px; text-align:center;">
                  <p style="margin:0; font-size:12px; color:#6b7280;">
                    © 2026 Sky Vault • Este e-mail foi enviado automaticamente.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>`,
  });

  await db.query(`INSERT INTO email_verification (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [email, codeHash, expiresAt]
  );

  return NextResponse.json({ ok: true });
}