import kotlinx.serialization.Serializable

data class Season(
    val label: String,
    val months: Set<Int>,
    val note: String = "",
)

@Serializable
data class Basin(
    val boxes: List<List<Double>> = emptyList(),
    val nhcBasins: String = "",
    val rsmc: String = "",
    val stormMonths: List<Int> = emptyList(),
)

@Serializable
data class BasinsDoc(
    val schema: Int = 1,
    val regions: Map<String, Basin> = emptyMap(),
)

var basinRegions: Map<String, Basin> = emptyMap()

private fun monthSpanLabel(months: List<Int>): String {
    if (months.isEmpty()) return "sin temporada de ciclones"
    return "${monthName(months.first())}–${monthName(months.last())}"
}

fun seasonFor(region: String): Season? {
    val b = basinRegions[region] ?: return null
    val months = b.stormMonths.toSet()
    return Season(monthSpanLabel(b.stormMonths), months, b.rsmc)
}


fun inSeason(season: Season, month: Int): Boolean = month in season.months

fun monthName(m: Int): String =
    listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
        .getOrElse(m - 1) { "$m" }

@Serializable
data class NhcStorm(
    val basin: String = "",
    val name: String = "",
    val classification: String = "",
    val intensity: Int = 0,
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val advisoryUrl: String = "",
)

@Serializable
data class NhcAdvisory(
    val basin: String = "",
    val title: String = "",
    val link: String = "",
    val date: String = "",
)

@Serializable
data class NhcFeed(
    val schema: Int = 1,
    val source: String = "",
    val fetchedAt: String = "",
    val storms: List<NhcStorm> = emptyList(),
    val advisories: List<NhcAdvisory> = emptyList(),
)

fun nhcBasinsFor(chapter: String): Set<String> = when (chapter) {
    "AN", "AT" -> setOf("AT")
    "PN", "PT" -> setOf("EP", "CP")
    else -> emptySet()
}

fun activeStorms(feed: NhcFeed, chapter: String): List<NhcStorm> {
    val basins = nhcBasinsFor(chapter)
    if (basins.isEmpty()) return emptyList()
    return feed.storms.filter { it.basin.uppercase() in basins }
}
