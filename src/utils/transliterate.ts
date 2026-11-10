import ALL_KANJI_MAP_RAW from './kanjiMap.json';

const ALL_KANJI_MAP = ALL_KANJI_MAP_RAW as Record<string, string>;

/**
 * Universal Multi-Script Transliteration Engine
 * Converts Non-Latin scripts (Japanese Kanji/Kana, Korean Hangul, Arabic, Cyrillic) into Latin text (Romaji / Pinyin / Latin).
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

// --- 2. Japanese Kana to Hepburn Romaji ---
const KANA_MAP: Record<string, string> = {
  // Extended Katakana / Hiragana Digraphs & Modern Loanwords
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
  'チェ': 'che', 'シェ': 'she', 'ジェ': 'je',
  'ティ': 'ti', 'ディ': 'di', 'トゥ': 'tu', 'ドゥ': 'du',
  'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo',
  'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo',
  'ヴァ': 'va', 'ヴィ': 'vi', 'ヴェ': 've', 'ヴォ': 'vo',
  'ツァ': 'tsa', 'ツィ': 'tsi', 'ツェ': 'tse', 'ツォ': 'tso',

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
  'ゔ': 'vu',

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
  'ヴ': 'vu', 'ー': '-',
};

// --- Japanese Kanji Compounds & Common Music Lyric Phrases ---
const KANJI_COMPOUNDS: [string, string][] = [
  // Full Lyric Sentences & High-Frequency Idioms
  ['君が好きだと叫びたい', 'kimi ga suki da to sakebitai'],
  ['さよならは言わないで', 'sayonara wa iwanaide'],
  ['さようならは言わないで', 'sayounara wa iwanaide'],
  ['誰も知らない物語', 'dare mo shiranai monogatari'],
  ['もう一度逢いたい', 'mou ichido aitai'],
  ['夜空を見上げて歩こう', 'yozora wo miagete arukou'],
  ['夢の中で生きていく', 'yume no naka de ikiteiku'],
  ['君の笑顔が好きだった', 'kimi no egao ga sukidatta'],
  ['手を繋いで歩いた道', 'te wo tsunaide aruita michi'],
  ['信じることを諦めないで', 'shinjiru koto wo akiramenaide'],
  ['この世界で一番美しい', 'kono sekai de ichiban utsukushii'],
  ['雨上がりの虹を見に行こう', 'ameagari no niji wo mi ni ikou'],
  ['桜舞い散る坂道で', 'sakura maichiru sakamichi de'],
  ['僕の心に咲いた花', 'boku no kokoro ni saita hana'],
  ['何気ない日々の幸せ', 'nanigenai hibi no shiawase'],
  ['終わらない旅路の果てに', 'owaranai tabiji no hate ni'],
  ['ずっと前から好きでした', 'zutto mae kara suki deshita'],
  ['やっぱり君が一番だ', 'yappari kimi ga ichiban da'],
  ['日本語の歌を歌おう', 'nihongo no uta wo utaou'],
  ['時々思い出す', 'tokidoki omoidasu'],

  // Verb Inflections (Okurigana)
  ['愛してる', 'aishiteru'], ['愛していた', 'aishiteita'], ['愛したい', 'aishitai'], ['愛して', 'aishite'],
  ['大好きだった', 'daisukidatta'], ['大好きでした', 'daisuki deshita'],
  ['大好きだ', 'daisukida'], ['大好き', 'daisuki'],
  ['好きだった', 'sukidatta'], ['好きでした', 'suki deshita'], ['好きだ', 'sukida'], ['好き', 'suki'],
  ['大嫌い', 'daikirai'], ['嫌い', 'kirai'],
  ['忘れないで', 'wasurenaide'], ['忘れない', 'wasurenai'], ['忘れた', 'wasureta'], ['忘れて', 'wasurete'], ['忘れる', 'wasureru'],
  ['抱きしめて', 'dakishimete'], ['抱きしめた', 'dakishimeta'], ['抱きしめる', 'dakishimeru'],
  ['見つめて', 'mitsumete'], ['見つめた', 'mitsumeta'], ['見つめる', 'mitsumeru'],
  ['見上げて', 'miagete'], ['見上げた', 'miageta'], ['見上げる', 'miageru'], ['見上げよう', 'miageyou'],
  ['見えない', 'mienai'], ['見えた', 'mieta'], ['見えて', 'miete'], ['見える', 'mieru'],
  ['教えて', 'oshiete'], ['教えた', 'oshieta'], ['教える', 'oshieru'],
  ['信じて', 'shinjite'], ['信じる', 'shinjiru'], ['信じた', 'shinjita'],
  ['感じて', 'kanjite'], ['感じた', 'kanjita'], ['感じる', 'kanjiru'],
  ['届かない', 'todokanai'], ['届いて', 'todoite'], ['届いた', 'todoita'], ['届く', 'todoku'],
  ['消えない', 'kienai'], ['消えて', 'kiete'], ['消えた', 'kieta'], ['消える', 'kieru'],
  ['傷ついて', 'kizutsuite'], ['傷ついた', 'kizutsuita'], ['傷つく', 'kizutsuku'],
  ['言わないで', 'iwanaide'], ['言わない', 'iwanai'], ['言えない', 'ienai'], ['言った', 'itta'], ['言って', 'itte'], ['言う', 'iu'],
  ['知らない', 'shiranai'], ['知りたくない', 'shiritakunai'], ['知った', 'shitta'], ['知って', 'shitte'], ['知る', 'shiru'],
  ['逢いたい', 'aitai'], ['会いたい', 'aitai'], ['逢えた', 'aeta'], ['会えた', 'aeta'], ['逢えて', 'aete'], ['会えて', 'aete'],
  ['生きていく', 'ikiteiku'], ['生きて', 'ikite'], ['生きた', 'ikita'], ['生きる', 'ikiru'],
  ['生まれて', 'umarete'], ['生まれた', 'umareta'], ['生まれ', 'umare'],
  ['咲いた', 'saita'], ['咲いて', 'saite'], ['咲く', 'saku'], ['咲き誇る', 'sakihokoru'],
  ['舞い散る', 'maichiru'], ['散って', 'chitte'], ['散った', 'chitta'], ['散る', 'chiru'],
  ['歩いた', 'aruita'], ['歩いて', 'aruite'], ['歩く', 'aruku'], ['歩こう', 'arukou'],
  ['走って', 'hashitte'], ['走った', 'hashitta'], ['走る', 'hashiru'], ['走ろう', 'hashirou'],
  ['叫びたい', 'sakebitai'], ['叫んだ', 'sakenda'], ['叫ぶ', 'sakebu'],
  ['繋いで', 'tsunaide'], ['繋いだ', 'tsunaida'], ['繋ぐ', 'tsunagu'], ['繋がる', 'tsunagaru'],
  ['諦めないで', 'akiramenaide'], ['諦めない', 'akiramenai'], ['諦めた', 'akirameta'], ['諦める', 'akirameru'],
  ['眠れない', 'nemurenai'], ['眠った', 'nemutta'], ['眠って', 'nemutte'], ['眠る', 'nemuru'],
  ['泣かないで', 'nakanaide'], ['泣いて', 'naite'], ['泣いた', 'naita'], ['泣く', 'naku'],
  ['笑って', 'waratte'], ['笑った', 'waratta'], ['笑う', 'warau'],
  ['祈って', 'inotte'], ['祈った', 'inotta'], ['祈る', 'inoru'],
  ['願って', 'negatte'], ['願った', 'negatta'], ['願う', 'negau'],
  ['誓って', 'chikatte'], ['誓った', 'chikatta'], ['誓う', 'chikau'],
  ['迷って', 'mayotte'], ['迷った', 'mayotta'], ['迷う', 'mayou'],
  ['思い出す', 'omoidasu'], ['思い出した', 'omoidashita'], ['思い出して', 'omoidashite'], ['思い出', 'omoide'],
  ['想い出', 'omoide'], ['想い', 'omoi'], ['想う', 'omou'], ['想って', 'omotte'],
  ['思う', 'omou'], ['思って', 'omotte'], ['思った', 'omotta'],
  ['歌おう', 'utaou'], ['歌って', 'utatte'], ['歌った', 'utatta'], ['歌う', 'utau'],
  ['聞いて', 'kiite'], ['聞いた', 'kiita'], ['聞く', 'kiku'], ['聞こえる', 'kikoeru'],
  ['話して', 'hanashite'], ['話した', 'hanashita'], ['話す', 'hanasu'],
  ['待たないで', 'matanaide'], ['待って', 'matte'], ['待った', 'matta'], ['待つ', 'matsu'],
  ['止めて', 'tomete'], ['止まった', 'tomatta'], ['止まる', 'tomaru'],
  ['帰ろう', 'kaerou'], ['帰って', 'kaette'], ['帰る', 'kaeru'],
  ['行こう', 'ikou'], ['行って', 'itte'], ['行った', 'itta'], ['行く', 'iku'],
  ['来ない', 'konai'], ['来て', 'kite'], ['来た', 'kita'], ['来る', 'kuru'],
  ['買って', 'katte'], ['買った', 'katta'], ['買う', 'kau'],
  ['乗って', 'notte'], ['乗った', 'notta'], ['乗る', 'noru'],
  ['立って', 'tatte'], ['立った', 'tatta'], ['立つ', 'tatsu'],
  ['飛んで', 'tonde'], ['飛んだ', 'tonda'], ['飛ぶ', 'tobu'],
  ['飲んで', 'nonde'], ['飲んだ', 'nonda'], ['飲む', 'nomu'],
  ['食べて', 'tabete'], ['食べた', 'tabeta'], ['食べる', 'taberu'],
  ['触れて', 'furete'], ['触れた', 'fureta'], ['触れる', 'fureru'],
  ['離れないで', 'hanarenaide'], ['離さないで', 'hanasanaide'], ['離れて', 'hanarete'], ['離れる', 'hanareru'],
  ['揺れて', 'yurete'], ['揺れる', 'yureru'],
  ['輝いて', 'kagayaite'], ['輝いた', 'kagayaita'], ['輝く', 'kagayaku'],
  ['照らして', 'terashite'], ['照らした', 'terashita'], ['照らす', 'terasu'],
  ['探して', 'sagashite'], ['探した', 'sagashita'], ['探す', 'sagasu'],
  ['壊れた', 'kowareta'], ['壊して', 'kowashite'], ['壊す', 'kowasu'],
  ['奪って', 'ubatte'], ['奪う', 'ubau'],
  ['導いて', 'michibiite'], ['導く', 'michibiku'],

  // Adjectives & Forms
  ['美しかった', 'utsukushikatta'], ['美しく', 'utsukushiku'], ['美しい', 'utsukushii'],
  ['優しさ', 'yasashisa'], ['優しく', 'yasashiku'], ['優しい', 'yasashii'],
  ['悲しみ', 'kanashimi'], ['悲しく', 'kanashiku'], ['悲しい', 'kanashii'],
  ['寂しさ', 'sabishisa'], ['寂しく', 'sabishiku'], ['寂しい', 'sabishii'],
  ['嬉しさ', 'ureshisa'], ['嬉しく', 'ureshiku'], ['嬉しい', 'ureshii'],
  ['痛くて', 'itakute'], ['痛み', 'itami'], ['痛い', 'itai'],
  ['温もり', 'nukumori'], ['温かい', 'atatakai'], ['暖かい', 'atatakai'],
  ['強さ', 'tsuyosa'], ['強く', 'tsuyoku'], ['強い', 'tsuyoi'],
  ['弱さ', 'yowasa'], ['弱く', 'yowaku'], ['弱い', 'yowai'],
  ['切なさ', 'setsunasa'], ['切ない', 'setsunai'],
  ['儚さ', 'hakanasa'], ['儚い', 'hakanai'],
  ['愛しい', 'itoshii'], ['恋しい', 'koishii'],
  ['新しい', 'atarashii'], ['新しく', 'atarashiku'],
  ['遠く', 'tooku'], ['遠い', 'tooi'], ['近く', 'chikaku'], ['近い', 'chikai'],
  ['早く', 'hayaku'], ['早い', 'hayai'], ['遅く', 'osoku'], ['遅い', 'osoi'],

  // Repetition marks (々)
  ['日々', 'hibi'], ['時々', 'tokidoki'], ['人々', 'hitobito'], ['星々', 'hoshiboshi'],
  ['色々', 'iroiro'], ['色々と', 'iroiro to'], ['年々', 'nen\'nen'], ['次々', 'tsugitsugi'],
  ['様々', 'samazama'], ['度々', 'tabitabi'], ['段々', 'dandan'], ['益々', 'masumasu'],
  ['近々', 'chikajika'], ['散々', 'sanzan'], ['長々', 'naganaga'],

  // Common Noun & Multi-Kanji Compounds
  ['何気ない', 'nanigenai'], ['何気なく', 'nanigenaku'],
  ['ありがとう', 'arigatou'], ['さようなら', 'sayounara'], ['さよなら', 'sayonara'],
  ['大丈夫', 'daijoubu'], ['一番', 'ichiban'], ['世界', 'sekai'],
  ['永遠', 'eien'], ['未来', 'mirai'], ['過去', 'kako'], ['現在', 'genzai'],
  ['時間', 'jikan'], ['約束', 'yakusoku'], ['記憶', 'kioku'], ['感情', 'kanjou'],
  ['太陽', 'taiyou'], ['奇跡', 'kiseki'], ['運命', 'unmei'], ['希望', 'kibou'],
  ['絶望', 'zetsubou'], ['言葉', 'kotoba'], ['場所', 'basho'],
  ['昨日', 'kinou'], ['今日', 'kyou'], ['明日', 'ashita'], ['今夜', 'konya'],
  ['昨夜', 'yuube'], ['毎日', 'mainichi'], ['瞬間', 'shunkan'], ['笑顔', 'egao'],
  ['本当', 'hontou'], ['本当に', 'hontou ni'], ['孤独', 'kodoku'], ['理由', 'riyuu'],
  ['季節', 'kisetsu'], ['秘密', 'himitsu'], ['景色', 'keshiki'], ['現実', 'genjitsu'],
  ['全部', 'zenbu'], ['二人', 'futari'], ['一人', 'hitori'], ['三人', 'sannin'],
  ['最初', 'saisho'], ['最後', 'saigo'], ['自由', 'jiyuu'], ['自分', 'jibun'],
  ['呼吸', 'kokyuu'], ['鼓動', 'kodou'], ['青空', 'aozora'], ['星空', 'hoshizora'],
  ['夜空', 'yozora'], ['花束', 'hanataba'], ['心臓', 'shinzou'], ['涙色', 'namidairo'],
  ['真実', 'shinjitsu'], ['大切', 'taisetsu'], ['一緒', 'issho'],
  ['始まり', 'hajimari'], ['終わり', 'owari'], ['物語', 'monogatari'],
  ['雨上がり', 'ameagari'], ['帰り道', 'kaerimichi'], ['坂道', 'sakamichi'],
  ['交差点', 'kousaten'], ['歩道橋', 'hodoukyou'], ['旅路', 'tabiji'],
  ['果てに', 'hate ni'], ['果て', 'hate'],
  ['日本語', 'nihongo'], ['日本', 'nihon'], ['学校', 'gakkou'], ['電車', 'densha'],
  ['気持ち', 'kimochi'], ['元気', 'genki'], ['天気', 'tenki'], ['空気', 'kuuki'],
  ['勇気', 'yuuki'], ['友達', 'tomodachi'], ['親友', 'shinyuu'], ['仲間', 'nakama'],
  ['もう一度', 'mou ichido'], ['一度', 'ichido'], ['何度', 'nando'], ['何度でも', 'nandodemo'],
  ['今度', 'kondo'], ['幸せ', 'shiawase'],
  ['夢見', 'yumemi'], ['見失', 'miushina'],
  ['彷徨', 'samayou'], ['曖昧', 'aimai'], ['閃光', 'senkou'], ['深淵', 'shin\'en'],
  ['刹那', 'setsuna'], ['情熱', 'jounetsu'], ['残酷', 'zankoku'], ['静寂', 'seijaku'],
  ['螺旋', 'rasen'], ['微熱', 'binetsu'], ['残響', 'zankyou'], ['幻影', 'gen\'ei'],
  ['幻想', 'gensou'], ['追憶', 'tsuioku'], ['微笑', 'hohoemi'], ['黄昏', 'tasogare'],
  ['夜明け', 'yoake'], ['夕焼け', 'yuuyake'], ['朝焼け', 'asayake'], ['星屑', 'hoshikuzu'],
  ['茜色', 'akaneiro'], ['虹', 'niji'],
];

// Sort compounds by length descending to match longest phrases first
const SORTED_KANJI_COMPOUNDS = [...KANJI_COMPOUNDS].sort((a, b) => b[0].length - a[0].length);

// Single Kanji to Romaji dictionary covering core Japanese music lyric vocabulary
const SINGLE_KANJI_MAP: Record<string, string> = {
  '愛': 'ai', '恋': 'koi', '心': 'kokoro', '夢': 'yume', '空': 'sora', '涙': 'namida',
  '夜': 'yoru', '雨': 'ame', '風': 'kaze', '花': 'hana', '桜': 'sakura', '今': 'ima',
  '君': 'kimi', '僕': 'boku', '私': 'watashi', '俺': 'ore', '誰': 'dare', '何': 'nani',
  '光': 'hikari', '影': 'kage', '闇': 'yami', '星': 'hoshi', '月': 'tsuki', '日': 'hi',
  '海': 'umi', '雲': 'kumo', '雪': 'yuki', '春': 'haru', '夏': 'natsu', '秋': 'aki',
  '冬': 'fuyu', '朝': 'asa', '夕': 'yuu', '道': 'michi', '街': 'machi', '扉': 'tobira',
  '窓': 'mado', '翼': 'tsubasa', '羽': 'hane', '手': 'te', '目': 'me', '瞳': 'hitomi',
  '足': 'ashi', '声': 'koe', '歌': 'uta', '音': 'oto', '命': 'inochi', '魂': 'tamashii',
  '息': 'iki', '胸': 'mune', '血': 'chi', '旅': 'tabi', '絆': 'kizuna', '線': 'sen',
  '神': 'kami', '鳥': 'tori', '波': 'nami', '炎': 'honoo', '火': 'hi', '水': 'mizu',
  '木': 'ki', '森': 'mori', '山': 'yama', '川': 'kawa', '草': 'kusa', '葉': 'ha',
  '白': 'shiro', '黒': 'kuro', '赤': 'aka', '青': 'ao', '生': 'sei', '死': 'shi',
  '見': 'mi', '聞': 'ki', '言': 'i', '話': 'hana', '知': 'shi', '分': 'waka',
  '行': 'i', '来': 'ku', '帰': 'kae', '去': 'sa', '出': 'de', '入': 'hai',
  '立': 'ta', '止': 'to', '待': 'ma', '追': 'o', '走': 'hashi', '飛': 'to',
  '抱': 'da', '触': 'fure', '握': 'nigi', '離': 'hana', '届': 'todo', '響': 'hibi',
  '揺': 'yure', '輝': 'kagaya', '照': 'tera', '燃': 'moe', '咲': 'saku', '散': 'chiru',
  '逢': 'a', '会': 'a', '別': 'waka', '消': 'ki', '降': 'fu', '越': 'ko',
  '強': 'tsuyo', '弱': 'yowa', '高': 'taka', '深': 'fuka', '遠': 'too', '近': 'chika',
  '新': 'atara', '古': 'furu', '早': 'haya', '痛': 'ita', '悲': 'kana', '嬉': 'ureshi',
  '優': 'yasa', '信': 'shin', '嘘': 'uso', '祈': 'ino', '誓': 'chika', '迷': 'mayo',
  '泣': 'na', '笑': 'wara', '叫': 'sake', '描': 'ega',
  '落': 'ochi', '探': 'saga', '色': 'iro', '時': 'toki', '年': 'toshi', '友': 'tomo',
  '人': 'hito', '男': 'otoko', '女': 'onna', '子': 'ko', '家': 'ie', '部屋': 'heya',
  '繋': 'tsuna', '彷': 'samayo', '徨': 'samayo', '壊': 'kowa', '奪': 'uba', '導': 'michibi',
  '紡': 'tsumu', '霞': 'kasumi', '痕': 'ato', '憐': 'awa', '眩': 'mabu', '儚': 'hakana',
  '好': 'suki', '幸': 'shiawase', '切': 'setsu', '本': 'hon', '気': 'ki', '天': 'ten',
  '学': 'gaku', '校': 'kou', '車': 'sha', '電': 'den', '銀': 'gin', '金': 'kin',
  '肉': 'niku', '自': 'ji', '楽': 'raku',
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
  'Н': 'N', 'О': 'O', 'Р': 'R', 'P': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
  'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y',
  'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
};

// --- 4. Arabic to Latin Mapping ---
const ARABIC_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'sh': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': "'a",
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': "'",
};

/**
 * Checks whether text contains non-Latin scripts (Japanese, Korean, Chinese, Arabic, Cyrillic)
 */
