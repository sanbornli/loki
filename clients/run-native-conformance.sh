#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
shared="$repo_root/packages/protocol/fixtures/conformance.json"

python3 -m json.tool "$shared" >/dev/null
cmp "$shared" "$repo_root/clients/swift/Tests/LokiSDKTests/Fixtures/conformance.json"
cmp "$shared" "$repo_root/clients/kotlin/src/test/resources/conformance.json"
cmp "$shared" "$repo_root/clients/unity/Tests/Fixtures/conformance.json"
echo "Native fixture copies match packages/protocol/fixtures/conformance.json"

if command -v swift >/dev/null 2>&1; then
  swift test --package-path "$repo_root/clients/swift"
else
  echo "SKIP Swift: swift is unavailable"
fi

if [ -x "$repo_root/clients/kotlin/gradlew" ]; then
  "$repo_root/clients/kotlin/gradlew" -p "$repo_root/clients/kotlin" test
elif command -v gradle >/dev/null 2>&1; then
  gradle -p "$repo_root/clients/kotlin" test
else
  echo "SKIP Kotlin: Gradle is unavailable"
fi

echo "Unity EditMode tests require a Unity test project; see clients/unity/README.md"
