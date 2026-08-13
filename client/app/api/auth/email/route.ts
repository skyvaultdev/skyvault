"use server";

import { createTransport } from "nodemailer";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDB } from "@/lib/database/db";
import { readFile } from "fs/promises";
import path from "path";
import { rateLimit } from "@/lib/security/rateLimit";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
 

  const { email } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "INVALID_EMAIL" },
      { status: 400 }
    );
  }

  if (!rateLimit(`otp-send:${email.toLowerCase()}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: "TOO_MANY_REQUESTS" },
      { status: 429 }
    );
  }



  const db = await getDB();

  
  const storeResult = await db.query(`
    SELECT
      store_name,
      primary_color,
      secondary_color,
      logo_url
    FROM store_settings
    ORDER BY id DESC
    LIMIT 1
  `);

  const store = storeResult.rows[0];

  if (!store) {
    return NextResponse.json(
      { error: "STORE_SETTINGS_NOT_FOUND" },
      { status: 404 }
    );
  }

  

  const storeName = store.store_name || "Minha Loja";

  const primaryColor = store.primary_color || "#7c3aed";

  const secondaryColor = store.secondary_color || "#ffffff";

  

  let logoAttachment = undefined;
  let logoHtml = "";

  if (store.logo_url) {
    try {
      

      const logoPath = path.join(
        process.cwd(),
        "public",
        store.logo_url.replace(/^\/+/, "")
      );

     
      const logoBuffer = await readFile(logoPath);


      logoAttachment = {
        filename: path.basename(logoPath),
        content: logoBuffer,
        cid: "store-logo",
      };

      logoHtml = `
        <img
          src="cid:store-logo"
          alt="${storeName}"
          width="160"
          style="
            display:block;
            width:160px;
            max-width:160px;
            height:auto;
            max-height:80px;
            object-fit:contain;
            margin:0 auto 18px auto;
            border:0;
            outline:none;
            text-decoration:none;
          "
        >
      `;
    } catch (error) {
      

      console.error("Erro ao carregar logo da loja:", error);
    }
  }


  const transporter = createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,

    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  });

  const code = generateCode();

  const codeHash = hashCode(code);

  const expiresAt = new Date(
    Date.now() + 10 * 60 * 1000
  );

  

  await db.query(
    `DELETE FROM email_verification WHERE email = $1`,
    [email]
  );

 

  await transporter.sendMail({
    from: process.env.EMAIL_USER,

    to: email,

    subject: `Confirme seu acesso • ${storeName}`,

    attachments: logoAttachment
      ? [logoAttachment]
      : [],

    html: `
<!DOCTYPE html>

<html lang="pt-BR">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta name="color-scheme" content="light dark">

  <title>Confirmação de login</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    width:100%;
    background-color:#09090b;
    font-family:Arial, Helvetica, sans-serif;
  "
>

  <!--
    Container externo
  -->

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
    style="
      width:100%;
      margin:0;
      padding:40px 16px;
      background-color:#09090b;
    "
  >

    <tr>

      <td align="center">

        <!--
          CARD PRINCIPAL
        -->

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          role="presentation"
          style="
            width:100%;
            max-width:500px;
            background-color:#111113;
            border:1px solid #27272a;
            border-radius:18px;
            overflow:hidden;
          "
        >

          <!--
            BARRA SUPERIOR
          -->

          <tr>

            <td
              style="
                height:5px;
                padding:0;
                font-size:0;
                line-height:0;
                background-color:${primaryColor};
              "
            >
              &nbsp;
            </td>

          </tr>

          <!--
            HEADER
          -->

          <tr>

            <td
              align="center"
              style="
                padding:38px 32px 30px 32px;
                text-align:center;
                background-color:#111113;
              "
            >

              ${logoHtml}

              <h1
                style="
                  margin:0;
                  padding:0;
                  color:#ffffff;
                  font-size:24px;
                  line-height:1.3;
                  font-weight:700;
                  letter-spacing:-0.5px;
                "
              >
                ${storeName}
              </h1>

              <p
                style="
                  margin:8px 0 0 0;
                  padding:0;
                  color:#a1a1aa;
                  font-size:13px;
                  line-height:1.5;
                "
              >
                Segurança da sua conta
              </p>

            </td>

          </tr>

          <!--
            DIVISOR
          -->

          <tr>

            <td
              style="
                height:1px;
                padding:0;
                background-color:#27272a;
                font-size:0;
                line-height:0;
              "
            >
              &nbsp;
            </td>

          </tr>

          <!--
            CONTEÚDO
          -->

          <tr>

            <td
              style="
                padding:34px 32px 36px 32px;
                background-color:#111113;
              "
            >

              <!-- Título -->

              <h2
                style="
                  margin:0 0 12px 0;
                  padding:0;
                  text-align:center;
                  color:${secondaryColor};
                  font-size:21px;
                  line-height:1.4;
                  font-weight:700;
                "
              >
                Confirme seu login
              </h2>

              <!-- Descrição -->

              <p
                style="
                  margin:0 auto 8px auto;
                  max-width:390px;
                  text-align:center;
                  color:#d4d4d8;
                  font-size:14px;
                  line-height:1.7;
                "
              >
                Detectamos uma tentativa de login na sua conta.
              </p>

              <p
                style="
                  margin:0 auto 28px auto;
                  max-width:390px;
                  text-align:center;
                  color:#a1a1aa;
                  font-size:13px;
                  line-height:1.7;
                "
              >
                Utilize o código abaixo para confirmar que é você.
              </p>

              <!--
                ÁREA DO CÓDIGO
              -->

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
                style="
                  margin:0 0 26px 0;
                "
              >

                <tr>

                  <td
                    align="center"
                    style="
                      padding:0;
                    "
                  >

                    <div
                      style="
                        display:inline-block;
                        min-width:190px;
                        padding:18px 26px;
                        box-sizing:border-box;
                        background-color:${primaryColor};
                        border-radius:12px;
                        border:1px solid ${primaryColor};
                        text-align:center;
                      "
                    >

                      <span
                        style="
                          color:${secondaryColor};
                          font-size:30px;
                          line-height:1;
                          font-weight:700;
                          letter-spacing:7px;
                          font-family:Arial, Helvetica, sans-serif;
                        "
                      >
                        ${code}
                      </span>

                    </div>

                  </td>

                </tr>

              </table>

              <!--
                AVISO DE EXPIRAÇÃO
              -->

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                role="presentation"
                style="
                  margin:0 0 24px 0;
                  background-color:#18181b;
                  border:1px solid #27272a;
                  border-radius:10px;
                "
              >

                <tr>

                  <td
                    style="
                      padding:14px 16px;
                      text-align:center;
                    "
                  >

                    <p
                      style="
                        margin:0;
                        color:#a1a1aa;
                        font-size:12px;
                        line-height:1.6;
                      "
                    >
                      Este código é válido por
                      <strong style="color:${secondaryColor};">
                        10 minutos
                      </strong>.
                    </p>

                  </td>

                </tr>

              </table>

              <!--
                SEGURANÇA
              -->

              <p
                style="
                  margin:0;
                  padding:0;
                  text-align:center;
                  color:#71717a;
                  font-size:12px;
                  line-height:1.7;
                "
              >
                Se você não tentou entrar na sua conta,
                ignore este e-mail.
              </p>

            </td>

          </tr>

          <!--
            FOOTER
          -->

          <tr>

            <td
              style="
                padding:22px 24px;
                text-align:center;
                background-color:#0d0d0f;
                border-top:1px solid #27272a;
              "
            >

              <p
                style="
                  margin:0;
                  padding:0;
                  color:#52525b;
                  font-size:11px;
                  line-height:1.6;
                "
              >
                © 2026 ${storeName}
              </p>

              <p
                style="
                  margin:5px 0 0 0;
                  padding:0;
                  color:#3f3f46;
                  font-size:10px;
                  line-height:1.5;
                "
              >
                Este e-mail foi enviado automaticamente.
              </p>

            </td>

          </tr>

        </table>

        <!--
          TEXTO EXTERNO DO CARD
        -->

        <p
          style="
            max-width:500px;
            margin:18px auto 0 auto;
            padding:0 16px;
            text-align:center;
            color:#52525b;
            font-size:10px;
            line-height:1.5;
          "
        >
          Mensagem automática de segurança.
        </p>

      </td>

    </tr>

  </table>

</body>

</html>
`,
  });

  await db.query(
    `
      INSERT INTO email_verification
        (email, code_hash, expires_at)
      VALUES
        ($1, $2, $3)
    `,
    [
      email,
      codeHash,
      expiresAt,
    ]
  );


  return NextResponse.json({
    ok: true,
  });
}

