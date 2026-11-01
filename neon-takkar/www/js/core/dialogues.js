/**
 * Original filmy-style dialogues (newly written — not quotes from real films).
 * Shown as a subtitle bubble and spoken with the phone's text-to-speech.
 * `hi` is the Devanagari version so Hindi TTS voices pronounce it naturally;
 * when no Hindi voice is installed the Roman text is spoken instead.
 */
import { store } from './store.js';
import { el, esc } from './dom.js';

export const DIALOGUE_CATEGORIES = [
  { id: 'start', name: 'Game Start', icon: '⏳' },
  { id: 'win', name: 'Level Up / Win', icon: '🏆' },
  { id: 'lose', name: 'Lose / Game Over', icon: '💀' },
  { id: 'boss', name: 'Boss Fight', icon: '👹' },
  { id: 'lowHealth', name: 'Low Health', icon: '❤️' },
  { id: 'shop', name: 'Coins / Shop', icon: '💰' },
  { id: 'npc', name: 'Funny NPC Lines', icon: '🤡' },
];

export const DIALOGUES = {
  start: [
    { text: 'Kahani abhi shuru hui hai, hero ne abhi chai bhi nahi pi', hi: 'कहानी अभी शुरू हुई है, हीरो ने अभी चाय भी नहीं पी' },
    { text: 'Loading ho raha hai… jaise sasural se rishta', hi: 'लोडिंग हो रहा है… जैसे ससुराल से रिश्ता' },
    { text: 'Taiyaar ho jao, aaj toh full drama hoga', hi: 'तैयार हो जाओ, आज तो फुल ड्रामा होगा' },
  ],
  win: [
    { text: 'Aaj mera din hai, kal ka pata nahi', hi: 'आज मेरा दिन है, कल का पता नहीं' },
    { text: 'Haar ke jeetne wale ko… level up kehte hain', hi: 'हार के जीतने वाले को… लेवल अप कहते हैं' },
    { text: 'Mummy dekho, main game me topper ban gaya!', hi: 'मम्मी देखो, मैं गेम में टॉपर बन गया!' },
    { text: 'Jalwa hai apna, WiFi slow hai toh kya', hi: 'जलवा है अपना, वाईफाई स्लो है तो क्या' },
    { text: 'Ye jeet meri nahi, mere thumb ki hai', hi: 'ये जीत मेरी नहीं, मेरे थंब की है' },
    { text: 'Boss ko bolo, naya boss aa gaya hai', hi: 'बॉस को बोलो, नया बॉस आ गया है' },
  ],
  lose: [
    { text: 'Main gir gaya… par style me gira', hi: 'मैं गिर गया… पर स्टाइल में गिरा' },
    { text: 'Haar gaya, par haar mana nahi, bas ek baar aur', hi: 'हार गया, पर हार माना नहीं, बस एक बार और' },
    { text: 'Ye sab kismat ka khel hai, aur kismat offline thi', hi: 'ये सब किस्मत का खेल है, और किस्मत ऑफलाइन थी' },
    { text: 'Aaj ke liye itna hi, kal phir aunga', hi: 'आज के लिए इतना ही, कल फिर आऊंगा' },
    { text: 'Lagta hai server ne dhokha diya', hi: 'लगता है सर्वर ने धोखा दिया' },
    { text: 'Bas ek galti… aur pura level gaya', hi: 'बस एक गलती… और पूरा लेवल गया' },
  ],
  boss: [
    { text: 'Tu bada boss hoga, main bhi ghar ka chhota beta hoon', hi: 'तू बड़ा बॉस होगा, मैं भी घर का छोटा बेटा हूं' },
    { text: 'Itni aasaani se nahi maanunga, mummy ki kasam', hi: 'इतनी आसानी से नहीं मानूंगा, मम्मी की कसम' },
    { text: 'Teri health bar meri saas ki patience jaisi hai, khatam hone wali', hi: 'तेरी हेल्थ बार मेरी सास की पेशेंस जैसी है, खत्म होने वाली' },
    { text: 'Darr ke aage combo hai', hi: 'डर के आगे कॉम्बो है' },
    { text: 'Aaj ya toh tu nahi, ya mera phone charging pe', hi: 'आज या तो तू नहीं, या मेरा फोन चार्जिंग पे' },
  ],
  lowHealth: [
    { text: 'Abhi zinda hoon, bas thoda sa', hi: 'अभी ज़िंदा हूं, बस थोड़ा सा' },
    { text: 'Ek potion de do, aashirwad milega', hi: 'एक पोशन दे दो, आशीर्वाद मिलेगा' },
    { text: 'Lagta hai ab mummy ka haldi doodh chahiye', hi: 'लगता है अब मम्मी का हल्दी दूध चाहिए' },
  ],
  shop: [
    { text: 'Paisa hi paisa hoga… agar ads dekhoge', hi: 'पैसा ही पैसा होगा… अगर ऐड्स देखोगे' },
    { text: 'Itna mehenga? Ye skin hai ya sona?', hi: 'इतना महंगा? ये स्किन है या सोना?' },
    { text: 'Bhaiya thoda discount, regular customer hoon', hi: 'भैया थोड़ा डिस्काउंट, रेगुलर कस्टमर हूं' },
    { text: 'Coins khatam, sapne baaki hain', hi: 'कॉइन्स खत्म, सपने बाकी हैं' },
  ],
  npc: [
    { text: 'Mujhse mat poochho, main toh background character hoon', hi: 'मुझसे मत पूछो, मैं तो बैकग्राउंड कैरेक्टर हूं' },
    { text: 'Beta, quest baad me, pehle khaana kha lo', hi: 'बेटा, क्वेस्ट बाद में, पहले खाना खा लो' },
    { text: 'Yahan khazana nahi, sirf meri purani chappal hai', hi: 'यहां खज़ाना नहीं, सिर्फ मेरी पुरानी चप्पल है' },
    { text: 'Main tera guide hoon, raasta mujhe bhi nahi pata', hi: 'मैं तेरा गाइड हूं, रास्ता मुझे भी नहीं पता' },
    { text: 'Chal bhaag! Mummy aa rahi hai!', hi: 'चल भाग! मम्मी आ रही है!' },
    { text: 'Sharma ji ka beta ye level 2 minute me kar chuka hai', hi: 'शर्मा जी का बेटा ये लेवल दो मिनट में कर चुका है' },
    { text: 'Ruko zara, sabr karo… save ho raha hai', hi: 'रुको ज़रा, सब्र करो… सेव हो रहा है' },
    { text: 'Agla level? Pehle ek reel dekh lu', hi: 'अगला लेवल? पहले एक रील देख लूं' },
  ],
};

