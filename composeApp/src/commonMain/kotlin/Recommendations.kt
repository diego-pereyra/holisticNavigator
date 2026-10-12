import kotlinx.serialization.Serializable

data class Season(
    val label: String,
    val months: Set<Int>,
    val note: String = "",
)

private val ATL_N = setOf(6, 7, 8, 9, 10, 11)
private val PAC_N = setOf(5, 6, 7, 8, 9, 10, 11)
private val S_HALF = setOf(11, 12, 1, 2, 3, 4)
private val IND_N = setOf(4, 5, 10, 11, 12)

fun seasonFor(region: String): Season? = when (region) {
    "Atlántico Norte" -> Season("jun–nov (pico ago–oct)", ATL_N)
    "Atlántico Tropical" -> Season("jun–nov", ATL_N, "cerca del ecuador, riesgo menor")
    "Atlántico Sur" -> Season("muy raro", emptySet(), "ciclones casi inexistentes en el Atlántico Sur")
    "Pacífico Norte" -> Season("may–nov (Este); tifones todo el año (Oeste)", PAC_N)
    "Pacífico Tropical" -> Season("may–nov", PAC_N)
    "Pacífico Sur" -> Season("nov–abr", S_HALF)
    "Índico Norte" -> Season("abr–dic (picos may y oct–nov)", IND_N)
    "Índico Sur" -> Season("nov–abr", S_HALF)
    "Índico Tropical" -> Season("nov–abr", S_HALF)
    "Mar Rojo (norte)", "Mar Rojo (sur)" -> Season("sin ciclones tropicales", emptySet())
    "Mediterráneo Este", "Mediterráneo Oeste" ->
        Season("raro (medicanes)", emptySet(), "ocasionales tormentas tipo tropical")
    else -> null
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
