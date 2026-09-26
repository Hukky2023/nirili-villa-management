# Nirili Villa Management - Android app

This folder contains the native Android shell for the existing Nirili Villa Management system.

## Architecture

The Android application loads the production Nirili Villa Management URL inside a hardened Android WebView. The website and Android app therefore use the same Cloudflare backend, database, bookings, bills, users and permissions.

Production URL:

`https://nirili-villa.nirili-management.workers.dev`

Application ID:

`com.nirili.villa.management`

The debug APK uses `com.nirili.villa.management.debug` so it can later coexist with a signed Play Store build.

## Requirements

- JDK 17
- Gradle 9.6.0
- Android SDK 36
- Android Gradle Plugin 9.4.1

## Build locally

From `mobile/android`:

```bash
gradle :app:assembleDebug
```

APK output:

`app/build/outputs/apk/debug/app-debug.apk`

## GitHub build

The repository workflow `.github/workflows/android-apk.yml` builds the APK and uploads it as a GitHub Actions artifact.

## Included mobile behavior

- Existing Nirili logins and sessions persist through Android WebView cookies.
- Android back button navigates through the app before closing.
- WhatsApp, Maps, telephone, mail and other external links open in their installed apps.
- Guest passport/photo and PDF inputs can select files from the Android device.
- HTTPS is enforced and SSL errors are rejected.
- Android 16 / API 36 is the target SDK.
- A progress indicator is displayed while pages load.
- Native Firebase Cloud Messaging (FCM) delivers high-priority management alerts while the app is backgrounded or the phone is locked.
- Android 13+ notification permission is requested from the Notifications panel instead of showing `Push unsupported`.
- Notification taps open the relevant Nirili Villa management route inside the app.

## Release signing

The current GitHub workflow intentionally produces a debug APK for testing. A Play Store release must use a private upload keystore stored in GitHub Actions secrets. Never commit a keystore or signing password into this repository.


## Native push notification configuration

The APK reads these GitHub Actions secrets at build time:

- `NIRILI_FIREBASE_APP_ID`
- `NIRILI_FIREBASE_API_KEY`
- `NIRILI_FIREBASE_PROJECT_ID`
- `NIRILI_FIREBASE_SENDER_ID`

The Cloudflare management deployment also needs these server-side secrets for Firebase HTTP v1 delivery:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

The private key must remain a server secret. Do not add the Firebase service-account JSON or private key to this repository.
