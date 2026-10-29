import crypto from "crypto";
import { config } from "@/config/configuration";

// Comparação de tempo constante — uma comparação normal (`!==`) sai mais
// rápido quanto mais cedo os caracteres divergem, o que em teoria permite
// deduzir o segredo certo byte a byte medindo a latência da resposta.
// timingSafeEqual exige buffers do MESMO tamanho (senão lança exceção),
// então o tamanho é conferido antes — vazar o COMPRIMENTO do segredo não
// é um risco real aqui, só o conteúdo.
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Segunda camada exigida em TODAS as rotas /api/internal/** (sync-user,
// cron/*), além do segredo próprio de cada uma (internalApi.secret /
// cron.secret) — um atacante que descubra só UM dos dois segredos (ex:
// vazado num log, erro, backup exposto) ainda não consegue chamar a rota
// sem também ter esse token. Isso NÃO substitui bloquear essas rotas no
// proxy/reverse-proxy pra tráfego externo quando existir um na frente —
// é defesa em camadas, não a mitigação de rede de verdade.
export function verifyInternalOrchestratorHeader(req: Request): boolean {
  const token = config.internalApi.orchestratorToken;
  if (!token) return false; // sem configurar, recusa tudo (fail closed)
  const provided = req.headers.get("x-internal-orchestrator");
  return !!provided && timingSafeEqualString(provided, token);
}
