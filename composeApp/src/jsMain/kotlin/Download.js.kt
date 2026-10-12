import kotlinx.browser.document
import org.w3c.dom.HTMLAnchorElement

actual fun downloadText(filename: String, mime: String, text: String) {
    val enc = js("encodeURIComponent")
    val a = document.createElement("a") as HTMLAnchorElement
    a.href = "data:$mime;charset=utf-8," + (enc(text) as String)
    a.download = filename
    a.click()
}
