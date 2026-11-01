# NEON TAKKAR — Security, Crash & Scale Test Report

Date: 1 November 2026 · Scope: the game client (`www/`), Cloud Functions (`functions/`) and Firebase security rules.

## Summary

| Area | How it was tested | Result |
|---|---|---|
| Game rules & logic | 72 automated unit/fuzz tests (`npm test`) | ✅ 72/72 |
| Hacking / cheating | 53 attack scenarios against the **real** rules and functions in the Firebase Emulator (`npm run test:security`) | ✅ 53/53 blocked |
| Fuzzing (random/hostile input) | 5,000 malicious room intents, 300 random Ludo games, 60 random chess games, 200 snake games, 3,000 random-Unicode chat strings | ✅ no crashes. **2 real bugs found and fixed** (see below) |
| XSS (script injection) | Names, chat, character names, match history, sound names set to `<img src=x onerror=…>` across every screen | ✅ never executed. CSP header added |
| Corrupted saved data | 7 kinds of broken or tampered `localStorage` (invalid JSON, `[]`, wrong types, `__proto__`, negative level) | ✅ app always boots. **1 crash found and fixed** |
| Long-session stability | 3-minute monkey test: 857 random taps, 73 screen changes | ✅ 0 errors; JS heap 3 MB → 7 MB, no leak |
| Concurrency | 50 simultaneous online chess matches (100 players) through real functions and rules | ✅ 50/50 finished correctly, server move p50 ≈ 100 ms |
| Matchmaking | 20 / 40 / 60 players pressing Quick Match at the same instant | ✅ 20/20 paired, **0 double-bookings** at every level (bug found and fixed) |
| Server logic speed | Ludo intent validation, single CPU core | ✅ ~200,000 intents/second |

## Bugs found by testing (all fixed)

1. **NaN-balance exploit (security, high).** Sending offline progress with `kind: "__proto__"` made the server write `NaN` coins. `NaN` passes every "not enough coins" check, which meant free shop items. *Fix:* prototype-safe lookups (`Object.hasOwn`, null-prototype catalog), finite-number clamping, and purchases refuse non-finite balances. Covered by fuzz tests and emulator test #8.
2. **Prototype keys as room members (security, medium).** `room.players['__proto__']` resolved to a truthy object inside the intent processor. Rules made it unreachable in practice, but it is now hard-blocked with `Object.hasOwn`.
3. **Quick Match double-booking (correctness, high).** Under simultaneous load a player could be seated in two matches. *Fix:* pairing is a transaction over both players' `matchState` documents.
4. **Quick Match contention (scale, high).** The old queue used one shared document, and every transaction locked the whole queue, so 20 simultaneous players hung. *Fix:* one ticket document per player, and claims lock only two tickets.
5. **Crash on corrupted save (stability, medium).** A save file containing `[]` crashed the app at launch. *Fix:* type-safe merge of saved data over defaults, plus record validation.
6. **Start time `0` treated as missing (logic, low).** `startedAt || now` became `??`.
7. **Snake: prototype direction (robustness, low).** Fixed with `Object.hasOwn`.

## Hardening added during this review

- **One pending intent per player.** `rooms/{code}/intents/{uid}` can't be written while the previous intent is still being processed, which caps per-player load on the backend.
- **Chat, reaction and DM rate limits in security rules.** Each message must be written together with a server-timestamp "rate stamp", and the rules require at least 0.7–0.8 s between messages.
- **Server sets the real chat name**, so players can't impersonate others in chat.
- **Callable rate limits:** friend requests (30/h), room creation (30/h), joins (60/h), invites (60/h), reports (10/h).
- **Anti-farming:** matches shorter than 60 s give no coins, which stops two accounts trading instant wins.
- **One open lobby per host:** creating a new room closes the host's previous lobby.
- **Content-Security-Policy:** only the app's own scripts plus Google's Firebase SDK can run, and `object-src` is `none`.
- **No referrer leakage**, fonts bundled (no third-party requests), no analytics or trackers.

## What the attack tests cover (`tests/emulator/security.mjs`)

- **Economy:** players can't edit their own or others' coins, profile or friends lists, and can't read private data or reports. Purchases, daily rewards, offline sync and guest import are checked and capped on the server. Anonymous guests can't use the synced economy.
- **Rooms:** outsiders can't read, list, chat in or send moves to a room. Players can't write game state, dice, tokens, results or settings, can't act as another player, and can't send unknown intent types. Only the host can change settings or kick.
- **Gameplay:** dice are rolled on the server. Out-of-turn and illegal moves are rejected. Checkmate and results are decided by the server.
- **Chat:** abuse is filtered on the server, impersonation is corrected, spam is blocked, and oversized messages are rejected. Reactions can't carry arbitrary sound IDs. DMs work only between friends.
- **Rate limits** and closing of stale lobbies.

## Will it handle 5 lakh (500,000) players?

**Offline play** (vs computer, pass & play, Snake, studios, shop) runs entirely on each phone. It puts no load on any server, so the number of players doesn't matter.

**Online play** runs on Firebase, which scales automatically, but each product has published limits. Check the current values in the Firebase docs before launch:

| Component | Limit (per Firebase docs) | What we did |
|---|---|---|
| Realtime Database | ~200k simultaneous connections and roughly 1k writes/s per database instance | **Room sharding:** rooms can be spread over many RTDB instances by room code (`RTDB_ROOM_SHARD_URLS`). Presence and DMs stay on the default instance |
| Cloud Functions (v2) | Instances scale automatically; quotas can be raised | `maxInstances` 200 (callables) and 1000 (`onIntent`), 80 concurrent requests per instance |
| Firestore | Scales horizontally; ~1 sustained write/s per document | No shared hot documents: one ticket per player in matchmaking, and per-user docs only |
| Leaderboard | Every view used to be a 50-document query | **Cached leaderboard document**, rebuilt every 15 minutes. One read per view |

**Rough capacity plan.** 5 lakh registered players typically means roughly 10–25k online at peak. If about half are in online matches, the database sees a few thousand game writes per second. One database instance isn't enough for that, so **turn on 6–12 room shards** before a big launch (setup is in the README).

### Honest limitations

- The load tests ran on the **Firebase Emulator** inside a single process. It proves correctness under concurrency (50 parallel matches, 60 simultaneous matchmakers, no wrong results, no double-booking). It can't measure production throughput: above about 40 simultaneous requests the emulator drops connections ("socket hang up"), and no exception in our code was logged.
- **Before a large launch**, deploy to a separate *staging* Firebase project and load-test with real traffic (for example, a few thousand simulated players using `tests/emulator/load.mjs` pointed at staging). This needs a Firebase project and a billing account.
- The Android APK has been built and inspected but not yet run on physical devices. Test on a few low-end Android phones (2–3 GB RAM) before release.
- The Play Store release must be a **signed release build**; debug builds allow WebView debugging.

## How to re-run everything

```bash
cd neon-takkar
npm install
npm test                      # 72 unit + fuzz tests (no network needed)
npm start                     # in another terminal, then:
npm run test:monkey           # 3-minute crash/XSS/corrupt-save browser test (needs Playwright)
# Firebase emulator suite (needs Java + firebase-tools):
(cd functions && npm install) && node scripts/sync-shared.js
npm run emulators             # in another terminal, then:
npm run test:security         # 53 hacking scenarios
npm run test:load             # 50 parallel online matches + 20-player matchmaking
```
