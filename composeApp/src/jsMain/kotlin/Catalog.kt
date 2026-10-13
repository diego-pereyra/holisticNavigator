import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.browser.window
import kotlinx.coroutines.await
import org.w3c.fetch.RequestInit
import org.w3c.fetch.Response
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

const val CATALOG_VERSION = 8

private val json = Json { ignoreUnknownKeys = true }

private val MONTH_ABBR = listOf(
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
)

suspend fun fetchText(url: String): String {
    println("HN: GET $url")
    val response: Response = window.fetch(url, js("{}") as RequestInit).await()
    println("HN: $url status=${response.status} ok=${response.ok}")
    if (!response.ok) throw IllegalStateException("No se pudo cargar $url (${response.status})")
    val body = response.text().await()
    println("HN: $url -> ${body.length} chars")
    return body
}

private fun parseDetails(body: String): Map<String, RouteDetail> =
    body.lineSequence()
        .filter { it.isNotBlank() }
        .map { json.decodeFromString<RouteDetail>(it) }
        .associateBy { it.code }

private fun routeCodeKey(code: String): Pair<String, Int> {
    val m = Regex("^([A-Za-z]+)(\\d+)$").find(code)
    return if (m != null) m.groupValues[1] to m.groupValues[2].toInt() else code to 0
}

private fun paramFromUrl(name: String): String? =
    window.location.search.removePrefix("?")
        .split('&').firstOrNull { it.startsWith("$name=") }
        ?.substringAfter('=')?.takeIf { it.isNotBlank() }

private fun routeFromUrl(): String? = paramFromUrl("route")
private fun variantFromUrl(): String? = paramFromUrl("variant")