export function hasNonLatinScript(text: string): boolean {
  if (!text) return false;
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

  // 1. Replace multi-character Kanji / Japanese compound words first (longest first)
  for (const [compound, romaji] of SORTED_KANJI_COMPOUNDS) {
    if (result.includes(compound)) {
      result = result.split(compound).join(` ${romaji} `);
    }
  }

  // 2. Replace Kana digraphs (2 chars)
  for (const [digraph, romaji] of Object.entries(KANA_MAP)) {
    if (digraph.length > 1 && result.includes(digraph)) {
      result = result.split(digraph).join(romaji);
    }
  }

  // 3. Process character by character with dynamic sokuon & repetition mark
  const chars = Array.from(result);
  const converted: string[] = [];
  let prevRomaji = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);

    // Hangul (Korean)
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const rom = transliterateHangul(ch);
      converted.push(rom);
      prevRomaji = rom;
      continue;
    }

    // Japanese Repetition Mark (々)
    if (ch === '々') {
      if (prevRomaji) {
        converted.push(prevRomaji);
      }
      continue;
    }

    // Dynamic Sokuon (っ / ッ)
    if (ch === 'っ' || ch === 'ッ') {
      const nextTwo = chars.slice(i + 1, i + 3).join('');
      const nextOne = chars[i + 1] || '';
      const nextRom = KANA_MAP[nextTwo] || KANA_MAP[nextOne] || SINGLE_KANJI_MAP[nextOne] || ALL_KANJI_MAP[nextOne] || '';
      if (nextRom) {
        const trimmed = nextRom.trim();
        const firstLetter = trimmed[0]?.toLowerCase() || 't';
        if (firstLetter === 'c') {
          converted.push('t');
        } else if (/[a-z]/i.test(firstLetter)) {
          converted.push(firstLetter);
        } else {
          converted.push('t');
        }
      } else {
        converted.push('t');
      }
      continue;
    }

    // Curated Single Kanji (Lyric Priority)
    if (SINGLE_KANJI_MAP[ch]) {
      const rom = SINGLE_KANJI_MAP[ch];
      converted.push(` ${rom} `);
      prevRomaji = rom;
      continue;
    }

    // Universal Joyo & Jinmeiyo Kanji Fallback (3,116 kanji)
    if (ALL_KANJI_MAP[ch]) {
      const rom = ALL_KANJI_MAP[ch];
      converted.push(` ${rom} `);
      prevRomaji = rom;
      continue;
    }

    // Japanese Kana
    if (KANA_MAP[ch]) {
      const rom = KANA_MAP[ch];
      converted.push(rom);
      prevRomaji = rom;
      continue;
    }

    // Cyrillic
    if (CYRILLIC_MAP[ch]) {
      converted.push(CYRILLIC_MAP[ch]);
      prevRomaji = '';
      continue;
    }

    // Arabic
    if (ARABIC_MAP[ch]) {
      converted.push(ARABIC_MAP[ch]);
      prevRomaji = '';
      continue;
    }

    converted.push(ch);
    prevRomaji = '';
  }

  return converted.join('').replace(/\s+/g, ' ').trim();
}
