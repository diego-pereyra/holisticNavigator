expect fun pickTextFile(accept: String, onResult: (name: String, content: String) -> Unit)

expect fun saveStore(key: String, value: String)

expect fun loadStore(key: String): String?
