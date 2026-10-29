-- app/layout.tsx rodava este ALTER TABLE a cada página carregada (todo
-- request, via generateMetadata/RootLayout) só pra garantir que a coluna
-- existisse. Isso sai do layout agora; a coluna passa a ser responsabilidade
-- desta migration.
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS background_solid_color TEXT;
