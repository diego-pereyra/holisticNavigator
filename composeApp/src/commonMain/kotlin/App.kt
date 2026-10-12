import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.maplibre.compose.camera.CameraAnimation
import org.maplibre.compose.expressions.dsl.const
import org.maplibre.compose.interaction.ClickResult
import org.maplibre.compose.layers.CircleLayer
import org.maplibre.compose.layers.FeaturesClickHandler
import org.maplibre.compose.layers.LineLayer
import org.maplibre.compose.map.MaplibreMap
import org.maplibre.compose.map.rememberMapState
import org.maplibre.compose.sources.GeoJsonData
import org.maplibre.compose.sources.rememberGeoJsonSource
import org.maplibre.compose.util.DpPadding
import org.maplibre.spatialk.geojson.BoundingBox
import org.maplibre.spatialk.geojson.Position
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.round
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.time.Duration.Companion.milliseconds

private val routeJson = Json { ignoreUnknownKeys = true }

private const val SIM_BASE_SECONDS = 90.0

private fun routeBoundingBox(geoJson: String): BoundingBox? {
    val features =
        runCatching { routeJson.parseToJsonElement(geoJson).jsonObject["features"]?.jsonArray }
            .getOrNull() ?: return null
    var minLat = 90.0
    var maxLat = -90.0
    var minLon = 180.0
    var maxLon = -180.0
    for (f in features) {
        val geometry = (f as? JsonObject)?.get("geometry")?.jsonObject ?: continue
        val coords = geometry["coordinates"] ?: continue
        when (geometry["type"]?.jsonPrimitive?.content) {
            "LineString" -> {
                for (p in coords.jsonArray) {
                    val lon = p.jsonArray.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: continue
                    val lat = p.jsonArray.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: continue
                    if (lon < minLon) { minLon = lon }
                    if (lon > maxLon) { maxLon = lon }
                    if (lat < minLat) { minLat = lat }
                    if (lat > maxLat) { maxLat = lat }
                }
            }
            "Point" -> {
                val lon = coords.jsonArray.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: continue
                val lat = coords.jsonArray.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: continue
                if (lon < minLon) { minLon = lon }
                if (lon > maxLon) { maxLon = lon }
                if (lat < minLat) { minLat = lat }
                if (lat > maxLat) { maxLat = lat }
            }
        }
    }
    if (maxLon < minLon || maxLat < minLat) return null
    if (maxLon - minLon >= 180.0) {
        minLon = -180.0
        maxLon = 180.0
    }
    return BoundingBox(
        southwest = Position(longitude = minLon, latitude = minLat),
        northeast = Position(longitude = maxLon, latitude = maxLat),
    )
}

private fun fx(v: Double): Double = round(v * 100000.0) / 100000.0

private fun pointGeoJson(p: NavPosition): String =
    """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},""" +
        """"geometry":{"type":"Point","coordinates":[${fx(p.longitude)},${fx(p.latitude)}]}}]}"""

private fun accuracyGeoJson(p: NavPosition): String {
    val n = 64
    val dLat = p.accuracyMeters / 111320.0
    val dLon = p.accuracyMeters / (111320.0 * cos(p.latitude * PI / 180.0).coerceAtLeast(0.02))
    val sb = StringBuilder("[")
    for (i in 0..n) {
        val a = 2.0 * PI * i / n
        sb.append('[').append(fx(p.longitude + dLon * cos(a)))
            .append(',').append(fx(p.latitude + dLat * sin(a))).append(']')
        if (i < n) sb.append(',')
    }
    sb.append(']')
    return """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},""" +
        """"geometry":{"type":"LineString","coordinates":$sb}}]}"""
}

private fun navLineGeoJson(p: NavPosition, nav: NavFix): String =
    """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},""" +
        """"geometry":{"type":"LineString","coordinates":[[${fx(p.longitude)},${fx(p.latitude)}],""" +
        """[${fx(nav.nextLon)},${fx(nav.nextLat)}]]}}]}"""

private fun navWpGeoJson(nav: NavFix): String =
    """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},""" +
        """"geometry":{"type":"Point","coordinates":[${fx(nav.nextLon)},${fx(nav.nextLat)}]}}]}"""

