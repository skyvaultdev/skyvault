// Nome do cookie de atribuição de referral — lido tanto no cliente
// (captura do ?ref= na página do produto) quanto no servidor
// (create-order, pra amarrar o pedido ao revendedor). Atribuição por
// ÚLTIMO CLIQUE: se o cliente passar por dois links de revendedores
// diferentes, vale o mais recente — mesmo modelo usado pela maioria dos
// programas de afiliado.
export const REFERRAL_COOKIE_NAME = "reseller_ref";
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 30;
