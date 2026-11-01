/**
 * Chat safety: shared text filter used on the client (instant feedback) and
 * in Cloud Functions (authoritative re-filtering of every stored message).
 */
const BAD = [
  // English
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard',
  // Hinglish (common abusive words, transliterated)
  'madarchod', 'mc', 'bhenchod', 'behenchod', 'bc', 'chutiya', 'chutiye', 'gaand', 'gandu', 'bhosdi', 'bhosdike', 'bhosda',
  'lauda', 'lavda', 'lodu', 'randi', 'harami', 'kamina', 'kutta', 'kutti', 'saala', 'saali', 'chod', 'jhatu', 'tatti',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const PHONE = /(\+?\d[\d\s-]{8,}\d)/g;
const URL = /\b(?:https?:\/\/|www\.)\S+/gi;

function norm(word) {
  return word.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] || c).replace(/(.)\1{2,}/g, '$1$1');
}

export function cleanText(text, max = 200) {
  let t = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  t = t.replace(URL, '[link removed]').replace(PHONE, '[number removed]');
  return t.replace(/[\p{L}\p{N}@$]+/gu, (w) => {
    const n = norm(w);
    return BAD.some((b) => n === b || (b.length > 3 && n.includes(b))) ? '*'.repeat(w.length) : w;
  }).trim();
}

export function isClean(text) {
  return cleanText(text) === String(text ?? '').trim();
}

export function cleanName(name) {
  const n = cleanText(name, 20).replace(/\*/g, '').replace(/[^\p{L}\p{N}_ .-]/gu, '').trim();
  return n.length >= 2 ? n : 'Player';
}
