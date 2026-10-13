import test from "node:test";
import assert from "node:assert/strict";

import {
  haversineNm,
  navigate,
  pointAlongTrack,
  trackLengthNm,
  routeTrackFromGeoJson,
  type RouteTrack,
} from "./navigation.ts";

function straightTrack(): RouteTrack {
  return {
    names: ["A", "B", "C"],
    dests: [false, false, true],
    corrected: [false, true, false],
    coords: [
      [0, 0],
      [10, 0],
      [10, 5],
    ],
  };
}

test("haversine 1 grado de latitud = 60 nm", () => {
  assert.ok(Math.abs(haversineNm(0, 0, 1, 0) - 60) < 0.5);
});

test("navigate apunta al waypoint siguiente y calcula XTE", () => {
  const nav = navigate(straightTrack(), 0.1, 5);
  assert.ok(nav);
  assert.equal(nav!.nextIndex, 1);
  assert.equal(nav!.nextName, "B");
  assert.equal(nav!.nextCorrected, true);
  assert.ok(Math.abs(Math.abs(nav!.xteNm) - 6) < 0.2, `xte=${nav!.xteNm}`);
});

test("trackLengthNm suma los tramos", () => {
  const len = trackLengthNm(straightTrack());
  assert.ok(len > 890 && len < 910, `len=${len}`);
});

test("pointAlongTrack interpola sobre el tramo", () => {
  const p = pointAlongTrack(straightTrack(), 300);
  assert.ok(p);
  assert.ok(Math.abs(p![0] - 5) < 0.1, `lon=${p![0]}`);
  assert.ok(Math.abs(p![1] - 0) < 1e-9);
});

test("routeTrackFromGeoJson lee LineString y props", () => {
  const gj = JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { wpNames: ["X", "Y"], wpDests: ["true", "false"] },
        geometry: {
          type: "LineString",
          coordinates: [
            [-5, 50],
            [-6, 49],
          ],
        },
      },
    ],
  });
  const t = routeTrackFromGeoJson(gj);
  assert.ok(t);
  assert.deepEqual(t!.names, ["X", "Y"]);
  assert.equal(t!.dests[0], true);
  assert.deepEqual(t!.coords[0], [-5, 50]);
});

test("routeTrackFromGeoJson tolera entrada inválida", () => {
  assert.equal(routeTrackFromGeoJson("no json"), null);
  assert.equal(routeTrackFromGeoJson(null), null);
});
