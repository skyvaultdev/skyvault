import { getDB } from "@/lib/database/db";

export async function ensureQuestionsTable() {
  const db = getDB();
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_questions (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      asker_name TEXT,
      question TEXT NOT NULL,
      answer TEXT,
      answered_by TEXT,
      answered_at TIMESTAMPTZ,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS product_questions_product_idx ON product_questions (product_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS product_questions_unanswered_idx ON product_questions (created_at) WHERE answer IS NULL AND hidden = false`);

  // staff_unread: a equipe ainda não viu a pergunta ou a última resposta do
  // cliente. Na primeira criação da coluna, perguntas sem resposta contam
  // como não lidas.
  const col = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'product_questions' AND column_name = 'staff_unread'`
  );
  if (col.rows.length === 0) {
    await db.query(`ALTER TABLE product_questions ADD COLUMN staff_unread BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.query(`UPDATE product_questions SET staff_unread = TRUE WHERE answer IS NULL AND hidden = false`);
  }
  await db.query(`CREATE INDEX IF NOT EXISTS product_questions_staff_unread_idx ON product_questions (created_at) WHERE staff_unread = TRUE`);

  // Conversa que segue depois da primeira resposta (cliente <-> loja).
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_question_messages (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
      author_type TEXT NOT NULL CHECK (author_type IN ('customer', 'staff')),
      author_name TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS product_question_messages_q_idx ON product_question_messages (question_id, created_at)`);
}

export type QuestionMessage = { id: number; question_id: number; author_type: "customer" | "staff"; author_name: string | null; body: string; created_at: string };

export async function loadMessages(questionIds: number[]): Promise<Map<number, QuestionMessage[]>> {
  const map = new Map<number, QuestionMessage[]>();
  if (questionIds.length === 0) return map;
  const res = await getDB().query(
    `SELECT id, question_id, author_type, author_name, body, created_at
     FROM product_question_messages WHERE question_id = ANY($1) ORDER BY created_at ASC, id ASC`,
    [questionIds]
  );
  for (const r of res.rows) {
    const list = map.get(Number(r.question_id)) ?? [];
    list.push({ ...r, id: Number(r.id), question_id: Number(r.question_id) });
    map.set(Number(r.question_id), list);
  }
  return map;
}
