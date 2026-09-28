-- Dados de PIX do revendedor, pra o owner conseguir pagar o saque direto
-- por QR code na dashboard. Fica em `resellers` (1:1, não precisa de
-- tabela separada) — só é preenchido pelo próprio revendedor, na aba de
-- perfil (a seção só aparece lá se o usuário for revendedor aprovado).
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_key_type TEXT; -- cpf | cnpj | email | phone | random
ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_holder_name TEXT;