const SPEAKER = { start: '🎬', win: '😎', lose: '🥲', boss: '👹', lowHealth: '🤕', shop: '🧔', npc: '👵' };
const MIN_GAP_MS = 5000;
const lastIdx = {};
let lastAt = 0;
let bubbleTimer = null;

function pick(cat) {
  const list = DIALOGUES[cat];
  if (!list?.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastIdx[cat]) i = (i + 1) % list.length;
  lastIdx[cat] = i;
  return list[i];
}

function hindiVoice() {
  if (typeof speechSynthesis === 'undefined') return null;
  const v = speechSynthesis.getVoices();
  return v.find((x) => x.lang === 'hi-IN' || x.lang === 'hi_IN') || null;
}

/** Speak one line with TTS (Devanagari for Hindi voices). */
export function speakLine(line) {
  const s = store.get().settings;
  if (!s.sfx || s.speech === false || typeof speechSynthesis === 'undefined') return;
  try {
    const hv = hindiVoice();
    const u = new SpeechSynthesisUtterance(hv ? line.hi : line.text);
    if (hv) { u.voice = hv; u.lang = 'hi-IN'; } else {
      const en = speechSynthesis.getVoices().find((x) => x.lang === 'en-IN');
      if (en) u.voice = en;
      u.lang = en ? 'en-IN' : 'hi-IN';
    }
    u.rate = 1.0; u.pitch = 1.05;
    u.volume = Math.min(1, s.sfxVol + 0.15);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* TTS unavailable */ }
}

function showBubble(cat, line) {
  document.querySelector('.dialogue')?.remove();
  const n = el('div', { class: 'dialogue glass', role: 'status' });
  n.innerHTML = `<span class="who">${SPEAKER[cat] || '🎬'}</span><span class="txt">"${esc(line.text)}"</span>`;
  n.addEventListener('click', () => n.remove());
  document.body.append(n);
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 300); }, 3800);
}

/**
 * Play a dialogue from a category (subtitle + voice).
 * @param {string} cat category id
 * `force` skips the random chance and the anti-spam gap (key moments like
 * match start / win / loss) — the player's on/off setting is always respected.
 * @param {{chance?:number, force?:boolean, delay?:number}} opts
 */
export function sayDialogue(cat, { chance = 1, force = false, delay = 0 } = {}) {
  const s = store.get().settings;
  if (s.dialogues === false) return null;
  if (!force && Math.random() > chance) return null;
  if (!force && Date.now() - lastAt < MIN_GAP_MS) return null;
  const line = pick(cat);
  if (!line) return null;
  lastAt = Date.now();
  const run = () => { showBubble(cat, line); speakLine(line); };
  if (delay) setTimeout(run, delay); else run();
  return line;
}

/** Preview a specific line (Sound Studio). */
export function previewLine(cat, i) {
  const line = DIALOGUES[cat]?.[i];
  if (!line) return;
  showBubble(cat, line);
  speakLine(line);
}

// Some browsers load voices asynchronously
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
