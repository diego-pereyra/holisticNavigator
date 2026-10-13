import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CatalogIndex(val routes: List<IndexEntry> = emptyList())

@Serializable
data class IndexEntry(
    val code: String,
    val title: String = "",
    val chapter: String = "",
    val region: String = "",
    val from: String = "",
    val to: String = "",
    val nmMin: Int = 0,
    val nmMax: Int = 0,
    val variantCount: Int = 0,
    val bestMonths: List<Int> = emptyList(),
    val stormMonths: List<Int> = emptyList(),
    val bbox: List<Double> = emptyList(),
    val searchNames: List<String> = emptyList(),
)

@Serializable
data class Waypoint(
    val name: String = "",
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val dest: Boolean = false,
    val corrected: Boolean = false,
)

@Serializable
data class RouteVariant(
    val id: String = "",
    val from: String = "",
    val to: String = "",
    val nm: Int = 0,
    val coastal: Boolean = false,
    val needsReview: Boolean = false,
    val waypoints: List<Waypoint> = emptyList(),
)

@Serializable
data class RouteZone(
    val label: String = "",
    val months: List<Int> = emptyList(),
)

@Serializable
data class RouteWhen(
    val bestEn: String = "",
    val bestEs: String = "",
    val bestMonths: List<Int> = emptyList(),
    val stormsEn: String = "",
    val stormsEs: String = "",
    val stormMonths: List<Int> = emptyList(),
    val zones: List<RouteZone> = emptyList(),
)

@Serializable
data class RouteDetail(
    val code: String,
    val title: String = "",
    val chapter: String = "",
    val region: String = "",
    val from: String = "",
    val to: String = "",
    @SerialName("when") val whenInfo: RouteWhen = RouteWhen(),
    val charts: List<String> = emptyList(),
    val guides: List<String> = emptyList(),
    val planner: List<String> = emptyList(),
    val variants: List<RouteVariant> = emptyList(),
    val attribution: String = "",
    val needsReview: Boolean = false,
    val quoteEn: String = "",
    val quoteEs: String = "",
    val quoteSource: String = "",
    val chapterTip: String = "",
    val tip: String = "",
)
