-- Guarda o último "timestep" TOTP (passo de 30s) aceito por conta, pra
-- recusar um código já usado (replay) mesmo que ainda esteja dentro da
-- janela de tolerância de ±1 passo. Sem isso, quem intercepta um código
-- válido (ex: ombro, captura de rede) pode reenviá-lo enquanto o passo
-- ainda não expirou.
ALTER TABLE admin ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

-- Rollback:
-- ALTER TABLE admin DROP COLUMN IF EXISTS totp_last_step;
