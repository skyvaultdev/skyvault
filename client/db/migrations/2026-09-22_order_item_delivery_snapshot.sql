-- Order items não guardavam o que foi REALMENTE entregue pro cliente em
-- cada pedido de tipo "arquivo" ou "infinito" (mensagem/link) — a tela do
-- pedido (dashboard e cliente) re-derivava esse conteúdo consultando o
-- produto AO VIVO no momento da visualização. Se o staff depois trocasse o
-- arquivo ou editasse a mensagem do produto, pedidos antigos passavam a
-- mostrar o conteúdo NOVO, não o que o cliente pagou e recebeu de fato.
-- Tipo "key" já era seguro (stock_keys.order_id amarra a chave exata ao
-- pedido, permanentemente) — só arquivo/infinito precisavam de snapshot.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_content TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivered_file_size BIGINT;
