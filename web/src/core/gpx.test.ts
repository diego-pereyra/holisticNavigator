import test from "node:test";
import assert from "node:assert/strict";

import {
  importedRouteToGeoJson,
  parseCsv,
  parseGpx,
  parseKml,
  parseRouteFile,
  voyageToGpx,
} from "./gpx.ts";

test("voyageToGpx incluye trkpt con hora UTC", () => {
  const log = {
    name: "Travesía",
    points: [{ t: Date.UTC(2024, 0, 1, 12, 0, 0), lat: 10, lon: -20 }],
  };
  const gpx = voyageToGpx(log);
  assert.ok(gpx.includes("<trkpt"));
  assert.ok(gpx.includes("2024-01-01T12:00:00Z"));
  assert.ok(gpx.includes("<name>Travesía</name>"));
});

test("voyageToGpx pone las notas como wpt antes del trk", () => {
  const log = {
    name: "Travesía",
    points: [{ t: Date.UTC(2024, 0, 1, 12, 0, 0), lat: 10, lon: -20 }],
    notes: [
      { t: Date.UTC(2024, 0, 1, 13, 0, 0), lat: 10.5, lon: -20.5, text: "Anclaje <b>buena</b>" },
      { t: Date.UTC(2024, 0, 1, 14, 0, 0), lat: 11, lon: -21, text: "Cambio de guardia" },
    ],
  };
  const gpx = voyageToGpx(log);
  assert.ok(gpx.includes('<wpt lat="10.5" lon="-20.5">'));
  assert.ok(gpx.includes("<name>Nota</name>"));
  assert.ok(gpx.includes("2024-01-01T13:00:00Z"));
  assert.ok(gpx.includes("<desc>Anclaje &lt;b&gt;buena&lt;/b&gt;</desc>"));
  assert.equal((gpx.match(/<wpt /g) ?? []).length, 2);
  assert.ok(gpx.indexOf("<wpt ") < gpx.indexOf("<trk>"));
  assert.ok(gpx.indexOf("Cambio de guardia") < gpx.indexOf("<trk>"));
});

test("parseGpx toma trkpt y nombre", () => {
  const xml =
    '<?xml version="1.0"?><gpx><trk><name>Mi ruta</name><trkseg>' +
    '<trkpt lat="50.0" lon="-5.0"></trkpt>' +
    '<trkpt lat="49.0" lon="-6.0"></trkpt>' +
    "</trkseg></trk></gpx>";
  const r = parseGpx("ruta.gpx", xml);
  assert.ok(r);
  assert.equal(r!.name, "Mi ruta");
  assert.equal(r!.points.length, 2);
  assert.deepEqual(r!.points[0], { t: 0, lat: 50.0, lon: -5.0 });
});

test("parseKml lee coordinates", () => {
  const xml =
    "<kml><Placemark><LineString><coordinates>-5,50,0 -6,49,0</coordinates></LineString></Placemark></kml>";
  const r = parseKml("a.kml", xml);
  assert.ok(r);
  assert.equal(r!.points.length, 2);
  assert.deepEqual(r!.points[1], { t: 0, lat: 49, lon: -6 });
});

test("parseCsv con encabezado y coma", () => {
  const csv = "lat,lon\n50.0,-5.0\n49.0,-6.0\n";
  const r = parseCsv("a.csv", csv);
  assert.ok(r);
  assert.equal(r!.points.length, 2);
});

test("parseCsv sin encabezado detecta lon,lat por magnitud", () => {
  const csv = "-170.0,10.0\n-171.0,11.0\n";
  const r = parseCsv("a.csv", csv);
  assert.ok(r);
  assert.deepEqual(r!.points[0], { t: 0, lat: 10.0, lon: -170.0 });
});

test("parseRouteFile despacha por extensión", () => {
  assert.ok(parseRouteFile("x.csv", "lat,lon\n1,2\n3,4\n"));
  assert.equal(parseRouteFile("x.txt", "sin puntos"), null);
});

test("importedRouteToGeoJson genera LineString", () => {
  const r = parseGpx(
    "r.gpx",
    '<gpx><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></gpx>',
  )!;
  const gj = importedRouteToGeoJson(r);
  assert.ok(gj.includes('"LineString"'));
  assert.ok(gj.includes("[2,1]"));
});
