actual fun pickTextFile(accept: String, onResult: (name: String, content: String) -> Unit) {
    println("HN: pickTextFile($accept) no soportado en desktop")
}

actual fun saveStore(key: String, value: String) {}

actual fun loadStore(key: String): String? = null
