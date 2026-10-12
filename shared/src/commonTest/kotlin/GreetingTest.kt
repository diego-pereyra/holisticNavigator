import kotlin.test.Test
import kotlin.test.assertTrue

class GreetingTest {
    @Test
    fun greetingIsNotBlank() {
        assertTrue(sharedGreeting().isNotBlank())
    }
}
