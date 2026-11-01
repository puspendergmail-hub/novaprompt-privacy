# NEON TAKKAR 🎲♛

**Premium Indian Meme Ludo & Chess.** Play • Laugh • Compete • Win.

A dark-neon mobile game built with HTML5/CSS/JavaScript and packaged for Android with Capacitor.
Offline play works with no login and no internet. Online play (Google Sign-In, private rooms, friends, chat, leaderboards) runs on Firebase with a server-authoritative Cloud Functions backend.

---

## What's inside

| Area | Status | Notes |
|---|---|---|
| **Meme Ludo** | ✅ Full rules | 2/3/4 players, six to unlock, safe stars & start cells, captures, home column, exact roll to finish, extra turn on 6/capture/home, three-sixes forfeit, winner detection |
| Ludo modes | ✅ | vs Computer (Easy/Medium/Hard), Pass & Play (mix humans + bots), Tournament, Online rooms (2 or 4) |
| Meme reactions | ✅ | Capture → funny sticker + sound; captured → crying sticker; six, near-win, home, victory and defeat reactions; quick emoji reactions |
| **Neon Chess** | ✅ Full FIDE rules | Legal-move validation, check/checkmate, stalemate, castling, en passant, promotion choice, 50-move, threefold repetition, insufficient material |
| Chess extras | ✅ | AI Easy/Medium/Hard (alpha-beta + quiescence, Web Worker), move history (SAN), chess clock, undo (offline), hints, piece sets (Neon King, Neon Queen, Warrior Knight, Custom Rook/Bishop/Pawn), 4 board themes, move animations |
| **Character Studio** | ✅ | Gallery or camera, drag/pinch crop, zoom, rotate, background removal, circular transparent PNG, frames, effects, name, preview, up to 12 saved characters. Used as the profile avatar **and rendered into the Ludo goti sprite** |
| **Goti Studio** | ✅ | Colour, faces (meme/animal/cartoon/flag/your character), hats & crowns, frames, glow, trails, victory effects, live preview |
| **Meme Sound Studio** | ✅ | 21 original synthesised sounds in 6 categories plus Hinglish voice lines (device TTS), assign any sound to 11 game events, upload your own audio (size/length checked, ownership confirmation), volume, mute, restore defaults |
| Shop & unlocks | ✅ | 69 cosmetic items: skins, hats, frames, trails, dice, Ludo/Chess boards, piece sets, sound packs, profile frames, characters. Coins/diamonds/XP-level gates. Cosmetic only, so no pay-to-win |
| Rewards | ✅ | 7-day login calendar with streaks, 3 daily missions, 11 achievements, level-up bonuses |
| **World Map** | ✅ | Hand-built SVG neon city (roads, river, bridges, mountains, parks, castle, stadium, island) with pan/pinch/zoom camera, fly-to animation, drifting clouds, shimmering water, glowing beacons, and level-gated locations |
| Tournament Stadium | ✅ | 3-round knockout cup (Ludo or Chess) vs Easy → Medium → Hard bots |
| **Accounts** | ✅ code, ⚠️ needs Firebase | Play as a guest, or create an account with email + password (or Google). A guest can create an account any time from Settings or Profile, and their progress (coins, diamonds, level, items) moves into the new account once, with server-side caps. Login, password reset and logout are included |
| Profile / Settings | ✅ | Stats, achievements, history, name/avatar/frame edit, Player ID; music/SFX/voice/vibration, volumes, English/Hindi, graphics quality, blocked list, logout, delete account |
| **Online multiplayer** | ✅ code, ⚠️ needs your Firebase project | Private rooms with codes, WhatsApp share, friend invites, quick match, ready/start, host settings (mode, board theme, sound pack, clock), presence, reconnection, turn timers, room chat, reactions |
| Social | ✅ code, ⚠️ needs Firebase | Friends by Player ID, requests, online status, recent players, DMs, block and report, chat filter (client + server) |
| Anti-cheat | ✅ | Clients only send *intents*. Cloud Functions validate every move with the same engine, roll dice with `crypto`, compute results and award currency. Security rules block client writes to state/currency |

> **Honest limits.** Online features need a Firebase project (yours) and can't run until you add `firebase-config.js`. The code paths are written and the server rules are unit-tested, but they haven't been exercised against a live Firebase project. Nearby Wi-Fi/Bluetooth play isn't implemented yet; the transport is isolated in `net/` so it can be added. Real-money purchases (Google Play Billing) aren't included; everything is earned in-game.

---

## Project structure

```
neon-takkar/
├── www/                      # the game (Capacitor webDir)
│   ├── index.html, css/style.css, fonts/ (bundled, OFL), assets/
│   └── js/
│       ├── app.js            # boot, global invites
│       ├── firebase-config.js# ← paste your Firebase web config here
│       ├── engine/           # PURE rules, shared with the server
│       │   ├── ludo.js       # Ludo rules + AI
│       │   ├── chess.js      # Chess rules + AI (perft-verified)
│       │   ├── chessWorker.js
│       │   ├── room.js       # authoritative online room protocol
│       │   └── moderation.js # chat/name filter
│       ├── core/             # store, audio, sprites, router, UI, catalog, i18n
│       ├── screens/          # every screen (home, ludo, chess, studios, shop, map…)
│       └── net/online.js     # Firebase client (lazy-loaded)
├── functions/                # Cloud Functions (Node 20)
│   ├── index.js              # callables + RTDB triggers
│   └── lib/economy.js, rooms.js
├── database.rules.json, firestore.rules, firestore.indexes.json, firebase.json
├── android/                  # Capacitor Android project
├── tests/                    # node:test suites (engines, protocol, economy, lobby, moderation)
└── scripts/                  # serve.js, sync-shared.js, android-assets.cjs
```

