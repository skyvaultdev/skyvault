import fs from "fs";
import path from "path";

// Vitest não carrega .env.local sozinho como o Next.js faz — replica isso
// aqui pra config/configuration.ts (lido por lib/database/init.ts) enxergar
// as mesmas credenciais de banco que o app usa em dev.
const envPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
