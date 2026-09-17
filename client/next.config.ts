/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [], // opcional
  logging: {
    fetches: { fullUrl: true },
  },
  // `serverActions.allowedOrigins` só libera Server Actions (POSTs de
  // formulário com "use server"). Sem `allowedDevOrigins` (config
  // separada, fora de "experimental" a partir do Next 15.3+), o dev
  // server bloqueia/avisa em QUALQUER requisição vinda de um host
  // diferente de localhost — inclusive os payloads RSC que carregam a
  // página e os dados do banco. É isso que faz parecer que "o ngrok não
  // puxa a DB": a página nem termina de carregar direito pelo túnel.
  allowedDevOrigins: ['iodine-womanhood-canola.ngrok-free.dev'],
  experimental: {
    serverActions: {
      allowedOrigins: ['iodine-womanhood-canola.ngrok-free.dev'],
    },
  },
};

export default nextConfig;

