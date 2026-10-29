import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

const { POST } = await import("./route");

beforeAll(async () => {
  await initApp();
});

afterAll(async () => {
  await (getDB() as unknown as { end: () => Promise<void> }).end();
});

function bootstrapRequest(email: string, password = "senha-de-teste-123") {
  return new Request("https://example.com/api/dev/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("POST /api/dev/auth/bootstrap — já existe um dev (caminho comum, não precisa limpar a tabela)", () => {
  it("recusa com DEV_ALREADY_BOOTSTRAPPED quando já existe qualquer dev_user", async () => {
    const existing = await getDB().query(`SELECT 1 FROM dev_users LIMIT 1`);
    if (existing.rows.length === 0) {
      // Nada bootstrapado neste banco — esse teste específico não se aplica
      // (o outro describe abaixo cobre o caminho "tabela vazia" de propósito).
      return;
    }
    const res = await POST(bootstrapRequest(`teste-ja-existe-${Date.now()}@teste.com`));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("DEV_ALREADY_BOOTSTRAPPED");
  });
});

describe("POST /api/dev/auth/bootstrap — corrida com a tabela vazia (advisory lock)", () => {
  // dev_users é uma tabela "singleton" por design — só existe UM jeito de
  // testar a corrida de verdade: esvaziar a tabela temporariamente. Salva
  // o(s) registro(s) reais (se houver) e restaura tudo no finally, mesmo
  // se uma asserção falhar no meio.
  let savedRows: Array<{ id: string; email: string; password_hash: string; created_at: string }> = [];

  beforeAll(async () => {
    const db = getDB();
    const existing = await db.query(`SELECT id, email, password_hash, created_at FROM dev_users`);
    savedRows = existing.rows;
    if (savedRows.length > 0) {
      await db.query(`DELETE FROM dev_users`);
    }
  });

  afterAll(async () => {
    const db = getDB();
    // Limpa qualquer coisa que os testes tenham criado antes de restaurar
    // o estado original.
    await db.query(`DELETE FROM dev_users`);
    for (const row of savedRows) {
      await db.query(
        `INSERT INTO dev_users (id, email, password_hash, created_at) OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4)`,
        [row.id, row.email, row.password_hash, row.created_at]
      );
    }
  });

  it("N requisições de bootstrap CONCORRENTES (tabela vazia) — só UMA cria conta, as outras recusam", async () => {
    const db = getDB();
    const before = await db.query(`SELECT count(*) FROM dev_users`);
    expect(Number(before.rows[0].count)).toBe(0);

    const CONCURRENT = 6;
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT }, (_, i) => POST(bootstrapRequest(`teste-bootstrap-race-${i}-${Date.now()}@teste.com`)))
    );
    const statuses = responses.map((r) => r.status).sort();

    // Exatamente 1 sucesso (200) e o resto recusado (403) — nunca 2+ contas
    // criadas, mesmo com N tentativas batendo ao mesmo tempo.
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 403)).toHaveLength(CONCURRENT - 1);

    const after = await db.query(`SELECT count(*) FROM dev_users`);
    expect(Number(after.rows[0].count)).toBe(1);
  });
});
