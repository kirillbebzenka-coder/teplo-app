#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
teplo_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
teplo_tools="$teplo_sdk/build-tools/35.0.0"
teplo_jar="$teplo_sdk/platforms/android-35/android.jar"
test -f "$teplo_jar"
test -x "$teplo_tools/aapt2"
teplo_out="$PWD/build"
mkdir -p "$teplo_out/compiled" "$teplo_out/classes" "$teplo_out/dex" "$teplo_out/private"
"$teplo_tools/aapt2" compile --dir res -o "$teplo_out/compiled/resources.zip"
"$teplo_tools/aapt2" link -o "$teplo_out/resources.apk" --manifest AndroidManifest.xml -I "$teplo_jar" "$teplo_out/compiled/resources.zip"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$teplo_jar" -d "$teplo_out/classes" src/ua/teplo/customer/test/MainActivity.java
jar cf "$teplo_out/classes.jar" -C "$teplo_out/classes" .
"$teplo_tools/d8" --min-api 26 --lib "$teplo_jar" --output "$teplo_out/dex" "$teplo_out/classes.jar"
cp "$teplo_out/resources.apk" "$teplo_out/unsigned.apk"
(cd "$teplo_out/dex" && zip -q -u "$teplo_out/unsigned.apk" classes.dex)
"$teplo_tools/zipalign" -f -p 4 "$teplo_out/unsigned.apk" "$teplo_out/aligned.apk"
# An ephemeral TEST key only. Never use this package/signature as a store release.
keytool -genkeypair -keystore "$teplo_out/private/test.jks" -storepass android -keypass android -alias teplo-test -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=TEPLO Customer Test" -noprompt
"$teplo_tools/apksigner" sign --ks "$teplo_out/private/test.jks" --ks-key-alias teplo-test --ks-pass pass:android --key-pass pass:android --out "$teplo_out/TEPLO-customer-test-v82.apk" "$teplo_out/aligned.apk"
"$teplo_tools/apksigner" verify --verbose --print-certs "$teplo_out/TEPLO-customer-test-v82.apk" > "$teplo_out/verification.txt"
"$teplo_tools/aapt2" dump badging "$teplo_out/TEPLO-customer-test-v82.apk" >> "$teplo_out/verification.txt"
"$teplo_tools/zipalign" -c -p 4 "$teplo_out/TEPLO-customer-test-v82.apk"
sha256sum "$teplo_out/TEPLO-customer-test-v82.apk" > "$teplo_out/SHA256SUMS.txt"
cat "$teplo_out/verification.txt"
