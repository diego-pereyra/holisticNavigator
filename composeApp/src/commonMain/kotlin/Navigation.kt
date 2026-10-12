import kotlinx.serialization.json.Json
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val R_NM = 3440.065

private fun Double.toRad() = this * PI / 180.0
private fun Double.toDeg() = this * 180.0 / PI

data class RouteTrack(
    val names: List<String>,
    val dests: List<Boolean>,
    val coords: List<Pair<Double, Double>>,
)

data class NavFix(
    val nextIndex: Int,
    val nextName: String,
    val nextIsDest: Boolean,
    val nextLon: Double,
    val nextLat: Double,
    val bearingDeg: Double,
    val distanceNm: Double,
    val xteNm: Double,
    val alongNm: Double,
    val legNm: Double,
    val legIndex: Int,
)

fun haversineNm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val dLat = (lat2 - lat1).toRad()
    val dLon = (lon2 - lon1).toRad()
    val a =
        sin(dLat / 2).let { it * it } +
            cos(lat1.toRad()) * cos(lat2.toRad()) * sin(dLon / 2).let { it * it }
    return 2.0 * R_NM * asin(min(1.0, sqrt(a)))
}

fun initialBearingDeg(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val p1 = lat1.toRad()
    val p2 = lat2.toRad()
    val dl = (lon2 - lon1).toRad()
    val y = sin(dl) * cos(p2)
    val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (atan2(y, x).toDeg() + 360.0) % 360.0
}

private data class Projection(val xteNm: Double, val alongNm: Double, val legNm: Double)

private fun project(
    aLat: Double,
    aLon: Double,
    bLat: Double,
    bLon: Double,
    pLat: Double,
    pLon: Double,
): Projection {
    val d13 = haversineNm(aLat, aLon, pLat, pLon) / R_NM
    val legNm = haversineNm(aLat, aLon, bLat, bLon)
    val t12 = initialBearingDeg(aLat, aLon, bLat, bLon).toRad()
    val t13 = initialBearingDeg(aLat, aLon, pLat, pLon).toRad()
    val xt = asin((sin(d13) * sin(t13 - t12)).coerceIn(-1.0, 1.0))
    val at = atan2(sin(d13) * cos(t13 - t12), cos(d13))
    return Projection(xt * R_NM, at * R_NM, legNm)
}

fun navigate(track: RouteTrack, lat: Double, lon: Double): NavFix? {
    val n = track.coords.size
    if (n < 2) return null

    var bestIdx = -1
    var bestAbs = Double.MAX_VALUE
    var bestXte = 0.0
    var bestAlong = 0.0
    var bestLeg = 0.0

    var nearestIdx = 1
    var nearestDist = Double.MAX_VALUE

    for (i in 0 until n - 1) {
        val a = track.coords[i]
        val b = track.coords[i + 1]
        val pr = project(a.second, a.first, b.second, b.first, lat, lon)
        val dA = haversineNm(lat, lon, a.second, a.first)
        val dB = haversineNm(lat, lon, b.second, b.first)
        if (dA < nearestDist) { nearestDist = dA; nearestIdx = i }
        if (dB < nearestDist) { nearestDist = dB; nearestIdx = i + 1 }
        if (pr.alongNm < 0.0 || pr.alongNm > pr.legNm) continue
        if (abs(pr.xteNm) < bestAbs) {
            bestAbs = abs(pr.xteNm)
            bestXte = pr.xteNm
            bestAlong = pr.alongNm
            bestLeg = pr.legNm
            bestIdx = i
        }
    }

    val legIndex: Int
    val nextIndex: Int
    if (bestIdx >= 0) {
        legIndex = bestIdx
        nextIndex = (bestIdx + 1).coerceAtMost(n - 1)
    } else {
        val ni = nearestIdx.coerceIn(1, n - 1)
        legIndex = ni - 1
        nextIndex = ni
    }

    val wp = track.coords[nextIndex]
    return NavFix(
        nextIndex = nextIndex,
        nextName = track.names.getOrNull(nextIndex) ?: "",
        nextIsDest = track.dests.getOrNull(nextIndex) ?: false,
        nextLon = wp.first,
        nextLat = wp.second,
        bearingDeg = initialBearingDeg(lat, lon, wp.second, wp.first),
        distanceNm = haversineNm(lat, lon, wp.second, wp.first),
        xteNm = bestXte,
        alongNm = bestAlong,
        legNm = bestLeg,
        legIndex = legIndex,
    )
}

fun trackLengthNm(track: RouteTrack): Double {
    var s = 0.0
    for (i in 0 until track.coords.size - 1) {
        val a = track.coords[i]
        val b = track.coords[i + 1]
        s += haversineNm(a.second, a.first, b.second, b.first)
    }
    return s
}

fun pointAlongTrack(track: RouteTrack, nm: Double): Pair<Double, Double>? {
    val n = track.coords.size
    if (n < 2) return null
    var remain = nm.coerceAtLeast(0.0)
    for (i in 0 until n - 1) {
        val a = track.coords[i]
        val b = track.coords[i + 1]
        val leg = haversineNm(a.second, a.first, b.second, b.first)
        if (remain <= leg || i == n - 2) {
            val t = if (leg < 1e-9) 0.0 else (remain / leg).coerceIn(0.0, 1.0)
            val lat = a.second + (b.second - a.second) * t
            val lon = a.first + (b.first - a.first) * t
            return lat to lon
        }
        remain -= leg
    }
    val last = track.coords.last()
    return last.second to last.first
}

private val trackJson = Json { ignoreUnknownKeys = true }

fun routeTrackFromGeoJson(geoJson: String?): RouteTrack? {
    if (geoJson.isNullOrBlank()) return null
    val root =
        runCatching { trackJson.parseToJsonElement(geoJson).jsonObject }.getOrNull() ?: return null
    val features = root["features"]?.jsonArray ?: return null
    for (f in features) {
        val fo = f.jsonObject
        val geom = fo["geometry"]?.jsonObject ?: continue
        if (geom["type"]?.jsonPrimitive?.content != "LineString") continue
        val coords =
            geom["coordinates"]?.jsonArray?.mapNotNull { pt ->
                val la = pt.jsonArray.getOrNull(1)?.jsonPrimitive?.doubleOrNull
                val lo = pt.jsonArray.getOrNull(0)?.jsonPrimitive?.doubleOrNull
                if (la == null || lo == null) null else (lo to la)
            } ?: continue
        if (coords.size < 2) continue
        val props = fo["properties"]?.jsonObject
        val names = props?.get("wpNames")?.jsonArray?.map { it.jsonPrimitive.content }
        val dests = props?.get("wpDests")?.jsonArray?.map { it.jsonPrimitive.content == "true" }
        val an = names?.takeIf { it.size == coords.size } ?: List(coords.size) { "WP $it" }
        val ad = dests?.takeIf { it.size == coords.size } ?: List(coords.size) { false }
        return RouteTrack(an, ad, coords)
    }
    return null
}
