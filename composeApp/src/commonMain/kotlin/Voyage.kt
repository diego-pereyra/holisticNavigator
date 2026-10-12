import kotlinx.serialization.Serializable

@Serializable
data class TrackPoint(val t: Long, val lat: Double, val lon: Double)

data class VoyageLog(
    val name: String = "Travesía",
    val points: List<TrackPoint> = emptyList(),
) {
    val distanceNm: Double
        get() {
            var s = 0.0
            for (i in 0 until points.size - 1) {
                s += haversineNm(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
            }
            return s
        }
}

fun VoyageLog.withPoint(lat: Double, lon: Double, t: Long, minGapNm: Double = 0.05, minGapMs: Long = 3000): VoyageLog {
    val last = points.lastOrNull()
    if (last != null) {
        val moved = haversineNm(last.lat, last.lon, lat, lon)
        if (moved < minGapNm && t - last.t < minGapMs) return this
    }
    return copy(points = points + TrackPoint(t, lat, lon))
}

fun VoyageLog.toGpx(): String {
    val sb = StringBuilder()
    sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
    sb.append("<gpx version=\"1.1\" creator=\"Holistic Navigator\" ")
        .append("xmlns=\"http://www.topografix.com/GPX/1/1\">\n")
    sb.append("  <trk>\n    <name>").append(name.replace("<", "&lt;")).append("</name>\n")
    sb.append("    <trkseg>\n")
    for (p in points) {
        sb.append("      <trkpt lat=\"").append(p.lat).append("\" lon=\"").append(p.lon)
            .append("\"><time>").append(isoUtc(p.t)).append("</time></trkpt>\n")
    }
    sb.append("    </trkseg>\n  </trk>\n</gpx>\n")
    return sb.toString()
}

expect fun downloadText(filename: String, mime: String, text: String)
