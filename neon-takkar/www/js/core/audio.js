/**
 * Meme sound engine. Every built-in sound is synthesised at runtime with the
 * Web Audio API (plus optional on-device text-to-speech for Hinglish
 * catch-phrases), so the game ships zero third-party audio files and has no
 * licensing issues. Players may add their own audio files (stored on-device).
 */
import { store } from './store.js';
import { idbGet } from './idb.js';

let ctx = null;
let master, sfxGain, musicGain;
const decoded = new Map();

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function applyVolumes() {
  if (!ctx) return;
  const s = store.get().settings;
  sfxGain.gain.value = s.sfx ? s.sfxVol : 0;
  musicGain.gain.value = s.music ? s.musicVol * 0.5 : 0;
}

/* ------------------------- synth building blocks ------------------------- */
function packWave() {
  const p = store.get().equipped.sound_pack;
  return p === 'pack_arcade' ? 'square' : p === 'pack_filmy' ? 'sawtooth' : 'triangle';
}

function tone(freq, start, dur, { type, vol = 0.3, slideTo, attack = 0.01 } = {}) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || packWave();
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

function noise(start, dur, { vol = 0.25, filter = 2000, q = 1, type = 'bandpass' } = {}) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = filter; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(c.currentTime + start);
}

function drum(start, freq = 120, vol = 0.6) {
  tone(freq, start, 0.25, { type: 'sine', vol, slideTo: 40, attack: 0.002 });
  noise(start, 0.06, { vol: vol * 0.3, filter: 3000 });
}

let speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
function say(text, { pitch = 1.1, rate = 1.05 } = {}) {
  const s = store.get().settings;
  if (!speechOk || !s.sfx || !s.speech) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === 'hi-IN') || voices.find((x) => x.lang === 'en-IN');
    if (v) u.voice = v;
    u.lang = v?.lang || 'hi-IN';
    u.pitch = pitch; u.rate = rate;
    u.volume = Math.min(1, s.sfxVol + 0.1);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { speechOk = false; }
}

/* --------------------------- sound library ------------------------------ */
export const SOUND_CATEGORIES = [
  { id: 'funny', name: 'Funny' }, { id: 'sad', name: 'Sad' }, { id: 'victory', name: 'Victory' },
  { id: 'defeat', name: 'Defeat' }, { id: 'surprise', name: 'Surprise' }, { id: 'dice', name: 'Dice' },
  { id: 'custom', name: 'My Uploads' },
];

