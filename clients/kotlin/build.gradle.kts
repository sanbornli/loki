plugins {
    kotlin("jvm") version "1.9.24"
    `java-library`
    `maven-publish`
    signing
}

group = "cc.lokiplay"
version = "0.2.2"

repositories { mavenCentral() }

kotlin { jvmToolchain(17) }

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions.jvmTarget = "1.8"
}

dependencies {
    testImplementation(kotlin("test-junit5"))
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test { useJUnitPlatform() }

java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
    withSourcesJar()
    withJavadocJar()
}

publishing {
    repositories {
        val repositoryUrl = providers.environmentVariable("MAVEN_REPOSITORY_URL")
        if (repositoryUrl.isPresent) {
            maven {
                name = "release"
                url = uri(repositoryUrl.get())
                credentials {
                    username = providers.environmentVariable("MAVEN_USERNAME").orNull
                    password = providers.environmentVariable("MAVEN_PASSWORD").orNull
                }
            }
        }
    }
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            pom {
                name.set("Loki SDK for Kotlin")
                description.set("Headless protocol-v1 Loki client")
                url.set("https://github.com/sanbornli/loki")
                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }
                scm { url.set("https://github.com/sanbornli/loki") }
                developers {
                    developer {
                        id.set("lokiplay")
                        name.set("Loki Play contributors")
                    }
                }
            }
        }
    }
}

signing {
    val key = providers.environmentVariable("MAVEN_SIGNING_KEY")
    val password = providers.environmentVariable("MAVEN_SIGNING_PASSWORD")
    if (key.isPresent) useInMemoryPgpKeys(key.get(), password.orNull)
    sign(publishing.publications)
}