---

## Run it locally (browser)

```bash
cd neon-takkar
npm install
npm start            # http://localhost:5173  (use a phone-sized viewport)
npm test             # 51 automated tests
```

The tests cover:
- chess move generation via **perft** on 4 standard positions (incl. Kiwipete: 97,862 nodes at depth 3)
- mate/stalemate/castling/en passant/promotion/repetition, and the AI finding mate-in-one
- the Ludo rules (unlock, captures, safe cells, exact finish, three sixes, near-win), plus full 4-AI games played to completion
- the server protocol (turn ownership, server dice, clocks, timeouts, forfeits) and the economy (purchases, daily streaks, offline-sync caps)

---

## Build the Android APK

Requirements: **Node 18+**, **JDK 21**, **Android SDK** (platform 35, build-tools 35). Android Studio provides all of these.

```bash
cd neon-takkar
npm install
npx cap sync android          # copies www/ into the Android project
cd android
./gradlew assembleDebug       # → app/build/outputs/apk/debug/app-debug.apk
```

Or open it in Android Studio with `npx cap open android` and press ▶ Run.

**Release build (Play Store):**
1. Create a keystore: `keytool -genkey -v -keystore neon-takkar.jks -alias neontakkar -keyalg RSA -keysize 2048 -validity 10000`
2. In Android Studio choose *Build → Generate Signed App Bundle / APK*, or configure `signingConfigs` in `android/app/build.gradle`.
3. Run `./gradlew bundleRelease` to get an `.aab` for Play Console.

After changing anything in `www/`, run `npx cap sync android` again. To regenerate icons and splash screens from `www/assets/icon.svg`, run `node scripts/android-assets.cjs` (needs Playwright).

---

## Firebase setup (online play)

1. **Create a project** at <https://console.firebase.google.com> and upgrade to the **Blaze** plan (Cloud Functions requires it; light usage is free-tier).
2. **Authentication**: enable the **Email/Password**, **Google** and **Anonymous** providers.
3. **Firestore**: create a database in production mode.
4. **Realtime Database**: create one, e.g. in `asia-southeast1`. If you pick another region, set `RTDB_REGION` when deploying functions.
5. **Web app**: in *Project settings → Your apps → Add web app*, copy the config into `www/js/firebase-config.js`:
   ```js
   export const firebaseConfig = { apiKey: '…', authDomain: '…', databaseURL: 'https://…firebasedatabase.app', projectId: '…', appId: '…' };
   ```
   Also add your hosting domain (or `localhost`) under *Authentication → Settings → Authorized domains*.
6. **Deploy the backend**:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add            # select your project
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore,database
   ```
   `predeploy` copies `www/js/engine/*` into `functions/shared/`, so the server validates moves with exactly the same code as the client.
7. **Google Sign-In inside the Android app**: the WebView can't open Google's popup, so use the native plugin:
   ```bash
   npm i @capacitor-firebase/authentication@^7
   ```
   - Add an **Android app** in Firebase with package `com.neontakkar.game`, add your SHA-1 (`cd android && ./gradlew signingReport`), and download `google-services.json` into `android/app/`.
   - `capacitor.config.json` already configures the plugin (`skipNativeAuth: true`; the JS SDK signs in with the native Google credential).
   - Run `npx cap sync android` and rebuild.

   The plugin isn't installed by default because it crashes at startup without `google-services.json`. Without it, players can still play online as anonymous guests.

### Online architecture

```
client ──push intent──► RTDB rooms/{code}/intents/{id}
                              │  (rules: only room members, uid must match)
                              ▼
                 Cloud Function onIntent (transaction)
                 processIntent(room, intent) ← shared engine
                 dice = crypto.randomInt
                              │
                              ▼
     rooms/{code}.state / lastEvents / clocks / result  ──► all clients (onValue)
                              │ status = over
                              ▼
          settleMatch → Firestore users/{uid} coins, xp, stats; matches/; recent/
```

- **Reconnection.** RTDB resyncs automatically. Room presence uses `onDisconnect`, and a reconnecting player keeps their seat.
- **Turn timers.** Ludo turns last 30s. Any client may request a `timeout`, which the server verifies against its own clock. Three missed turns in a row is a forfeit. Chess clocks are tracked on the server.
- **Offline progress sync.** Coins and XP earned offline while signed in are queued, then applied by `syncOfflineProgress` with per-entry and daily caps, because offline results can't be verified.

---

## Content & safety

- All built-in audio is synthesised at runtime with the Web Audio API, so the game ships no third-party sound files. Voice lines use the device's text-to-speech.
- Uploaded photos and sounds stay **on the device** (IndexedDB) and are never uploaded. Uploading requires an ownership/content confirmation.
- Chat is filtered on the client and filtered again by Cloud Functions (English and Hinglish abuse, links, phone numbers). Players can block and report, and reports go to the Firestore `reports` collection for moderators.
- Fonts: Baloo 2 and Russo One (SIL OFL 1.1), bundled for offline use.
- The home artwork in `www/assets/` was cropped from the project's concept art.

## Privacy

See `www/privacy.html` (also reachable from Settings → Privacy Policy).