private fun voyageGeoJson(log: VoyageLog): String {
    val sb = StringBuilder("[")
    log.points.forEachIndexed { i, p ->
        if (i > 0) sb.append(',')
        sb.append('[').append(fx(p.lon)).append(',').append(fx(p.lat)).append(']')
    }
    sb.append(']')
    return """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},""" +
        """"geometry":{"type":"LineString","coordinates":$sb}}]}"""
}

private fun fmtCoord(v: Double, pos: String, neg: String): String {
    val rounded = round(abs(v) * 1000.0) / 1000.0
    return "$rounded${if (v >= 0) pos else neg}"
}

private fun nextSimFactor(f: Double): Double = when {
    f <= 1.0 -> 4.0
    f <= 4.0 -> 16.0
    f <= 16.0 -> 64.0
    else -> 1.0
}

@Composable
fun App(
    routeGeoJson: String? = null,
    myPosition: NavPosition? = null,
    onRouteClick: ((String) -> Unit)? = null,
    gpsEnabled: Boolean = true,
    onToggleGps: () -> Unit = {},
    compact: Boolean = false,
    catalogOpen: Boolean = false,
    overlayPaddingLeft: Dp = 440.dp,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    MaterialTheme(colorScheme = darkColorScheme()) {
        Box(modifier = Modifier.fillMaxSize()) {
            val track = remember(routeGeoJson) { routeTrackFromGeoJson(routeGeoJson) }

            var simOn by remember { mutableStateOf(false) }
            var simNm by remember { mutableStateOf(0.0) }
            var simFactor by remember { mutableStateOf(4.0) }
            var recording by remember { mutableStateOf(false) }
            var voyage by remember { mutableStateOf(VoyageLog()) }
            val totalNm = remember(track) { track?.let { trackLengthNm(it) } ?: 0.0 }

            LaunchedEffect(routeGeoJson) { simNm = 0.0 }
            LaunchedEffect(simOn, track) {
                if (!simOn || totalNm <= 0.0) return@LaunchedEffect
                while (true) {
                    kotlinx.coroutines.delay(50)
                    simNm += (totalNm / 90.0) * simFactor * 0.05
                    if (simNm >= totalNm) simNm -= totalNm
                }
            }

            val simPosition =
                if (simOn && track != null && totalNm > 0.0) {
                    pointAlongTrack(track, simNm)?.let { (lat, lon) ->
                        NavPosition(
                            latitude = lat,
                            longitude = lon,
                            accuracyMeters = 0.0,
                            timestampMs = 1_700_000_000_000L + (simNm * 1000.0).toLong(),
                        )
                    }
                } else null

            val pos = simPosition ?: myPosition
            val nav =
                if (pos != null && track != null) {
                    navigate(track, pos.latitude, pos.longitude)
                } else null

            LaunchedEffect(recording, pos?.timestampMs) {
                val p = pos ?: return@LaunchedEffect
                if (recording) {
                    voyage = voyage.withPoint(p.latitude, p.longitude, p.timestampMs)
                }
            }

            val routeClick: FeaturesClickHandler = { features ->
                val code = features.firstOrNull()?.properties?.get("code")?.jsonPrimitive?.content
                if (!code.isNullOrBlank()) onRouteClick?.invoke(code)
                ClickResult.Consume
            }
            val mapState =
                rememberMapState(
                    content = {
                        if (routeGeoJson != null) {
                            val routes = rememberGeoJsonSource(GeoJsonData.JsonString(routeGeoJson))
                            LineLayer(
                                id = "route-lines",
                                source = routes,
                                color = const(Color(0xFF4FC3F7)),
                                width = const(1.5.dp),
                                onClick = routeClick,
                            )
                            CircleLayer(
                                id = "route-endpoints",
                                source = routes,
                                color = const(Color(0xFFFFCC80)),
                                radius = const(3.dp),
                                onClick = routeClick,
                            )
                        }
                        if (pos != null) {
                            if (!simOn) {
                                val acc = rememberGeoJsonSource(GeoJsonData.JsonString(accuracyGeoJson(pos)))
                                LineLayer(
                                    id = "my-accuracy",
                                    source = acc,
                                    color = const(Color(0x662979FF)),
                                    width = const(1.dp),
                                )
                            }
                            val me = rememberGeoJsonSource(GeoJsonData.JsonString(pointGeoJson(pos)))
                            CircleLayer(
                                id = "my-halo",
                                source = me,
                                color = const(Color(if (simOn) 0x33FFB300 else 0x332979FF)),
                                radius = const(11.dp),
                            )
                            CircleLayer(
                                id = "my-dot",
                                source = me,
                                color = const(Color(if (simOn) 0xFFFF8F00 else 0xFF2979FF)),
                                radius = const(5.dp),
                            )
                            if (nav != null) {
                                val toWp =
                                    rememberGeoJsonSource(
                                        GeoJsonData.JsonString(navLineGeoJson(pos, nav)),
                                    )
                                LineLayer(
                                    id = "nav-to-wp",
                                    source = toWp,
                                    color = const(Color(0xFF00E676)),
                                    width = const(1.5.dp),
                                )
                                val wpSrc =
                                    rememberGeoJsonSource(GeoJsonData.JsonString(navWpGeoJson(nav)))
                                CircleLayer(
                                    id = "nav-wp-halo",
                                    source = wpSrc,
                                    color = const(Color(0x5500E676)),
                                    radius = const(12.dp),
                                )
                                CircleLayer(
                                    id = "nav-wp",
                                    source = wpSrc,
                                    color = const(Color(0xFF00E676)),
                                    radius = const(6.dp),
                                )
                            }
                        }
                        if (voyage.points.size >= 2) {
                            val vg =
                                rememberGeoJsonSource(GeoJsonData.JsonString(voyageGeoJson(voyage)))
                            LineLayer(
                                id = "voyage-line",
                                source = vg,
                                color = const(Color(0xFFFFD54F)),
                                width = const(2.dp),
                            )
                        }
                    },
                )

            val fitPadding = DpPadding(left = overlayPaddingLeft, top = 24.dp, right = 24.dp, bottom = 24.dp)

            val centerOn: suspend (NavPosition, Boolean) -> Unit = { p, animate ->
                val pad = 0.02 + p.accuracyMeters / 111320.0
                runCatching {
                    mapState.animateCameraToBounds(
                        boundingBox = BoundingBox(
                            southwest = Position(longitude = p.longitude - pad, latitude = p.latitude - pad),
                            northeast = Position(longitude = p.longitude + pad, latitude = p.latitude + pad),
                        ),
                        fitPadding = fitPadding,
                        animation =
                            if (animate) CameraAnimation.Ease(duration = 500.milliseconds)
                            else CameraAnimation.Ease(duration = 0.milliseconds),
                    )
                }.onFailure { println("HN: ERR center: ${it.message}") }
            }

            LaunchedEffect(routeGeoJson) {
                val bbox = routeGeoJson?.let { routeBoundingBox(it) } ?: return@LaunchedEffect
                runCatching {
                    mapState.animateCameraToBounds(
                        boundingBox = bbox,
                        fitPadding = fitPadding,
                        animation = CameraAnimation.Ease(duration = 700.milliseconds),
                    )
                }.onFailure { println("HN: ERR fit camera: ${it.message}") }
            }

            var centeredOnce by remember { mutableStateOf(false) }
            LaunchedEffect(pos?.timestampMs, routeGeoJson) {
                val p = pos ?: return@LaunchedEffect
                if (!centeredOnce && routeGeoJson == null) {
                    centerOn(p, true)
                    centeredOnce = true
                }
            }

            MaplibreMap(
                modifier = Modifier.fillMaxSize(),
                state = mapState,
                overlay = { overlay() },
            )

            val scope = rememberCoroutineScope()
            var controlsOpen by remember(compact) { mutableStateOf(!compact) }

            if (!(compact && catalogOpen)) {
            Column(
                modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
                horizontalAlignment = Alignment.End,
            ) {
                if (compact) {
                    Surface(
                        color = Color(0xF0181C22),
                        contentColor = Color(0xFFE8F5E9),
                        shape = RoundedCornerShape(50),
                        modifier = Modifier.clickable(onClick = { controlsOpen = !controlsOpen }),
                    ) {
                        Text(
                            if (controlsOpen) "✕ cerrar" else "⋯ controles",
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
                if (controlsOpen) {
                    if (compact) Spacer(Modifier.height(8.dp))
                    Surface(color = Color(0xF0181C22), contentColor = Color(0xFFE8F5E9)) {
                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                            Text("Simulador")
                            Row {
                                TextButton(onClick = { simOn = !simOn }) {
                                    Text(if (simOn) "⏸" else "▶ probar")
                                }
                                TextButton(onClick = { simNm = 0.0 }) { Text("↺") }
                                TextButton(onClick = { simFactor = nextSimFactor(simFactor) }) {
                                    Text("x${simFactor.roundToInt()}")
                                }
                            }
                            if (simOn && totalNm > 0.0) {
                                Text("${simNm.roundToInt()} / ${totalNm.roundToInt()} nm")
                            } else if (simOn) {
                                Text("Elegí una ruta para simular")
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Surface(color = Color(0xF0181C22), contentColor = Color(0xFFE8F5E9)) {
                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                            Text("Bitácora")
                            Row {
                                TextButton(onClick = { recording = !recording }) {
                                    Text(if (recording) "■ parar" else "● grabar")
                                }
                                TextButton(onClick = { voyage = VoyageLog() }) { Text("borrar") }
                                TextButton(
                                    onClick = {
                                        downloadText(
                                            "travesia.gpx",
                                            "application/gpx+xml",
                                            voyage.toGpx(),
                                        )
                                    },
                                ) { Text("GPX") }
                            }
                            Text("${voyage.points.size} pts · ${voyage.distanceNm.roundToInt()} nm")
                        }
                    }
                }
            }
            }

            if (!(compact && catalogOpen)) {
            Column(
                modifier =
                    Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Surface(
                    color = Color(0xF0181C22),
                    contentColor = Color(0xFFE8F5E9),
                    shape = RoundedCornerShape(50),
                    modifier = Modifier.clickable(onClick = onToggleGps),
                ) {
                    Text(
                        if (gpsEnabled) (if (compact) "GPS ✓" else "GPS: activado")
                        else (if (compact) "GPS ✗" else "GPS: desactivado"),
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
                if (pos != null) {
                    Spacer(Modifier.height(8.dp))
                    FloatingActionButton(
                        onClick = { scope.launch { centerOn(pos, true) } },
                    ) {
                        Text("◉")
                    }
                    if (nav != null) {
                        Spacer(Modifier.height(8.dp))
                        Surface(color = Color(0xF0181C22), contentColor = Color(0xFFE8F5E9)) {
                            Column(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            ) {
                                Text(
                                    "Próximo: ${nav.nextName.ifBlank { "WP ${nav.nextIndex}" }}" +
                                        if (nav.nextIsDest) "  (destino)" else "",
                                )
                                Text(
                                    "${nav.bearingDeg.roundToInt()}°   " +
                                        "${(nav.distanceNm * 10).roundToInt() / 10.0} nm",
                                )
                                Text(
                                    "XTE ${(nav.xteNm * 10).roundToInt() / 10.0} nm " +
                                        "${if (nav.xteNm >= 0) "der" else "izq"}   " +
                                        "tramo ${nav.legIndex + 1}",
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Surface(color = Color(0xE60B1626), contentColor = Color(0xFFE8EEF4)) {
                        Text(
                            text = if (simOn) "SIMULACIÓN  " else "Mi posición  " +
                                "${fmtCoord(pos.latitude, "N", "S")}  " +
                                "${fmtCoord(pos.longitude, "E", "W")}  " +
                                "±${pos.accuracyMeters.roundToInt()} m",
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }
            }

            if (!compact) {
                Surface(
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp),
                    tonalElevation = 4.dp,
                ) {
                    Text(
                        text = sharedGreeting(),
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}