export const SOUNDS = {
  oye: { cat: 'funny', name: 'Oye Hoye!', emoji: '😜', play() { tone(500, 0, 0.12, { slideTo: 900 }); tone(900, 0.13, 0.18, { slideTo: 600 }); say('Oye hoye!', { pitch: 1.4 }); } },
  kya_baat: { cat: 'funny', name: 'Kya Baat Hai!', emoji: '🤩', play() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.2)); say('Kya baat hai!'); } },
  kaat_diya: { cat: 'funny', name: 'Kaat Diya!', emoji: '😂', play() { noise(0, 0.15, { filter: 5000, vol: 0.4 }); tone(300, 0.05, 0.25, { slideTo: 1200 }); say('Kaat diya! Ha ha ha!', { pitch: 1.3, rate: 1.15 }); } },
  airhorn: { cat: 'funny', name: 'Air Horn', emoji: '📯', play() { for (let i = 0; i < 3; i++) { tone(440, i * 0.22, 0.18, { type: 'sawtooth', vol: 0.25 }); tone(554, i * 0.22, 0.18, { type: 'sawtooth', vol: 0.2 }); } } },
  boing: { cat: 'funny', name: 'Boing', emoji: '🤪', play() { tone(180, 0, 0.45, { type: 'sine', slideTo: 900, vol: 0.4 }); } },
  hahaha: { cat: 'funny', name: 'Ha Ha Ha', emoji: '🤣', play() { [0, 0.16, 0.32, 0.48].forEach((t, i) => tone(380 - i * 25, t, 0.12, { vol: 0.3 })); say('Ha ha ha!', { pitch: 1.5, rate: 1.3 }); } },
  wah_wah: { cat: 'sad', name: 'Wah Wah Wah', emoji: '😢', play() { [392, 370, 349].forEach((f, i) => tone(f, i * 0.35, 0.32, { type: 'sawtooth', vol: 0.18 })); tone(330, 1.05, 0.9, { type: 'sawtooth', vol: 0.18, slideTo: 300 }); } },
  rona_mat: { cat: 'sad', name: 'Bas Kar Pagle', emoji: '😭', play() { tone(600, 0, 0.6, { type: 'sine', slideTo: 200, vol: 0.3 }); say('Bas kar pagle, rulayega kya?', { pitch: 0.9, rate: 0.95 }); } },
  arre_nahi: { cat: 'sad', name: 'Arre Nahi!', emoji: '😩', play() { tone(700, 0, 0.5, { slideTo: 250 }); say('Arre nahi yaar!', { pitch: 0.95 }); } },
  tada: { cat: 'victory', name: 'Ta-Da!', emoji: '🎉', play() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.1, 0.18)); [523, 659, 784, 1046].forEach((f) => tone(f, 0.32, 0.7, { vol: 0.15 })); } },
  dhol: { cat: 'victory', name: 'Dhol Baaje', emoji: '🥁', play() { const p = [0, 0.15, 0.3, 0.38, 0.45, 0.6, 0.75, 0.83, 0.9]; p.forEach((t, i) => drum(t, i % 3 === 0 ? 90 : 160, 0.5)); say('Jeet gaye bhai!', { pitch: 1.2 }); } },
  jeet: { cat: 'victory', name: 'Apna Time Aa Gaya', emoji: '🏆', play() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3)); say('Apna time aa gaya!', { pitch: 1.1 }); } },
  agli_baar: { cat: 'defeat', name: 'Agli Baar Pakka', emoji: '🥲', play() { [330, 294, 262].forEach((f, i) => tone(f, i * 0.3, 0.3, { vol: 0.2 })); say('Koi baat nahi, agli baar pakka!', { pitch: 1 }); } },
  sad_trombone: { cat: 'defeat', name: 'Sad Trombone', emoji: '🎺', play() { [311, 294, 277].forEach((f, i) => tone(f, i * 0.4, 0.38, { type: 'sawtooth', vol: 0.18 })); tone(262, 1.2, 1, { type: 'sawtooth', vol: 0.2, slideTo: 240 }); } },
  kyaaa: { cat: 'surprise', name: 'Kyaaa?!', emoji: '😱', play() { tone(300, 0, 0.35, { slideTo: 1400, vol: 0.3 }); say('Kyaaa?!', { pitch: 1.6 }); } },
  dun_dun: { cat: 'surprise', name: 'Dun Dun Dunnn', emoji: '😨', play() { tone(196, 0, 0.3, { type: 'sawtooth', vol: 0.25 }); tone(185, 0.35, 0.3, { type: 'sawtooth', vol: 0.25 }); tone(147, 0.7, 1.1, { type: 'sawtooth', vol: 0.28 }); drum(0.7, 60, 0.6); } },
  whoosh: { cat: 'surprise', name: 'Whoosh', emoji: '💨', play() { noise(0, 0.5, { filter: 900, q: 0.6, vol: 0.4 }); } },
  dice_roll: { cat: 'dice', name: 'Dice Roll', emoji: '🎲', play() { for (let i = 0; i < 7; i++) noise(i * 0.06, 0.04, { filter: 2500 + Math.random() * 2000, vol: 0.35, q: 4 }); } },
  chakka: { cat: 'dice', name: 'Chakka!', emoji: '6️⃣', play() { tone(660, 0, 0.12); tone(990, 0.1, 0.25); say('Chakka!', { pitch: 1.3, rate: 1.2 }); } },
  tick: { cat: 'dice', name: 'Tick', emoji: '👆', play() { tone(1200, 0, 0.05, { type: 'square', vol: 0.12 }); } },
  pop: { cat: 'dice', name: 'Pop', emoji: '🫧', play() { tone(400, 0, 0.08, { type: 'sine', slideTo: 1000, vol: 0.3 }); } },
};

