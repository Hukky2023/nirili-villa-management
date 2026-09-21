# Nirili Villa Mobile

Native Android and iOS client for the existing Nirili Villa Management system.

## Architecture

The mobile app uses React Native + Expo and opens the production Nirili Villa management application inside a hardened native WebView. The existing Cloudflare Worker/D1 application remains the source of truth, so Android, iOS and the web dashboard all use the same bookings, rooms, bills, restaurant, excursion, transport and user data.

Default backend:

`https://nirili-villa.nirili-management.workers.dev`

Override it for testing with:

```bash
EXPO_PUBLIC_HOTEL_SYSTEM_URL=https://your-test-host.example npm start
```

## Local test

Requires Node.js 22.13+.

```bash
cd mobile
npm install
npm run typecheck
npm run doctor
npm start
```

For native projects:

```bash
npm run prebuild
npm run android
# macOS only:
npm run ios
```

## Android release

The EAS `preview` profile produces an installable APK for internal testing. The `production` profile produces an Android App Bundle for Google Play.

## iOS release

The iOS bundle identifier is `com.nirili.villa`. App Store/TestFlight signing requires an Apple Developer account. The repository CI can validate that the iOS native project is generated correctly, but a signed store build still requires Apple credentials.

## Native behaviour included

- persistent login cookies inside the WebView
- Android hardware back-button navigation
- iOS swipe-back navigation
- file and camera upload permissions
- external phone, mail, WhatsApp and map links open in the correct native app
- loading and offline/error recovery screen
- tablet support
- one shared live backend/database
