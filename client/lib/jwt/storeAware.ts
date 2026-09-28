import { verifyJWT, type AppJWTPayload } from "@/lib/jwt/init";
import { getCurrentStoreId } from "@/lib/tenant/tenantContext";
import { config } from "@/config/configuration";

// Igual ao verifyJWT, mas também exige que o token tenha sido emitido para a
// loja do Host atual (claim `sid`). Sem isso, o cookie de uma loja valeria
// em outra. Tokens antigos (sem sid) valem só para a loja padrão.
export async function verifyJWTForStore(token: string): Promise<AppJWTPayload | null> {
  const payload = await verifyJWT(token);
  if (!payload) return null;
  const tokenStore = typeof payload.sid === "number" ? payload.sid : config.tenant.defaultStoreId;
  let current: number;
  try {
    current = await getCurrentStoreId();
  } catch {
    return null;
  }
  return tokenStore === current ? payload : null;
}
