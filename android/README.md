# Nirili Villa Management Android app

Native Android WebView wrapper for the Nirili Villa Management system with Firebase Cloud Messaging (FCM).

## Firebase

The Android package is `com.nirili.villa.management` and is registered with Firebase project `nirili-villa-management`.

The Firebase Admin service-account private key must never be added to this repository. Server-side FCM credentials belong in protected deployment secrets.

## Web app URL

The wrapper loads `https://nirili-villa.nirili-management.workers.dev`.

## Push registration

After a staff/admin user is signed in, the Android wrapper injects a same-origin request to `/api/admin-push` with the current FCM token. The existing web backend associates that token with the authenticated account.

FCM data messages are rendered by `NiriliFirebaseMessagingService` using notification channel `nirili_management`. Tapping a notification opens the path supplied in the FCM `url` data field.

## Build

Open the `android` directory in Android Studio, allow Gradle sync to finish, and build/install the app. Android 13+ users will be prompted for notification permission.
