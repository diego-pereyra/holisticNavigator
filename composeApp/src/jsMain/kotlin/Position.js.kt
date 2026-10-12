import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.browser.window

@Composable
actual fun rememberDevicePosition(enabled: Boolean): NavPosition? {
    var pos by remember { mutableStateOf<NavPosition?>(null) }
    DisposableEffect(enabled) {
        if (!enabled) return@DisposableEffect onDispose {}
        val geo = window.navigator.asDynamic().geolocation
        if (geo == null || geo === undefined) {
            println("HN: geolocation no disponible")
            return@DisposableEffect onDispose {}
        }
        val options = js("{ enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }")
        val watchId = geo.watchPosition(
            { p: dynamic ->
                val c = p.coords
                pos = NavPosition(
                    latitude = (c.latitude as Number).toDouble(),
                    longitude = (c.longitude as Number).toDouble(),
                    accuracyMeters = (c.accuracy as Number).toDouble(),
                    headingDeg = (c.heading as? Number)?.toDouble(),
                    speedMps = (c.speed as? Number)?.toDouble(),
                    timestampMs = (p.timestamp as Number).toLong(),
                )
            },
            { e: dynamic -> println("HN: geolocation error ${e.code}: ${e.message}") },
            options,
        )
        onDispose { geo.clearWatch(watchId) }
    }
    return pos
}
