// Posición (T2.2, §4.1): GPS del navegador, con estados explícitos.

export type PositionSource = "gps" | "manual" | "simulated";
export type PositionStatus = "off" | "searching" | "fixed" | "denied" | "unavailable";

export interface Position {
  lat: number;
  lon: number;
  accuracyM: number;
  source: PositionSource;
  t: number;
}

export interface GpsUpdate {
  status: PositionStatus;
  position: Position | null;
}

export function watchGps(onUpdate: (u: GpsUpdate) => void): () => void {
  if (!("geolocation" in navigator)) {
    onUpdate({ status: "unavailable", position: null });
    return () => undefined;
  }
  onUpdate({ status: "searching", position: null });
  const id = navigator.geolocation.watchPosition(
    (p) => {
      onUpdate({
        status: "fixed",
        position: {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracyM: p.coords.accuracy,
          source: "gps",
          t: p.timestamp,
        },
      });
    },
    (err) => {
      onUpdate({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable", position: null });
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 60_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