/** Game events that sounds can be assigned to (Sound Studio). */
export const EVENTS = [
  { id: 'dice', name: 'Dice roll', def: 'dice_roll' },
  { id: 'six', name: 'Rolled a six', def: 'chakka' },
  { id: 'capture', name: 'You capture a goti', def: 'kaat_diya' },
  { id: 'captured', name: 'Your goti is captured', def: 'rona_mat' },
  { id: 'nearWin', name: 'Near win', def: 'kyaaa' },
  { id: 'home', name: 'Goti reaches home', def: 'kya_baat' },
  { id: 'victory', name: 'Victory', def: 'dhol' },
  { id: 'defeat', name: 'Defeat', def: 'agli_baar' },
  { id: 'check', name: 'Chess check', def: 'dun_dun' },
  { id: 'chessCapture', name: 'Chess capture', def: 'oye' },
  { id: 'move', name: 'Move / tap', def: 'pop' },
];

export function soundFor(eventId) {
  const a = store.get().sounds.assign[eventId];
  return a || EVENTS.find((e) => e.id === eventId)?.def;
}

export async function playSound(id) {
  const s = store.get().settings;
  if (!s.sfx || !id) return;
  if (!ac()) return;
  if (id.startsWith('custom:')) {
    try {
      let buf = decoded.get(id);
      if (!buf) {
        const blob = await idbGet('audio:' + id.slice(7));
        if (!blob) return;
        buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        decoded.set(id, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(sfxGain);
      src.start();
      src.stop(ctx.currentTime + Math.min(buf.duration, 6));
    } catch (e) { console.warn('custom sound failed', e); }
    return;
  }
  SOUNDS[id]?.play();
}

export function playEvent(eventId) {
  return playSound(soundFor(eventId));
}

export function forgetDecoded(id) { decoded.delete(id); }

/* -------------------------------- music --------------------------------- */
let musicTimer = null;
const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
export function startMusic() {
  const c = ac();
  if (!c || musicTimer) return;
  let step = 0;
  const beat = () => {
    if (!store.get().settings.music) return;
    const t = c.currentTime + 0.05;
    const root = [0, 3, 4, 2][Math.floor(step / 8) % 4];
    const note = SCALE[(root + [0, 2, 4, 2, 5, 4, 2, 1][step % 8]) % SCALE.length];
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.4);
    if (step % 4 === 0) {
      const b = c.createOscillator(); const bg = c.createGain();
      b.type = 'sine'; b.frequency.value = SCALE[root] / 2;
      bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.18, t + 0.03); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      b.connect(bg); bg.connect(musicGain); b.start(t); b.stop(t + 1.3);
    }
    step++;
  };
  musicTimer = setInterval(beat, 320);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

/* ------------------------------- haptics -------------------------------- */
export function vibrate(ms = 30) {
  if (!store.get().settings.vibration) return;
  const H = window.Capacitor?.Plugins?.Haptics;
  if (H) { H.impact({ style: ms > 60 ? 'HEAVY' : 'LIGHT' }).catch(() => {}); return; }
  navigator.vibrate?.(ms);
}

/** Unlock audio on first user gesture (autoplay policy). */
export function unlockAudioOnGesture() {
  const go = () => {
    ac();
    if (store.get().settings.music) startMusic();
    window.removeEventListener('pointerdown', go);
  };
  window.addEventListener('pointerdown', go);
}
