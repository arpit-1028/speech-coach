// ────────────────────────────────────────────────────────────────────────────
// phoneticMap.js — Human-Friendly English & Hindi Phonetic Translators
// Converts esoteric IPA symbols (θ, ð, ʃ, ʒ, ŋ, æ, ʌ, ə, etc.) to intuitive 
// English + Devanagari Hindi labels so Indian students instantly understand.
// ────────────────────────────────────────────────────────────────────────────

export const PHONETIC_MAP = {
  // Consonants
  'θ':   { en: 'th',    hi: 'थ',  example: 'think, path' },
  'ð':   { en: 'dh',    hi: 'द',  example: 'this, mother' },
  'ʃ':   { en: 'sh',    hi: 'श',  example: 'ship, wash' },
  'tʃ':  { en: 'ch',    hi: 'च',  example: 'chair, match' },
  'dʒ':  { en: 'j',     hi: 'ज',  example: 'joy, bridge' },
  'ʒ':   { en: 'zh',    hi: 'ज़',  example: 'vision, measure' },
  'ŋ':   { en: 'ng',    hi: 'ंग', example: 'sing, long' },
  'v':   { en: 'v',     hi: 'व',  example: 'very, visit' },
  'w':   { en: 'w',     hi: 'व',  example: 'water, world' },
  'r':   { en: 'r',     hi: 'र',  example: 'red, road' },
  'ɹ':   { en: 'r',     hi: 'र',  example: 'red, right' },
  'l':   { en: 'l',     hi: 'ल',  example: 'light, learn' },
  'p':   { en: 'p',     hi: 'प',  example: 'pen, speak' },
  'b':   { en: 'b',     hi: 'ब',  example: 'big, book' },
  't':   { en: 't',     hi: 'ट',  example: 'time, test' },
  'd':   { en: 'd',     hi: 'ड',  example: 'day, down' },
  'k':   { en: 'k',     hi: 'क',  example: 'cat, clean' },
  'g':   { en: 'g',     hi: 'ग',  example: 'go, game' },
  'f':   { en: 'f',     hi: 'फ',  example: 'fast, fine' },
  's':   { en: 's',     hi: 'स',  example: 'see, sun' },
  'z':   { en: 'z',     hi: 'ज़',  example: 'zoo, zero' },
  'h':   { en: 'h',     hi: 'ह',  example: 'home, hand' },
  'm':   { en: 'm',     hi: 'म',  example: 'man, map' },
  'n':   { en: 'n',     hi: 'न',  example: 'now, name' },
  'j':   { en: 'y',     hi: 'य',  example: 'yes, you' },
  'ɖ':   { en: 'd',     hi: 'ड',  example: 'day' },
  'ʈ':   { en: 't',     hi: 'ट',  example: 'time' },

  // Vowels & Diphthongs
  'æ':   { en: 'a (ae)',   hi: 'ऐ',   example: 'cat, map' },
  'ʌ':   { en: 'u (uh)',   hi: 'अ',   example: 'sun, cut' },
  'ə':   { en: 'uh',       hi: 'अ',   example: 'about, ago' },
  'iː':  { en: 'ee',       hi: 'ई',   example: 'see, tree' },
  'ɪ':   { en: 'i',        hi: 'इ',   example: 'sit, win' },
  'uː':  { en: 'oo',       hi: 'ऊ',   example: 'moon, food' },
  'ʊ':   { en: 'u',        hi: 'उ',   example: 'book, put' },
  'ɔː':  { en: 'aw/or',    hi: 'ऑ',   example: 'call, saw' },
  'ɑː':  { en: 'aa',       hi: 'आ',   example: 'car, star' },
  'ɜːr': { en: 'ur/er',    hi: 'अर',  example: 'bird, learn' },
  'ɜː':  { en: 'ur/er',    hi: 'अर',  example: 'bird, world' },
  'eɪ':  { en: 'ay',       hi: 'ए',   example: 'day, say' },
  'aɪ':  { en: 'eye',      hi: 'आइ',  example: 'my, time' },
  'oʊ':  { en: 'oh',       hi: 'ओ',   example: 'go, home' },
  'aʊ':  { en: 'ow',       hi: 'आउ',  example: 'now, out' },
  'ɔɪ':  { en: 'oy',       hi: 'ऑइ',  example: 'boy, voice' },
  'ɛ':   { en: 'e',        hi: 'ए',   example: 'bed, red' },
  'e':   { en: 'e',        hi: 'ए',   example: 'bed, men' },
  'i':   { en: 'i',        hi: 'इ',   example: 'city' },
  'u':   { en: 'u',        hi: 'उ',   example: 'into' },
  'o':   { en: 'o',        hi: 'ओ',   example: 'go' },
  'a':   { en: 'a',        hi: 'आ',   example: 'father' },
};

/**
 * Format a single IPA token into human English + Hindi string (e.g. "th (थ)")
 */
export function formatPhoneme(ph) {
  if (!ph) return '';
  const clean = ph.trim();
  if (PHONETIC_MAP[clean]) {
    const item = PHONETIC_MAP[clean];
    return `${item.en} (${item.hi})`;
  }
  return clean;
}

/**
 * Format short version (e.g. "th")
 */
export function formatPhonemeShort(ph) {
  if (!ph) return '';
  const clean = ph.trim();
  if (PHONETIC_MAP[clean]) {
    return PHONETIC_MAP[clean].en;
  }
  return clean;
}

/**
 * Humanize AI coach feedback tips by replacing raw IPA symbols with readable English + Hindi
 */
export function humanizeFeedback(text) {
  if (!text || typeof text !== 'string') return text || '';
  let out = text;
  
  // Sort keys by length descending to replace multi-char tokens first
  const keys = Object.keys(PHONETIC_MAP).sort((a, b) => b.length - a.length);
  
  keys.forEach((ipa) => {
    const item = PHONETIC_MAP[ipa];
    const repl = `${item.en} (${item.hi})`;
    out = out.split(`'${ipa}'`).join(`'${repl}'`);
    out = out.split(`"${ipa}"`).join(`"${repl}"`);
    out = out.split(`/${ipa}/`).join(`/${repl}/`);
    out = out.split(` ${ipa} `).join(` ${repl} `);
  });
  
  return out;
}
