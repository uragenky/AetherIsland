/**
 * Universal Multi-Script Transliteration Engine
 * Converts Non-Latin scripts (Japanese Kana/Kanji, Korean Hangul, Arabic, Cyrillic) into Latin text (Romaji / Pinyin / Latin).
 */

// --- 1. Korean Hangul Decomposition (Revised Romanization of Korean) ---
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

const HANGUL_INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];
const HANGUL_VOWELS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
const HANGUL_FINALS = [
  '', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h',
];

function transliterateHangul(char: string): string {
  const code = char.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) {
    return char;
  }
  const index = code - HANGUL_START;
  const initial = Math.floor(index / 588);
  const vowel = Math.floor((index % 588) / 28);
  const final = index % 28;

  return HANGUL_INITIALS[initial] + HANGUL_VOWELS[vowel] + HANGUL_FINALS[final];
}

// --- 2. Japanese Hiragana & Katakana to Hepburn Romaji ---
const KANA_MAP: Record<string, string> = {
  // Digraphs (small y)
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',

  'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
  'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
  'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
  'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
  'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
  'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
  'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
  'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
  'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
  'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
  'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',

  // Basic Hiragana
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',

  // Basic Katakana
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
  'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
  'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
  'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
  'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
  'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
  'ー': '-',
};

// Common Japanese lyrics Kanji lexicon
const COMMON_KANJI: Record<string, string> = {
  '愛': 'ai', '恋': 'koi', '心': 'kokoro', '夢': 'yume', '空': 'sora',
  '涙': 'namida', '夜': 'yoru', '雨': 'ame', '風': 'kaze', '花': 'hana',
  '桜': 'sakura', '今': 'ima', '君': 'kimi', '僕': 'boku', '私': 'watashi',
  '誰': 'dare', '何': 'nani', '光': 'hikari', '影': 'kage', '永遠': 'eien',
  '未来': 'mirai', '世界': 'sekai', '時間': 'jikan', '歌': 'uta', '声': 'koe',
  '手': 'te', '目': 'me', '道': 'michi', '旅': 'tabi', '命': 'inochi',
  '魂': 'tamashii', '運命': 'unmei', '希望': 'kibou', '奇跡': 'kiseki',
  '約束': 'yakusoku', '記憶': 'kioku', '感情': 'kanjou', '太陽': 'taiyou',
  '月': 'tsuki', '星': 'hoshi', '海': 'umi', '雲': 'kumo', '雪': 'yuki',
  '春': 'haru', '夏': 'natsu', '秋': 'aki', '冬': 'fuyu', '明日': 'ashita',
  '昨日': 'kinou', '今日': 'kyou', '全部': 'zenbu', '本当': 'hontou',
  '大切': 'taisetsu', '優しさ': 'yasashisa', '孤独': 'kodoku', '一緒': 'issho',
  '一人': 'hitori', '二人': 'futari', '想い': 'omoi', '願い': 'negai',
  '言葉': 'kotoba', '場所': 'basho', '始まり': 'hajimari', '終わり': 'owari',
  '笑顔': 'egao', '自由': 'jiyuu', '信じて': 'shinjite', '忘れない': 'wasurenai',
  '見つめて': 'mitsumete', '抱きしめて': 'dakishimete', '教えて': 'oshiete',
};

// --- 3. Cyrillic to Latin Mapping ---
const CYRILLIC_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': "'", 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
  'Ъ': '', 'Ы': 'Y', 'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
};

// --- 4. Arabic to Latin Mapping ---
const ARABIC_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': "'a",
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': "'",
};

/**
 * Checks whether text contains non-Latin scripts (Japanese, Korean, Chinese, Arabic, Cyrillic)
 */
export function hasNonLatinScript(text: string): boolean {
  if (!text) return false;
  // Regex matches Hangul, Hiragana, Katakana, CJK Unified Ideographs, Arabic, Cyrillic
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0400-\u04FF]/.test(text);
}

/**
 * Transliterates non-Latin line of text into Romanized Latin characters
 */
export function transliterateText(text: string): string {
  if (!text || !hasNonLatinScript(text)) {
    return text;
  }

  let result = text;

  // 1. Replace multi-character Kanji / Japanese compound words first
  for (const [kanji, romaji] of Object.entries(COMMON_KANJI)) {
    if (result.includes(kanji)) {
      result = result.split(kanji).join(` ${romaji} `);
    }
  }

  // 2. Replace Kana digraphs (2 chars)
  for (const [digraph, romaji] of Object.entries(KANA_MAP)) {
    if (digraph.length > 1 && result.includes(digraph)) {
      result = result.split(digraph).join(romaji);
    }
  }

  // 3. Process character by character for Hangul, single Kana, Cyrillic, Arabic
  const chars = Array.from(result);
  const converted = chars.map((ch) => {
    // Hangul
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      return transliterateHangul(ch);
    }
    // Japanese Kana
    if (KANA_MAP[ch]) {
      return KANA_MAP[ch];
    }
    // Cyrillic
    if (CYRILLIC_MAP[ch]) {
      return CYRILLIC_MAP[ch];
    }
    // Arabic
    if (ARABIC_MAP[ch]) {
      return ARABIC_MAP[ch];
    }
    return ch;
  });

  return converted.join('').replace(/\s+/g, ' ').trim();
}
