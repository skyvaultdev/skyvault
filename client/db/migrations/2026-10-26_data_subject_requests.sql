-- Fila de solicitações de exclusão de dados (direito do titular, LGPD) —
-- exportação é self-service (GET /api/profile/data-export, sem precisar
-- de fila: gera e devolve o JSON na hora), mas excluir/anonimizar uma
-- conta tem consequências reais (pedidos, comissões de revendedor) e
-- passa por revisão do staff antes.
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT
);
CREATE INDEX IF NOT EXISTS data_subject_requests_status_idx ON data_subject_requests (status, requested_at);
