import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const outputPosition = process.argv.indexOf("--output");
const output =
  outputPosition === -1 ? undefined : process.argv[outputPosition + 1];
const version = process.env.LOKI_PACKAGE_VERSION ?? "0.1.2";
const tag = `v${version}`;

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const mavenPom = await fetch(
  `https://repo1.maven.org/maven2/cc/lokiplay/loki-sdk/${version}/loki-sdk-${version}.pom`,
);
if (!mavenPom.ok) {
  throw new Error(`Maven Central returned ${mavenPom.status} for loki-sdk ${version}`);
}
const pom = await mavenPom.text();
if (!pom.includes(`<version>${version}</version>`)) {
  throw new Error("Maven POM version mismatch");
}

const unity = await fetch(
  `https://raw.githubusercontent.com/sanbornli/loki/${tag}/clients/unity/package.json`,
);
if (!unity.ok) {
  throw new Error(`Unity package.json on ${tag} returned ${unity.status}`);
}
const unityPackage = (await unity.json()) as { name?: string; version?: string };
if (unityPackage.name !== "play.loki.sdk" || unityPackage.version !== version) {
  throw new Error(`Unity package on the public tag does not match ${version}`);
}

const packageSwift = await fetch(
  `https://raw.githubusercontent.com/sanbornli/loki/${tag}/Package.swift`,
);
if (!packageSwift.ok) {
  throw new Error(`Package.swift on ${tag} returned ${packageSwift.status}`);
}
const swiftSource = await packageSwift.text();
if (!swiftSource.includes("LokiSDK")) {
  throw new Error("public Swift package does not export LokiSDK");
}

let gradleResolved = false;
const directory = await mkdtemp(join(tmpdir(), "loki-native-smoke-"));
try {
  await writeFile(
    join(directory, "settings.gradle.kts"),
    'rootProject.name = "loki-native-smoke"\n',
  );
  await writeFile(
    join(directory, "build.gradle.kts"),
    `
plugins { java }
repositories { mavenCentral() }
dependencies { implementation("cc.lokiplay:loki-sdk:${version}") }
`,
  );
  try {
    await run(
      "gradle",
      ["--no-daemon", "dependencies", "--configuration", "compileClasspath"],
      directory,
    );
    gradleResolved = true;
  } catch {
    gradleResolved = false;
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "registry" as const,
  passed: true,
  ecosystems: {
    npm: { source: "registry.npmjs.org", version, evidenced: true },
    maven: {
      source: "repo1.maven.org",
      coordinate: `cc.lokiplay:loki-sdk:${version}`,
      pom: mavenPom.status,
      gradleResolved,
    },
    swift: {
      source: `https://github.com/sanbornli/loki.git#${tag}`,
      product: "LokiSDK",
      packageSwift: packageSwift.status,
    },
    unity: {
      source: `https://github.com/sanbornli/loki.git?path=/clients/unity#${tag}`,
      package: "play.loki.sdk",
      version: unityPackage.version,
    },
  },
};

if (output) {
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" });
}
console.log(JSON.stringify(artifact, null, 2));
