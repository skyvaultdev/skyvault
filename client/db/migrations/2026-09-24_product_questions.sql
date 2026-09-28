-- Perguntas e respostas na página do produto (estilo Mercado Livre):
-- cliente logado pergunta, staff responde pela dashboard; a pergunta fica
-- pública (só nome abreviado) junto com a resposta.
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
);
CREATE INDEX IF NOT EXISTS product_questions_product_idx ON product_questions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_questions_unanswered_idx ON product_questions (created_at) WHERE answer IS NULL AND hidden = false;
