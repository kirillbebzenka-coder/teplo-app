# TEPLO customer APK — test shell

Installable Android package `ua.teplo.customer.test`, Android 8+ (API 26), target API 35.
Opens the existing HTTPS customer app; needs internet. Web updates appear without
rebuilding the APK. Native push, offline ordering and store publication are outside
this test. Real delivery/payment guards remain enforced by the existing backend.

Only INTERNET permission is declared. JavaScript and DOM storage are enabled for the
existing app. No JavaScript/native bridge, file/content access, HTTP, mixed content,
debugging or third-party cookies. External HTTPS, phone and mail links use Android
intents. Only the four customer page paths remain inside the WebView.

`bash android/customer/build.sh` builds using JDK and preinstalled SDK platform/build
tools 35. No Gradle, dependency downloads, license acceptance or server changes.
The build verifies APK signature, alignment and manifest and uploads only APK and
verification metadata. The generated private test key is never uploaded or committed.
Its signature is for this test only; a future build with another key requires removing
the previous test install. A production signing/release process must be set up separately.

Physical-device login, keyboard, rotation/back and test checkout still need verification.
