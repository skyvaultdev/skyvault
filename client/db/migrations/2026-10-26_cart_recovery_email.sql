-- Marca quando o último e-mail de carrinho abandonado foi enviado pra esse
-- item — evita reenviar a cada execução do cron enquanto o carrinho não
-- muda (ver lib/orders/sendAbandonedCartEmails.ts).
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS recovery_email_sent_at TIMESTAMPTZ;
