import androidx.compose.ui.window.application

fun main() = application {
    androidx.compose.ui.window.Window(
        onCloseRequest = ::exitApplication,
        title = "Holistic Navigator",
    ) {
        App()
    }
}
