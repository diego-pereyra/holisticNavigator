expect fun nowEpochMs(): Long

private fun floorDiv(a: Long, b: Long): Long {
    var q = a / b
    if ((a xor b) < 0 && q * b != a) q--
    return q
}

private data class Civil(val year: Int, val month: Int, val day: Int, val secOfDay: Int)

private fun civilUtc(epochMs: Long): Civil {
    val totalSec = floorDiv(epochMs, 1000L)
    val days = floorDiv(totalSec, 86400L)
    val secOfDay = (totalSec - days * 86400L).toInt()
    val z = days + 719468L
    val era = floorDiv(z, 146097L)
    val doe = z - era * 146097L
    val yoe = (doe - doe / 1460L + doe / 36524L - doe / 146096L) / 365L
    val y = yoe + era * 400L
    val doy = doe - (365L * yoe + yoe / 4L - yoe / 100L)
    val mp = (5L * doy + 2L) / 153L
    val d = doy - (153L * mp + 2L) / 5L + 1L
    val mo = if (mp < 10L) mp + 3L else mp - 9L
    val yr = if (mo <= 2L) y + 1L else y
    return Civil(yr.toInt(), mo.toInt(), d.toInt(), secOfDay)
}

fun yearMonthOf(epochMs: Long): Pair<Int, Int> {
    val c = civilUtc(epochMs)
    return c.year to c.month
}

private fun p2(v: Int) = if (v < 10) "0$v" else "$v"

fun isoUtc(epochMs: Long): String {
    val c = civilUtc(epochMs)
    return "${c.year.toString().padStart(4, '0')}-${p2(c.month)}-${p2(c.day)}" +
        "T${p2(c.secOfDay / 3600)}:${p2((c.secOfDay % 3600) / 60)}:${p2(c.secOfDay % 60)}Z"
}
