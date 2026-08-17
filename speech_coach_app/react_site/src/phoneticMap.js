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
  'th':  { en: 'th',    hi: 'थ',  example: 'think, path' },
  'dh':  { en: 'dh',    hi: 'द',  example: 'this, mother' },
  'sh':  { en: 'sh',    hi: 'श',  example: 'ship, wash' },

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

// Pre-sorted keys for replacement (longest first to avoid partial matches)
const SORTED_IPA_KEYS = Object.keys(PHONETIC_MAP).sort((a, b) => b.length - a.length);

/**
 * Format a single IPA token into human English + Hindi string (e.g. "th (थ)")
 * Works for both bare IPA symbols AND descriptive focus strings like "short /ʌ/ vowel"
 */
export function formatPhoneme(ph) {
  if (!ph) return '';
  const clean = ph.trim();
  
  // Direct match: bare IPA symbol like "θ", "ʃ", "æ"
  if (PHONETIC_MAP[clean]) {
    const item = PHONETIC_MAP[clean];
    return `${item.en} (${item.hi})`;
  }
  
  // Descriptive focus string like "short /ʌ/ vowel", "TH /θ/ sound", "/ɪ/ vowel + /ʃ/"
  // → Replace all embedded /IPA/ tokens with human-readable equivalents
  return humanizeFocusString(clean);
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
  return humanizeFocusString(clean);
}

/**
 * Convert descriptive focus strings to human-readable English + Hindi
 * "short /ʌ/ vowel" → "Short 'uh (अ)' vowel"  
 * "/ɪ/ vowel + /ʃ/" → "'i (इ)' vowel + 'sh (श)'"
 * "TH /θ/ sound" → "TH 'th (थ)' sound"
 * "V vs W distinction" → "V vs W distinction" (already readable)
 */
function humanizeFocusString(text) {
  if (!text) return '';
  let out = text;

  // 1. Replace /IPA/ patterns with human-readable equivalents
  out = out.replace(/\/([^/]+)\//g, (match, ipaContent) => {
    const trimmed = ipaContent.trim();
    // Try direct lookup
    if (PHONETIC_MAP[trimmed]) {
      const item = PHONETIC_MAP[trimmed];
      return `'${item.en} (${item.hi})'`;
    }
    // Try each known IPA within the content (for multi-phoneme like "reɪn")
    let result = trimmed;
    let changed = false;
    for (const key of SORTED_IPA_KEYS) {
      if (result.includes(key) && PHONETIC_MAP[key]) {
        const item = PHONETIC_MAP[key];
        result = result.replace(key, `${item.en}(${item.hi})`);
        changed = true;
      }
    }
    if (changed) return `'${result}'`;
    return match; // Return original if no IPA found
  });

  // 2. Replace common jargon words with simple descriptions  
  const JARGON_MAP = {
    'bilabial stop': 'lip sound',
    'voiced stop': 'strong sound',
    'affricate': 'combined sound',
    'diphthong': 'gliding vowel',
    'cluster': 'blend',
    'coda cluster': 'ending blend',
    'complex coda': 'complex ending',
    'complex onset': 'complex start',
    'sibilants': 'hissing sounds',
    'onset': 'starting',
    'syllabic': 'syllable',
    'schwa': 'soft "uh" sound',
    'yod coalescence': 'y-blending',
    'flap T': 'soft T',
    'reduced vowels': 'soft vowels',
    'syllable reduction': 'syllable blending',
    'stress pattern': 'emphasis pattern',
    'stress on 2nd syllable': 'emphasis on 2nd part',
    'multi-syllable stress': 'word emphasis pattern',
    'long word stress control': 'word rhythm control',
    'vowel reduction in unstressed syls': 'soft vowels in unstressed parts',
    'silent letters + reduction': 'silent letters + blending',
    'multiple sibilants': 'multiple hissing sounds',
    'smooth linking': 'smooth word connection',
    'connected speech': 'flowing speech',
    'stress + reduced vowels': 'emphasis + soft vowels',
  };

  for (const [jargon, simple] of Object.entries(JARGON_MAP)) {
    if (out.toLowerCase().includes(jargon.toLowerCase())) {
      out = out.replace(new RegExp(jargon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), simple);
    }
  }

  // Capitalize first letter
  if (out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }

  return out;
}

/**
 * Humanize AI coach feedback tips by replacing raw IPA symbols with readable English + Hindi
 */
export function humanizeFeedback(text) {
  if (!text || typeof text !== 'string') return text || '';
  let out = text;
  
  // Replace /IPA/ patterns first
  out = out.replace(/\/([^/]+)\//g, (match, ipaContent) => {
    const trimmed = ipaContent.trim();
    if (PHONETIC_MAP[trimmed]) {
      const item = PHONETIC_MAP[trimmed];
      return `'${item.en} (${item.hi})'`;
    }
    return match;
  });

  // Replace bare IPA in quotes or surrounded by spaces
  for (const ipa of SORTED_IPA_KEYS) {
    const item = PHONETIC_MAP[ipa];
    const repl = `${item.en} (${item.hi})`;
    out = out.split(`'${ipa}'`).join(`'${repl}'`);
    out = out.split(`"${ipa}"`).join(`"${repl}"`);
  }
  
  return out;
}
