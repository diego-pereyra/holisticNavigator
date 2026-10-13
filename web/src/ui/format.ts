// Formato de UI en español rioplatense (regla 2 de §6 ter: sin jerga interna).

export const MONTH_INITIAL = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export const MONTH_ABBR = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];
export const MONTH_NAME = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function currentMonthUtc(): number {
  return new Date().getUTCMonth() + 1;
}

export function nm(value: number): string {
  return `${Math.round(value).toLocaleString("es-AR")} nm`;
}

export function nmDecimal(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} nm`;
}

export function rangeNm(min: number, max: number): string {
  if (min === max || max === 0) return nm(min);
  return `${min.toLocaleString("es-AR")}–${nm(max)}`;
}
