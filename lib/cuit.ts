/**
 * Normaliza un CUIT a formato XX-XXXXXXXX-X.
 * Acepta: "20345678901", "20-34567890-1", "20 34567890 1"
 */
export function normalizeCUIT(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

/**
 * Valida un CUIT argentino (módulo 11).
 */
export function isValidCUIT(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * weights[i];
  }

  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;

  return check === parseInt(digits[10]);
}

/**
 * Extrae el tipo de persona del prefijo CUIT.
 * 20/23/24 = Persona Física, 30/33/34 = Persona Jurídica
 */
export function tipoCUIT(raw: string): "fisica" | "juridica" | "otro" {
  const digits = raw.replace(/\D/g, "");
  const prefix = digits.slice(0, 2);
  if (["20", "23", "24", "27"].includes(prefix)) return "fisica";
  if (["30", "33", "34"].includes(prefix)) return "juridica";
  return "otro";
}
