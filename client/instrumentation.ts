// Next chama register() uma vez, no boot do processo — antes de qualquer
// requisição ser atendida. Sem isso, o pool do Postgres só existia depois
// que ALGUÉM abria uma página (app/layout.tsx era o único lugar que
// chamava initApp()); reiniciar o servidor e bater direto numa API (o
// webhook do Mercado Pago, por exemplo) dava 500 até a primeira página
// carregar. getDB()/getOrCreatePool() também inicializam sob demanda como
// rede de segurança, mas isso aqui é o que evita precisar dela.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initApp } = await import("@/lib/database/init");
    await initApp();
  }
}
