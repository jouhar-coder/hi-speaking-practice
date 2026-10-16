# hi Android app (Flutter)

This folder contains the Flutter source for the Android version of hi, a multilingual AI speaking coach. It supports English, Malayalam, French, German, Arabic, Hindi, Japanese, Spanish, Italian, and Korean.

## Prerequisites

- Flutter SDK installed and available in PATH
- Android Studio with Android SDK / platform tools
- An Android phone or emulator
- The hi backend deployed on Render with an OpenAI API key configured

## Generate Android platform files

This repository keeps the app's Dart source and package manifest so the native Android project can be generated with the Flutter SDK:

```bash
cd android_app
flutter create . --platforms=android
flutter pub get
flutter run
```

If Flutter asks to overwrite files, preserve `lib/main.dart` and `pubspec.yaml`.

## Android microphone permission

Open `android/app/src/main/AndroidManifest.xml` and add these permissions directly below the opening `<manifest>` tag:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

The app requests microphone access through Android's speech recognition service. The device's speech recognition engine must have the selected language installed/supported. Text input is also available if speech recognition for a language is unavailable.

## Configure the backend

The app calls:

`https://hi-speaking-practice.onrender.com/api/chat`

In Render, open the `hi-speaking-practice` web service, go to **Environment**, and add:

- `OPENAI_API_KEY` = your secret OpenAI API key
- `OPENAI_MODEL` = a model available to your API project (optional; defaults to `gpt-5.5`)

Keep the API key on the server only. Never put it in this Flutter app, a web page, or GitHub. After saving environment variables, redeploy/restart the Render service. The backend's `/api/health` response reports whether AI is configured.

The free Render service may sleep after inactivity. The first request after sleep can take longer.

## Build an Android APK

```bash
flutter build apk --release
```

The APK is normally written to `build/app/outputs/flutter-apk/app-release.apk`.

## Current MVP limitations

- Conversation history lives only in the current app session.
- Native speech recognition and text-to-speech language availability depends on the Android device.
- The backend's temporary in-memory account store is not production-grade.
- The API includes a basic in-memory per-IP limit; use shared rate limiting, authentication, monitoring, and a persistent database before public scale.
