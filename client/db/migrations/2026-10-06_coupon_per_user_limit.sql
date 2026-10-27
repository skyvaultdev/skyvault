-- Limite de uso por cliente, além do limite global que já existia
-- (coupons.usage_limit). 0 = ilimitado, mesma convenção de usage_limit.
-- Validado em app/api/checkout/create-order/route.ts contando os pedidos
-- pagos do usuário com esse coupon_id (orders.status fora de
-- pending_payment/cancelled/expired).
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INT NOT NULL DEFAULT 0;
