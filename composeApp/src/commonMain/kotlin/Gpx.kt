import kotlin.math.abs
import kotlinx.serialization.Serializable

@Serializable
data class ImportedRoute(val id: String, val name: String, val points: List<TrackPoint>)

private val POINT_TAG = Regex("""<(?:trkpt|rtept|wpt)\b([^>]*)>""", RegexOption.IGNORE_CASE)
private val NAME_TAG = Regex("""<name>([^<]*)</name>""", RegexOption.IGNORE_CASE)
private val COORD_BLOCK = Regex("""<coordinates>\s*([^<]+?)\s*</coordinates>""", RegexOption.IGNORE_CASE)

private fun attr(attrs: String, key: String): Double? =
    Regex("""\b$key\s*=\s*"([-\d.eE+]+)"""", RegexOption.IGNORE_CASE)
        .find(attrs)?.groupValues?.get(1)?.toDoubleOrNull()

private fun cleanName(name: String, xml: String): String =
    NAME_TAG.find(xml)?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
        ?: name.substringBeforeLast('.').ifBlank { name }

private fun routeId(name: String, seed: Int): String =
    "IMP-" + ((name.hashCode() * 31 + seed).toUInt().toString(16)).take(6)

private fun makeRoute(name: String, content: String, pts: List<TrackPoint>): ImportedRoute? {
    if (pts.size < 2) return null
    val label = cleanName(name, content)
    return ImportedRoute(routeId(label, content.length), label, pts)
}

fun parseGpx(name: String, xml: String): ImportedRoute? {
    val pts = POINT_TAG.findAll(xml).mapNotNull { m ->
        val attrs = m.groupValues[1]
        val lat = attr(attrs, "lat") ?: return@mapNotNull null
        val lon = attr(attrs, "lon") ?: return@mapNotNull null
        TrackPoint(0L, lat, lon)
    }.toList()
    return makeRoute(name, xml, pts)
}

fun parseKml(name: String, xml: String): ImportedRoute? {
    val pts = mutableListOf<TrackPoint>()
    for (m in COORD_BLOCK.findAll(xml)) {
        for (tuple in m.groupValues[1].trim().split(Regex("\\s+"))) {
            val parts = tuple.split(",")
            if (parts.size < 2) continue
            val lon = parts[0].toDoubleOrNull()
            val lat = parts[1].toDoubleOrNull()
            if (lat != null && lon != null) pts.add(TrackPoint(0L, lat, lon))
        }
    }
    return makeRoute(name, xml, pts)
}

fun parseCsv(name: String, text: String): ImportedRoute? {
    val lines = text.lineSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() && !it.startsWith("#") }
        .toList()
    if (lines.size < 2) return null
    val delim = if (lines.first().count { it == ';' } > lines.first().count { it == ',' }) ';' else ','

    val header = splitCsvLine(lines.first(), delim).map { it.trim().trim('"').lowercase() }
    var latIdx = header.indexOfFirst { it in setOf("lat", "latitude", "lat_deg", "y") }
    var lonIdx = header.indexOfFirst { it in setOf("lon", "lng", "long", "longitude", "lon_deg", "x") }
    var start = 0
    if (latIdx >= 0 && lonIdx >= 0) {
        start = 1
    } else {
        val r0 = splitCsvLine(lines.first(), delim)
        val a = r0.getOrNull(0)?.trim()?.trim('"')?.toDoubleOrNull()
        val b = r0.getOrNull(1)?.trim()?.trim('"')?.toDoubleOrNull()
        if (a == null || b == null) return null
        if (kotlin.math.abs(a) > 90.0 && kotlin.math.abs(b) <= 90.0) {
            lonIdx = 0
            latIdx = 1
        } else {
            latIdx = 0
            lonIdx = 1
        }
    }

    val pts = mutableListOf<TrackPoint>()
    for (i in start until lines.size) {
        val cells = splitCsvLine(lines[i], delim)
        val lat = cells.getOrNull(latIdx)?.trim()?.trim('"')?.toDoubleOrNull()
        val lon = cells.getOrNull(lonIdx)?.trim()?.trim('"')?.toDoubleOrNull()
        if (lat != null && lon != null) pts.add(TrackPoint(0L, lat, lon))
    }
    return makeRoute(name, text, pts)
}

private fun splitCsvLine(line: String, delim: Char): List<String> {
    val out = mutableListOf<String>()
    val sb = StringBuilder()
    var inQ = false
    for (c in line) {
        when {
            c == '"' -> inQ = !inQ
            c == delim && !inQ -> {
                out.add(sb.toString())
                sb.clear()
            }
            else -> sb.append(c)
        }
    }
    out.add(sb.toString())
    return out
}

fun parseRouteFile(name: String, content: String): ImportedRoute? {
    val lower = name.lowercase()
    return when {
        lower.endsWith(".kml") -> parseKml(name, content)
        lower.endsWith(".csv") || lower.endsWith(".tsv") -> parseCsv(name, content)
        else -> parseGpx(name, content)
    }
}

fun ImportedRoute.toIndexEntry(): IndexEntry =
    IndexEntry(code = id, title = name, chapter = "IMP", region = "Importada")

fun ImportedRoute.toGeoJson(): String {
    val safe = name.replace("\"", "'").replace("\\", " ")
    val coords = points.joinToString(",") { "[${it.lon},${it.lat}]" }
    return """{"type":"FeatureCollection","features":[{"type":"Feature",""" +
        """"properties":{"code":"$id","variant":"$id","title":"$safe","from":"","to":"""" +
        ""","needsReview":false,"landNm":0},"geometry":{"type":"LineString",""" +
        """"coordinates":[$coords]}}]}"""
}
