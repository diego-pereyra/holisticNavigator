import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import kotlinx.browser.document
import org.jetbrains.skiko.wasm.onWasmReady
import org.maplibre.compose.browser.installMapLibreCompose

@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    registerServiceWorker()
    onWasmReady {
        installMapLibreCompose()
        ComposeViewport(viewportContainer = document.body!!) {
            HolisticApp()
        }
    }
}