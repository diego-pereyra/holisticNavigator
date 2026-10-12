import kotlinx.browser.document
import kotlinx.browser.window
import org.w3c.dom.HTMLInputElement
import org.w3c.files.FileReader

actual fun pickTextFile(accept: String, onResult: (name: String, content: String) -> Unit) {
    val input = document.createElement("input") as HTMLInputElement
    input.type = "file"
    input.accept = accept
    input.style.display = "none"
    input.onchange = {
        val files = input.files
        val file = if (files != null && files.length > 0) files.item(0) else null
        if (file != null) {
            val reader = FileReader()
            reader.onload = {
                val content = reader.result
                if (content is String) onResult(file.name, content)
                null
            }
            reader.readAsText(file)
        }
        null
    }
    input.click()
}

actual fun saveStore(key: String, value: String) {
    window.localStorage.setItem(key, value)
}

actual fun loadStore(key: String): String? = window.localStorage.getItem(key)
