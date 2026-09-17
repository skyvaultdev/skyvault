-- Número de pedido "público" — curto, aleatório, não sequencial. O id
-- interno (BIGINT identity) continua existindo e é usado em toda FK/URL/
-- rota — isso aqui é só o que aparece pro humano (email, tela, ticket),
-- pra não expor quantos pedidos a loja já teve só olhando o número.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON orders (order_number) WHERE order_number IS NOT NULL;
