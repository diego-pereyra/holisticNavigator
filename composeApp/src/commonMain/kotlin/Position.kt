import androidx.compose.runtime.Composable

/** A single device fix. Heading/speed may be null (e.g. no movement yet). */
data class NavPosition(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Double,
    val headingDeg: Double? = null,
    val speedMps: Double? = null,
    val timestampMs: Long = 0L,
)

/**
 * Live device position, or null until the first fix (and on platforms without
 * geolocation). Web uses navigator.geolocation; desktop returns null for now.
 */
@Composable
expect fun rememberDevicePosition(enabled: Boolean = true): NavPosition?
