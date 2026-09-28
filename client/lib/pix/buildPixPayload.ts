// Gera o payload do "PIX Copia e Cola" (BR Code, padrão EMV QRCPS-MPM do
// Banco Central) puramente em código — sem chamar nenhuma API externa,
// é só formatação de string + checksum. Usado pra o owner pagar a
// comissão de um revendedor direto por QR code, sem integrar um gateway
// de pagamento novo só pra isso (a loja já não tem saldo "interno", o
// dinheiro do Mercado Pago vai pra conta bancária do dono e ele paga o
// revendedor por fora — isso só facilita gerando o QR certo).

function tlv(id: string, value: string): string {
  const length = String(value.length).padStart(2, "0");
  return `${id}${length}${value}`;
}

// Remove acentos/caracteres fora do alfabeto aceito pelo BR Code — merchant
// name/city precisam ser ASCII puro.
function sanitizeAscii(value: string, maxLength: number): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
  return (normalized || "NA").slice(0, maxLength);
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — exigido pelo
// padrão, calculado sobre o payload inteiro já com o campo 63 "aberto"
// (id+tamanho, sem o valor).
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(params: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount?: number | null;
  txid?: string | null;
  description?: string | null;
}): string {
  const merchantAccountInfo =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", params.pixKey) +
    (params.description ? tlv("02", sanitizeAscii(params.description, 99)) : "");

  const additionalData = tlv("05", (params.txid ? params.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) : "") || "***");

  let payload =
    tlv("00", "01") +
    tlv("26", merchantAccountInfo) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (params.amount != null && params.amount > 0 ? tlv("54", params.amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", sanitizeAscii(params.merchantName, 25)) +
    tlv("60", sanitizeAscii(params.merchantCity, 15)) +
    tlv("62", additionalData);

  payload += "6304";
  return payload + crc16(payload);
}
