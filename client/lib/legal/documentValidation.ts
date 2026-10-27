// CPF/CNPJ — sem dependência de banco ou de "next/server", pra poder ser
// importado tanto pela validação no backend (app/api/store-settings/legal/route.ts)
// quanto pelo formulário no dashboard (LegalSettingsPanel.tsx, client component).

export type DocumentKind = "cpf" | "cnpj";

export function normalizeDocument(input: string): string {
  return input.replace(/\D/g, "");
}

export function documentKind(digits: string): DocumentKind | null {
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  return null;
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1*$/.test(digits);
}

function calcCheckDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || allSameDigit(digits)) return false;
  const d1 = calcCheckDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[9])) return false;
  const d2 = calcCheckDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[10]);
}

function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || allSameDigit(digits)) return false;
  const d1 = calcCheckDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[12])) return false;
  const d2 = calcCheckDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[13]);
}

// `digits` precisa já estar normalizado (só números) — normalizeDocument().
export function validateDocument(digits: string): boolean {
  const kind = documentKind(digits);
  if (kind === "cpf") return isValidCpf(digits);
  if (kind === "cnpj") return isValidCnpj(digits);
  return false;
}

export function formatDocument(digits: string): string {
  const kind = documentKind(digits);
  if (kind === "cpf") {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (kind === "cnpj") {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digits;
}
