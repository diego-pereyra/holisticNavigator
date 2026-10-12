import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvm("desktop")

    js {
        useEsModules()
        browser {
            commonWebpackConfig {
                cssSupport { enabled.set(true) }
            }
        }
        binaries.executable()
    }

    sourceSets {
        getByName("commonMain").apply {
            dependencies {
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.ui)
                implementation(compose.components.resources)
                implementation(libs.maplibre.compose)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.kotlinx.coroutines.core)
                implementation(project(":shared"))
            }
        }
        getByName("commonTest").apply {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        getByName("desktopMain").apply {
            dependencies {
                implementation(compose.desktop.currentOs)
            }
        }
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile>().configureEach {
    compilerOptions.jvmTarget.set(JvmTarget.JVM_21)
}

compose.desktop {
    application {
        mainClass = "MainKt"

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "Holistic Navigator"
            packageVersion = "0.1.0"
        }
    }
}