@Composable
fun HolisticApp() {
    var routeFeatures by remember { mutableStateOf<JsonArray?>(null) }
    var selectedCode by remember { mutableStateOf(routeFromUrl()) }
    var selectedVariant by remember { mutableStateOf(variantFromUrl()) }
    var panelOpen by remember { mutableStateOf(window.innerWidth >= 700) }
    var gpsOn by remember { mutableStateOf(true) }
    var showHelp by remember { mutableStateOf(loadStore("hn_seen_help") == null) }
    var imported by remember {
        mutableStateOf(
            runCatching {
                json.decodeFromString<List<ImportedRoute>>(loadStore("hn.imported") ?: "[]")
            }.getOrDefault(emptyList()),
        )
    }

    fun persist(list: List<ImportedRoute>) {
        imported = list
        runCatching { saveStore("hn.imported", json.encodeToString(list)) }
    }

    LaunchedEffect(Unit) {
        routeFeatures = try {
            val text = fetchText("catalog/routes.geojson?v=$CATALOG_VERSION")
            json.parseToJsonElement(text).jsonObject["features"]?.jsonArray
        } catch (t: Throwable) {
            println("HN: ERR geojson: ${t.message}")
            null
        }
    }

    val importedFeatures = remember(imported) {
        val acc = mutableListOf<JsonElement>()
        for (r in imported) {
            val feats =
                runCatching {
                    json.parseToJsonElement(r.toGeoJson()).jsonObject["features"]?.jsonArray
                }.getOrNull()
            if (feats != null) acc.addAll(feats)
        }
        JsonArray(acc)
    }

    val matchedFeatures = remember(selectedCode, routeFeatures, importedFeatures) {
        val code = selectedCode ?: return@remember emptyList()
        val features: List<JsonElement> = (routeFeatures ?: JsonArray(emptyList())) + importedFeatures
        features.mapNotNull { it as? JsonObject }.filter { f ->
            f.get("properties")?.jsonObject?.get("code")?.jsonPrimitive?.content == code
        }
    }

    val variants = remember(matchedFeatures) {
        matchedFeatures
            .mapNotNull { it.get("properties")?.jsonObject?.get("variant")?.jsonPrimitive?.content }
            .distinct().sorted()
    }

    val selectedGeoJson =
        remember(matchedFeatures, selectedVariant) {
            if (matchedFeatures.isEmpty()) return@remember null
            val filtered =
                if (selectedVariant != null && variants.size > 1)
                    matchedFeatures.filter { f ->
                        f.get("properties")?.jsonObject?.get("variant")?.jsonPrimitive?.content == selectedVariant
                    }
                else matchedFeatures
            if (filtered.isEmpty()) return@remember null
            buildJsonObject {
                put("type", "FeatureCollection")
                put("features", JsonArray(filtered))
            }.toString()
        }

    val compact = window.innerWidth < 700
    App(
        routeGeoJson = selectedGeoJson,
        myPosition = rememberDevicePosition(gpsOn),
        onRouteClick = { code ->
            if (code != selectedCode) selectedVariant = null
            selectedCode = code
        },
        gpsEnabled = gpsOn,
        onToggleGps = { gpsOn = !gpsOn },
        compact = compact,
        catalogOpen = panelOpen,
        overlayPaddingLeft = if (panelOpen && !compact) 440.dp else 24.dp,
    ) {
        CatalogOverlay(
            selectedCode = selectedCode,
            variants = variants,
            selectedVariant = selectedVariant,
            onSelectVariant = { selectedVariant = it },
            open = panelOpen,
            onToggle = { panelOpen = !panelOpen },
            imported = imported.map { it.toIndexEntry() },
            onImportGpx = {
                pickTextFile(".gpx,.kml,.csv,application/gpx+xml") { name, content ->
                    val r = parseRouteFile(name, content)
                    if (r != null) {
                        persist(imported.filter { it.id != r.id } + r)
                        selectedVariant = null
                        selectedCode = r.id
                    } else {
                        println("HN: archivo sin ruta válida (GPX/KML/CSV): $name")
                    }
                }
            },
            onDeleteImported = { id ->
                persist(imported.filter { it.id != id })
                if (selectedCode == id) selectedCode = null
            },
            onSelect = {
                if (it == null || it.code != selectedCode) selectedVariant = null
                selectedCode = it?.code
            },
        )

        Box(modifier = Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Surface(
                color = Color(0xF0181C22),
                contentColor = Color(0xFFE8F5E9),
                shape = RoundedCornerShape(50),
                modifier = Modifier.clickable { showHelp = true },
            ) {
                Text(
                    "?  ayuda",
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }

        if (showHelp) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color(0xE6000000)).clickable { },
                contentAlignment = Alignment.Center,
            ) {
                Surface(
                    color = Color(0xFF12233A),
                    contentColor = Color(0xFFE8EEF4),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.padding(20.dp).widthIn(max = 420.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "Holistic Navigator",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "Planificá travesías oceánicas sin conexión, basadas en World Cruising Routes (Cornell).",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        HelpLine("☰ Rutas", "Abrí el catálogo, buscá por puerto o zona y tocá una ruta.")
                        HelpLine(
                            "Consejos y datos",
                            "En la ficha: el consejo de la ruta, una cita del libro y los datos (temporada, ciclones, waypoints, millas).",
                        )
                        HelpLine("◉ / GPS", "Centrá el mapa en tu posición; el chip GPS la activa o desactiva.")
                        HelpLine("⋯ controles", "Simulador de travesía y bitácora (exportá tu track en GPX).")
                        Text(
                            "Funciona sin conexión: agregala a la pantalla de inicio.",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF9FB0C0),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            TextButton(
                                onClick = {
                                    showHelp = false
                                    saveStore("hn_seen_help", "1")
                                },
                            ) { Text("Entendido") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HelpLine(label: String, text: String) {
    Column {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF80CBC4),
        )
        Text(text, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun CatalogOverlay(
    selectedCode: String?,
    variants: List<String> = emptyList(),
    selectedVariant: String? = null,
    onSelectVariant: (String?) -> Unit = {},
    imported: List<IndexEntry> = emptyList(),
    onImportGpx: () -> Unit = {},
    onDeleteImported: (String) -> Unit = {},
    onSelect: (IndexEntry?) -> Unit,
    open: Boolean = true,
    onToggle: () -> Unit = {},
) {
    var routes by remember { mutableStateOf<List<IndexEntry>>(emptyList()) }
    var regionFilter by remember { mutableStateOf<String?>(null) }
    var nhcFeed by remember { mutableStateOf<NhcFeed?>(null) }
    var nhcError by remember { mutableStateOf(false) }
    var loadingIndex by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var details by remember { mutableStateOf<Map<String, RouteDetail>>(emptyMap()) }
    var loadingChapter by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            val body = fetchText("catalog/index.json?v=$CATALOG_VERSION")
            routes = json.decodeFromString<CatalogIndex>(body).routes
        } catch (t: Throwable) {
            println("HN: ERR index: ${t.message}")
            error = t.message ?: t.toString()
        } finally {
            loadingIndex = false
        }
    }

    val selected = (imported + routes).firstOrNull { it.code == selectedCode }
    val selCode = selected?.code
    LaunchedEffect(selCode) {
        val sel = selected ?: return@LaunchedEffect
        if (sel.code in details || sel.chapter.isEmpty()) return@LaunchedEffect
        loadingChapter = sel.chapter
        try {
            val parsed = parseDetails(fetchText("catalog/facts/${sel.chapter}.jsonl?v=$CATALOG_VERSION"))
            details = details + parsed
        } catch (t: Throwable) {
            println("HN: ERR facts/${sel.chapter}: ${t.message}")
            error = t.message ?: t.toString()
        } finally {
            loadingChapter = null
        }
    }

    LaunchedEffect(Unit) {
        nhcFeed = try {
            json.decodeFromString<NhcFeed>(fetchText("catalog/nhc.json?v=$CATALOG_VERSION"))
        } catch (t: Throwable) {
            println("HN: ERR nhc.json: ${t.message}")
            nhcError = true
            null
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isNarrow = maxWidth < 480.dp
        val panelMaxHeight = maxHeight
        val panelWidth = if (isNarrow) maxWidth else 380.dp
        if (!open) {
            Surface(
                color = Color(0xE60B1626),
                contentColor = Color(0xFFE8EEF4),
                shape = RoundedCornerShape(50),
                modifier = Modifier.padding(12.dp).clickable(onClick = onToggle),
            ) {
                Text(
                    "☰ Rutas",
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        } else {
        Surface(
            color = Color(0xE60B1626),
            contentColor = Color(0xFFE8EEF4),
            shape = RoundedCornerShape(topEnd = 12.dp, bottomEnd = 12.dp),
            modifier = Modifier.width(panelWidth).fillMaxHeight(),
        ) {
        Column(modifier = Modifier.fillMaxHeight().padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    "Catálogo",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "✕",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier
                        .clickable(onClick = onToggle)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Buscar ruta, puerto o zona") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 6.dp),
            ) {
                Surface(
                    color = Color(0xFF1E3A5F),
                    shape = RoundedCornerShape(50),
                    modifier = Modifier.clickable(onClick = onImportGpx),
                ) {
                    Text(
                        "+ Importar GPX",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            val allEntries = imported + routes
            val regions = remember(allEntries) {
                allEntries.mapNotNull { it.region.ifBlank { null } }.distinct().sorted()
            }
            if (regions.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    item {
                        VariantChip(label = "Todas", selected = regionFilter == null) {
                            regionFilter = null
                        }
                    }
                    items(regions, key = { it }) { reg ->
                        VariantChip(label = reg, selected = regionFilter == reg) {
                            regionFilter = if (regionFilter == reg) null else reg
                        }
                    }
                }
            }

            val filtered = allEntries
                .filter { route ->
                    val byRegion = regionFilter == null || route.region == regionFilter
                    val matches =
                        query.isBlank() ||
                            route.code.contains(query, true) ||
                            route.title.contains(query, true) ||
                            route.region.contains(query, true) ||
                            route.ports.any { it.contains(query, true) }
                    byRegion && matches
                }
                .sortedWith(
                    compareBy({ routeCodeKey(it.code).first }, { routeCodeKey(it.code).second }),
                )

            Text(
                text = when {
                    error != null -> "Error: $error"
                    loadingIndex -> "Cargando catálogo…"
                    else -> "${filtered.size} de ${allEntries.size} rutas" +
                        (regionFilter?.let { " · $it" } ?: "")
                },
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(vertical = 8.dp),
            )
            Text(
                text = "8.ª edición · waypoints GPS reales",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF9FB0C0),
                modifier = Modifier.padding(top = 0.dp, bottom = 6.dp),
            )

            if (variants.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                    VariantChip(label = "Todas", selected = selectedVariant == null) { onSelectVariant(null) }
                    for (v in variants) {
                        val label = v.removePrefix(selectedCode ?: "").ifBlank { v }
                        VariantChip(label = label, selected = selectedVariant == v) { onSelectVariant(v) }
                    }
                }
            }

            HorizontalDivider()

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(filtered, key = { it.code }) { route ->
                    RouteRow(
                        route = route,
                        selected = route.code == selectedCode,
                        onClick = { onSelect(route) },
                        onDelete = if (route.region == "Importada") {
                            { onDeleteImported(route.code) }
                        } else {
                            null
                        },
                    )
                }
            }

            val sel = selected
            if (sel != null) {
                HorizontalDivider()
                var adviceOpen by remember(sel.code) { mutableStateOf(!isNarrow) }
                Surface(color = Color(0xFF12233A), contentColor = Color(0xFFE8EEF4)) {
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { adviceOpen = !adviceOpen }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Consejos y datos · ${sel.code}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                if (!adviceOpen) {
                                    Text(
                                        sel.title,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color(0xFF9FB0C0),
                                        maxLines = 1,
                                    )
                                }
                            }
                            Text(
                                if (adviceOpen) "▾" else "▴",
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                        if (adviceOpen) {
                            Column(
                                modifier = Modifier
                                    .heightIn(max = if (isNarrow) panelMaxHeight * 0.5f else 320.dp)
                                    .verticalScroll(rememberScrollState())
                                    .padding(bottom = 8.dp),
                            ) {
                                val detail = details[sel.code]
                                when {
                                    detail != null -> RouteDetailView(
                                        sel,
                                        detail,
                                        storms = nhcFeed?.let { activeStorms(it, sel.chapter) } ?: emptyList(),
                                        nhcLoaded = nhcFeed != null,
                                        nhcError = nhcError,
                                    )
                                    loadingChapter == sel.chapter -> Text(
                                        "Cargando ficha…", style = MaterialTheme.typography.labelMedium,
                                        modifier = Modifier.padding(top = 10.dp),
                                    )
                                    else -> Text(
                                        "Sin datos de esta ruta", style = MaterialTheme.typography.labelMedium,
                                        modifier = Modifier.padding(top = 10.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        }
        }
    }
}

@Composable
private fun VariantChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg = if (selected) Color(0xFF2F6BAF) else Color(0xFF1E3A5F)
    Surface(
        color = bg,
        shape = RoundedCornerShape(50),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun RouteRow(route: IndexEntry, selected: Boolean, onClick: () -> Unit, onDelete: (() -> Unit)? = null) {
    val background = if (selected) Color(0xFF1E3A5F) else Color.Transparent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(background)
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(route.code, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(route.title, style = MaterialTheme.typography.bodySmall)
            if (route.region.isNotBlank()) {
                Text(
                    route.region,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF9FB0C0),
                )
            }
        }
        if (onDelete != null) {
            Text(
                "✕",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .clickable(onClick = onDelete)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun RouteDetailView(
    entry: IndexEntry,
    detail: RouteDetail,
    storms: List<NhcStorm> = emptyList(),
    nhcLoaded: Boolean = false,
    nhcError: Boolean = false,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(detail.code, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(detail.title, style = MaterialTheme.typography.bodyMedium)

        if (detail.tip.isNotBlank()) {
            Text(
                "Consejo",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF80CBC4),
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(detail.tip, style = MaterialTheme.typography.bodySmall)
        }
        if (detail.chapterTip.isNotBlank()) {
            Text(
                "Cómo encarar · ${detail.region}",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF80CBC4),
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(detail.chapterTip, style = MaterialTheme.typography.bodySmall)
        }

        val quote = detail.quoteEs.ifBlank { detail.quoteEn }
        if (quote.isNotBlank()) {
            HorizontalDivider(color = Color(0xFF2A3B4A))
            Text(
                "Del libro",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF9FB0C0),
            )
            Text(
                "“$quote”",
                style = MaterialTheme.typography.bodySmall,
                fontStyle = FontStyle.Italic,
            )
            Text(
                "— ${detail.quoteSource.ifBlank { "Jimmy Cornell — World Cruising Routes" }}",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF9FB0C0),
            )
        }

        val months = detail.monthsMentioned.map { MONTH_ABBR.getOrElse(it - 1) { "$it" } }
        DetailLine("Cuenca", detail.region.ifBlank { "—" })
        DetailLine("Temporada", months.joinToString(", ").ifBlank { "—" })

        val season = seasonFor(detail.region)
        if (season != null) {
            DetailLine("Ciclones", season.label)
            val month = yearMonthOf(nowEpochMs()).second
            when {
                season.months.isEmpty() -> Text(
                    "${monthName(month)}: ${season.note.ifBlank { "sin temporada de ciclones" }}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF9FB0C0),
                )
                inSeason(season, month) -> Text(
                    "⚠ ${monthName(month)}: dentro de la temporada de ciclones",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
                else -> Text(
                    "${monthName(month)}: fuera de la temporada de ciclones",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF9FB0C0),
                )
            }
        }
        DetailLine("Waypoints", if (detail.waypointCodes.isEmpty()) "—" else "${detail.waypointCodes.size} (${detail.waypointCodes.take(3).joinToString(", ")}…)")
        DetailLine("Millas", detail.miles.joinToString(", ").ifBlank { "—" })

        if (detail.needsReview) {
            Text(
                "Datos a revisar (trazado cruza tierra)",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        val basins = nhcBasinsFor(detail.chapter)
        when {
            basins.isEmpty() -> DetailLine("Avisos NHC", "sin cobertura (usar BoM/Fiji)")
            !nhcLoaded -> DetailLine("Avisos NHC", if (nhcError) "no disponible" else "cargando…")
            storms.isEmpty() -> DetailLine("Avisos NHC", "sin tormentas activas")
            else -> {
                DetailLine("Avisos NHC", "${storms.size} activa(s)")
                for (s in storms) {
                    Text(
                        "• ${s.name} (${s.classification}, ${s.intensity} kt)",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        Text(detail.attribution, style = MaterialTheme.typography.labelSmall, color = Color(0xFF9FB0C0))
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label + ":", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        Text(value, style = MaterialTheme.typography.labelMedium)
    }
}