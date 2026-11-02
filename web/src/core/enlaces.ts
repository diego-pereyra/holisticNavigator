// Enlaces de "Apoyar el proyecto" (decisión del programa sponsors,
// sponsors/ENLACES.md). Un solo lugar por URL: no duplicar en la UI.
export const ENLACE_KOFI = "https://ko-fi.com/holisticnavigator"; // puntual + vitrina
export const ENLACE_SPONSORS = "https://github.com/sponsors/diego-pereyra"; // recurrente + corporativo

// Contador de visitas (BT1.2): se completa cuando el worker de metricas/ esté
// deployado. Vacía = la app no manda nada (no-op).
export const ENLACE_METRICAS = "";

// Clave local del último día avisado (formato YYYY-MM-DD). Nada sale del
// dispositivo salvo el GET anónimo al worker, y solo una vez por día.
export const CLAVE_BEACON_DIA = "hn-beacon-dia";

export function deberiaApitarBeacon(
  url: string,
  stampHoy: string,
  stampGuardado: string | null,
): boolean {
  if (!url) return false;
  if (!url.startsWith("https://")) return false;
  return stampGuardado !== stampHoy;
}
