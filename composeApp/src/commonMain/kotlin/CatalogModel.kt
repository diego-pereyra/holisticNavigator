import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CatalogIndex(val routes: List<IndexEntry> = emptyList())

@Serializable
data class IndexEntry(
    val code: String,
    val title: String,
    val chapter: String,
    val region: String = "",
    val ports: List<String> = emptyList(),
)

@Serializable
data class RouteDetail(
    val code: String,
    val title: String = "",
    val chapter: String = "",
    val region: String = "",
    val ports: List<String> = emptyList(),
    val printedPages: List<Int> = emptyList(),
    val attribution: String = "",
    val needsReview: Boolean = false,
    val monthsMentioned: List<Int> = emptyList(),
    val waypointCodes: List<String> = emptyList(),
    val miles: List<Int> = emptyList(),
    @SerialName("sourcePdfPages") val pages: List<Int> = emptyList(),
    val charCount: Int = 0,
)
