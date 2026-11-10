/* スワリタイ！ 〜降りる人を見極めろ〜  ゲームロジック（描画なし・Node でテスト可能） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SW = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 定数
  const C = {
    T_TRAVEL: 24, T_STOP: 8.5,
    DOOR_OPEN: 0.8, ALIGHT: 1.0, BOARD: 2.6, CLOSE_WARN: 6.8,
    STAND_DRAIN: 1.0, CROWD_DRAIN: 0.6, WALK_DRAIN: 0.3, BRACE_DRAIN: 0.7, SIT_REGEN: 1.3,
    MAX_STAMINA: 100, MAX_KARMA: 100, MAX_MIND: 100, MIND_REGEN: 0.5,
    EYE_STAND: 1.6, EYE_SIT: 1.15,
    PLAYER_SPEED: 1.9, PLAYER_R: 0.26, NPC_R: 0.24,
    COMBO_WINDOW: 45,
    MAX_PEOPLE: 42,
  };
  const DOORS = [-6, 0, 6];
  const X_MIN = -6.75, X_MAX = 8.15;

  // 座席
  function buildSeats() {
    const seats = [];
    const benches = [{ cx: -3, n: 6, pri: false }, { cx: 3, n: 6, pri: false }, { cx: 7.45, n: 3, pri: true }];
    for (const side of [-1, 1]) {
      for (const b of benches) {
        for (let i = 0; i < b.n; i++) {
          const x = b.cx + (i - (b.n - 1) / 2) * 0.5;
          seats.push({ id: seats.length, x, side, z: side * 1.18, fz: side * 0.55, pri: b.pri, occ: -1, res: -1, freedAt: -99, freedBy: -1 });
        }
      }
    }
    return seats;
  }
  // 立ち位置
  function buildSlots(seats) {
    const slots = [];
    for (const s of seats) slots.push({ x: s.x, z: s.fz, kind: 'front', seat: s.id, occ: -1 });
    for (let x = -5.6; x <= 7.8; x += 0.8) if (DOORS.every(d => Math.abs(x - d) > 0.3)) slots.push({ x, z: 0, kind: 'mid', occ: -1 });
    for (const d of DOORS) for (const side of [-1, 1]) for (const dx of [-0.32, 0.32]) slots.push({ x: d + dx, z: side * 1.02, kind: 'door', door: d, side, occ: -1 });
    return slots;
  }

  // ---------------------------------------------------------------- 駅
  const LINE = [
    { name: '寝坊ヶ丘', kana: 'ねぼうがおか', board: [0, 0] },
    { name: '二度寝台', kana: 'にどねだい', board: [4, 6] },
    { name: '学園前', kana: 'がくえんまえ', board: [5, 7] },
    { name: '満員坂', kana: 'まんいんざか', board: [12, 15] },
    { name: 'オフィス街', kana: 'おふぃすがい', board: [5, 7] },
    { name: '病院前', kana: 'びょういんまえ', board: [5, 7] },
    { name: '乗換天国', kana: 'のりかえてんごく', board: [11, 14] },
    { name: '商店街前', kana: 'しょうてんがいまえ', board: [5, 7] },
    { name: '腰痛温泉', kana: 'ようつうおんせん', board: [4, 6] },
    { name: '推し活スタジアム', kana: 'おしかつすたじあむ', board: [4, 6] },
    { name: '迷子ヶ谷', kana: 'まいごがや', board: [2, 4] },
    { name: 'やっと座れ橋', kana: 'やっとすわればし', board: [0, 0] },
  ];
  const ENDLESS_NAMES = ['もう一駅', '帰りたい', '残業坂', '終電前', '星見台', 'ひざ笑う', '吊り革町', '満腹', '無限ヶ原', '明日こそ', '夢の島', 'まだ着かない', '揺れる谷', '腰が限界', '奇跡ヶ丘', '座席の森'];
  const FAV = { // 降りやすい駅
    salaryman: [4, 6], ol: [4, 6], student: [2], elderly: [5, 7, 8], obachan: [7, 5], tourist: [8, 9],
    otaku: [9], drunk: [11], pregnant: [5], injured: [5], mother: [7], gamer: [], yankee: [], ceo: [4], alien: [9], sick: [5],
  };

  // ---------------------------------------------------------------- 乗客タイプ
  const TYPES = {
    salaryman: { name: 'サラリーマン', female: 0, sleepy: 0.5, watch: 1, idle: ['phone', 'phone', 'none'], want: 0.85, react: 1.0, speed: 1.3 },
    ol: { name: 'OL', female: 1, sleepy: 0.25, watch: 1, idle: ['phone', 'makeup', 'none'], want: 0.85, react: 0.9, speed: 1.3 },
    student: { name: '学生', female: 0.5, sleepy: 0.3, watch: 0, idle: ['phone', 'book', 'phone'], want: 0.6, react: 0.8, speed: 1.5 },
    elderly: { name: 'お年寄り', female: 0.5, sleepy: 0.35, watch: 1, idle: ['none', 'none', 'book'], want: 1, react: 1.6, speed: 0.8, priority: 30 },
    pregnant: { name: '妊婦さん', female: 1, sleepy: 0.1, watch: 0, idle: ['none', 'phone'], want: 1, react: 1.4, speed: 0.9, priority: 45 },
    injured: { name: 'ケガ人', female: 0.3, sleepy: 0.1, watch: 0, idle: ['none', 'phone'], want: 1, react: 1.5, speed: 0.7, priority: 35 },
    mother: { name: '子連れママ', female: 1, sleepy: 0.05, watch: 0, idle: ['none'], want: 1, react: 1.2, speed: 1.0, priority: 40 },
    obachan: { name: '席ハンターおばちゃん', female: 1, sleepy: 0.15, watch: 0, idle: ['none', 'phone'], want: 1, react: 0.25, speed: 2.0 },
    tourist: { name: '観光客', female: 0.5, sleepy: 0, watch: 0, idle: ['map', 'map', 'phone'], want: 0.8, react: 1.2, speed: 1.1, alwaysLook: 1 },
    gamer: { name: 'スマホゲーマー', female: 0.3, sleepy: 0, watch: 0, idle: ['game'], want: 0.8, react: 1.5, speed: 1.2, noLook: 1 },
    yankee: { name: 'ヤンキー', female: 0.15, sleepy: 0, watch: 0, idle: ['phone', 'none'], want: 1, react: 0.6, speed: 1.4, tough: 1 },
    drunk: { name: '酔っぱらい', female: 0.1, sleepy: 1, watch: 0, idle: ['none'], want: 1, react: 2.0, speed: 0.8 },
    otaku: { name: '推し活オタク', female: 0.4, sleepy: 0.05, watch: 0, idle: ['phone', 'phone'], want: 0.7, react: 0.9, speed: 1.4 },
    ceo: { name: '謎の紳士', female: 0, sleepy: 0, watch: 1, idle: ['none'], want: 1, react: 1.6, speed: 0.8, priority: 200, rare: 1 },
    thief: { name: '若者', female: 0, sleepy: 0, watch: 0, idle: ['phone'], want: 0, react: 1, speed: 1.5, noLook: 1 },
    alien: { name: '???', female: 0, sleepy: 0, watch: 0, idle: ['none'], want: 1, react: 1.0, speed: 1.0, priority: 150, rare: 1 },
    sick: { name: '具合が悪そうな人', female: 0.5, sleepy: 0.05, watch: 0, idle: ['none'], want: 1, react: 1.4, speed: 0.9, priority: 35 },
    dasher: { name: 'せっかちな人', female: 0.3, sleepy: 0, watch: 0, idle: ['phone'], want: 1, react: 0.05, speed: 2.8 },
    emperor: { name: '車内の帝王', female: 0, sleepy: 0, watch: 0, idle: ['none'], want: 1, react: 0.1, speed: 0.9, tough: 1 },
    henchman: { name: '帝王の子分', female: 0, sleepy: 0, watch: 0, idle: ['none'], want: 0, react: 1, speed: 1.4, tough: 1 },
  };
  const BASE_WEIGHTS = { salaryman: 22, ol: 14, student: 12, elderly: 9, pregnant: 2.5, injured: 2, mother: 2.5, obachan: 6, tourist: 4, gamer: 7, yankee: 3, drunk: 2, otaku: 4, sick: 1.2 };
  const STATION_BOOST = { 2: { student: 18 }, 3: { salaryman: 20, ol: 10 }, 5: { elderly: 10, injured: 3 }, 6: { tourist: 5, ol: 6 }, 7: { obachan: 8, elderly: 6, mother: 3 }, 8: { elderly: 8, tourist: 4 }, 9: { otaku: 14 } };

  const COLORS = [
    ['紺', '#1f2a44'], ['黒', '#1b1b1d'], ['灰色', '#6c7078'], ['赤', '#b0303a'], ['青', '#2f5fae'], ['緑', '#3e7a48'],
    ['黄色', '#d8b23a'], ['ピンク', '#d983a6'], ['白', '#e6e6e2'], ['茶色', '#7a5534'], ['紫', '#6d4a91'], ['オレンジ', '#d77a2c'], ['水色', '#7fbfe0'],
  ];
  const SKINS = ['#f1c9a5', '#e8b88f', '#d9a27a', '#f5d6bc', '#c98e64', '#e3b394'];
  const HAIRS = ['#1d1612', '#2b2018', '#3a2a1e', '#5a3d25', '#8a6a48', '#b8b2aa', '#dcdad6', '#c9a35a'];

  const ITEMS = [
    { key: 'wallet', name: '財布', pts: 25, w: 5 },
    { key: 'phone', name: 'スマホ', pts: 25, w: 5 },
    { key: 'pass', name: '定期券', pts: 20, w: 4 },
    { key: 'hanky', name: 'ハンカチ', pts: 12, w: 5 },
    { key: 'teeth', name: '入れ歯', pts: 40, w: 1.2 },
    { key: 'scroll', name: '謎の巻物', pts: 66, w: 0.4 },
  ];

  const SKILLS = [
    { key: 'glasses', name: '見極めメガネ', icon: '👓', cost: 25, dur: 30, desc: '乗客があと何駅で降りるか見える（30秒）' },
    { key: 'drink', name: 'エナドリ', icon: '🥤', cost: 20, desc: '体力+35。飲むたびに値上がり' },
    { key: 'brainwash', name: '洗脳ビーム', icon: '🌀', cost: 50, karma: 10, desc: '座っている人を狙って発射。急用を思い出して席を立つ（カルマ+10）' },
    { key: 'force', name: '強制どかし', icon: '💪', cost: 10, karma: 22, desc: '目の前の座っている人をどかして座る（カルマ+22）。強い人には反撃される' },
    { key: 'legs', name: '鉄の脚', icon: '🦵', cost: 35, dur: 40, desc: '立っていても体力が減らない＆揺れに強い（40秒）' },
    { key: 'protein', name: '鉄拳プロテイン', icon: '🥊', cost: 20, dur: 60, desc: 'パンチの威力2倍、ガードで無傷（60秒）' },
    { key: 'confess', name: '懺悔', icon: '🙏', cost: 45, desc: 'カルマ-25（30秒に1回）' },
  ];

  // ステータス（やりこむとレベルが上がって割り振れる）。どれも 0〜10、1 ポイントの効き目は小さめ
  const STATS = [
    { key: 'hp', name: '体力', icon: '💪', desc: '立っていても疲れにくい・座ると早く回復' },
    { key: 'spd', name: '足の速さ', icon: '🦵', desc: '歩くのが速い・混んでいても進みやすい' },
    { key: 'atk', name: '攻撃力', icon: '👊', desc: 'パンチがクリティカル（2倍）になりやすい' },
    { key: 'def', name: '防御力', icon: '🛡', desc: '殴られても痛くない・揺れで踏ん張りやすい' },
    { key: 'guts', name: '度胸', icon: '😤', desc: 'こわい人に注意しても言うことを聞いてくれやすい' },
    { key: 'eye', name: '観察力', icon: '👀', desc: 'メガネが長持ち・あやしい人に気づきやすい' },
  ];
  const STAT_MAX = 10, STAT_CAP_TOTAL = 30, STAT_CAP_FAIR = 20; // 合計の上限（ランキング・オンラインは 20）
  function normStats(st) { const o = {}; for (const d of STATS) o[d.key] = clamp(Math.floor(+(st && st[d.key]) || 0), 0, STAT_MAX); return o; }
  function statSum(st) { let n = 0; for (const d of STATS) n += (st && st[d.key]) || 0; return n; }
  // 合計が上限をこえていたら、大きいものから 1 ずつ減らす
  function capStats(st, cap) {
    const o = normStats(st);
    while (statSum(o) > cap) { let k = STATS[0].key; for (const d of STATS) if (o[d.key] > o[k]) k = d.key; o[k]--; }
    return o;
  }
  // レベル：経験値の表（lv → lv+1 に必要な経験値）
  function xpNeed(lv) { return 60 + 20 * lv; }
  function levelOf(xp) { let lv = 1, x = xp || 0; while (x >= xpNeed(lv) && lv < 99) { x -= xpNeed(lv); lv++; } return { lv, into: x, need: xpNeed(lv) }; }
  function statPoints(lv) { return Math.min(STAT_CAP_TOTAL, Math.max(0, lv - 1)); }
  function xpGain(g) { const sc = finalScore(g), res = g.multi ? (g.pi >= 0 ? g.players[g.pi].result : null) : g.result; return Math.round(sc.total / 10) + g.stats.stations * 3 + (res && res.cause === 'clear' ? 30 : 0); }
  const ST = (g, k) => (g.player.st && g.player.st[k]) || 0;

  const TITLES = [
    [0, '吊り革の妖精'], [150, 'ただの通勤者'], [350, '車内の常連'], [600, '気づかいの人'], [900, '車内の守護者'],
    [1300, '吊り革マスター'], [1800, '通勤電車の聖人'], [2500, '伝説の乗客'], [3500, '線路を統べる者'],
  ];
  function titleFor(score, karma) {
    let t = TITLES[0][1];
    for (const [s, n] of TITLES) if (score >= s) t = n;
    if (karma >= 80) t = '闇の' + t;
    return t;
  }

  const ACHIEVEMENTS = [
    { id: 'first_sit', name: 'はじめての着席', desc: '席に座る' },
    { id: 'quick5', name: '秒速着席', desc: '空いてから1秒以内に座る×5（1回で）' },
    { id: 'saint5', name: '聖人', desc: '1回で5回席を譲る' },
    { id: 'hunter3', name: '痴漢ハンター', desc: '痴漢を合計3人KO' },
    { id: 'counter5', name: 'カウンターの鬼', desc: '1回でカウンター5回' },
    { id: 'lost5', name: '落とし物名人', desc: '1回で落とし物を5回届ける' },
    { id: 'teeth', name: '入れ歯の恩人', desc: '入れ歯を持ち主に届ける' },
    { id: 'ironman', name: '鉄人', desc: '一度も座らずに終点まで行く' },
    { id: 'devil', name: '悪魔の帰宅', desc: 'カルマ90以上で終点まで行く' },
    { id: 'pure', name: '聖人君子', desc: 'カルマ0のまま終点まで行く' },
    { id: 'ceo', name: '恩を売る', desc: '謎の紳士に席を譲る', hidden: 1 },
    { id: 'alien_seat', name: '銀河の善行', desc: '???に席を譲る', hidden: 1 },
    { id: 'alien_punch', name: '未知との遭遇', desc: '???を殴る', hidden: 1 },
    { id: 'arrested', name: '連行', desc: 'カルマが限界をこえる' },
    { id: 'collapse', name: '膝が笑う', desc: '体力0で倒れる' },
    { id: 'ko', name: '返り討ち', desc: '痴漢に倒される' },
    { id: 'brain3', name: '洗脳マスター', desc: '1回で洗脳3回' },
    { id: 'wrong', name: '誤爆', desc: '関係ない人を殴る' },
    { id: 'tanuki', name: '狸', desc: '1回で狸寝入り合計60秒' },
    { id: 'clear', name: '終点到着', desc: 'やっと座れ橋に着く' },
    { id: 'oversleep', name: '寝過ごしハンター', desc: '寝過ごした人の席を奪う' },
    { id: 'brace10', name: '体幹おばけ', desc: '1回で揺れを10回踏ん張る' },
    { id: 'door3', name: '駆け込み幇助', desc: '1回でドアを3回押さえる' },
    { id: 'combo5', name: '善行コンボ', desc: '善行を5連続でつなぐ' },
    { id: 'score2000', name: '伝説の乗客', desc: 'スコア2000以上' },
    { id: 'endless30', name: '環状線の亡霊', desc: '終点なしモードで30駅', hidden: 1 },
    { id: 'jiji', name: '敬老の日', desc: '全員お年寄りモードで遊ぶ', hidden: 1 },
    { id: 'thief', name: '泥棒退治', desc: '落とし物泥棒を撃退する' },
    { id: 'hard', name: '満員地獄', desc: '地獄モードで終点まで行く', hidden: 1 },
    { id: 'suri', name: '現行犯', desc: 'スリを撃退する' },
    { id: 'faker', name: '名探偵', desc: '仮病を見破る' },
    { id: 'blocker', name: '鉄壁', desc: '席ダッシュを体でブロックする' },
    { id: 'hush', name: '車内の風紀委員', desc: '大声の電話をやめさせる' },
    { id: 'hogask', name: 'すみません、詰めて', desc: '2人分の席を詰めてもらう' },
    { id: 'emperor', name: '帝王討伐', desc: '車内の帝王を倒す', hidden: 1 },
    { id: 'false', name: '冤罪', desc: 'まだ何もしていない人を殴る', hidden: 1 },
    { id: 'speaker', name: '静かな車内', desc: '迷惑YouTuberのスピーカーを壊す' },
    { id: 'brawl', name: '逆ギレ返し', desc: '逆ギレして向かってきた人を返り討ちにする' },
    { id: 'bagthrow', name: 'かばん投げ', desc: '席に置かれたかばんをぶん投げる', hidden: 1 },
  ];

  // ---------------------------------------------------------------- 乱数
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.chance = p => f() < p;
    return f;
  }
  function weighted(r, obj) {
    let tot = 0; for (const k in obj) tot += obj[k];
    let v = r() * tot;
    for (const k in obj) { v -= obj[k]; if (v <= 0) return k; }
    return Object.keys(obj)[0];
  }
  const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------------------------------------------------------------- ゲーム作成
  function makePlayer(x, z) {
    return {
      x, z, yaw: Math.PI / 2, pitch: 0, seat: -1, stamina: C.MAX_STAMINA, karma: 0, toku: 0, earned: 0,
      combo: 0, lastDeedT: -999, carrying: null, lastBraceT: -99, braceHeld: false, punchCD: 0, hitFlash: 0,
      fakeSleep: false, mode: null, modeT: 0, buffs: {}, drinkCount: 0, confessCD: 0, stagger: 0, punchAnim: 0,
      ignoreT: 0, sitT: 0, st: normStats(null), mind: 100,
    };
  }
  // フェイントする人：id から決める（乱数を使わない）。およそ 18%
  const FEINT_OK = { salaryman: 1, ol: 1, student: 1, otaku: 1, obachan: 1, gamer: 1, yankee: 1, tourist: 1 };
  function feinter(p) { return ((Math.imul(p.id, 2654435761) >>> 0) % 100) < 18; }
  function makeStats() {
    return {
      sits: 0, quickSits: 0, gives: 0, chikanKO: 0, counters: 0, delivered: 0, teeth: 0, ceo: 0, alien: 0, alienPunch: 0,
      brainwash: 0, force: 0, wrongPunch: 0, thiefKO: 0, stolen: 0, tanuki: 0, oversleepSteal: 0, braces: 0, braceFail: 0, doorHolds: 0, maxCombo: 0,
      standTime: 0, sitTime: 0, stations: 0, sos: 0, deeds: 0, skillsUsed: 0, bestDeed: null,
      suriKO: 0, falseAccuse: 0, fakerExposed: 0, fooled: 0, dashBlock: 0, hush: 0, hogAsk: 0, henchKO: 0, emperorKO: 0, brawlKO: 0, bagThrow: 0, speakerKO: 0, warns: 0, wrongWarn: 0,
    };
  }
  function create(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    const mode = opts.mode || 'normal'; // normal | daily | endless | hard | jiji
    const g = {
      C, seed, mode, r: rng(seed), t: 0, over: false, result: null,
      seats: null, slots: null, people: [], nextId: 1, events: [],
      phase: 'stop', phaseT: C.BOARD - 0.4, station: 0, doorSide: 1, doorsOpen: true, doorClose: C.T_STOP,
      items: [], chikan: null, lurch: null, runner: null, nextChikanCheck: 30, nextItemCheck: 12, samaritanT: 15,
      endless: mode === 'endless', hard: mode === 'hard', jiji: mode === 'jiji', bal2: !!opts.bal2,
      player: makePlayer(0.4, 0.6),
      stats: makeStats(),
      aim: -1, prompt: null, ann: '', online: mode === 'online',
    };
    // 複数プレイヤー（オンライン）：opts.players = [{ name, cpu }]
    if (opts.players && opts.players.length) {
      g.multi = true; g.pi = -1;
      const spots = [[0.4, 0.6], [-0.6, -0.55], [1.5, -0.5], [-1.4, 0.55]];
      g.players = opts.players.map((o, i) => ({
        i, name: o.name || ('プレイヤー' + (i + 1)), cpu: !!o.cpu, pl: Object.assign(makePlayer(spots[i % 4][0], spots[i % 4][1]), { st: capStats(o.cpu ? { hp: 3, spd: 3, atk: 4, def: 4, guts: 3, eye: 3 } : o.stats, STAT_CAP_FAIR) }), stats: makeStats(),
        aim: -1, prompt: null, events: [], out: false, result: null, ghost: false, tricks: 0, pko: 0,
      }));
      g.worldPlayer = makePlayer(999, 0); g.worldStats = makeStats(); g.worldEvents = [];
    }
    // 悪者：どの種類が出るか（ふつうはスリ＋日がわりのゲスト 1 種類。地獄・終点なしは全部）
    g.vr = rng((seed ^ 0x5eed5eed) >>> 0);
    const GUESTS = ['hog', 'faker', 'dasher', 'caller', 'tuber', 'leak', 'pack', 'bento', 'preach', 'door'];
    g.tutorial = mode === 'tutorial';
    if (g.tutorial) { g.nextChikanCheck = 1e9; g.nextItemCheck = 1e9; }
    g.villainKinds = g.jiji || g.tutorial ? [] : ['suri'].concat(GUESTS); // 全部の悪者がランダムに出る（同時に 2 人まで）
    if (opts.villains) g.villainKinds = opts.villains.slice();
    g.noBoss = !!opts.noBoss || !!opts.villains; // テストで悪者を決めているときはボス駅なし
    // ボス駅テスト：毎駅がボス駅（1 つをくり返す／全部を順番に）。ほかの悪者は出ない。倒れない
    if (opts.bossTest) { g.bossTest = opts.bossTest; g.endless = true; g.villainKinds = []; g.noBoss = false; }
    planBoss(g);
    g.seenVillain = {};
    g.seats = buildSeats();
    g.slots = buildSlots(g.seats);
    g.player.stamina = C.MAX_STAMINA;
    if (opts.stats && !g.multi) g.player.st = capStats(opts.stats, opts.statCap || STAT_CAP_TOTAL);
    populateStart(g);
    if (g.multi) setCtx(g, -1);
    return g;
  }

  function lastStation(g) { return g.endless ? 1e9 : g.online ? 7 : LINE.length - 1; }
  function stationName(g, i) {
    if (g.bossAt && g.bossAt[i]) return BOSS[g.bossAt[i]].name;
    if (g.online && i >= 7) return LINE[LINE.length - 1].name;
    if (i < LINE.length - (g.endless ? 1 : 0)) return LINE[i].name;
    if (g.endless) {
      const k = i - (LINE.length - 1);
      return ENDLESS_NAMES[k % ENDLESS_NAMES.length] + (k >= ENDLESS_NAMES.length ? ' ' + (Math.floor(k / ENDLESS_NAMES.length) + 1) + '丁目' : '');
    }
    return LINE[LINE.length - 1].name;
  }
  function nextStation(g) { return g.phase === 'travel' ? g.station + 1 : g.station; }

  // ---------------------------------------------------------------- 複数プレイヤー
  const PID = 100000; // 照準で「ほかのプレイヤー」を表す番号（PID + 何人目か）
  // いま処理しているプレイヤーに切り替える（-1 は世界）。1 人用のときは何もしない
  function setCtx(g, i) {
    if (!g.multi) return;
    if (g.pi >= 0) { const P = g.players[g.pi]; P.aim = g.aim; P.prompt = g.prompt; }
    g.pi = i;
    if (i < 0) { g.player = g.worldPlayer; g.stats = g.worldStats; g.events = g.worldEvents; g.aim = -1; g.prompt = null; return; }
    const P = g.players[i]; g.player = P.pl; g.stats = P.stats; g.events = P.events; g.aim = P.aim; g.prompt = P.prompt;
  }
  function aliveIdx(g) { const a = []; g.players.forEach((P, i) => { if (!P.out) a.push(i); }); return a; }
  // 世界の処理から見たプレイヤーの体（脱落した人は含めない）
  function bodies(g) { return g.multi ? g.players.filter(P => !P.out).map(P => P.pl) : [g.player]; }
  function seatedBody(g) { for (const b of bodies(g)) if (b.seat >= 0) return b; return null; }
  function withEach(g, fn) {
    if (!g.multi) { fn(g.player, 0); return; }
    const prev = g.pi;
    for (const i of aliveIdx(g)) { setCtx(g, i); fn(g.player, i); }
    setCtx(g, prev);
  }
  function toOthers(g, e) { if (!g.multi) return; g.players.forEach((P, i) => { if (i !== g.pi) P.events.push(e); }); }
  function emit(g, e) { g.events.push(e); if (g.events.length > 400) g.events.splice(0, 100); }
  function toast(g, text, kind) { emit(g, { type: 'toast', text, kind: kind || 'info' }); }
  function bubble(g, p, text, dur) { p.bubble = text; p.bubbleT = dur || 2.2; emit(g, { type: 'bubble', id: p.id, text }); }

  // ---------------------------------------------------------------- 乗客生成
  function pickType(g, station) {
    const r = g.r;
    if (g.jiji) return r.chance(0.08) ? 'obachan' : 'elderly';
    if (station >= 3 && r.chance(0.035)) return 'ceo';
    if (station >= 2 && r.chance(0.012)) return 'alien';
    const w = Object.assign({}, BASE_WEIGHTS);
    const st = g.endless && station >= LINE.length ? (station % 9) + 1 : station;
    const boost = STATION_BOOST[st] || {};
    for (const k in boost) w[k] = (w[k] || 0) + boost[k];
    if (g.hard) { w.obachan *= 2; w.yankee *= 2; }
    return weighted(r, w);
  }
  function pickDest(g, type, from) {
    const r = g.r, last = lastStation(g);
    if (g.endless) {
      const maxRem = 8;
      // 好みの駅（周期 9 駅で同じ性格の駅がくる）
      const w = {};
      for (let d = from + 1; d <= from + maxRem; d++) {
        let v = 1;
        const base = d < LINE.length - 1 ? d : ((d - (LINE.length - 1)) % 9) + 1;
        if ((FAV[type] || []).includes(base)) v += 5;
        if (base === 6) v += 1.5;
        w[d] = v;
      }
      if (type === 'drunk') return from + 7 + r.int(0, 3);
      return parseInt(weighted(r, w), 10);
    }
    if (type === 'drunk') return r.chance(0.8) ? last : r.int(Math.min(from + 4, last), last);
    const w = {};
    for (let d = from + 1; d <= last; d++) {
      let v = 1;
      if ((FAV[type] || []).includes(d)) v += 6;
      if (d === 6) v += 2;
      if (d === last) v += 1.5;
      // 都心に向かう朝の電車：遠くの駅（終点の近く）で降りる人ほど多い → 終盤ほど混む
      { const x = (d - from) / Math.max(1, last - from); v *= 0.35 + 2.4 * x * x; }
      w[d] = v;
    }
    return parseInt(weighted(r, w), 10);
  }
  function makeLook(g, type, female) {
    const r = g.r;
    let top = r.pick(COLORS), bottom = r.pick(COLORS.slice(0, 3).concat([COLORS[9], COLORS[4]]));
    if (type === 'salaryman' || type === 'ceo') { top = r.pick([COLORS[0], COLORS[1], COLORS[2]]); bottom = top; }
    if (type === 'student') { top = r.pick([COLORS[0], COLORS[1]]); bottom = top; }
    let hairC = r.pick(HAIRS.slice(0, 5));
    if (type === 'elderly' || type === 'ceo') hairC = r.pick(HAIRS.slice(5, 7));
    if (type === 'yankee') hairC = r.pick(['#d9b04a', '#c9a35a', '#e0e0e0', '#b33']);
    let skin = r.pick(SKINS);
    if (type === 'alien') skin = '#8fd18a';
    if (type === 'drunk') skin = '#eaa58a';
    if (type === 'thief') { top = ['黒', '#26262b']; bottom = ['紺', '#1f2a44']; }
    if (type === 'dasher') { top = ['オレンジ', '#e0661c']; bottom = ['紺', '#1f2a44']; }
    if (type === 'emperor') { top = ['金色', '#c9a227']; bottom = ['黒', '#1b1b1d']; hairC = '#e8e8e8'; }
    if (type === 'henchman') { top = ['黒', '#1b1b1d']; bottom = top; hairC = '#1d1612'; }
    const hairStyle = female ? r.pick(['long', 'bob', 'pony', 'bun']) : r.pick(['short', 'short', 'side', 'buzz']);
    return {
      top: top[1], topName: top[0], bottom: bottom[1], skin, hair: hairC,
      hairStyle: type === 'elderly' && !female && r.chance(0.4) ? 'bald' : type === 'alien' ? 'hat' : type === 'henchman' ? 'buzz' : hairStyle,
      glasses: (type === 'otaku' || type === 'salaryman' || type === 'elderly' || type === 'ceo') && r.chance(0.45) || type === 'emperor' || type === 'henchman',
      mask: r.chance(0.12) && type !== 'alien' && type !== 'emperor' && type !== 'henchman' && type !== 'sick', // 具合が悪そうな人は表情が大事なのでマスクなし
      bag: r.chance(0.5) || type === 'tourist',
      tie: (type === 'salaryman' || type === 'ceo' || type === 'emperor') ? (type === 'ceo' ? '#d8b23a' : type === 'emperor' ? '#7a1020' : r.pick(['#8a2a2a', '#2a3f8a', '#3a6a3a', '#777'])) : null,
      shade: r.range(-0.1, 0.1),
      shades: type === 'emperor' || type === 'henchman', crown: type === 'emperor',
    };
  }
  function spawn(g, type, station, dest) {
    const r = g.r, T = TYPES[type];
    const female = r.chance(T.female) ? 1 : 0;
    const p = {
      id: g.nextId++, type, female, h: (female ? r.range(1.52, 1.68) : r.range(1.62, 1.84)) * (type === 'elderly' ? 0.95 : 1),
      x: 0, z: 0, ry: 0, state: 'stand', seat: -1, slot: -1, tx: 0, tz: 0, then: null,
      dest: dest != null ? dest : pickDest(g, type, station), boardedAt: station,
      priority: T.priority || 0, wantSeat: r.chance(T.want), react: T.react * r.range(0.75, 1.35), speed: T.speed * r.range(0.9, 1.1),
      sleep: 0, oversleep: false, anim: 'none', animT: 0, idle: r.pick(T.idle), looks: [], watches: [], packing: false, prep: -1,
      expr: 'neutral', exprT: 0, blink: r.range(0, 4), bubble: null, bubbleT: 0, role: null, scanT: 0, look: makeLook(g, type, female),
      tough: !!T.tough, wakeT: -1, arrivedFrontT: -1, targetPlayer: false, walkPhase: r.range(0, 6), angry: 0, stopLeaving: false,
      undercover: false, stunned: 0, wantT: 0, priOK: r.chance(0.5),
    };
    if (type === 'salaryman' && r.chance(0.06)) p.undercover = true;
    return p;
  }
  function assignSleep(g, p) {
    const T = TYPES[p.type], rem = p.dest - nextStation(g);
    p.sleep = 0;
    if (rem >= 3 && g.r.chance(T.sleepy)) p.sleep = g.r.chance(0.6) ? 2 : 1;
    if (p.type === 'drunk') p.sleep = 2;
    if (rem <= 1 && g.r.chance(T.sleepy * 0.25)) { p.sleep = 2; p.oversleep = true; } // 寝過ごし予備軍
  }
  function sitAt(g, p, seat) {
    // 目の前で空いた席を取られた（席の前に立っていたプレイヤーの心が削られる）
    if (g.t > 3 && !seat.gift && g.t - seat.freedAt < 5) {
      const bi = bodyIndex(g, (b) => b.seat < 0 && dist2(b.x, b.z, seat.x, seat.fz) < 0.95);
      if (bi >= 0) asPlayer(g, bi, () => hurtMind(g, 8, '目の前で席を取られた'));
    }
    seat.occ = p.id; seat.res = -1; seat.gift = false;
    p.seat = seat.id; p.state = 'seated'; p.x = seat.x; p.z = seat.z; p.ry = seat.side > 0 ? Math.PI : 0;
    releaseSlot(g, p);
    p.prep = -1; p.anim = 'none';
    if (p.sleep === 0) assignSleep(g, p);
    if (p.role === 'hog') hogClaim(g, p);
  }
  function releaseSlot(g, p) { if (p.slot >= 0) { if (g.slots[p.slot].occ === p.id) g.slots[p.slot].occ = -1; p.slot = -1; } }
  function freeSeat(g, seat, by) { seat.occ = -1; seat.res = -1; seat.gift = false; seat.freedAt = g.t; seat.freedBy = by != null ? by : -1; if (by !== -1 && by != null) emit(g, { type: 'seatFree', id: seat.id }); }

  function populateStart(g) {
    const r = g.r;
    const nSeat = g.hard ? 30 : 26, nStand = g.hard ? 12 : 8;
    const seatOrder = g.seats.map(s => s.id).sort(() => r() - 0.5);
    for (let i = 0; i < nSeat; i++) {
      let type = pickType(g, 1); if (TYPES[type].priority && !g.jiji && type !== 'elderly') type = 'salaryman';
      const p = spawn(g, type, 0);
      g.people.push(p); sitAt(g, p, g.seats[seatOrder[i]]);
    }
    for (let i = 0; i < nStand; i++) {
      const p = spawn(g, pickType(g, 1), 0);
      if (g.tutorial) { p.wantSeat = false; p.priority = 0; }
      g.people.push(p); placeStanding(g, p, true);
    }
    g.phase = 'stop'; g.phaseT = C.BOARD + 1.5; g.doorsOpen = true; g.doorSide = 1; g.nextDoorSide = 1;
    g.ann = stationName(g, 0) + '駅。この電車は ' + (g.endless ? 'どこまでも' : stationName(g, lastStation(g)) + ' 行き') + 'です。';
  }

  function chooseSlot(g, p, nearX, nearZ, preferFront) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < g.slots.length; i++) {
      const s = g.slots[i];
      if (s.occ >= 0) continue;
      if (bodies(g).some(b => dist2(s.x, s.z, b.x, b.z) < 0.5)) continue;
      let d = dist2(s.x, s.z, nearX, nearZ);
      if (preferFront && s.kind !== 'front') d += 2.5;
      if (!preferFront && s.kind === 'front') d += 0.8;
      d += g.r() * 1.2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function placeStanding(g, p, instant) {
    const si = chooseSlot(g, p, p.x, p.z, p.wantSeat);
    if (si < 0) { p.tx = p.x; p.tz = 0; }
    else { g.slots[si].occ = p.id; p.slot = si; p.tx = g.slots[si].x; p.tz = g.slots[si].z; }
    if (instant) { p.x = p.tx; p.z = p.tz; p.state = 'stand'; }
    else { p.state = 'walk'; p.then = 'stand'; }
  }

  // ---------------------------------------------------------------- 照準
  function headY(p) {
    if (p.state === 'seated') return p.h * 0.93 - 0.5 - (p.sleep ? 0.06 : 0);
    if (p.state === 'ko') return 0.25;
    return p.h * 0.93;
  }
  function eyeY(g) { return g.player.seat >= 0 ? C.EYE_SIT : C.EYE_STAND; }
  function aimTarget(g, maxD) {
    const pl = g.player;
    const cp = Math.cos(pl.pitch);
    const fx = -Math.sin(pl.yaw) * cp, fy = Math.sin(pl.pitch), fz = -Math.cos(pl.yaw) * cp;
    const ey = eyeY(g);
    let best = -1, bs = 1e9;
    for (const p of g.people) {
      if (p.state === 'gone' || p.state === 'exit' && Math.abs(p.z) > 1.5) continue;
      const hy = headY(p);
      for (const yy of [hy - 0.05, hy - 0.45]) {
        const dx = p.x - pl.x, dy = yy - ey, dz = p.z - pl.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxD || d < 0.05) continue;
        const dot = (dx * fx + dy * fy + dz * fz) / d;
        if (dot <= 0) continue;
        const ang = Math.acos(clamp(dot, -1, 1));
        const allow = Math.atan(0.3 / d) + 0.05;
        if (ang < allow) { const sc = ang / allow + d * 0.05; if (sc < bs) { bs = sc; best = p.id; } }
      }
    }
    if (g.multi) {
      g.players.forEach((P, j) => {
        if (j === g.pi || P.out) return;
        const b = P.pl, hy = b.seat >= 0 ? C.EYE_SIT + 0.05 : C.EYE_STAND + 0.05;
        for (const yy of [hy - 0.05, hy - 0.45]) {
          const dx = b.x - pl.x, dy = yy - ey, dz = b.z - pl.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > maxD || d < 0.05) continue;
          const dot = (dx * fx + dy * fy + dz * fz) / d;
          if (dot <= 0) continue;
          const ang = Math.acos(clamp(dot, -1, 1)), allow = Math.atan(0.3 / d) + 0.05;
          if (ang < allow) { const sc = ang / allow + d * 0.05; if (sc < bs) { bs = sc; best = PID + j; } }
        }
      });
    }
    return best;
  }
  function person(g, id) { for (const p of g.people) if (p.id === id) return p; return null; }

  // 目撃者による倍率
  function witnessFactor(g) {
    const pl = g.player;
    let n = 0, uc = false;
    for (const p of g.people) {
      if (p.state === 'gone' || p.state === 'exit') continue;
      const d = dist2(p.x, p.z, pl.x, pl.z);
      if (d < 5 && p.sleep === 0 && p.state !== 'ko') n++;
      if (p.undercover && d < 6 && p.sleep === 0) uc = true;
    }
    return { f: (1 + 0.04 * Math.min(n, 18)) * (uc ? 2 : 1), n, uc };
  }
  function addKarma(g, base, why, useWitness) {
    let amt = base;
    if (useWitness !== false) {
      const w = witnessFactor(g);
      amt = base * w.f;
      if (w.uc) toast(g, '…変装した駅員に見られていた！', 'bad');
    }
    amt = Math.round(amt);
    g.player.karma = Math.min(C.MAX_KARMA, g.player.karma + amt);
    emit(g, { type: 'karma', amount: amt, text: why });
    return amt;
  }
  // 新バランス（お試し）：座ることの点。コンボやカルマには関係しない
  function bonusPts(g, n, label) {
    const pl = g.player; pl.toku += n; pl.earned += n;
    emit(g, { type: 'points', amount: n, text: label, combo: 1 });
  }
  function deed(g, base, label) {
    const pl = g.player;
    if (g.t - pl.lastDeedT < C.COMBO_WINDOW) pl.combo++; else pl.combo = 1;
    pl.lastDeedT = g.t;
    const mult = Math.min(2.5, 1 + 0.25 * (pl.combo - 1));
    const pts = Math.round(base * mult);
    pl.toku += pts; pl.earned += pts;
    pl.karma = Math.max(0, pl.karma - 5);
    pl.mind = Math.min(C.MAX_MIND, pl.mind + 5); // 「ありがとう」で心も回復
    g.stats.deeds++;
    g.stats.maxCombo = Math.max(g.stats.maxCombo, pl.combo);
    if (!g.stats.bestDeed || pts > g.stats.bestDeed.pts) g.stats.bestDeed = { pts, label };
    emit(g, { type: 'points', amount: pts, text: label, combo: pl.combo });
    emit(g, { type: 'sfx', name: 'coin' });
    return pts;
  }
  function hurt(g, amt, cause, extra) {
    const pl = g.player;
    pl.stamina -= amt; pl.hitFlash = 0.4;
    if (pl.stamina <= 0) { pl.stamina = 0; gameOver(g, cause, extra); }
  }
  // 精神ゲージ：人間関係のつらさで減る。度胸が高いと減りにくい。0 で「心が折れた」
  function hurtMind(g, amt, why) {
    const pl = g.player; if (g.over || g.multi && g.pi >= 0 && g.players[g.pi].out) return;
    const a = amt * (1 - 0.04 * ST(g, 'guts'));
    pl.mind = Math.max(0, pl.mind - a);
    if (a >= 1) emit(g, { type: 'mind', amount: -Math.round(a), text: why });
    if (pl.mind <= 0) gameOver(g, 'broken');
  }
  const CAUSES = {
    collapse: { title: '膝が笑った', text: '立ちっぱなしで体力が尽きた…' },
    ko: { title: 'KO負け', text: '痴漢の反撃で床に沈んだ…' },
    arrest: { title: '駅員に連行', text: 'カルマがたまりすぎて、次の駅で降ろされた…' },
    clear: { title: '終点到着！', text: 'おつかれさまでした' },
    pko: { title: 'トドメを刺された', text: 'ライバルのパンチで床に沈んだ…' },
    broken: { title: '心が折れた', text: 'もう無理…次の駅で降りた' },
    leave: { title: '途中で降りた', text: '' },
  };
  function gameOver(g, cause, extra) {
    if (g.multi) {
      const P = g.players[g.pi]; if (!P || P.out) return;
      P.out = true; P.outT = g.t; P.outStation = g.station; g.outCount = (g.outCount || 0) + 1; P.outOrder = g.outCount;
      P.result = Object.assign({ cause }, CAUSES[cause], extra || {});
      const pl = P.pl;
      if (pl.seat >= 0) { freeSeat(g, g.seats[pl.seat], -1); pl.seat = -1; }
      if (pl.carrying) { const it = pl.carrying; pl.carrying = null; [it.x, it.z] = aisleClamp(pl.x, pl.z); it.taken = false; it.t0 = g.t; g.items.push(it); }
      pl.fakeSleep = false; pl.mode = null;
      emit(g, { type: cause === 'clear' ? 'clear' : 'gameover', cause });
      if (cause !== 'clear') toOthers(g, { type: 'toast', text: P.name + ' が脱落！（' + CAUSES[cause].title + '）', kind: 'warn' });
      return;
    }
    if (g.over) return;
    g.over = true;
    g.result = Object.assign({ cause }, CAUSES[cause], extra || {});
    emit(g, { type: cause === 'clear' ? 'clear' : 'gameover', cause });
  }
  function finalScore(g) {
    const res = g.multi ? (g.pi >= 0 ? g.players[g.pi].result : null) : g.result;
    const pl = g.player, clear = res && res.cause === 'clear';
    const stationBonus = g.stats.stations * 10;
    const clearBonus = clear ? 300 + Math.round(pl.stamina) : 0;
    const karmaPen = Math.round(pl.karma);
    const total = Math.max(0, pl.earned + stationBonus + clearBonus - karmaPen);
    return { earned: pl.earned, stationBonus, clearBonus, karmaPen, total, title: titleFor(total, pl.karma) };
  }

  // ---------------------------------------------------------------- 移動
  function moveToward(p, tx, tz, sp, dt) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.02) { p.x = tx; p.z = tz; return true; }
    const s = Math.min(d, sp * dt);
    p.x += dx / d * s; p.z += dz / d * s;
    p.ry = Math.atan2(dx, dz);
    p.walkPhase += dt * sp * 6;
    return d - s < 0.02;
  }
  function aisleClamp(x, z) {
    x = clamp(x, X_MIN, X_MAX);
    let zm = 0.82;
    for (const d of DOORS) if (Math.abs(x - d) < 0.62) zm = 1.3;
    return [x, clamp(z, -zm, zm)];
  }
  function nearestDoor(x) { let b = DOORS[0]; for (const d of DOORS) if (Math.abs(d - x) < Math.abs(b - x)) b = d; return b; }

  // ---------------------------------------------------------------- プレイヤー行動
  function computePrompt(g) {
    const pl = g.player;
    const aimId = g.aim, ap = aimId >= 0 ? person(g, aimId) : null;
    const apd = ap ? dist2(ap.x, ap.z, pl.x, pl.z) : 99;
    if (g.over) return null;
    if (pl.mode === 'brainwash' && ap && ap.state === 'seated' && apd < 6) return { act: 'brainwash', label: '洗脳ビーム発射', id: ap.id };
    if (pl.mode === 'force' && ap && ap.state === 'seated' && apd < 1.7 && pl.seat < 0) return { act: 'force', label: '無理やりどかす', id: ap.id };
    if (pl.seat >= 0) {
      const pr = priorityNear(g);
      if (pl.carrying && ap && ap !== pr && apd < 1.8 && ap.state !== 'ko' && !(WARN_ROLES[ap.role] && !ap.warned)) return { act: 'deliver', label: pl.carrying.name + 'を渡す', id: ap.id };
      if (pr) return { act: 'give', label: TYPES[pr.type].name === '???' ? '席を譲る（？）' : TYPES[pr.type].name + 'に席を譲る', id: pr.id };
      if (ap && ap.role === 'caller' && !ap.hushed && apd < 2.2) return { act: 'hush', label: '「電話は静かに…」と注意する', id: ap.id };
      { const wp = warnPrompt(g, ap, apd, true); if (wp) return wp; }
      { const wp = wrongWarnPrompt(g, ap, apd); if (wp) return wp; }
      return { act: 'stand', label: '立ち上がる' };
    }
    // 落とし物を持っていても、注意・座るなどは先に出す（渡すのは、ほかにすることがないとき）
    if (pl.carrying && atOpenDoor(g)) return { act: 'staff', label: '駅員に' + pl.carrying.name + 'を届ける' };
    if (speakerNear(g)) return { act: 'speaker', label: '🔊 スピーカーを壊す（パンチでもOK）' };
    if (ap && ap.role === 'caller' && !ap.hushed && apd < 2.0 && ap.state !== 'ko') return { act: 'hush', label: '「電話は静かに…」と注意する', id: ap.id };
    { const wp = warnPrompt(g, ap, apd, false); if (wp) return wp; }
    if (ap && ap.type === 'sick' && (ap.state === 'stand' || ap.state === 'walk') && ap.role !== 'faked' && !ap.checked && apd < 1.8) return { act: 'expose', label: '「…仮病じゃない？」と指摘する', id: ap.id };
    for (const it of g.items) if (!it.taken && dist2(it.x, it.z, pl.x, pl.z) < 1.15 && !pl.carrying) return { act: 'pick', label: it.name + 'を拾う', id: it.id };
    for (const s of g.seats) if (s.hog && dist2(s.x, s.fz, pl.x, pl.z) < 0.95) {
      const q = person(g, s.hog); if (!q) continue;
      if (q.hogKind === 'bag' && pl.pitch < -0.45) return { act: 'throw', label: '👜 かばんをぶん投げて座る（カルマ+）', id: s.id };
      if (!q.asked) return { act: 'ask', label: q.hogKind === 'bag' ? '「かばん、どけてもらえますか？」と頼む' : '「詰めてもらえますか？」と頼む', id: s.id };
    }
    if (pl.carrying && pl.pitch < -0.55 && !(ap && apd < 1.8 && ap.state !== 'ko')) return { act: 'putdown', label: pl.carrying.name + 'を床に置く' };
    const fs = nearestFreeSeat(g);
    if (fs) return { act: 'sit', label: fs.pri ? '優先席に座る' : '座る', id: fs.id };
    if (pl.carrying && ap && apd < 1.8 && ap.state !== 'ko') return { act: 'deliver', label: pl.carrying.name + 'を渡す', id: ap.id };
    if (g.runner && g.runner.active && !g.runner.held) {
      if (Math.abs(pl.x - g.runner.door) < 0.75 && Math.sign(pl.z) === g.doorSide && Math.abs(pl.z) > 0.9) return { act: 'door', label: 'ドアを押さえる' };
    }
    for (const d of DOORS) for (const side of [-1, 1]) {
      if (dist2(pl.x, pl.z, d + 0.75, side * 1.1) < 0.55 && Math.abs(pl.z) > 0.8) return { act: 'sos', label: g.chikan && g.chikan.stage === 'active' ? '非常通報ボタン（痴漢を通報）' : '非常通報ボタン（いたずら厳禁）' };
    }
    return wrongWarnPrompt(g, ap, apd);
  }
  // 停車中で、開いているドアの近くにいる（駅員に届けられる）
  function atOpenDoor(g) {
    const pl = g.player;
    if (g.phase !== 'stop' || !g.doorsOpen || pl.seat >= 0) return false;
    const d = nearestDoor(pl.x);
    return Math.abs(pl.x - d) < 0.95 && Math.sign(pl.z || 1) === g.doorSide && Math.abs(pl.z) > 0.55;
  }
  function priorityNear(g) {
    const pl = g.player; if (pl.seat < 0) return null;
    const seat = g.seats[pl.seat];
    let best = null, bd = 1.7;
    for (const p of g.people) {
      if (!p.priority || p.state === 'seated' || p.state === 'gone' || p.state === 'exit' || p.leaving || p.dest <= nextStation(g)) continue;
      const d = dist2(p.x, p.z, seat.x, seat.fz);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function nearestFreeSeat(g) {
    const pl = g.player;
    let best = null, bd = 1.25;
    for (const s of g.seats) {
      if (s.occ >= 0) continue;
      const d = dist2(s.x, s.fz, pl.x, pl.z);
      if (d < bd) {
        if (s.res >= 0 && s.gift) continue; // 譲った席は取り返せない
        if (s.res >= 0) { // 予約した人がもう目の前なら無理
          const q = person(g, s.res);
          if (q && dist2(q.x, q.z, s.x, s.fz) < 0.3) continue;
        }
        bd = d; best = s;
      }
    }
    return best;
  }
  function playerSit(g, seat) {
    const pl = g.player;
    if (seat.res >= 0) {
      const q = person(g, seat.res);
      if (q) {
        const qd = dist2(q.x, q.z, seat.x, seat.fz);
        if (qd < 1.0) { addKarma(g, 4, '横取り'); q.expr = 'angry'; q.exprT = 4; bubble(g, q, 'ちょっと！'); }
        q.state = 'stand'; q.then = null; q.angry = 6; placeStanding(g, q, false);
      }
    }
    seat.occ = 0; seat.res = -1; pl.seat = seat.id; pl.x = seat.x; pl.z = seat.z * 0.92; pl.sitT = g.t;
    pl.yaw = seat.side > 0 ? 0 : Math.PI; pl.pitch = 0;
    g.stats.sits++;
    if (g.t - seat.freedAt < 1.0 && seat.freedAt > 0) { g.stats.quickSits++; if (g.bal2) bonusPts(g, 15, '⚡ 秒速着席'); }
    if (seat.freedBy >= 0) { const q = person(g, seat.freedBy); if (q && q.oversleep) g.stats.oversleepSteal++; }
    emit(g, { type: 'sfx', name: 'sit' });
    emit(g, { type: 'sit' });
  }
  function playerStand(g) {
    const pl = g.player; if (pl.seat < 0) return;
    const s = g.seats[pl.seat];
    freeSeat(g, s, -1);
    pl.seat = -1; pl.x = s.x; pl.z = s.fz * 1.15; pl.fakeSleep = false;
    pl.yaw = s.side > 0 ? 0 : Math.PI;
    emit(g, { type: 'stand' });
  }

  function doAction(g) {
    const pl = g.player, pr = g.prompt;
    if (!pr) return;
    const T = (p) => TYPES[p.type];
    switch (pr.act) {
      case 'sit': playerSit(g, g.seats[pr.id]); break;
      case 'stand': playerStand(g); break;
      case 'wake': pl.fakeSleep = false; break;
      case 'give': {
        const p = person(g, pr.id); if (!p) return;
        const seat = g.seats[pl.seat];
        playerStand(g);
        pl.z = seat.fz * 0.6 + (pl.x > seat.x ? 0 : 0); pl.x = seat.x + (p.x > seat.x ? -0.45 : 0.45);
        [pl.x, pl.z] = aisleClamp(pl.x, pl.z);
        seat.res = p.id; seat.gift = true; releaseSlot(g, p); p.state = 'walk'; p.tx = seat.x; p.tz = seat.fz; p.then = 'sit'; p.seatTarget = seat.id;
        let base = p.priority;
        let label = T(p).name + 'に席を譲った';
        if (p.arrivedFrontT > 0 && g.t - p.arrivedFrontT < 6) { base += 10; label += '（早い！）'; }
        if (p.type === 'ceo') { g.stats.ceo++; label = '謎の紳士に席を譲った…「君、うちの会社に来ないか」'; }
        if (p.type === 'alien') { g.stats.alien++; label = '???に席を譲った…「ワレワレハ カンシャ スル」'; }
        if (p.fake) { // 仮病にだまされた
          p.expr = 'happy'; p.exprT = 5; p.role = 'faked'; p.priority = 0; bubble(g, p, 'ラッキー♪', 2.5);
          g.stats.fooled++; toast(g, '…仮病だった！ だまされた（徳なし）', 'bad'); hurtMind(g, 20, '仮病にだまされた');
          break;
        }
        p.expr = 'happy'; p.exprT = 6; bubble(g, p, p.type === 'alien' ? 'ピピ…アリガト' : 'ありがとうございます', 2.5);
        g.stats.gives++;
        deed(g, base, label);
        p.priority = 0; // 一度座らせた人で稼げない
        break;
      }
      case 'pick': {
        const it = g.items.find(i => i.id === pr.id); if (!it) return;
        it.taken = true; pl.carrying = it; g.items = g.items.filter(i => i !== it);
        hurt(g, 4, 'collapse');
        const owner = person(g, it.owner);
        toast(g, it.name + 'を拾った。' + (owner && owner.state !== 'gone' ? '持ち主は「' + it.hint + '」らしい' : '持ち主はもう降りたかも…'), 'info');
        emit(g, { type: 'sfx', name: 'pick' });
        break;
      }
      case 'deliver': {
        const p = person(g, pr.id); const it = pl.carrying; if (!p || !it) return;
        if (p.id === it.owner) {
          pl.carrying = null;
          if (it.key === 'teeth') g.stats.teeth++;
          g.stats.delivered++;
          p.expr = 'happy'; p.exprT = 5; bubble(g, p, it.key === 'teeth' ? 'ふがふが！（ありがとう）' : 'あっ！ありがとうございます！');
          const pts = it.pts + (it.ownerLeaving ? 15 : 0);
          deed(g, pts, it.name + 'を届けた' + (it.ownerLeaving ? '（ギリギリ！）' : ''));
        } else {
          p.expr = 'surprised'; p.exprT = 2; bubble(g, p, '…違いますけど？', 1.6);
          pl.wrongDeliverT = g.t;
        }
        break;
      }
      case 'staff': {
        const it = pl.carrying; pl.carrying = null;
        const gone = !person(g, it.owner);
        deed(g, Math.round(it.pts * (gone ? 0.6 : 0.4)), it.name + 'を駅員に届けた');
        g.stats.delivered++;
        emit(g, { type: 'staffTake' });
        break;
      }
      case 'putdown': {
        const it = pl.carrying; pl.carrying = null;
        const fx = pl.x - Math.sin(pl.yaw) * 0.45, fz = pl.z - Math.cos(pl.yaw) * 0.45;
        [it.x, it.z] = aisleClamp(fx, fz); it.taken = false; it.t0 = g.t; it.noticed = true;
        g.items.push(it);
        toast(g, it.name + 'を床に置いた', 'info');
        break;
      }
      case 'door': {
        g.runner.held = true; g.doorClose += 1.6; g.stats.doorHolds++;
        deed(g, 12, '駆け込みの人のためにドアを押さえた');
        addKarma(g, 10, '駆け込み乗車はおやめください！', false);
        toast(g, '「駆け込み乗車はおやめください！」', 'bad');
        break;
      }
      case 'sos': {
        if (g.chikan && g.chikan.stage === 'active') {
          g.chikan.stage = 'reported'; g.stats.sos++;
          deed(g, 35, '非常通報で痴漢を通報した');
          toast(g, '通報した！次の駅で駅員が来る', 'good');
          const v = person(g, g.chikan.victimId); if (v) { v.expr = 'relief'; v.exprT = 4; }
        } else {
          addKarma(g, 15, 'いたずら通報');
          toast(g, '「いたずらはやめてください」', 'bad');
        }
        emit(g, { type: 'sfx', name: 'buzzer' });
        break;
      }
      case 'hush': {
        const p = person(g, pr.id); if (!p) return;
        p.hushed = true;
        if (p.scary && gutsWin(g, p)) p.scary = false;
        if (p.scary) {
          bubble(g, p, g.r.pick(['あぁ？ 関係ねぇだろ！', 'は？ 今大事な話なんだけど！']), 2.5);
          angerFight(g, p);
        } else {
          p.role = null; p.idle = 'phone'; p.expr = 'sad'; p.exprT = 4; bubble(g, p, 'あ…すみません', 2);
          g.stats.hush++; deed(g, 20, '大声の電話を注意した');
          for (const q of g.people) if (q !== p && q.sleep === 0 && q.state === 'seated' && dist2(q.x, q.z, p.x, p.z) < 3) { q.expr = 'happy'; q.exprT = 2.5; }
        }
        break;
      }
      case 'warn': {
        const p = person(g, pr.id); if (!p) return;
        if (p.role === 'bx' && !p.bxDone) { // ボス駅の困った人
          const X = BX[p.bxk];
          if (p.scary && gutsWin(g, p)) p.scary = false;
          if (p.scary) { p.warned = true; bubble(g, p, g.r.pick(['あぁ？ なんか文句あんの？', 'は？ うるせぇな！']), 2.5); angerFight(g, p); p.bxDone = true; break; }
          p.bxDone = true; p.warned = true; p.expr = p.bxk === 'ninja' ? 'surprised' : 'sad'; p.exprT = 4; bubble(g, p, X.reply, 2.2);
          if (p.bxk === 'ninja') { p.dispName = '忍者'; p.look.top = '#1c1c22'; p.look.topName = '黒'; p.look.bottom = '#1c1c22'; p.look.costume = 'ninja'; }
          if (p.bxk === 'animal' || p.bxk === 'cand' || p.bxk === 'ninja') { releaseSlot(g, p); if (p.seat >= 0) { freeSeat(g, g.seats[p.seat], p.id); p.seat = -1; } const d = nearestDoor(p.x); p.state = 'walk'; p.tx = d; p.tz = (p.z >= 0 ? 1 : -1) * 0.95; p.then = 'stand'; }
          g.stats.warns++; deed(g, X.pts, (p.dispName || '') + '：' + X.label.replace(/^「|」.*$/g, ''));
          break;
        }
        if (!WARN_ROLES[p.role]) { // 人まちがい
          p.expr = 'surprised'; p.exprT = 3; bubble(g, p, pr.wrong === 'bento' ? 'え？ 何も食べてませんけど…' : pr.wrong === 'ninja' ? 'え？ ただの会社員ですけど…' : 'え？ 私じゃないですけど…', 2.2);
          g.stats.wrongWarn++; hurtMind(g, 8, '人まちがいで注意した'); emit(g, { type: 'sfx', name: 'buzzer' });
          break;
        }
        p.warned = true;
        if (p.scary && gutsWin(g, p)) p.scary = false;
        if (p.scary) {
          bubble(g, p, g.r.pick(['あぁ？ なんか文句あんの？', 'は？ うるせぇな！', '生意気言うな！']), 2.5);
          angerFight(g, p);
          break;
        }
        const ok = { leak: ['あ、すみません…（音を下げる）', '音もれを注意した', 20], bento: ['あ…すみません（ふたを閉める）', '車内の弁当を注意した', 20], pack: ['あ、すみません（リュックを前に抱える）', 'リュックを前に抱えてもらった', 15], door: ['あ、すみません（奥に詰める）', 'ドア前の人に詰めてもらった', 15], preach: ['…ふん、最近の若いもんは', '説教おじさんを追いはらった', 25] }[p.role];
        if (p.role === 'door') { p.state = 'walk'; p.tx = p.x + (p.x > 0 ? -1.2 : 1.2); p.tz = 0; p.then = 'stand'; }
        if (p.role === 'preach') { const [tx, tz] = aisleClamp(p.x + (p.x > g.player.x ? 3 : -3), 0); releaseSlot(g, p); p.state = 'walk'; p.tx = tx; p.tz = tz; p.then = 'stand'; }
        p.role = null; p.expr = 'sad'; p.exprT = 4; bubble(g, p, ok[0], 2.2);
        g.stats.warns++; deed(g, ok[2], ok[1]);
        for (const q of g.people) if (q !== p && q.sleep === 0 && q.state === 'seated' && dist2(q.x, q.z, p.x, p.z) < 3) { q.expr = 'happy'; q.exprT = 2.5; }
        break;
      }
      case 'salt': {
        const p = person(g, pr.id); if (!p) return;
        emit(g, { type: 'sfx', name: 'whoosh' });
        if (p.possessed) { p.possessed = false; p.expr = 'surprised'; p.exprT = 3; bubble(g, p, 'はっ…私は何を…？', 2.2); }
        else { p.bxDone = true; bubble(g, p, 'ぎゃああ…（成仏）', 1.8); p.state = 'gone'; releaseSlot(g, p); if (p.seat >= 0) { freeSeat(g, g.seats[p.seat], p.id); p.seat = -1; } }
        g.stats.salt = (g.stats.salt || 0) + 1; deed(g, 25, '🧂 塩で除霊した');
        break;
      }
      case 'expose': {
        const p = person(g, pr.id); if (!p) return;
        if (p.fake) {
          p.role = 'faked'; p.priority = 0; p.targetPlayer = false; p.expr = 'angry'; p.exprT = 5; bubble(g, p, 'ちっ…バレたか', 2.2);
          g.stats.fakerExposed++; deed(g, 35, '仮病を見破った');
          if (p.state === 'stand') placeStanding(g, p, false);
        } else {
          p.checked = true; p.expr = 'sad'; p.exprT = 5; bubble(g, p, 'ほんとに…つらいんです…', 2.5);
          addKarma(g, 18, '本当に具合が悪い人を疑った'); toast(g, '本当に具合が悪い人だった…', 'bad'); hurtMind(g, 15, '病人を疑ってしまった');
        }
        break;
      }
      case 'ask': {
        const s = g.seats[pr.id], q = s && person(g, s.hog); if (!q) return;
        q.asked = true;
        if (q.scary && gutsWin(g, q)) q.scary = false;
        if (q.scary) {
          bubble(g, q, g.r.pick(['あぁ？ 荷物が座ってんだよ', 'は？ 狭いんだけど']), 2.2);
          angerFight(g, q);
        } else {
          q.expr = 'sad'; q.exprT = 3; bubble(g, q, 'あ…すみません', 1.8);
          q.hogSeat = null; q.role = null; s.hog = 0; s.occ = -1; s.res = -1;
          playerSit(g, s); g.stats.hogAsk++; deed(g, 15, '席を詰めてもらった');
        }
        break;
      }
      case 'speaker': if (speakerNear(g)) hitSpeaker(g, 1); break;
      case 'throw': {
        const s = g.seats[pr.id], q = s && person(g, s.hog); if (!q) return;
        q.hogSeat = null; q.role = null; q.asked = true; s.hog = 0; s.occ = -1; s.res = -1;
        q.expr = 'angry'; q.exprT = 5; bubble(g, q, q.scary ? 'てめぇ！ オレのかばん！' : 'ちょっと！？ 私のかばん！', 2.2);
        emit(g, { type: 'bagThrow', x: s.x, z: s.z, side: s.side }); emit(g, { type: 'sfx', name: 'push' });
        addKarma(g, 10, 'かばんをぶん投げた'); g.stats.bagThrow++;
        playerSit(g, s);
        if (q.scary) { hurt(g, 8, 'collapse'); emit(g, { type: 'shake', amount: 0.8 }); toast(g, 'どつかれた…（体力-8）', 'bad'); }
        break;
      }
      case 'brainwash': {
        const p = person(g, pr.id); if (!p) return;
        const sk = SKILLS[2];
        if (pl.toku < sk.cost) { toast(g, '徳が足りない', 'bad'); return; }
        pl.toku -= sk.cost; pl.mode = null; g.stats.brainwash++; g.stats.skillsUsed++;
        addKarma(g, sk.karma, '洗脳');
        p.expr = 'dazed'; p.exprT = 3; bubble(g, p, 'あ…用事を思い出した…', 2.5);
        p.sleep = 0; p.oversleep = false;
        p.dest = nextStation(g) + (g.phase === 'stop' && g.doorsOpen ? 0 : 0);
        if (g.phase === 'stop') p.dest = g.station;
        const seat = g.seats[p.seat];
        freeSeat(g, seat, p.id); p.seat = -1; p.leaving = true;
        p.state = 'walk'; const d = nearestDoor(p.x); p.tx = d + (g.r() - 0.5) * 0.5; p.tz = Math.sign(p.z || 1) * 1.0; p.then = 'stand';
        emit(g, { type: 'sfx', name: 'beam' });
        emit(g, { type: 'beam', id: p.id });
        break;
      }
      case 'force': {
        const p = person(g, pr.id); if (!p) return;
        const sk = SKILLS[3];
        if (pl.toku < sk.cost) { toast(g, '徳が足りない', 'bad'); return; }
        pl.toku -= sk.cost; pl.mode = null; g.stats.skillsUsed++;
        if (p.tough || p.type === 'alien') {
          hurt(g, 25, 'ko');
          addKarma(g, 10, '乱暴');
          p.expr = 'angry'; p.exprT = 6; bubble(g, p, p.type === 'alien' ? 'ビビビ！！' : 'あぁ？なんだテメェ', 2.5);
          emit(g, { type: 'shake', amount: 1 }); emit(g, { type: 'sfx', name: 'hit' });
          toast(g, '反撃された！', 'bad');
          return;
        }
        g.stats.force++;
        addKarma(g, sk.karma, '強制どかし');
        const seat = g.seats[p.seat];
        freeSeat(g, seat, p.id); p.seat = -1;
        p.expr = 'angry'; p.exprT = 8; p.angry = 10; bubble(g, p, 'えっ!? ちょっと！', 2);
        p.state = 'stand'; p.x = seat.x + 0.5; p.z = seat.fz; placeStanding(g, p, false);
        playerSit(g, seat);
        emit(g, { type: 'sfx', name: 'push' });
        break;
      }
    }
  }

  function useSkill(g, idx) {
    const pl = g.player, sk = SKILLS[idx]; if (!sk || g.over) return false;
    const cost = skillCost(g, idx);
    if (sk.key === 'brainwash' || sk.key === 'force') {
      if (pl.mode === sk.key) { pl.mode = null; return true; }
      if (pl.toku < cost) { toast(g, '徳が足りない（' + cost + '必要）', 'bad'); return false; }
      if (sk.key === 'force' && pl.seat >= 0) { toast(g, 'もう座っている', 'info'); return false; }
      pl.mode = sk.key; pl.modeT = 10;
      toast(g, sk.key === 'brainwash' ? '洗脳ビーム準備：座っている人を狙ってアクション' : '強制どかし準備：目の前の座っている人を狙ってアクション', 'info');
      return true;
    }
    if (pl.toku < cost) { toast(g, '徳が足りない（' + cost + '必要）', 'bad'); return false; }
    if (sk.key === 'confess') {
      if (pl.confessCD > 0) { toast(g, 'まだ懺悔できない（' + Math.ceil(pl.confessCD) + '秒）', 'bad'); return false; }
      if (pl.karma <= 0) { toast(g, '懺悔することがない', 'info'); return false; }
      pl.karma = Math.max(0, pl.karma - 25); pl.confessCD = 30;
      emit(g, { type: 'karma', amount: -25, text: '懺悔' });
    } else if (sk.key === 'drink') {
      if (pl.stamina >= C.MAX_STAMINA - 1) { toast(g, '体力は満タン', 'info'); return false; }
      pl.stamina = Math.min(C.MAX_STAMINA, pl.stamina + 35); pl.drinkCount++;
      emit(g, { type: 'sfx', name: 'drink' });
    } else {
      pl.buffs[sk.key] = sk.dur + (sk.key === 'glasses' ? 2 * ST(g, 'eye') : 0);
    }
    pl.toku -= cost; g.stats.skillsUsed++;
    emit(g, { type: 'skill', key: sk.key });
    return true;
  }
  function skillCost(g, idx) {
    const sk = SKILLS[idx];
    if (sk.key === 'drink') return sk.cost + g.player.drinkCount * 10;
    return sk.cost;
  }

  function doPunch(g) {
    const pl = g.player;
    if (pl.punchCD > 0 || pl.seat >= 0) return;
    pl.punchCD = 0.42; pl.punchAnim = 0.3;
    pl.stamina = Math.max(0.1, pl.stamina - 1);
    emit(g, { type: 'sfx', name: 'whoosh' });
    if (speakerNear(g)) { hitSpeaker(g, pl.buffs.protein > 0 ? 2 : 1); return; }
    const id = aimTarget(g, 1.6);
    if (g.multi && id >= PID) { punchPlayer(g, id - PID); return; }
    const p = id >= 0 ? person(g, id) : null;
    if (!p) return;
    const ch = g.chikan;
    let dmgMul = pl.buffs.protein > 0 ? 2 : 1;
    const foe = ch && p.id === ch.chikanId && ch.stage !== 'done' || p.role === 'thief' || p.role === 'suri' && p.loot || p.brute && !(p.role === 'emperor' && gangOf(g, p.id).some(q => q.role === 'hench'));
    if (foe && p.state !== 'ko' && ST(g, 'atk') > 0 && g.r() < 0.04 * ST(g, 'atk')) { dmgMul++; emit(g, { type: 'crit' }); }
    if (ch && p.id === ch.chikanId && (ch.stage === 'active' || ch.stage === 'fight' || ch.stage === 'reported')) {
      if (ch.stage !== 'fight') {
        ch.stage = 'fight'; ch.fstate = 'idle'; ch.ft = 0.9; ch.pi = g.multi ? g.pi : 0;
        p.state = 'fight'; releaseSlot(g, p);
        bubble(g, p, ch.kind === 'boxer' ? 'ほう…やる気か' : 'な、なにを！', 1.8);
        const v = person(g, ch.victimId); if (v) { v.expr = 'surprised'; v.exprT = 3; }
        toast(g, '痴漢との戦闘！ ' + (ch.kind === 'boxer' ? '（元ボクサーだ！）' : '') + ' 構えたらパンチでカウンター、ガードで防御', 'warn');
      }
      let dmg = dmgMul;
      if (ch.fstate !== 'windup' && g.r() < (ch.kind === 'boxer' ? 0.6 : ch.kind === 'small' ? 0.2 : 0.4)) {
        emit(g, { type: 'sfx', name: 'block' }); bubble(g, p, 'ガード！', 0.6); emit(g, { type: 'guarded', id: p.id });
        return;
      }
      if (ch.fstate === 'windup') { dmg += 1; ch.fstate = 'recover'; ch.ft = 0.9; g.stats.counters++; ch.counters++; emit(g, { type: 'counter' }); toast(g, 'カウンター！', 'good'); }
      ch.hp -= dmg; p.stunned = 0.25; p.expr = 'pain'; p.exprT = 0.6;
      emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
      if (ch.hp <= 0) {
        ch.stage = 'done'; p.state = 'ko'; p.expr = 'ko'; p.exprT = 999;
        const base = { small: 60, normal: 100, boxer: 180 }[ch.kind] + ch.counters * 10;
        g.stats.chikanKO++;
        const v = person(g, ch.victimId);
        if (v) { v.expr = 'happy'; v.exprT = 6; v.role = null; bubble(g, v, '助かりました…！', 2.5); }
        deed(g, base, '痴漢を撃退した！');
        p.koT = 0;
        emit(g, { type: 'sfx', name: 'ko' });
      }
      return;
    }
    if (ch && p.id === ch.chikanId && ch.stage === 'done') return; // 倒れた相手
    if (p.state === 'ko') return; // 倒れている人
    if (p.role === 'suri') { punchSuri(g, p, dmgMul); return; }
    if (p.brute) { punchBrute(g, p, dmgMul); return; }
    if (p.role === 'thief' && p.state !== 'ko') {
      p.thiefHp -= dmgMul; p.stunned = 0.3; p.expr = 'pain'; p.exprT = 0.6; p.pickT = 0; p.thiefGoal = null;
      emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
      if (p.thiefHp <= 0) {
        releaseSlot(g, p); p.state = 'ko'; p.expr = 'ko'; p.exprT = 999; p.koT = 0; p.fleeing = false; p.role = 'thiefKO';
        g.stats.thiefKO++;
        const n = p.stolen || 0;
        deed(g, 50 + 20 * n, n ? '泥棒を撃退！盗まれた物×' + n + 'を取り返した' : '泥棒を撃退！');
        emit(g, { type: 'sfx', name: 'ko' });
        return;
      }
      if (!p.fleeing) {
        p.fleeing = true; releaseSlot(g, p); bubble(g, p, 'やべっ！', 1.2);
        toast(g, '泥棒だ！ 逃がすな！ 追いかけてもう一発', 'warn');
        const d = nearestDoor(p.x); p.state = 'walk'; p.tx = d + (p.x > d ? 0.3 : -0.3); p.tz = (p.z >= 0 ? 1 : -1) * 0.95; p.then = 'stand'; p.speed = 1.55;
      }
      return;
    }
    // 無関係の人
    // 見習い乗車（最初の 1 回）：1 回だけ止めて教える
    if (g.rookie && !g.rookieWarned) { g.rookieWarned = true; toast(g, '🔰 その人は悪者じゃないかも？ 関係ない人を殴るとカルマがたまって連行されます', 'warn'); return; }
    if (p.type === 'alien') g.stats.alienPunch++;
    g.stats.wrongPunch++;
    p.expr = 'angry'; p.exprT = 5; p.angry = 8; bubble(g, p, p.type === 'alien' ? 'ピギャッ!?' : '痛っ！なにするんですか！', 2);
    if (p.sleep) { p.sleep = 0; p.oversleep = false; }
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
    addKarma(g, 20, '無関係の人を殴った');
    if (p.tough) { hurt(g, 18, 'ko'); bubble(g, p, 'やんのかコラァ！', 2); emit(g, { type: 'shake', amount: 1 }); }
  }

  // プレイヤー同士のパンチ：元気な相手はよろけるだけ。具合が悪そう（体力 20 以下）ならトドメで脱落
  function punchPlayer(g, j) {
    const me = g.pi, T = g.players[j];
    if (!T || T.out) return;
    const tp = T.pl;
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hitPlayer', i: j });
    if (tp.stamina <= 20) {
      g.players[me].pko++;
      addKarma(g, 25, T.name + 'にトドメ');
      toast(g, T.name + ' にトドメを刺した！', 'warn');
      setCtx(g, j); gameOver(g, 'pko', { by: g.players[me].name, text: g.players[me].name + ' のパンチで床に沈んだ…' }); setCtx(g, me);
    } else {
      addKarma(g, 15, T.name + 'を殴った');
      tp.stamina = Math.max(1, tp.stamina - 8); tp.stagger = 0.5; tp.hitFlash = 0.4;
      T.events.push({ type: 'toast', text: g.players[me].name + ' に殴られた！ 体力-8', kind: 'bad' });
      T.events.push({ type: 'shake', amount: 1 }); T.events.push({ type: 'sfx', name: 'hit' });
    }
  }

  // ---------------------------------------------------------------- 更新
  function update(g, dt, input) {
    if (g.over) return;
    input = input || {};
    dt = Math.min(dt, 0.1);
    g.t += dt;
    if (!playerStep(g, dt, input)) return;
    updatePhase(g, dt);
    updatePeople(g, dt);
    updateEvents(g, dt);
  }
  // 1 人分の操作と体の更新。脱落・終わりなら false
  function playerStep(g, dt, input) {
    const pl = g.player;
    const isOver = () => g.multi ? g.players[g.pi].out : g.over;
    // 視点
    if (input.yaw != null) pl.yaw = input.yaw;
    if (input.pitch != null) pl.pitch = clamp(input.pitch, -1.2, 1.2);
    pl.punchCD = Math.max(0, pl.punchCD - dt); pl.punchAnim = Math.max(0, pl.punchAnim - dt);
    pl.hitFlash = Math.max(0, pl.hitFlash - dt); pl.confessCD = Math.max(0, pl.confessCD - dt); pl.stagger = Math.max(0, pl.stagger - dt);
    for (const k in pl.buffs) { pl.buffs[k] -= dt; if (pl.buffs[k] <= 0) { delete pl.buffs[k]; toast(g, (SKILLS.find(s => s.key === k) || {}).name + 'の効果が切れた', 'info'); } }
    if (pl.mode) { pl.modeT -= dt; if (pl.modeT <= 0) pl.mode = null; }
    pl.braceHeld = !!input.brace;
    if (input.bracePressed) pl.lastBraceT = g.t;

    // 移動（オンラインの参加者は自分の端末で動かして、場所だけ送ってくる）
    let moving = false;
    if (input.pos) { if (pl.seat < 0) { [pl.x, pl.z] = aisleClamp(+input.pos[0] || 0, +input.pos[1] || 0); moving = !!input.mv; } }
    else if (pl.seat < 0) moving = movePlayer(g, pl, input, dt);
    pl.moving = moving;

    // 体力
    if (pl.seat >= 0) {
      const regen = C.SIT_REGEN * (pl.fakeSleep ? 1.35 : 1) * (1 + 0.03 * ST(g, 'hp'));
      pl.stamina = Math.min(C.MAX_STAMINA, pl.stamina + regen * dt);
      pl.mind = Math.min(C.MAX_MIND, pl.mind + C.MIND_REGEN * (pl.fakeSleep ? 1.6 : 1) * dt);
      g.stats.sitTime += dt;
      if (pl.fakeSleep) g.stats.tanuki += dt;
    } else {
      g.stats.standTime += dt;
      const standing = g.people.filter(p => p.state === 'stand' || p.state === 'walk' || p.state === 'fight').length;
      const crowd = clamp((standing - 4) / 18, 0, 1);
      let drain = C.STAND_DRAIN + C.CROWD_DRAIN * crowd + (moving ? C.WALK_DRAIN : 0) + (pl.braceHeld ? C.BRACE_DRAIN : 0);
      if (g.phase === 'stop') drain *= 0.7;
      if (g.hard) drain *= 1.25;
      if (g.rookie) drain *= 0.6; // 見習い乗車（最初の 1 回だけ）
      if (g.speaker && g.speaker.on && !g.speaker.broken && dist2(g.speaker.x, g.speaker.z, pl.x, pl.z) < 4) drain += 0.35; // うるさくて疲れる
      if (g.endless && g.station > 11) drain *= 1 + Math.min(2, (g.station - 11) * 0.05);
      drain *= 1 - 0.02 * ST(g, 'hp');
      if (pl.buffs.legs > 0) drain = pl.braceHeld ? C.BRACE_DRAIN * 0.5 : 0;
      pl.stamina -= drain * dt;
      if (pl.stamina <= 0) { pl.stamina = 0; gameOver(g, 'collapse'); return false; }
    }

    // うるさいと心がすり減る（爆音スピーカー・大声電話の近く）
    if (g.speaker && g.speaker.on && !g.speaker.broken && dist2(g.speaker.x, g.speaker.z, pl.x, pl.z) < 4) hurtMind(g, 0.6 * dt, '');
    else if (g.people.some((q) => q.role === 'caller' && q.state !== 'ko' && q.state !== 'gone' && dist2(q.x, q.z, pl.x, pl.z) < 3)) hurtMind(g, 0.4 * dt, '');
    warneeHurt(g, dt); bxHurt(g, dt);
    if (g.tutorial) pl.mind = Math.max(pl.mind, 40);
    if (isOver()) return false;
    // 狸寝入り
    if (input.fakeSleep) { if (pl.seat >= 0) { pl.fakeSleep = !pl.fakeSleep; emit(g, { type: 'sfx', name: pl.fakeSleep ? 'snore' : 'sit' }); } }

    // 照準
    g.aim = pl.fakeSleep ? -1 : aimTarget(g, 7);
    // スキル
    if (input.skill != null && input.skill >= 0) useSkill(g, input.skill);
    // 行動
    g.prompt = pl.fakeSleep ? { act: 'wake', label: '目を開ける' } : computePrompt(g);
    if (input.action && g.prompt) { doAction(g); g.prompt = pl.fakeSleep ? { act: 'wake', label: '目を開ける' } : computePrompt(g); }
    if (input.punch && !pl.fakeSleep) doPunch(g);
    if (isOver()) return false;

    // 優先が必要な人を無視
    const pr = priorityNear(g);
    if (pr && pl.seat >= 0) {
      pl.ignoreT += dt;
      if (pl.ignoreT > 3) {
        const rate = (pl.fakeSleep ? 0.15 : 0.55) * (g.seats[pl.seat].pri ? 1.8 : 1);
        pl.karma = Math.min(C.MAX_KARMA, pl.karma + rate * dt);
        if (g.r() < dt * 0.15 && !pl.fakeSleep) {
          const glare = g.people.filter(p => p.state === 'seated' && p.sleep === 0 && dist2(p.x, p.z, pl.x, pl.z) < 3);
          for (const q of glare.slice(0, 2)) { q.expr = 'glare'; q.exprT = 2.5; }
        }
      }
    } else pl.ignoreT = 0;

    if (g.tutorial) { pl.stamina = Math.max(pl.stamina, 40); pl.karma = Math.min(pl.karma, 60); } // チュートリアルでは負けない
    if (g.bossTest) { pl.stamina = Math.max(pl.stamina, 15); pl.mind = Math.max(pl.mind, 15); pl.karma = Math.min(pl.karma, 80); } // ボス駅テストでは倒れない
    if (pl.karma >= C.MAX_KARMA) { g.stats.arrestedAt = nextStation(g); gameOver(g, 'arrest'); return false; }
    return !isOver();
  }

  // 立っているプレイヤーの移動（混雑で遅くなる・人に押される）。動いたら true
  function movePlayer(g, pl, input, dt) {
    let moving = false;
      let mx = input.mx || 0, mz = input.mz || 0;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      if (pl.braceHeld) { mx *= 0.25; mz *= 0.25; }
      if (ml > 0.05) {
        const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
        const spd = (pl.st && pl.st.spd) || 0;
        let sp = C.PLAYER_SPEED * (1 + 0.02 * spd) * (pl.stagger > 0 ? 0.4 : 1);
        // 混雑による減速
        let crowd = false;
        for (const p of g.people) {
          if (p.state === 'gone' || p.state === 'seated') continue;
          if (dist2(p.x, p.z, pl.x, pl.z) < 0.5) { crowd = true; break; }
        }
        if (crowd) sp *= 0.55 + 0.015 * spd;
        let nx = pl.x + (fx * mz + rx * mx) * sp * dt, nz = pl.z + (fz * mz + rz * mx) * sp * dt;
        [nx, nz] = aisleClamp(nx, nz);
        pl.x = nx; pl.z = nz; moving = true;
      }
      // 人との押し合い（やわらかい当たり）
      for (const p of g.people) {
        if (p.state === 'gone' || p.state === 'seated' || p.state === 'exit' && Math.abs(p.z) > 1.4) continue;
        const d = dist2(p.x, p.z, pl.x, pl.z), m = 0.42;
        if (d < m && d > 0.001) {
          const push = (m - d) * 0.35;
          pl.x += (pl.x - p.x) / d * push; pl.z += (pl.z - p.z) / d * push;
          [pl.x, pl.z] = aisleClamp(pl.x, pl.z);
        }
      }
      if (g.multi) for (const P of g.players) {
        const o = P.pl; if (o === pl || P.out || o.seat >= 0) continue;
        const d = dist2(o.x, o.z, pl.x, pl.z), m = 0.45;
        if (d < m && d > 0.001) { const push = (m - d) * 0.4; pl.x += (pl.x - o.x) / d * push; pl.z += (pl.z - o.z) / d * push; [pl.x, pl.z] = aisleClamp(pl.x, pl.z); }
      }
        return moving;
  }

  // ---------------------------------------------------------------- オンライン（複数プレイヤー）の更新
  // inputs[i]：i 人目の操作（CPU は自動）。ホストの端末だけが呼ぶ
  function updateMulti(g, dt, inputs) {
    if (g.over) return;
    dt = Math.min(dt, 0.1);
    g.t += dt;
    for (let i = 0; i < g.players.length; i++) {
      const P = g.players[i];
      setCtx(g, i);
      if (P.out) { if (P.ghost) ghostStep(g, dt, (inputs && inputs[i]) || {}); continue; }
      const inp = P.cpu ? botInput(g, i) : ((inputs && inputs[i]) || {});
      playerStep(g, dt, inp);
    }
    setCtx(g, -1);
    updatePhase(g, dt);
    if (!g.over) { updatePeople(g, dt); updateEvents(g, dt); trickCheck(g); }
    if (g.worldEvents.length) { for (const P of g.players) for (const e of g.worldEvents) P.events.push(e); g.worldEvents.length = 0; }
    for (const P of g.players) if (P.events.length > 300) P.events.splice(0, P.events.length - 300);
    if (!g.over && g.players.every(P => P.out && !P.ghost) || !g.over && g.players.every(P => P.out)) { g.over = true; g.result = { cause: 'end' }; }
  }
  // 脱落したあとの「ニセ乗客」：座っている人にウソの降りるサインを出させる
  const FAKE_KINDS = [['board', '掲示板をチラ見'], ['watch', '時計を見る'], ['pack', '荷物をまとめる']];
  function ghostStep(g, dt, input) {
    const pl = g.player, P = g.players[g.pi];
    if (input.yaw != null) pl.yaw = input.yaw;
    if (input.pitch != null) pl.pitch = clamp(input.pitch, -1.2, 1.2);
    if (input.pos) [pl.x, pl.z] = aisleClamp(+input.pos[0] || 0, +input.pos[1] || 0);
    else ghostMove(pl, input, dt);
    P.fakeCD = Math.max(0, (P.fakeCD || 0) - dt);
    const id = aimTarget(g, 7);
    const t = id >= 0 && id < PID ? person(g, id) : null;
    g.aim = id < PID ? id : -1;
    g.prompt = t && t.state === 'seated' ? { act: 'fake', label: P.fakeCD > 0 ? 'ウソのサイン（' + Math.ceil(P.fakeCD) + '秒）' : 'ウソの降りるサインを出させる', id: t.id } : null;
    if (input.action && g.prompt && P.fakeCD <= 0) {
      const k = FAKE_KINDS[(P.fakeN = ((P.fakeN || 0) + 1)) % FAKE_KINDS.length];
      if (k[0] === 'board') { t.anim = 'board'; t.animT = 1.3; t.looks.push(g.t); }
      else if (k[0] === 'watch') { t.anim = 'watch'; t.animT = 1.1; t.watches.push(g.t); }
      else { t.packing = true; t.fakePackT = g.t + 8; }
      t.sleep = 0; t.fakeUntil = g.t + 10; t.fakeBy = g.pi;
      P.fakeCD = 2.5;
      emit(g, { type: 'toast', text: '👻 ' + k[1] + 'させた', kind: 'info' });
    }
  }
  function ghostMove(pl, input, dt) {
    let mx = input.mx || 0, mz = input.mz || 0;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (ml > 0.05) {
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
      [pl.x, pl.z] = aisleClamp(pl.x + (fx * mz + rx * mx) * 2.4 * dt, pl.z + (fz * mz + rz * mx) * 2.4 * dt);
    }
  }
  // 通信が切れた・部屋を出たプレイヤーを脱落にする
  function dropPlayer(g, i, cause) { const prev = g.pi; setCtx(g, i); gameOver(g, cause || 'leave'); setCtx(g, prev); }
  // ウソのサインにだまされて、その人の前に立ったプレイヤーを数える
  function trickCheck(g) {
    for (const p of g.people) {
      if (!(p.fakeUntil > g.t) || p.state !== 'seated') continue;
      const s = g.seats[p.seat]; if (!s) continue;
      g.players.forEach((P, i) => {
        if (P.out || i === p.fakeBy || P.pl.seat >= 0) return;
        if (dist2(P.pl.x, P.pl.z, s.x, s.fz) > 0.6) return;
        p.fooled = p.fooled || {};
        if (p.fooled[i]) return;
        p.fooled[i] = 1;
        const G = g.players[p.fakeBy]; if (!G) return;
        G.tricks++;
        G.events.push({ type: 'toast', text: '👻 ' + P.name + ' がだまされた！（いたずら +1）', kind: 'good' });
      });
    }
  }
  // CPU のプレイヤー（様子を見て、降りそうな人の前で待つ）
  function botInput(g, i) {
    const P = g.players[i], pl = P.pl, mem = P.bot || (P.bot = { react: 0.35 + (i * 0.17) % 0.5 });
    const inp = { yaw: pl.yaw, pitch: 0 };
    if (g.phase === 'travel' && g.lurchPlan) for (const L of g.lurchPlan) if (L.warned && !L.done && g.phaseT > L.t - 0.55) inp.bracePressed = true;
    const pr = g.prompt;
    if (pl.seat >= 0) { if (pr && pr.act === 'give' && pl.stamina > 70) inp.action = true; return inp; }
    if (pr && pr.act === 'sit') { if (!mem.sitSeen) mem.sitSeen = g.t; if (g.t - mem.sitSeen > mem.react) { inp.action = true; mem.sitSeen = 0; } return inp; }
    mem.sitSeen = 0;
    if (pr && pr.act === 'staff') { inp.action = true; return inp; }
    if (pl.stamina < 30 && pl.toku >= skillCost(g, 1)) inp.skill = 1;
    let best = null, bs = -1e9;
    for (const p of g.people) {
      if (p.state !== 'seated') continue;
      const seat = g.seats[p.seat];
      let sc = p.looks.filter(t => g.t - t < 30).length * 2 + p.watches.filter(t => g.t - t < 30).length * 2 + (p.packing ? 6 : 0) - (p.sleep ? 5 : 0);
      if (p.type === 'tourist') sc -= 6;
      sc -= dist2(seat.x, seat.fz, pl.x, pl.z) * 0.3;
      // ほかのプレイヤーがもう前にいる席は避ける
      if (g.players.some((Q, j) => j !== i && !Q.out && dist2(Q.pl.x, Q.pl.z, seat.x, seat.fz) < 0.5)) sc -= 4;
      if (sc > bs) { bs = sc; best = seat; }
    }
    if (best) {
      const dx = best.x - pl.x, dz = best.fz - pl.z, d = Math.hypot(dx, dz);
      if (d > 0.25) { inp.yaw = Math.atan2(-dx, -dz); inp.mz = 1; }
    }
    return inp;
  }
  // i 人目の最終スコア
  function finalScoreOf(g, i) { const prev = g.pi; setCtx(g, i); const r = finalScore(g); setCtx(g, prev); return r; }
  // 順位（スコアの高い順。同点なら長く残った人が上）
  function standings(g) {
    return g.players.map((P, i) => ({ i, name: P.name, cpu: P.cpu, score: finalScoreOf(g, i).total, cause: P.result ? P.result.cause : 'clear', outOrder: P.outOrder || 99, tricks: P.tricks, pko: P.pko }))
      .sort((a, b) => b.score - a.score || b.outOrder - a.outOrder);
  }

  function updatePhase(g, dt) {
    g.phaseT += dt;
    if (g.phase === 'travel') {
      if (g.phaseT >= C.T_TRAVEL) {
        g.phase = 'stop'; g.phaseT = 0; g.station++; withEach(g, () => { g.stats.stations++; if (g.bal2 && g.player.seat >= 0) bonusPts(g, 8, '💺 座ったまま 1 駅'); });
        g.doorSide = g.nextDoorSide || 1; g.doorsOpen = false; g.doorClose = C.T_STOP;
        g.ann = stationName(g, g.station) + '、' + stationName(g, g.station) + '。お出口は' + (g.doorSide > 0 ? '右側' : '左側') + 'です。';
        emit(g, { type: 'arrive', station: g.station });
        emit(g, { type: 'sfx', name: 'brake' });
        withEach(g, () => bossJudge(g));
        if (g.station >= lastStation(g)) {
          if (g.multi) { withEach(g, () => gameOver(g, 'clear')); g.over = true; g.result = { cause: 'end' }; return; }
          gameOver(g, 'clear'); return;
        }
        // 洗脳中の人などを降ろす準備
      }
      // 予告アナウンス
      if (g.phaseT > C.T_TRAVEL - 9 && !g.annNext) { g.annNext = true; const n = stationName(g, g.station + 1); g.ann = '次は ' + n + '、' + n + '。'; emit(g, { type: 'announce', text: g.ann }); bossAnnounce(g); }
    } else {
      if (!g.doorsOpen && g.phaseT >= C.DOOR_OPEN && g.phaseT < g.doorClose) { g.doorsOpen = true; emit(g, { type: 'doors', open: true, side: g.doorSide }); emit(g, { type: 'sfx', name: 'door' }); }
      if (g.phaseT >= C.ALIGHT && !g.alighted) { g.alighted = true; startAlight(g); }
      if (g.phaseT >= C.BOARD && !g.boarded) { g.boarded = true; startBoard(g); }
      if (g.phaseT >= C.CLOSE_WARN && !g.warned) {
        g.warned = true; emit(g, { type: 'sfx', name: 'chime' }); emit(g, { type: 'announce', text: 'ドアが閉まります。ご注意ください。' });
        if (g.station > 0 && !g.tutorial && g.r.chance(0.3)) g.runner = { active: true, door: g.r.pick(DOORS), held: false };
      }
      if (g.phaseT >= g.doorClose && g.doorsOpen) {
        g.doorsOpen = false; emit(g, { type: 'doors', open: false, side: g.doorSide }); emit(g, { type: 'sfx', name: 'door' });
        if (g.runner && g.runner.held) { // 駆け込みの人が乗る
          const p = spawn(g, g.r.pick(['salaryman', 'student', 'ol']), g.station);
          p.x = g.runner.door; p.z = g.doorSide * 1.6; g.people.push(p); p.expr = 'relief'; p.exprT = 3;
          bubble(g, p, 'すみません、ありがとう！', 2); placeStanding(g, p, false);
        }
        g.runner = null;
      }
      if (g.phaseT >= g.doorClose + 0.8) {
        g.phase = 'travel'; g.phaseT = 0; g.alighted = g.boarded = g.warned = g.annNext = false;
        g.lurchPlan = planLurches(g);
        g.nextDoorSide = g.r.chance(0.5) ? 1 : -1;
        // 置いて行かれた落とし物の持ち主
        for (const it of g.items) { const o = person(g, it.owner); if (!o || o.state === 'gone') it.ownerGone = true; }
        g.items = g.items.filter(it => g.t - it.t0 < 100);
        withEach(g, (pl) => {
          if (pl.carrying) { const o = person(g, pl.carrying.owner); if (!o || o.state === 'gone') pl.carrying.ownerGone = true; }
          if (pl.carrying && !person(g, pl.carrying.owner) && !pl.carrying.told) { pl.carrying.told = true; toast(g, '持ち主は降りてしまった…次の駅で、開いたドアの近くの駅員に届けよう', 'warn'); }
        });
        emit(g, { type: 'depart' });
        emit(g, { type: 'sfx', name: 'depart' });
        g.ann = '';
      }
    }
  }
  function planLurches(g) {
    if (g.tutorial) return [];
    const n = (g.hard ? 2 : 1) + (g.r.chance(0.45) ? 1 : 0);
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(g.r.range(4, C.T_TRAVEL - 4));
    return arr.sort((a, b) => a - b).map(t => ({ t, done: false, warned: false }));
  }

  function startAlight(g) {
    const ch = g.chikan;
    if (ch && (ch.stage === 'active' || ch.stage === 'reported') && ch.startStation < g.station) endChikan(g, ch.stage === 'reported' ? 'arrested' : 'escaped');
    for (const p of g.people) {
      if (p.state === 'gone' || p.state === 'ko' || p.state === 'fight') continue;
      if (p.dest <= g.station) {
        if (p.sleep && p.oversleep) { p.wakeT = g.r.range(0.6, 2.8); continue; } // 寝過ごし
        if (p.sleep) { p.sleep = 0; }
        leave(g, p);
      }
    }
  }
  function leave(g, p) {
    if (p.seat >= 0) { freeSeat(g, g.seats[p.seat], p.id); p.seat = -1; }
    releaseSlot(g, p);
    const d = nearestDoor(p.x);
    p.state = 'exit'; p.tx = d + (g.r() - 0.5) * 0.6; p.tz = g.doorSide * 1.2; p.then = 'out';
    p.packing = false; p.anim = 'none';
    if (p.role === 'thief' && p.stolen && !p.fleeing) toast(g, '…さっきの若者、盗んだ物を持って降りていった？', 'bad');
    if (p.role === 'tuber' && g.speaker && g.speaker.owner === p.id) g.speaker = null;
    if (p.role === 'suri' && p.loot) toast(g, p.caught ? 'スリに逃げられた…' : '…さっきの人、スリだった？ 財布を持って降りていった', 'bad');
    // 落とし物の持ち主が降りる
    for (const b of bodies(g)) { const it = b.carrying; if (it && it.owner === p.id) it.ownerLeaving = true; }
  }
  function startBoard(g) {
    const st = g.station;
    let range = st < LINE.length && !g.endless ? LINE[st].board : [3, 9];
    if (g.endless && st < LINE.length - 1) range = LINE[st].board;
    if (g.endless && st >= LINE.length - 1) range = [4 + Math.min(4, (st - 11) >> 2), 8 + Math.min(6, (st - 11) >> 1)];
    let n = g.r.int(range[0], range[1]);
    // 終点に向かってどんどん混む：後半の駅ほど乗ってくる人が多く、終点のひとつ手前でどっと乗ってくる
    const last = lastStation(g), frac = g.endless ? 0 : Math.min(1, st / Math.max(1, last));
    if (!g.endless && st > 0 && st < last) { n = Math.max(n, 4) ; n = Math.round(n * (0.7 + 1.3 * frac)); if (st === last - 1) n += 8; }
    if (g.hard) n = Math.round(n * 1.4);
    if (g.tutorial) n = 0; // チュートリアル：乗ってくる人はいない
    const alive = g.people.filter(p => p.state !== 'gone' && p.state !== 'exit').length;
    n = Math.max(0, Math.min(n, C.MAX_PEOPLE + Math.round(12 * frac) - alive));
    let i = 0;
    g.boardQueue = [];
    for (; i < n; i++) g.boardQueue.push({ at: g.phaseT + i * 0.32, type: pickType(g, st) });
    const thiefAboard = g.people.some(p => p.role === 'thief' && p.state !== 'ko');
    if (!g.endless && st >= 2 && st <= lastStation(g) - 3 && !thiefAboard && !g.jiji && (g.thiefCount || 0) < 2 && g.r.chance(g.hard ? 0.4 : 0.25) && g.boardQueue.length)
      g.boardQueue.splice(g.r.int(0, g.boardQueue.length - 1), 0, { at: 0, type: 'thief' });
    if (g.endless && st >= 2 && !thiefAboard && g.r.chance(0.3) && g.boardQueue.length) g.boardQueue.splice(0, 0, { at: 0, type: 'thief' });
    if (!bossBoard(g, st)) planVillains(g, st);
    g.boardQueue.forEach((q, k) => { q.at = g.phaseT + k * 0.32; });
  }
  function updateBoardQueue(g) {
    if (!g.boardQueue || !g.boardQueue.length || g.phase !== 'stop') return;
    while (g.boardQueue.length && g.boardQueue[0].at <= g.phaseT) {
      const q = g.boardQueue.shift();
      const p = spawn(g, q.type, g.station, q.type === 'thief' ? g.station + g.r.int(3, 5) : null);
      if (q.v) setupVillain(g, p, q.v);
      if (q.type === 'thief') { g.thiefCount = (g.thiefCount || 0) + 1; p.role = 'thief'; p.wantSeat = false; p.stolen = 0; p.thiefT = g.r.range(3, 7); p.thiefHp = 3; p.look.mask = g.r.chance(0.4); }
      const d = g.r.pick(DOORS);
      p.x = d + (g.r() - 0.5) * 0.6; p.z = g.doorSide * 1.7;
      g.people.push(p);
      // 空いている席へ（近いところ）
      let best = null, bd = 6;
      if (p.wantSeat) for (const s of g.seats) {
        if (s.occ >= 0 || s.res >= 0) continue;
        if (s.pri && !p.priority && !p.priOK && p.type !== 'obachan' && p.type !== 'yankee') continue;
        const dd = dist2(s.x, s.fz, p.x, 0) + g.r() * 0.8;
        if (dd < bd) { bd = dd; best = s; }
      }
      if (!best && p.role === 'emperor') best = emperorKick(g, p);
      if (best) { best.res = p.id; p.state = 'walk'; p.tx = best.x; p.tz = best.fz; p.then = 'sit'; p.seatTarget = best.id; }
      else if (p.role === 'hench' || p.role === 'suri') { p.state = 'walk'; p.tx = p.x; p.tz = 0; p.then = 'stand'; }
      else if (p.priority && seatedBody(g) && g.r.chance(0.55)) {
        const s = g.seats[seatedBody(g).seat]; p.state = 'walk'; p.tx = s.x + (g.r() - 0.5) * 0.3; p.tz = s.fz; p.then = 'stand'; p.targetPlayer = true; p.targetSeat = s.id;
      } else placeStanding(g, p, false);
      if (q.type === 'ceo' || q.type === 'alien') emit(g, { type: 'rare', id: p.id });
    }
  }

  function updatePeople(g, dt) {
    const pl = g.player;
    const ns = nextStation(g);
    const travelLeft = g.phase === 'travel' ? C.T_TRAVEL - g.phaseT : 0;
    updateBoardQueue(g);
    for (const p of g.people) {
      if (p.state === 'gone') continue;
      p.blink -= dt; if (p.blink < -0.13) p.blink = g.r.range(2, 5.5);
      if (p.exprT > 0) { p.exprT -= dt; if (p.exprT <= 0) p.expr = 'neutral'; }
      if (p.bubbleT > 0) { p.bubbleT -= dt; if (p.bubbleT <= 0) p.bubble = null; }
      if (p.angry > 0) p.angry -= dt;
      if (p.stunned > 0) p.stunned -= dt;
      if (p.animT > 0) { p.animT -= dt; if (p.animT <= 0) p.anim = 'none'; }
      const rem = p.dest - ns;

      // 寝過ごした人が飛び起きる
      if (p.wakeT > 0) {
        p.wakeT -= dt;
        if (p.wakeT <= 0) {
          p.sleep = 0; p.oversleep = false;
          if (g.phase === 'stop' && g.doorsOpen && g.phaseT < g.doorClose - 0.6) {
            p.expr = 'panic'; p.exprT = 3; bubble(g, p, 'はっ！ 降ります降ります！', 2); p.speed = 2.4;
            leave(g, p);
          } else {
            p.expr = 'sad'; p.exprT = 6; bubble(g, p, '…寝過ごした', 2.5);
            p.dest = ns + g.r.int(1, 3); // 次で降りる気
            if (p.dest > lastStation(g)) p.dest = lastStation(g);
          }
        }
      }

      switch (p.state) {
        case 'seated': {
          // 行動のサイン
          if (g.phase === 'travel' && p.sleep === 0) {
            const T = TYPES[p.type];
            let lookRate = rem <= 0 ? 0.28 : rem === 1 ? 0.09 : rem === 2 ? 0.035 : 0.012;
            if (T.alwaysLook) lookRate = 0.2;
            if (T.noLook) lookRate = rem <= 0 ? 0.02 : 0.003;
            if (p.anim === 'none' && g.r() < lookRate * dt) { p.anim = 'board'; p.animT = 1.3; p.looks.push(g.t); }
            if (T.watch && p.anim === 'none' && g.r() < (rem <= 0 ? 0.06 : rem === 1 ? 0.045 : 0.012) * dt) { p.anim = 'watch'; p.animT = 1.1; p.watches.push(g.t); }
            if (rem <= 0 && travelLeft < 11 && !p.packing && g.r() < 0.35 * dt) { p.packing = true; }
            if (rem <= 0 && p.prep < 0) p.prep = g.r.chance(0.55) ? g.r.range(0.5, 6) : 0;
            if (rem <= 0 && p.prep > 0 && travelLeft < p.prep) { // 早めに立つ
              const seat = g.seats[p.seat]; freeSeat(g, seat, p.id); p.seat = -1;
              const d = nearestDoor(p.x);
              p.state = 'walk'; p.tx = d + (g.r() - 0.5) * 0.6; p.tz = (g.r() < 0.5 ? 1 : -1) * 0.95; p.then = 'stand'; p.leaving = true;
            }
            // フェイント：降りないのに降りるサイン（掲示板チラ見＋荷物まとめ）を出す人（およそ 18%・1 回の乗車で 1 回）
            // 乱数は使わない（今日のダイヤの電車が変わらないように）
            if (rem >= 1 && rem <= 3 && !p.feinted && !p.role && !p.priority && !p.fake && FEINT_OK[p.type] && feinter(p) && travelLeft < 4 + (p.id % 5)) {
              p.feinted = true; p.feintNow = true; p.packing = true; p.fakePackT = g.t + travelLeft + C.T_STOP + 3;
              if (p.anim === 'none') { p.anim = 'board'; p.animT = 1.3; } p.looks.push(g.t);
            }
            if (p.feintNow && !(p.fakePackT > g.t)) { p.feintNow = false; p.expr = 'surprised'; p.exprT = 2; bubble(g, p, (p.id % 2 ? '…あ、次だった' : '…まだだった'), 2); }
            if (rem > 0 && p.packing && !(p.fakePackT > g.t)) p.packing = false;
          }
          // 眠り：近づくと起きる
          if (g.phase === 'travel' && p.sleep && !p.oversleep && rem <= 1 && g.r() < 0.12 * dt) { p.sleep = 0; p.expr = 'sleepy'; p.exprT = 3; }
          if (p.role === 'hog' && p.hogSeat == null && !p.asked && g.r() < 0.5 * dt) hogClaim(g, p);
          if (p.type === 'drunk' && g.r() < 0.02 * dt) bubble(g, p, 'ういっく…', 1.5);
          if (p.sleep && g.r() < 0.03 * dt) bubble(g, p, 'Zzz…', 2);
          // NPC が席を譲る（若者）
          break;
        }
        case 'exit': {
          const open = g.phase === 'stop' && g.doorsOpen;
          if (open && Math.abs(p.z) >= 1.05 && Math.sign(p.z) === g.doorSide) p.tz = g.doorSide * 3.2;
          else if (open && Math.abs(p.tz) < 3) p.tz = g.doorSide * 1.2;
          moveToward(p, p.tx, p.tz, p.speed * 1.1, dt);
          if (Math.abs(p.z) > 2.6) p.state = 'gone';
          break;
        }
        case 'walk': {
          if (p.role === 'dasher' && p.then === 'sit' && dasherBlocked(g, p)) break;
          const arrived = moveToward(p, p.tx, p.tz, p.speed, dt);
          if (arrived) {
            if (p.then === 'sit') {
              const s = g.seats[p.seatTarget];
              if (s && s.occ < 0 && (s.res === p.id || s.res < 0)) { sitAt(g, p, s); }
              else { p.then = null; p.state = 'stand'; placeStanding(g, p, false); }
            } else { p.state = 'stand'; p.then = null; if (p.targetPlayer) p.arrivedFrontT = g.t; }
          }
          break;
        }
        case 'stand': {
          if (p.slot < 0 && !p.leaving && !p.targetPlayer && !p.role && !p.hold) { // hold：台本（動画など）でその場に置いておく人
            // スロットが無い人：できれば取る
            if (g.r() < dt) placeStanding(g, p, false);
          }
          // 立っている人のサイン（席を探す）
          if (g.phase === 'travel' && p.sleep === 0) {
            const T = TYPES[p.type];
            let lookRate = rem <= 0 ? 0.25 : rem === 1 ? 0.08 : 0.02;
            if (T.alwaysLook) lookRate = 0.2;
            if (p.anim === 'none' && g.r() < lookRate * dt) { p.anim = 'board'; p.animT = 1.3; p.looks.push(g.t); }
          }
          // 空いた席を狙う
          if (p.wantSeat && !p.leaving && rem >= 1 && (!p.role || SEEKERS[p.role]) && !(p.blockCD > g.t) && !(g.phase === 'stop' && p.dest <= g.station)) {
            let best = null, bd = p.role === 'dasher' ? 5.5 : p.type === 'obachan' ? 4.0 : 3.0;
            for (const s of g.seats) {
              if (s.occ >= 0) continue;
              if (s.res >= 0 && !(p.role === 'dasher' && dashSteal(g, p, s))) continue;
              if (s.pri && !p.priority && !p.priOK && p.type !== 'obachan' && p.type !== 'yankee' && p.type !== 'drunk') continue;
              const d = dist2(s.x, s.fz, p.x, p.z);
              if (d < bd) { bd = d; best = s; }
            }
            if (best) {
              p.scanT += dt;
              if (p.scanT >= p.react) {
                if (best.res >= 0) { const q = person(g, best.res); if (q) { q.then = null; q.state = 'stand'; q.expr = 'sad'; q.exprT = 3; bubble(g, q, 'あっ…', 1.2); placeStanding(g, q, false); } }
                p.scanT = 0; best.res = p.id; releaseSlot(g, p);
                p.state = 'walk'; p.tx = best.x; p.tz = best.fz; p.then = 'sit'; p.seatTarget = best.id; p.targetPlayer = false;
                if (p.type === 'obachan') bubble(g, p, 'よっこいしょ！', 1.2);
                if (p.role === 'dasher') bubble(g, p, g.r.pick(['どいてどいて〜！', 'その席もらったァ！']), 1.4);
              }
            } else p.scanT = 0;
          }
          // 優先の人：座っているプレイヤーの前へ寄ってくる
          const sb = seatedBody(g);
          if (p.priority && !p.targetPlayer && sb && g.phase === 'travel' && g.r() < 0.02 * dt) {
            const s = g.seats[sb.seat];
            if (dist2(p.x, p.z, s.x, s.fz) < 4.5) { releaseSlot(g, p); p.state = 'walk'; p.tx = s.x + 0.15; p.tz = s.fz; p.then = 'stand'; p.targetPlayer = true; p.targetSeat = s.id; }
          }
          if (p.targetPlayer && !(p.targetSeat != null && g.multi ? g.seats[p.targetSeat].occ === 0 : sb)) p.targetPlayer = false;
          break;
        }
        case 'fight': if (p.brute) updateBrute(g, p, dt); else updateFighter(g, p, dt); break;
        case 'ko': {
          p.koT = (p.koT || 0) + dt;
          if (g.phase === 'stop' && g.doorsOpen && p.koT > 2) { // 駅員に引き渡し
            p.state = 'exit'; p.tx = nearestDoor(p.x); p.tz = g.doorSide * 1.2; p.speed = 1.0;
            if (g.chikan && g.chikan.chikanId === p.id) g.chikan = null;
          }
          break;
        }
      }
      if (p.role === 'thief') updateThief(g, p, dt);
      else if (p.role === 'suri') updateSuri(g, p, dt);
      else if (p.role === 'caller') updateCaller(g, p, dt);
      else if (p.role === 'tuber') updateTuber(g, p, dt);
      else if (WARN_ROLES[p.role]) updateWarnee(g, p, dt);
      else if (p.role === 'bx') updateBx(g, p, dt);
      else if (p.role === 'hench' || p.role === 'emperor') updateGang(g, p, dt);
      if (p.fake && p.role !== 'faked' && p.state !== 'seated' && p.state !== 'ko' && g.r() < 0.07 * dt) { p.expr = 'happy'; p.exprT = 0.8; } // 仮病：元気な顔がもれる
      if (p.robbedAt && g.t > p.robbedAt && p.state !== 'gone') { p.robbedAt = 0; p.sleep = 0; p.oversleep = false; p.expr = 'worried'; p.exprT = 6; bubble(g, p, 'あれ？財布がない…！', 2.5); }
      // 降りる人（席を立って待っている）→ ドアが開いたら出る
      if (p.leaving && g.phase === 'stop' && g.doorsOpen && p.state === 'stand' && p.dest <= g.station) { p.leaving = false; leave(g, p); }
    }
    // 降りた人を消す
    g.people = g.people.filter(p => p.state !== 'gone');
    for (const s of g.seats) if (s.res >= 0) { const q = person(g, s.res); if (!q || q.state !== 'walk' || q.then !== 'sit' || q.seatTarget !== s.id) { s.res = -1; s.gift = false; } }
    for (const s of g.slots) if (s.occ >= 0) { const q = person(g, s.occ); if (!q || q.slot < 0 || g.slots[q.slot] !== s) s.occ = -1; }
    // 2 人分使われていた席：その人が立ったら空く
    for (const s of g.seats) if (s.hog) { const q = person(g, s.hog); if (!q || q.state !== 'seated' || q.hogSeat !== s.id) { s.hog = 0; s.occ = -1; s.res = -1; s.freedAt = g.t; s.freedBy = -1; emit(g, { type: 'seatFree', id: s.id }); } }

    // NPC が優先の人に譲る
    g.samaritanT -= dt;
    if (g.samaritanT <= 0) {
      g.samaritanT = g.r.range(12, 22);
      const needy = g.people.filter(p => p.priority && (p.state === 'stand') && !p.targetPlayer);
      for (const n of needy) {
        const giver = g.people.find(q => q.state === 'seated' && !q.priority && !q.role && q.sleep === 0 && q.type !== 'yankee' && q.type !== 'obachan' && q.type !== 'gamer' && dist2(q.x, q.z, n.x, n.z) < 1.8);
        if (giver && g.r.chance(0.45)) {
          const s = g.seats[giver.seat]; freeSeat(g, s, giver.id); giver.seat = -1; giver.state = 'stand';
          giver.z = s.fz; placeStanding(g, giver, false);
          s.res = n.id; releaseSlot(g, n); n.state = 'walk'; n.tx = s.x; n.tz = s.fz; n.then = 'sit'; n.seatTarget = s.id;
          bubble(g, giver, 'どうぞ', 1.5); bubble(g, n, 'あらまぁ、ありがとう', 2);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- 落とし物泥棒
  function updateThief(g, p, dt) {
    if (p.state === 'ko' || p.state === 'exit' || p.state === 'gone') return;
    if (p.fleeing) {
      // 逃げる：ドアが開いていたら降りてしまう
      if (p.state === 'stand' && g.phase === 'stop' && g.doorsOpen) {
        p.dest = g.station; releaseSlot(g, p);
        const d = nearestDoor(p.x); p.state = 'exit'; p.tx = d; p.tz = g.doorSide * 1.2; p.speed = 1.7;
        if (p.stolen) toast(g, '泥棒は盗んだ物を持って逃げてしまった…', 'bad'); else toast(g, '泥棒は逃げてしまった…', 'bad');
      }
      return;
    }
    if (p.pickT > 0) {
      p.pickT -= dt;
      if (p.pickT <= 0) {
        const goal = p.thiefGoal; p.thiefGoal = null;
        if (goal && goal.kind === 'pocket') {
          const v = person(g, goal.id);
          if (v && v.state === 'seated' && v.sleep) { p.stolen++; g.stats.stolen++; v.robbedAt = g.t + g.r.range(6, 12); emit(g, { type: 'thiefSteal' }); }
        }
        p.thiefT = g.r.range(5, 9);
      }
      return;
    }
    if (p.state === 'stand' && p.thiefGoal) {
      const goal = p.thiefGoal;
      if (goal.kind === 'item') {
        const it = g.items.find(i => i.id === goal.id);
        p.thiefGoal = null; p.thiefT = g.r.range(4, 8);
        if (it && dist2(it.x, it.z, p.x, p.z) < 0.7) {
          g.items = g.items.filter(i => i !== it); p.stolen++; g.stats.stolen++;
          bubble(g, p, '（ひょい）', 1.2); emit(g, { type: 'thiefSteal' }); emit(g, { type: 'sfx', name: 'pick' });
        }
      } else { p.pickT = 1.6; }
      return;
    }
    if (p.state !== 'stand') return;
    if (g.r() < dt * 0.5) { p.expr = 'shifty'; p.exprT = g.r.range(1, 3); }
    p.thiefT -= dt;
    if (p.thiefT > 0) return;
    p.thiefT = g.r.range(7, 12);
    if (p.stolen >= 3) return; // 盗みすぎない
    // 床の落とし物（プレイヤーの近くは避ける）
    let goal = null, bd = 9;
    for (const it of g.items) { const d = dist2(it.x, it.z, p.x, p.z); if (d < bd && bodies(g).every(b => dist2(it.x, it.z, b.x, b.z) > 0.8)) { bd = d; goal = { kind: 'item', id: it.id, x: it.x, z: it.z }; } }
    if (!goal && g.r.chance(0.45)) {
      const sl = g.people.filter(q => q.state === 'seated' && q.sleep && !q.robbedAt && !q.robbed && dist2(q.x, q.z, p.x, p.z) < 7);
      if (sl.length) { const v = g.r.pick(sl); v.robbed = true; const s = g.seats[v.seat]; goal = { kind: 'pocket', id: v.id, x: s.x, z: s.fz }; }
    }
    if (!goal) return;
    releaseSlot(g, p);
    p.thiefGoal = goal; p.state = 'walk'; p.tx = goal.x; p.tz = goal.z; p.then = 'stand';
  }

  // ---------------------------------------------------------------- 悪者（スリ・席占領・仮病・席ダッシュ・大声電話・車内の帝王）
  const SEEKERS = { hog: 1, dasher: 1, caller: 1, emperor: 1 };
  // ================================================================ ボス駅（初級・中級・最終）とイベント駅
  // たちっぱ線では 3〜4 駅目・6〜7 駅目・終点の 1〜2 つ手前にボス駅が来る（どの駅になるかは毎回ランダム。今日のダイヤはみんな同じ）
  // ボス駅で乗ってくる「困った人たち」を、次の駅に着くまでに片付ければボーナス。残っていると精神ダメージ
  const BOSS = {
    taiiku: { tier: 1, name: '体育大学前', kind: 'gym', n: [3, 4], msg: '体操部が乗ってくる。つり革で技をする人を注意しよう' },
    zoo: { tier: 1, name: '動物園前', kind: 'animal', n: [3, 4], msg: '動物が乗ってくる！？ 追い払おう' },
    tori: { tier: 1, name: '撮り鉄の聖地', kind: 'tori', n: [3, 4], msg: '撮り鉄が通路をふさぐ。注意しよう' },
    senkyo: { tier: 1, name: '選挙事務所前', kind: 'cand', n: [1, 2], msg: '候補者が車内で演説を始める…' },
    yuen: { tier: 1, name: '遊園地前', kind: 'balloon', n: [3, 4], msg: '風船を持った子どもたち。割れるとびっくり' },
    furyo: { tier: 2, name: '不良高校前', kind: 'yanki', n: [4, 5], msg: 'ヤンキーが大勢乗ってくる。床に座りこむ・客にからむ' },
    hanabi: { tier: 2, name: '花火大会前', kind: 'yukata', n: [11, 13], survive: true, msg: '浴衣の人で超満員！ 次の駅まで倒れずに耐えろ' },
    keiba: { tier: 2, name: '競馬場前', kind: 'keiba', n: [3, 4], msg: '馬券が外れた人たちが八つ当たり…' },
    ninja: { tier: 2, name: '忍者の里', kind: 'ninja', n: [3, 3], msg: 'ふつうの乗客にまぎれた忍者を見破れ（人まちがいに注意）' },
    josei: { tier: 2, name: '女性専用車両の乗換駅', kind: 'lady', n: [9, 11], hands: true, msg: '女性客がどっと乗ってくる。近くを通るときは手を挙げて（踏ん張る）通ろう' },
    reien: { tier: 3, name: 'うらめし霊園前', kind: 'ghost', n: [3, 4], msg: '幽霊が乗客に乗り移る！ 🧂 塩をまいて除霊しろ。次の駅までに' },
    shuden: { tier: 3, name: '終電の飲み屋街', kind: 'nomi', n: [5, 6], msg: '酔っぱらいだらけ。からまれる前に声をかけよう' },
    maou: { tier: 3, name: '魔王城前', maou: true, msg: '「車両の魔王」と手下が乗ってくる…！ 魔王を倒せ' },
    rojin: { tier: 0, name: 'ほのぼの老人ホーム前', event: true, msg: 'お年寄りがたくさん乗ってくる。席を譲るチャンス' },
  };
  // 困った人たち（ボス駅で乗ってくる）：types：見た目のもと、label：注意のことば、near：近くにいるときの効き方
  const BX = {
    gym: { types: ['student'], name: '体操部員', look: ['ジャージ', '#1f5fbf'], lines: ['ハッ！ 大車輪！', 'バク転いきまーす！', 'つり革で L 字支持！', '月面宙返り！'], note: '🤸 つり革で技をしている…', label: '「車内で技はやめて…」と注意する', reply: 'あ、すみません！（技をやめる）', pts: 20, scary: 0.1, near: { r: 1.0, sta: 4, mind: 2, cd: 3, why: 'バク転がぶつかった' } },
    animal: { types: ['student'], names: ['サル', 'ペンギン', 'カピバラ', '子ゾウ'], h: 0.7, looks: [['茶色', '#7a5230'], ['黒', '#26262b'], ['茶色', '#a07850'], ['灰色', '#8a8f96']], lines: { サル: ['ウキーッ！', 'ウキキッ（吊り革にぶら下がる）'], ペンギン: ['ペタペタ…', 'クェッ'], カピバラ: ['…（じっとしている）', '…（温泉を探している）'], 子ゾウ: ['パオーン！', '（鼻で吊り革をつかむ）'] }, note: '🐾 動物が乗ってる…！？', label: '「シッシッ」と追い払う', reply: '（しぶしぶドアのほうへ）', pts: 15, scary: 0, wantSeat: true, near: { r: 1.3, mind: 2, cd: 4, why: '動物にびっくり' } },
    tori: { types: ['otaku', 'gamer'], name: '撮り鉄', lines: ['パシャパシャパシャ！', 'どいて！ 今いいとこ！', 'この車両レアなんで！'], note: '📸 通路でカメラを構えている', label: '「通路をふさがないで…」と注意する', reply: 'あ、すみません…', pts: 15, scary: 0.25, near: { r: 1.6, cont: 0.5 } },
    cand: { types: ['salaryman'], name: '候補者', look: ['白', '#f2f2f2'], tie: '#c0392b', lines: ['清き一票をお願いします！', '握手！ 握手！', '〇〇、〇〇でございます！'], note: '🎤 演説しながら握手を求めてくる', label: '「車内での演説はちょっと…」と注意する', reply: '…清き一票を…（去る）', pts: 25, scary: 0.15, approach: true, near: { r: 1.6, cont: 0.9 } },
    balloon: { types: ['student'], name: '風船を持った子ども', h: 0.75, lines: ['ふうせーん！', 'わーい！'], note: '🎈 風船を持ってはしゃいでいる', label: '「風船、しっかり持っててね」と声をかける', reply: 'はーい！', pts: 15, scary: 0, pop: true },
    yanki: { types: ['yankee'], name: 'ヤンキー', look: ['黒（学ラン）', '#15161c'], bottom: '#15161c', lines: ['おい、何見てんだよ', 'ここ座っていいっすかぁ？（床に座りこむ）', 'ウェーイ！'], note: '😤 床に座りこんで、まわりにからんでいる', label: '「床に座らないで…」と注意する', reply: '…ちっ、わかったよ', pts: 25, scary: 0.5, near: { r: 2.0, cont: 0.4 } },
    yukata: { types: ['ol', 'student', 'salaryman'], name: '浴衣の人', looks: [['紺', '#26407a'], ['赤', '#c0392b'], ['ピンク', '#e88aa8'], ['白', '#f2f2f2']], lines: ['花火楽しみ〜！', '押さないで〜！', 'たまや〜！'], note: '👘 浴衣で花火大会へ', noWarn: true, near: { r: 0.8, sta: 3, cd: 2.5, why: '下駄で足をふまれた' } },
    keiba: { types: ['salaryman', 'drunk'], name: '外れた人', lines: ['くそっ、あと鼻差だったのに！', '（新聞をバサーッと広げる）', 'ちくしょー！'], note: '📰 新聞を広げて八つ当たりしている', label: '「新聞、たたんでもらえますか」と頼む', reply: '…はい（たたむ）', pts: 20, scary: 0.35, near: { r: 2.0, cont: 0.5 } },
    ninja: { types: ['salaryman', 'ol', 'student'], hidden: true, note: '🥷 …足音がまったくしない', label: '「…忍者ですよね？」と見破る', reply: 'ドロン！ …見破られたでござる', pts: 30, scary: 0.3, lines: ['…ニンニン', '（天井を見上げている）'] },
    lady: { types: ['ol'], female: true, plain: true },
    ghost: { types: ['ol', 'salaryman'], name: '幽霊', look: ['白', '#eef2f6'], skin: '#dfe8ee', lines: ['うらめしや…', '…さむい…', 'ひゅ〜どろどろ…'], note: '👻 足が…ない？', salt: true },
    nomi: { types: ['drunk', 'salaryman'], name: '酔っぱらい', lines: ['もう一軒いこうよぉ〜', 'ういっく…', '部長〜聞いてくださいよ〜'], note: '🍺 べろべろに酔っている', label: '「大丈夫ですか？」と声をかける', reply: '…すみませぇん（寝る）', pts: 20, scary: 0.2, approach: true, near: { r: 1.5, cont: 0.7 } },
  };
  const BOSS_PTS = [0, 60, 100, 150];
  function planBoss(g) {
    g.bossAt = {};
    if (g.bossTest) { const all = Object.keys(BOSS); for (let st = 1; st <= 120; st++) g.bossAt[st] = g.bossTest === 'all' ? all[(st - 1) % all.length] : g.bossTest; return; }
    if (g.tutorial || g.jiji || opts_noBoss(g)) return;
    const r = rng((g.seed ^ 0xb055b055) >>> 0), last = lastStation(g);
    const pick = (tier) => r.pick(Object.keys(BOSS).filter((k) => BOSS[k].tier === tier));
    if (g.endless) { for (let st = 4; st < 400; st += 4) g.bossAt[st] = pick(1 + ((st / 4 - 1) % 3)); return; }
    if (g.online) { g.bossAt[r.int(2, 3)] = pick(1); g.bossAt[5] = pick(3); return; }
    g.bossAt[r.int(3, 4)] = pick(1); g.bossAt[r.int(6, 7)] = pick(2); g.bossAt[r.int(last - 2, last - 1)] = pick(3);
    if (r.chance(0.4)) { const st = r.pick([2, 5].filter((s) => !g.bossAt[s] && !g.bossAt[s + 1] && !g.bossAt[s - 1])); if (st) g.bossAt[st] = 'rojin'; }
  }
  function opts_noBoss(g) { return !!g.noBoss; }
  // ボス駅の予告（次の駅がボス駅のとき）
  function bossAnnounce(g) {
    const k = g.bossAt && g.bossAt[g.station + 1]; if (!k) return;
    const B = BOSS[k];
    toast(g, (B.event ? '📣 次はイベント駅「' : ['', '⚠ 次は初級ボス駅「', '⚠⚠ 次は中級ボス駅「', '☠ 次は最終ボス駅「'][B.tier]) + B.name + '」…' + B.msg, B.event ? 'info' : 'warn');
    emit(g, { type: 'sfx', name: 'chime' });
  }
  // ボス駅で乗ってくる人を、乗る列に入れる
  function bossBoard(g, st) {
    const k = g.bossAt && g.bossAt[st]; if (!k || !g.boardQueue) return false;
    const B = BOSS[k], r = g.r;
    g.boss = { key: k, st, deadline: st + 1, ids: [], fail: 0, tier: B.tier };
    // 乗れる人数をこえないように：ふつうに乗る人を減らして、ボス駅の人を乗せる
    const alive = g.people.filter((p) => p.state !== 'gone' && p.state !== 'exit').length;
    const room = () => C.MAX_PEOPLE + 16 - alive - g.boardQueue.length;
    const put = (arr) => { for (const q of arr) { while (room() <= 0) { const i = g.boardQueue.findIndex((x) => !x.v); if (i < 0) return; g.boardQueue.splice(i, 1); } g.boardQueue.push(q); } };
    if (B.event) { for (let i = 0; i < 8; i++) put([{ at: 0, type: 'elderly' }]); g.boss = null; return true; }
    if (B.maou) { put([{ at: 0, type: 'emperor', v: 'emperor' }, { at: 0, type: 'henchman', v: 'hench' }, { at: 0, type: 'henchman', v: 'hench' }, { at: 0, type: 'henchman', v: 'hench' }]); g.boss.maou = true; return true; }
    const X = BX[B.kind], n = r.int(B.n[0], B.n[1]);
    for (let i = 0; i < n; i++) put([{ at: 0, type: r.pick(X.types), v: 'bx:' + B.kind }]);
    if (B.hands) { g.boss.hands = true; g.nextChikanCheck = 4; }
    if (B.survive) g.boss.survive = true;
    return true;
  }
  function setupBx(g, p, kind) {
    const X = BX[kind], r = g.r;
    if (g.boss) g.boss.ids.push(p.id);
    p.dest = capDest(g, (g.boss ? g.boss.deadline : g.station + 1) + r.int(1, 2));
    if (X.plain) { if (X.female) { p.female = 1; } p.bxPlain = true; return; } // 女性専用車両：ふつうの乗客
    p.role = 'bx'; p.bxk = kind; p.wantSeat = !!X.wantSeat; p.sleep = 0; p.scary = r.chance(X.scary || 0); p.bxT = r.range(2, 5);
    if (X.names) { const i = r.int(0, X.names.length - 1); p.dispName = X.names[i]; if (X.looks) { p.look.top = X.looks[i][1]; p.look.topName = X.looks[i][0]; p.look.bottom = X.looks[i][1]; } }
    else if (!X.hidden) p.dispName = X.name;
    if (X.look) { p.look.top = X.look[1]; p.look.topName = X.look[0]; }
    if (X.bottom) p.look.bottom = X.bottom;
    if (X.looks && !X.names) { const L = r.pick(X.looks); p.look.top = L[1]; p.look.topName = L[0]; }
    if (X.skin) p.look.skin = X.skin;
    if (X.tie) p.look.tie = X.tie;
    if (X.h) p.h *= X.h;
    if (kind === 'ghost') { p.look.mask = false; p.possT = r.range(4, 8); }
    if (kind === 'nomi') p.look.skin = '#e89a7a';
    // 3D の衣装（見た目）：オンライン対戦の参加者にも届くように look に入れる
    if (!X.hidden) p.look.costume = kind === 'animal' ? 'animal:' + p.dispName : kind;
  }
  // 困った人たちの動き
  function updateBx(g, p, dt) {
    if (p.state === 'ko' || p.state === 'exit' || p.state === 'gone' || p.state === 'fight' || p.bxDone) return;
    const X = BX[p.bxk], pl = g.player;
    p.bxT -= dt;
    if (p.bxk === 'ghost') {
      // 近くの乗客に乗り移る（幽霊は消える）
      p.possT -= dt;
      if (p.possT <= 0) {
        const t = g.people.filter((q) => q !== p && !q.role && !q.possessed && q.state !== 'gone' && q.state !== 'exit' && q.state !== 'ko' && dist2(q.x, q.z, p.x, p.z) < 3.5)[0];
        if (t) {
          t.possessed = true; t.expr = 'sleepy'; t.exprT = 99; bubble(g, t, 'ウゥ…（目がうつろ）', 2.2);
          if (g.boss) g.boss.ids.push(t.id);
          p.bxDone = true; p.state = 'gone'; releaseSlot(g, p); if (p.seat >= 0) { freeSeat(g, g.seats[p.seat], p.id); p.seat = -1; }
          toast(g, '👻 幽霊が乗客に乗り移った…！ 🧂 塩をまけ', 'warn');
          return;
        }
        p.possT = 2;
      }
    }
    if (p.bxT <= 0) {
      p.bxT = g.r.range(4, 8);
      const L = Array.isArray(X.lines) ? X.lines : (X.lines && X.lines[p.dispName]) || [];
      if (L.length && (!X.hidden || g.r.chance(0.25))) bubble(g, p, g.r.pick(L), 2);
      if (X.pop && g.r.chance(0.4)) { // 風船が割れる
        bubble(g, p, 'パーン！！ うわーん！', 2); emit(g, { type: 'sfx', name: 'hit' });
        for (const q of g.people) if (q !== p && q.state !== 'gone' && dist2(q.x, q.z, p.x, p.z) < 3.5) { q.expr = 'surprised'; q.exprT = 2; if (q.sleep && !q.oversleep) q.sleep = 0; }
        if (dist2(p.x, p.z, pl.x, pl.z) < 3) hurtMind(g, 4, '風船が割れてびっくり');
      }
      if (X.approach && p.state === 'stand' && dist2(p.x, p.z, pl.x, pl.z) > 1.3) {
        releaseSlot(g, p); const [tx, tz] = aisleClamp(pl.x + (p.x > pl.x ? 0.7 : -0.7), pl.seat >= 0 ? pl.z * 0.55 : pl.z);
        p.state = 'walk'; p.tx = tx; p.tz = tz; p.then = 'stand';
      }
    }
  }
  // 近くにいるときの効き方・女性専用車両の手挙げ（プレイヤーの更新から呼ぶ）
  function bxHurt(g, dt) {
    const pl = g.player;
    for (const q of g.people) {
      if (q.role !== 'bx' || q.bxDone || q.state === 'ko' || q.state === 'gone' || q.state === 'exit' || q.state === 'fight') continue;
      const N = BX[q.bxk].near; if (!N) continue;
      const d = dist2(q.x, q.z, pl.x, pl.z); if (d > N.r) continue;
      if (N.cont) hurtMind(g, N.cont * dt, '');
      else if (pl.seat < 0) {
        q.bumpT = (q.bumpT || 0) - dt;
        if (q.bumpT <= 0) { q.bumpT = N.cd; if (N.sta) { pl.stamina = Math.max(0.1, pl.stamina - N.sta); pl.hitFlash = 0.25; } if (N.mind) hurtMind(g, N.mind, N.why || ''); else if (N.why) toast(g, N.why, 'bad'); emit(g, { type: 'sfx', name: 'block' }); }
      }
    }
    // 女性専用車両の乗換駅：手を挙げずに女性のすぐ横を通ると、痴漢とまちがえられる
    if (g.boss && g.boss.hands && pl.seat < 0 && !pl.braceHeld && pl.moving) {
      g.handT = (g.handT || 0) - dt;
      if (g.handT <= 0) {
        const w = g.people.find((q) => q.female && !q.role && q.state !== 'gone' && q.state !== 'exit' && q.state !== 'ko' && dist2(q.x, q.z, pl.x, pl.z) < 0.7);
        if (w) {
          g.handT = 2.5; g.boss.fail++;
          w.expr = 'angry'; w.exprT = 3; bubble(g, w, g.r.pick(['ちょっと！ 今さわった？', 'え、なに？', '…（にらむ）']), 2);
          hurtMind(g, 4, '痴漢とまちがえられそうになった'); addKarma(g, 3, '手を挙げずに通った');
          if (!g.handTip) { g.handTip = true; toast(g, '🙋 女性の近くを通るときは、踏ん張る（手を挙げる）で通ろう', 'warn'); }
        }
      }
    }
  }
  // 塩をまく（幽霊・乗り移られた人）
  function saltPrompt(g, ap, apd) {
    if (!ap || apd > 2.0 || ap.state === 'gone' || ap.state === 'ko') return null;
    if (ap.possessed || (ap.role === 'bx' && ap.bxk === 'ghost' && !ap.bxDone)) return { act: 'salt', label: '🧂 塩をまいて除霊する', id: ap.id };
    return null;
  }
  // 次の駅に着いたら、ボス駅の結果
  function bossJudge(g) {
    const b = g.boss; if (!b || g.station < b.deadline) return;
    g.boss = null;
    const B = BOSS[b.key];
    const alive = (id) => { const p = person(g, id); return p && p.state !== 'gone' && p.state !== 'exit' && p.state !== 'ko' && (p.possessed || (p.role === 'bx' && !p.bxDone)) ? p : null; };
    let clear;
    if (b.survive) clear = !g.over;
    else if (b.hands) clear = b.fail === 0;
    else if (b.maou) clear = !g.people.some((p) => p.role === 'emperor' && p.state !== 'ko' && p.state !== 'gone' && p.state !== 'exit');
    else clear = !b.ids.some(alive);
    if (b.key === 'reien') {
      const left = b.ids.map(alive).filter((p) => p && p.possessed);
      for (const p of left) { p.possessed = false; leave(g, p); bubble(g, p, '…（ふらふらと降りていく）', 2); }
      if (left.length) hurtMind(g, Math.min(30, 10 * left.length), '取りつかれたまま降りていった');
    }
    for (const id of b.ids) { const p = alive(id); if (p) { p.bxDone = true; p.dest = Math.min(p.dest, g.station + 1); } }
    if (clear) { deed(g, BOSS_PTS[b.tier], '🏆 ' + B.name + '（ボス駅）クリア！'); g.stats.bossClear = (g.stats.bossClear || 0) + 1; emit(g, { type: 'sfx', name: 'clear' }); }
    else { hurtMind(g, 12, 'ボス駅をクリアできなかった'); toast(g, '😵 ' + B.name + '…クリアならず', 'bad'); }
  }

  const VILLAIN_MSG = {
    suri: '⚠ スリが乗ってきた…！ 財布を抜く瞬間を見逃すな（抜く前に殴ると冤罪）',
    hog: '⚠ 席を2人分使う人が乗ってきた（頼めば詰めてくれる…かも）',
    faker: '⚠ 具合が悪そうな人が乗ってきた…本当に？',
    dasher: '⚠ 席ダッシュの人が乗ってきた！ 空いた席を横取りされるな',
    caller: '⚠ 大声で電話する人が乗ってきた…寝ている人が起きちゃう',
    tuber: '⚠ 迷惑YouTuberが乗ってきた！ 床のスピーカーを壊せ（下を見てパンチ）',
    emperor: '👑 車内の帝王が乗ってきた…！ 子分を倒さないと近づけない',
    leak: '⚠ どこからかシャカシャカ音が…音もれの人を探して注意しよう（人まちがいに注意）',
    pack: '⚠ 大きなリュックを背負ったままの人が乗ってきた。ぶつかると痛い',
    bento: '⚠ においのきつい弁当を食べている人がいる…離れるか、注意するか',
    preach: '⚠ 説教したそうなおじさんが乗ってきた…目が合うと長いぞ',
    door: '⚠ ドアの前から動かない人がいる。乗り降りのじゃま',
  };
  const WARN_ROLES = { leak: 1, pack: 1, bento: 1, preach: 1, door: 1 };
  function capDest(g, d) { return Math.min(d, lastStation(g)); }
  function villainCount(g) {
    let n = g.chikan ? 1 : 0;
    for (const p of g.people) {
      if (p.state === 'gone' || p.state === 'exit' || p.state === 'ko') continue;
      if (p.role === 'thief' || p.role === 'suri' || p.role === 'hog' || p.role === 'caller' || WARN_ROLES[p.role]) n++;
      else if (p.role === 'dasher' && p.state !== 'seated') n++;
      else if (p.fake && p.role !== 'faked') n++;
      else if (p.role === 'emperor') n += 2;
      else if (p.role === 'tuber') n++;
    }
    return n;
  }
  // この駅で乗ってくる悪者を決める（同時に 2 人まで）
  function planVillains(g, st) {
    if (!g.villainKinds.length || st < 1 || st > lastStation(g) - 2 || !g.boardQueue) return;
    const vr = g.vr, active = villainCount(g);
    const put = (arr) => { const at = vr.int(0, g.boardQueue.length); g.boardQueue.splice(at, 0, ...arr); };
    if (!g.emperorDone && st >= 3 && st <= lastStation(g) - 3 && active === 0 && vr.chance(g.hard || g.endless ? 0.07 : 0.035)) {
      g.emperorDone = true;
      put([{ at: 0, type: 'emperor', v: 'emperor' }, { at: 0, type: 'henchman', v: 'hench' }, { at: 0, type: 'henchman', v: 'hench' }]);
      return;
    }
    if (active >= 2 || !vr.chance(g.hard ? 0.5 : 0.35)) return;
    const w = {}; for (const k of g.villainKinds) w[k] = k === 'suri' ? 2 : 1;
    const v = weighted(vr, w);
    if (v === 'tuber' && g.speaker && g.speaker.on && !g.speaker.broken) return;
    const type = v === 'leak' ? vr.pick(['student', 'ol', 'salaryman', 'gamer']) : v === 'pack' ? vr.pick(['student', 'tourist', 'otaku']) : v === 'bento' ? vr.pick(['salaryman', 'obachan', 'otaku']) : v === 'preach' ? 'salaryman' : v === 'door' ? vr.pick(['salaryman', 'ol', 'gamer']) :
      v === 'suri' ? vr.pick(['salaryman', 'student', 'ol']) : v === 'hog' ? vr.pick(['salaryman', 'yankee', 'obachan', 'otaku']) : v === 'faker' ? 'sick' : v === 'dasher' ? 'dasher' : v === 'tuber' ? vr.pick(['student', 'yankee']) : vr.pick(['salaryman', 'ol', 'obachan', 'yankee']);
    put([{ at: 0, type, v }]);
  }
  function setupVillain(g, p, v) {
    const r = g.r, st = g.station;
    if (v.startsWith('bx:')) { setupBx(g, p, v.slice(3)); return; }
    if (g.boss && g.boss.maou && (v === 'emperor' || v === 'hench')) p.maouGang = true;
    if (!g.seenVillain[v] && VILLAIN_MSG[v] && !g.tutorial) { g.seenVillain[v] = true; toast(g, VILLAIN_MSG[v], 'warn'); }
    if (v === 'suri') { p.role = 'suri'; p.wantSeat = false; p.sleep = 0; p.suri = { ph: 'roam', t: r.range(4, 8) }; p.hp = 2; p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'hog') { p.role = 'hog'; p.wantSeat = true; p.react = 0.25; p.scary = p.tough || r.chance(0.3); p.hogKind = p.type === 'obachan' || p.type === 'otaku' || p.female ? 'bag' : 'spread'; p.dest = capDest(g, st + r.int(3, 6)); }
    else if (v === 'faker') { p.fake = true; p.idle = 'none'; p.wantSeat = true; } // 顔（ニヤッ）が見えるように、うつむかせない
    else if (v === 'dasher') { p.role = 'dasher'; p.wantSeat = true; p.dest = capDest(g, st + r.int(2, 4)); }
    else if (v === 'caller') { p.role = 'caller'; p.idle = 'call'; p.scary = p.tough || r.chance(0.3); p.callT = r.range(2, 4); p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'tuber') { p.role = 'tuber'; p.wantSeat = false; p.idle = 'phone'; p.tubT = r.range(1, 2); p.dest = capDest(g, st + r.int(3, 5)); g.speaker = { owner: p.id, x: p.x, z: 0, hp: 2, on: false, broken: false }; }
    else if (v === 'leak') { p.look.costume = 'leak'; p.role = 'leak'; p.idle = 'phone'; p.scary = p.tough || r.chance(0.2); p.leakT = r.range(3, 6); p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'pack') { p.look.costume = 'pack'; p.role = 'pack'; p.wantSeat = false; p.look.bag = true; p.scary = p.tough || r.chance(0.2); p.bumpT = 0; p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'bento') { p.look.costume = 'bento'; p.role = 'bento'; p.idle = 'none'; p.scary = p.tough || r.chance(0.2); p.eatT = r.range(3, 6); p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'preach') { p.role = 'preach'; p.wantSeat = false; p.scary = r.chance(0.45); p.prT = r.range(2, 4); p.speed *= 0.85; p.dest = capDest(g, st + r.int(3, 5)); }
    else if (v === 'door') { p.role = 'door'; p.wantSeat = false; p.doorX = nearestDoor(p.x); p.doorZ = r.chance(0.5) ? 0.95 : -0.95; p.dest = capDest(g, st + r.int(3, 6)); }
    else if (v === 'emperor') { p.role = 'emperor'; p.wantSeat = true; p.priOK = true; p.brute = { hp: 6, dmg: 18, guard: 0.4 }; p.dest = capDest(g, st + r.int(3, 5)); g.emperorId = p.id; p.menT = r.range(6, 10); }
    else if (v === 'hench') {
      const boss = person(g, g.emperorId);
      p.role = 'hench'; p.wantSeat = false; p.brute = { hp: 3, dmg: 9, guard: 0.25 }; p.boss = g.emperorId; p.dest = boss ? boss.dest : capDest(g, st + 4);
      p.gIdx = g.people.filter(q => q.role === 'hench' && q.boss === g.emperorId).length; p.menT = g.r.range(4, 9);
    }
    if (p.maouGang) { p.look.costume = p.role === 'emperor' ? 'maou' : 'maouHench'; if (p.role === 'emperor') { p.dispName = '車両の魔王'; p.brute = { hp: 9, dmg: 22, guard: 0.45 }; p.look.top = '#3a1052'; p.look.topName = '紫'; } else { p.dispName = '魔王の手下'; p.brute.hp = 4; } p.dest = capDest(g, st + 2); }
  }
  // テスト用：その場に悪者を出す
  function spawnVillain(g, v, x, z, typeOverride) {
    const type = typeOverride || (v.startsWith('bx:') ? BX[v.slice(3)].types[0] : v === 'tuber' ? 'student' : v === 'suri' ? 'salaryman' : v === 'faker' ? 'sick' : v === 'dasher' ? 'dasher' : v === 'emperor' ? 'emperor' : v === 'hench' ? 'henchman' : v === 'hog' ? 'salaryman' : 'ol');
    const p = spawn(g, type, g.station);
    p.x = x != null ? x : 0; p.z = z != null ? z : 0;
    g.people.push(p); setupVillain(g, p, v);
    p.state = 'stand';
    return p;
  }
  // 2 人分の席：となりの空き席も使う
  function hogClaim(g, p) {
    if (p.seat < 0 || p.hogSeat != null) return;
    const seat = g.seats[p.seat];
    const s2 = g.seats.find(o => o.id !== seat.id && o.side === seat.side && o.pri === seat.pri && Math.abs(o.x - seat.x) < 0.55 && o.occ < 0 && o.res < 0);
    if (!s2) return;
    s2.occ = p.id; s2.hog = p.id; p.hogSeat = s2.id;
  }
  // 席ダッシュ：ほかの人が向かっている席も、自分のほうが近ければ横取りする
  function dashSteal(g, p, s) {
    const q = person(g, s.res); if (!q || q.role === 'emperor') return false;
    return dist2(q.x, q.z, s.x, s.fz) > dist2(p.x, p.z, s.x, s.fz) + 0.5;
  }
  // 席ダッシュ：立っているプレイヤーにぶつかると止まる
  function dasherBlocked(g, p) {
    const bi = bodyIndex(g, (b) => b.seat < 0 && dist2(b.x, b.z, p.x, p.z) < 0.42);
    if (bi < 0) return false;
    const s = g.seats[p.seatTarget]; if (s && s.res === p.id) s.res = -1;
    p.then = null; p.state = 'stand'; p.expr = 'surprised'; p.exprT = 2; p.blockCD = g.t + 6;
    bubble(g, p, 'うわっ、ちょっ…！', 1.6); placeStanding(g, p, false);
    asPlayer(g, bi, () => { g.stats.dashBlock++; deed(g, 15, '席ダッシュを体でブロック'); });
    return true;
  }
  // プレイヤーの体を探す（1 人用は 0、オンラインは何人目か）
  function bodyIndex(g, fn) {
    if (!g.multi) return fn(g.player) ? 0 : -1;
    return g.players.findIndex(P => !P.out && fn(P.pl));
  }
  function asPlayer(g, i, fn) { if (!g.multi) { fn(); return; } const prev = g.pi; setCtx(g, i); fn(); setCtx(g, prev); }
  function bodyOf(g, i) { return g.multi ? (g.players[i] && !g.players[i].out ? g.players[i].pl : null) : g.player; }

  // スリ：人に寄って、ポケットに手を入れて、抜いたら次の駅で逃げる
  function updateSuri(g, p, dt) {
    const S = p.suri; if (!S || p.state === 'ko' || p.state === 'exit' || p.state === 'gone') return;
    if (S.ph === 'escape') return;
    const tpos = () => { const T = S.target; if (!T) return null; if (T.kind === 'pl') { const b = bodyOf(g, T.i); return b && b.seat < 0 ? b : null; } const v = person(g, T.id); return v && (v.state === 'stand' || v.state === 'walk') ? v : null; };
    const roam = () => { S.ph = 'roam'; S.t = g.r.range(5, 9); S.target = null; if (p.anim === 'reach') { p.anim = 'none'; p.animT = 0; } if (p.state === 'stand' && p.slot < 0) placeStanding(g, p, false); };
    if (S.ph === 'roam') {
      if (p.state !== 'stand') return;
      if (g.r() < dt * 0.25) { p.expr = 'shifty'; p.exprT = g.r.range(0.5, 1.4); }
      S.t -= dt; if (S.t > 0) return;
      S.t = g.r.range(5, 9);
      if (g.phase !== 'travel' || C.T_TRAVEL - g.phaseT < 6) return;
      const npcs = g.people.filter(q => q !== p && q.state === 'stand' && !q.role && !q.priority && !q.leaving && !q.robbed && dist2(q.x, q.z, p.x, p.z) < 6);
      let T = null;
      const bi = bodyIndex(g, b => b.seat < 0 && dist2(b.x, b.z, p.x, p.z) < 6);
      if (bi >= 0 && (g.r.chance(0.45) || !npcs.length)) T = { kind: 'pl', i: bi };
      else if (npcs.length) T = { kind: 'npc', id: g.r.pick(npcs).id };
      if (!T) return;
      S.target = T; S.ph = 'approach'; S.t = 7;
    }
    const tp = tpos();
    if (!tp) { roam(); return; }
    const d = dist2(p.x, p.z, tp.x, tp.z);
    if (S.ph === 'approach') {
      S.t -= dt; if (S.t <= 0) { roam(); return; }
      if (d < 0.7) { S.ph = 'reach'; S.rt = 1.5; releaseSlot(g, p); p.state = 'stand'; p.then = null; }
      else if (p.state === 'stand' || p.state === 'walk') { releaseSlot(g, p); p.state = 'walk'; p.then = 'stand'; const side = tp.x > p.x ? -1 : 1; [p.tx, p.tz] = aisleClamp(tp.x + side * 0.38, tp.z * 0.9); }
      return;
    }
    if (S.ph === 'reach') {
      if (d > 1.15) { roam(); return; }
      p.anim = 'reach'; p.animT = 0.2; p.ry = Math.atan2(tp.x - p.x, tp.z - p.z);
      S.rt -= dt;
      if (S.rt <= 0) suriSteal(g, p, S.target);
    }
  }
  function suriSteal(g, p, T) {
    const S = p.suri; S.ph = 'escape'; p.anim = 'none'; p.animT = 0;
    p.loot = { kind: T.kind, id: T.id, i: T.i, amt: 0 };
    emit(g, { type: 'suriSteal', id: p.id });
    if (T.kind === 'npc') { const v = person(g, T.id); if (v) { v.robbed = true; v.robbedAt = g.t + g.r.range(3, 6); } }
    else asPlayer(g, T.i, () => {
      const pl = g.player, amt = Math.min(Math.floor(pl.toku), g.r.int(20, 40));
      pl.toku -= amt; p.loot.amt = amt;
      toast(g, '💸 …ポケットが軽い！？ 徳を' + amt + '抜かれた！ スリだ、次の駅までに捕まえろ', 'bad');
      emit(g, { type: 'shake', amount: 0.4 });
    });
    // 次の駅で逃げる
    p.dest = capDest(g, g.phase === 'stop' ? g.station + 1 : nextStation(g)); p.leaving = true;
    releaseSlot(g, p); const dd = nearestDoor(p.x);
    p.state = 'walk'; p.tx = dd + (g.r() - 0.5) * 0.6; p.tz = (p.z >= 0 ? 1 : -1) * 0.95; p.then = 'stand';
  }
  function punchSuri(g, p, dmgMul) {
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
    if (!p.loot) { // まだ何もしていない：冤罪
      g.stats.falseAccuse++; g.stats.wrongPunch++;
      p.expr = 'angry'; p.exprT = 5; p.angry = 8; bubble(g, p, '痛っ！なにするんですか！', 2);
      addKarma(g, 20, '冤罪（まだ何もしていない人を殴った）'); hurtMind(g, 15, '冤罪…');
      toast(g, '…まだ何もしていなかった。冤罪だ！', 'bad');
      const S = p.suri; S.ph = 'roam'; S.t = g.r.range(9, 14); S.target = null; p.anim = 'none';
      if (p.state === 'walk') { p.state = 'stand'; p.then = null; placeStanding(g, p, false); }
      return;
    }
    p.hp -= dmgMul; p.stunned = 0.3; p.expr = 'pain'; p.exprT = 0.6;
    if (p.hp <= 0) {
      releaseSlot(g, p); p.state = 'ko'; p.expr = 'ko'; p.exprT = 999; p.koT = 0; p.leaving = false; p.role = 'suriKO';
      g.stats.suriKO++; deed(g, 80, 'スリを現行犯で撃退！');
      returnLoot(g, p);
      emit(g, { type: 'sfx', name: 'ko' });
      return;
    }
    if (!p.caught) { p.caught = true; bubble(g, p, 'ちっ！', 1.2); toast(g, 'スリだ！ 逃がすな！ もう一発', 'warn'); p.speed = 1.6; }
  }
  function returnLoot(g, p) {
    const L = p.loot; if (!L) return; p.loot = null;
    if (L.kind === 'pl') {
      const b = bodyOf(g, L.i); if (!b || !L.amt) return;
      b.toku += L.amt;
      asPlayer(g, L.i, () => toast(g, '抜かれた徳 ' + L.amt + ' が戻ってきた！', 'good'));
      return;
    }
    const v = person(g, L.id);
    const it = { id: g.nextId++, key: 'wallet', name: '財布', pts: 30, owner: L.id, x: p.x, z: p.z, t0: g.t, noticeAfter: 0, noticed: true, taken: true,
      hint: v ? v.look.topName + 'の服の' + (v.female ? '女性' : '男性') : '降りた人' };
    if (!g.player.carrying) { g.player.carrying = it; toast(g, '財布を取り返した！ 持ち主（' + it.hint + '）に返そう', 'good'); }
    else { it.taken = false; [it.x, it.z] = aisleClamp(p.x, p.z); g.items.push(it); toast(g, '財布が床に落ちた（持ち主は' + it.hint + '）', 'info'); }
  }

  // 大声電話：寝ている人を起こしてしまう
  function updateCaller(g, p, dt) {
    if (p.state === 'ko' || p.state === 'exit' || p.state === 'gone') return;
    p.callT -= dt; if (p.callT > 0) return;
    p.callT = g.r.range(4, 7);
    bubble(g, p, g.r.pick(['もしもし！？ 今電車！！', 'えーっ!? マジでぇ!?', 'だからさぁ！！ 聞こえる!?', 'ガハハハハ！！', 'うん、うん、今電車だって！！']), 2.2);
    for (const q of g.people) {
      if (q === p || q.state === 'gone' || dist2(q.x, q.z, p.x, p.z) > 3.2) continue;
      if (q.sleep && !q.oversleep) { q.sleep = 0; q.expr = 'angry'; q.exprT = 3; if (g.r.chance(0.3)) bubble(g, q, 'うるさいなぁ…', 1.5); }
      else if (q.sleep === 0 && q.state !== 'ko' && g.r.chance(0.3)) { q.expr = 'glare'; q.exprT = 2; }
    }
  }

  // 注意できる悪者（音もれ・リュック・弁当・説教・ドア前）：近くにいると心がすり減る。注意すると徳（こわい人は逆ギレ）
  function updateWarnee(g, p, dt) {
    if (p.state === 'ko' || p.state === 'exit' || p.state === 'gone' || p.state === 'fight') return;
    const pl = g.player;
    if (p.role === 'leak') {
      p.leakT -= dt; if (p.leakT > 0) return; p.leakT = g.r.range(5, 9);
      if (g.r.chance(0.3)) bubble(g, p, '♪', 1.2); // ときどきだけ。だれの音かは近くで見て探す
      else if (dist2(p.x, p.z, pl.x, pl.z) < 4) toast(g, '🎧 どこからかシャカシャカ音が…', 'info');
    } else if (p.role === 'bento') {
      p.eatT -= dt; if (p.eatT > 0) return; p.eatT = g.r.range(5, 8);
      bubble(g, p, g.r.pick(['もぐもぐ…', 'ずるずるっ', 'うまっ']), 1.6);
      for (const q of g.people) if (q !== p && q.sleep === 0 && q.state !== 'ko' && dist2(q.x, q.z, p.x, p.z) < 2.5 && g.r.chance(0.3)) { q.expr = 'glare'; q.exprT = 2; }
    } else if (p.role === 'door') {
      if (p.state === 'stand' && dist2(p.x, p.z, p.doorX, p.doorZ) > 0.45) { releaseSlot(g, p); p.state = 'walk'; p.tx = p.doorX; p.tz = p.doorZ; p.then = 'stand'; }
    } else if (p.role === 'preach') {
      // 自分（プレイヤー）に近づいてきて、説教をはじめる
      p.prT -= dt; if (p.prT > 0) return; p.prT = g.r.range(1.5, 3);
      const d = dist2(p.x, p.z, pl.x, pl.z);
      if (d > 1.3 && p.state === 'stand') { releaseSlot(g, p); const [tx, tz] = aisleClamp(pl.x + (p.x > pl.x ? 0.7 : -0.7), pl.seat >= 0 ? pl.z * 0.55 : pl.z); p.state = 'walk'; p.tx = tx; p.tz = tz; p.then = 'stand'; }
      else if (d <= 1.6) { p.ry = Math.atan2(pl.x - p.x, pl.z - p.z); bubble(g, p, g.r.pick(['だいたい最近の若いもんは…', '君ねぇ、立ち方がなってない！', 'わしが若いころはなぁ…', 'ちょっと聞きなさい！']), 2.2); p.expr = 'angry'; p.exprT = 2; }
    }
  }
  // 注意できる悪者がまわりにいるとき、心と体力に効く（プレイヤーの更新から呼ぶ）
  function warneeHurt(g, dt) {
    const pl = g.player;
    for (const q of g.people) {
      if (!WARN_ROLES[q.role] || q.state === 'ko' || q.state === 'gone' || q.state === 'exit' || q.state === 'fight') continue;
      const d = dist2(q.x, q.z, pl.x, pl.z);
      if (q.role === 'leak' && d < 2.5) hurtMind(g, 0.3 * dt, '');
      else if (q.role === 'bento' && d < 3) hurtMind(g, 0.35 * dt, '');
      else if (q.role === 'preach' && d < 1.7) hurtMind(g, 1.1 * dt, '');
      else if (q.role === 'pack' && d < 0.85 && pl.seat < 0) {
        q.bumpT = (q.bumpT || 0) - dt;
        if (q.bumpT <= 0) { q.bumpT = 3; pl.stamina = Math.max(0.1, pl.stamina - 3); pl.hitFlash = 0.25; hurtMind(g, 3, 'リュックがぶつかった'); emit(g, { type: 'sfx', name: 'block' }); }
      } else if (q.role === 'door' && d < 0.9 && pl.seat < 0 && g.phase === 'stop') {
        q.bumpT = (q.bumpT || 0) - dt;
        if (q.bumpT <= 0) { q.bumpT = 4; hurtMind(g, 3, 'ドア前の人にじゃまされた'); bubble(g, q, '…', 1); }
      }
    }
  }
  // 音もれ・弁当の人がまわりにいるか（いれば、ふつうの人にも「注意する」が出る＝人まちがいもある）
  function nearSmellOrLeak(g) {
    const pl = g.player;
    return g.people.find((q) => (q.role === 'leak' || q.role === 'bento' || (q.role === 'bx' && q.bxk === 'ninja' && !q.bxDone)) && q.state !== 'ko' && q.state !== 'gone' && q.state !== 'fight' && dist2(q.x, q.z, pl.x, pl.z) < 3.5) || null;
  }
  const WARN_LABEL = { leak: '「音、もれてますよ」と注意する', bento: '「においが…」と注意する', pack: '「リュック、前に抱えてもらえますか」と頼む', door: '「奥に詰めてもらえますか」と頼む', preach: '「すみません、ひとりにしてください」と言う' };
  function warnPrompt(g, ap, apd, seated) {
    if (!ap || ap.state === 'ko' || ap.state === 'fight' || ap.warned) return null;
    { const sp = saltPrompt(g, ap, apd); if (sp) return sp; }
    if (ap.role === 'bx' && !ap.bxDone && BX[ap.bxk].label && apd < 2.2) return { act: 'warn', label: BX[ap.bxk].label, id: ap.id };
    if (WARN_ROLES[ap.role] && apd < (seated ? 2.0 : 2.2) && !(seated && (ap.role === 'pack' || ap.role === 'door'))) return { act: 'warn', label: WARN_LABEL[ap.role], id: ap.id };
    return null;
  }
  // 人まちがい：音もれ・弁当の人の近くでは、ふつうの人にも注意できてしまう（ほかにすることがないときだけ出す）
  function wrongWarnPrompt(g, ap, apd) {
    if (!ap || ap.state === 'ko' || ap.role || ap.priority || ap.warned || apd > 1.8) return null;
    const nz = nearSmellOrLeak(g);
    return nz && ap !== nz ? { act: 'warn', label: nz.role === 'bx' ? BX[nz.bxk].label : WARN_LABEL[nz.role], id: ap.id, wrong: nz.role === 'bx' ? nz.bxk : nz.role } : null;
  }

  // 迷惑YouTuber：床のスピーカーで音楽を流す。スピーカーを壊すと徳
  function updateTuber(g, p, dt) {
    const sp = g.speaker; if (!sp || sp.owner !== p.id || p.state === 'ko' || p.state === 'exit' || p.state === 'gone') return;
    if (!sp.on) {
      if (p.state !== 'stand') return;
      [sp.x, sp.z] = aisleClamp(p.x + 0.4, p.z * 0.4); sp.on = true;
      bubble(g, p, 'どうもー！ 今日は電車で爆音ライブしてみた！', 2.5); emit(g, { type: 'speaker', on: true });
      return;
    }
    if (sp.broken) return;
    p.tubT -= dt; if (p.tubT > 0) return;
    p.tubT = g.r.range(3, 5);
    bubble(g, p, g.r.pick(['♪♪ イェーイ！', 'チャンネル登録よろしく〜！', 'みんなノッてる〜？', '♪ ズンチャズンチャ ♪']), 2);
    for (const q of g.people) {
      if (q === p || q.state === 'gone' || dist2(q.x, q.z, sp.x, sp.z) > 4) continue;
      if (q.sleep && !q.oversleep) { q.sleep = 0; q.expr = 'angry'; q.exprT = 3; if (g.r.chance(0.25)) bubble(g, q, 'うるさっ…', 1.4); }
      else if (q.sleep === 0 && q.state !== 'ko' && g.r.chance(0.35)) { q.expr = 'glare'; q.exprT = 2; }
    }
  }
  function speakerNear(g) {
    const sp = g.speaker, pl = g.player;
    return !!(sp && sp.on && !sp.broken && pl.seat < 0 && pl.pitch < -0.3 && dist2(sp.x, sp.z, pl.x, pl.z) < 1.15);
  }
  function hitSpeaker(g, dmg) {
    const sp = g.speaker; sp.hp -= dmg || 1;
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'speakerHit' }); emit(g, { type: 'shake', amount: 0.4 });
    if (sp.hp > 0) { const o = person(g, sp.owner); if (o) { o.expr = 'surprised'; o.exprT = 1.5; bubble(g, o, 'ちょっ、機材に触んな！', 1.4); } return; }
    sp.broken = true; emit(g, { type: 'speaker', on: false });
    const o = person(g, sp.owner);
    if (o) { o.role = 'tuberSad'; o.idle = 'none'; o.expr = 'sad'; o.exprT = 8; bubble(g, o, 'ああっ！ 機材がぁ！', 2.5); }
    g.stats.speakerKO++; deed(g, 40, '迷惑スピーカーを壊した');
    for (const q of g.people) if (q !== o && q.sleep === 0 && q.state !== 'ko' && dist2(q.x, q.z, sp.x, sp.z) < 4) { q.expr = 'happy'; q.exprT = 3; }
  }

  // 車内の帝王と子分
  function emperorKick(g, p) {
    const cands = g.people.filter(q => q.state === 'seated' && !q.priority && !q.role && q.type !== 'alien');
    if (!cands.length) return null;
    let v = cands[0], bd = 1e9; for (const q of cands) { const d = dist2(q.x, q.z, p.x, 0); if (d < bd) { bd = d; v = q; } }
    const s = g.seats[v.seat]; freeSeat(g, s, -1); v.seat = -1; v.state = 'stand'; v.z = s.fz; v.expr = 'worried'; v.exprT = 4; bubble(g, v, 'ひっ…どうぞ…', 1.8); placeStanding(g, v, false);
    return s;
  }
  function gangOf(g, bossId) { return g.people.filter(q => (q.role === 'hench' && q.boss === bossId || q.role === 'emperor' && q.id === bossId) && q.state !== 'ko' && q.state !== 'gone' && q.state !== 'exit'); }
  function updateGang(g, p, dt) {
    if (p.state === 'ko' || p.state === 'exit' || p.state === 'gone' || p.state === 'fight') return;
    p.menT -= dt;
    if (p.role === 'hench') {
      const boss = person(g, p.boss);
      if (boss && boss.state === 'seated' && p.state === 'stand' && p.gSeat !== boss.seat) {
        const s = g.seats[boss.seat]; p.gSeat = boss.seat; releaseSlot(g, p);
        p.state = 'walk'; [p.tx, p.tz] = aisleClamp(s.x + (p.gIdx % 2 ? 0.45 : -0.45), s.fz); p.then = 'stand';
      }
      if (p.menT <= 0) {
        p.menT = g.r.range(9, 15);
        bubble(g, p, g.r.pick(['あぁん？', '見てんじゃねぇぞ', '帝王のお通りだ']), 1.8); p.expr = 'glare'; p.exprT = 2;
        for (const q of g.people) if (q !== p && !q.brute && q.sleep === 0 && q.state !== 'ko' && dist2(q.x, q.z, p.x, p.z) < 2) { q.expr = 'worried'; q.exprT = 3; }
      }
    } else if (p.menT <= 0) { p.menT = g.r.range(10, 16); bubble(g, p, g.r.pick(['フッ…', '庶民の電車も悪くない', 'ワシの席はどこじゃ']), 1.8); }
  }
  function setAggro(g, q, pi) {
    if (q.state === 'ko') return;
    if (q.role === 'caller') q.callT = 99;
    q.aggro = true; q.aggroPi = pi; releaseSlot(g, q);
    if (q.seat >= 0) { freeSeat(g, g.seats[q.seat], q.id); q.seat = -1; }
    if (q.hogSeat != null) q.hogSeat = null;
    q.state = 'fight'; q.bfs = 'idle'; q.bft = g.r.range(0.6, 1.2); q.then = null;
    if (!q.angryFight || q.role === 'emperor' || q.role === 'hench') bubble(g, q, q.role === 'emperor' ? 'ほう…やるじゃねぇか' : 'やんのかコラァ！', 1.8);
  }
  // 度胸：こわい人でも言うことを聞いてくれる
  function gutsWin(g, p) {
    if (!(g.r() < 0.07 * ST(g, 'guts'))) return false;
    emit(g, { type: 'guts' }); toast(g, '😤 度胸で押し切った！', 'good');
    return true;
  }
  // こわい人に注意すると、逆ギレして向かってくる
  function angerFight(g, p) {
    hurtMind(g, 10, '逆ギレされた');
    p.brute = { hp: p.type === 'yankee' ? 4 : 3, dmg: p.type === 'yankee' ? 12 : 10, guard: 0.3 };
    p.angryFight = true; p.expr = 'angry'; p.exprT = 5;
    setAggro(g, p, g.multi ? g.pi : 0);
    toast(g, '逆ギレして向かってきた！ 構えたらパンチでカウンター、ガードで防御', 'warn');
  }
  function punchBrute(g, p, dmgMul) {
    const pi = g.multi ? g.pi : 0, isGang = p.role === 'hench' || p.role === 'emperor', bossId = p.role === 'emperor' ? p.id : p.boss;
    const gang = isGang ? gangOf(g, bossId) : [p], hench = gang.filter(q => q.role === 'hench');
    if (p.role === 'emperor' && hench.length) {
      bubble(g, hench[0], '帝王に触るな！', 1.5); emit(g, { type: 'sfx', name: 'block' });
      toast(g, '子分が邪魔で届かない！ 先に子分を倒せ', 'warn');
      for (const q of hench) if (!q.aggro) setAggro(g, q, pi);
      return;
    }
    if (!p.aggro) { if (p.role === 'emperor' || !isGang) setAggro(g, p, pi); else { for (const q of hench) if (!q.aggro) setAggro(g, q, pi); } toast(g, p.role === 'emperor' ? '👑 帝王との決戦！' : '帝王の子分とケンカだ！ 構えたらパンチでカウンター、ガードで防御', 'warn'); }
    if (p.bfs !== 'windup' && g.r() < p.brute.guard) { emit(g, { type: 'sfx', name: 'block' }); bubble(g, p, 'ガード！', 0.6); emit(g, { type: 'guarded', id: p.id }); return; }
    let dmg = dmgMul;
    if (p.bfs === 'windup') { dmg += 1; p.bfs = 'recover'; p.bft = 0.9; g.stats.counters++; emit(g, { type: 'counter' }); toast(g, 'カウンター！', 'good'); }
    p.brute.hp -= dmg; p.stunned = 0.25; p.expr = 'pain'; p.exprT = 0.6;
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
    if (p.brute.hp > 0) return;
    releaseSlot(g, p); p.state = 'ko'; p.expr = 'ko'; p.exprT = 999; p.koT = 0; p.aggro = false;
    emit(g, { type: 'sfx', name: 'ko' });
    if (!isGang) { g.stats.brawlKO++; p.role = null; deed(g, 45, '逆ギレした人を返り討ちにした'); }
    else if (p.role === 'hench') {
      g.stats.henchKO++; deed(g, 50, '帝王の子分を倒した！');
      const boss = person(g, bossId);
      if (boss && boss.state !== 'ko' && !gangOf(g, bossId).some(q => q.role === 'hench')) setAggro(g, boss, pi);
    } else {
      g.stats.emperorKO++; deed(g, 250, '車内の帝王を倒した！！');
      toast(g, '👑 車内に平和が戻った！', 'good');
      for (const q of g.people) if (q.state !== 'ko' && q.state !== 'gone' && q.sleep === 0) { q.expr = 'happy'; q.exprT = 3; }
    }
  }
  function updateBrute(g, p, dt) {
    if (!p.aggro) { p.state = 'stand'; placeStanding(g, p, false); return; }
    if (g.multi) {
      if (p.aggroPi == null || !g.players[p.aggroPi] || g.players[p.aggroPi].out) { calmBrute(g, p); return; }
      const prev = g.pi; setCtx(g, p.aggroPi); bruteStep(g, p, dt); setCtx(g, prev); return;
    }
    bruteStep(g, p, dt);
  }
  function calmBrute(g, p) { if (p.role === 'caller') p.callT = 2; p.aggro = false; p.bfs = 'idle'; p.state = 'stand'; p.gSeat = null; placeStanding(g, p, false); }
  function bruteStep(g, p, dt) {
    const pl = g.player;
    if (pl.seat >= 0) { bubble(g, p, 'ちっ、座りやがった…', 1.5); calmBrute(g, p); return; }
    const d = dist2(p.x, p.z, pl.x, pl.z);
    p.ry = Math.atan2(pl.x - p.x, pl.z - p.z);
    if (d > 0.8) { [p.x, p.z] = aisleClamp(p.x + (pl.x - p.x) / d * 1.3 * dt, p.z + (pl.z - p.z) / d * 1.3 * dt); }
    p.bft -= dt * (p.stunned > 0 ? 0.5 : 1);
    if (p.bfs === 'idle' && p.bft <= 0) { p.bfs = 'windup'; p.bft = p.role === 'emperor' ? 0.5 : 0.65; emit(g, { type: 'windup', id: p.id }); p.expr = 'angry'; p.exprT = 1; }
    else if (p.bfs === 'windup' && p.bft <= 0) {
      p.bfs = 'recover'; p.bft = 0.6;
      if (d < 1.5) {
        if (pl.braceHeld) { const chip = pl.buffs.protein > 0 ? 0 : 2; if (chip) hurt(g, chip, 'ko', { text: '帝王の一味にのされた…' }); emit(g, { type: 'sfx', name: 'block' }); emit(g, { type: 'block' }); }
        else { hurt(g, Math.round(p.brute.dmg * (1 - 0.03 * ST(g, 'def'))), 'ko', { text: p.angryFight ? '逆ギレした人にのされた…' : '帝王の一味にのされた…' }); emit(g, { type: 'shake', amount: 1.2 }); emit(g, { type: 'sfx', name: 'hit' }); pl.stagger = 0.4; }
      }
    } else if (p.bfs === 'recover' && p.bft <= 0) { p.bfs = 'idle'; p.bft = g.r.range(0.9, 1.8); }
  }

  // ---------------------------------------------------------------- 痴漢
  function updateFighter(g, p, dt) {
    if (g.multi) {
      const ch = g.chikan;
      if (!ch || ch.pi == null || g.players[ch.pi].out) { if (ch && ch.chikanId === p.id) { ch.stage = 'active'; endChikan(g, 'escaped'); } else p.state = 'stand'; return; }
      const prev = g.pi; setCtx(g, ch.pi); fighterStep(g, p, dt); setCtx(g, prev); return;
    }
    fighterStep(g, p, dt);
  }
  function fighterStep(g, p, dt) {
    const ch = g.chikan, pl = g.player;
    if (!ch || ch.chikanId !== p.id) { p.state = 'stand'; return; }
    if (pl.seat >= 0) { toast(g, '痴漢は逃げ出した！', 'bad'); ch.stage = 'active'; endChikan(g, 'escaped'); return; }
    const d = dist2(p.x, p.z, pl.x, pl.z);
    p.ry = Math.atan2(pl.x - p.x, pl.z - p.z);
    if (d > 0.85) { const [nx, nz] = aisleClamp(p.x + (pl.x - p.x) / d * 1.2 * dt, p.z + (pl.z - p.z) / d * 1.2 * dt); p.x = nx; p.z = nz; }
    ch.ft -= dt * (p.stunned > 0 ? 0.5 : 1);
    if (ch.fstate === 'idle' && ch.ft <= 0) { ch.fstate = 'windup'; ch.ft = ch.kind === 'boxer' ? 0.55 : 0.7; emit(g, { type: 'windup', id: p.id }); p.expr = 'angry'; p.exprT = 1; }
    else if (ch.fstate === 'windup' && ch.ft <= 0) {
      ch.fstate = 'recover'; ch.ft = 0.6;
      if (d < 1.5 && pl.seat < 0) {
        const dmg = Math.round((ch.kind === 'boxer' ? 22 : ch.kind === 'small' ? 10 : 15) * (1 - 0.03 * ST(g, 'def')));
        if (pl.braceHeld) {
          const chip = pl.buffs.protein > 0 ? 0 : 2;
          if (chip) hurt(g, chip, 'ko');
          emit(g, { type: 'sfx', name: 'block' }); emit(g, { type: 'block' });
        } else {
          hurt(g, dmg, 'ko'); emit(g, { type: 'shake', amount: 1.2 }); emit(g, { type: 'sfx', name: 'hit' });
          pl.stagger = 0.4;
        }
      }
    } else if (ch.fstate === 'recover' && ch.ft <= 0) { ch.fstate = 'idle'; ch.ft = g.r.range(0.7, 1.5) * (ch.kind === 'boxer' ? 0.75 : 1); }
  }
  function endChikan(g, how) {
    const ch = g.chikan; if (!ch) return;
    const p = person(g, ch.chikanId), v = person(g, ch.victimId);
    if (how === 'escaped') { toast(g, '痴漢は逃げてしまった…', 'bad'); if (v) { v.expr = 'sad'; v.exprT = 5; } }
    if (how === 'arrested') toast(g, '通報した痴漢は駅員に連れていかれた', 'good');
    if (p && p.state !== 'gone') {
      if (how === 'arrested' || how === 'escaped') { p.role = null; p.dest = g.station; leave(g, p); p.state = 'exit'; }
    }
    if (v) v.role = null;
    g.chikan = null;
  }
  function tryStartChikan(g) {
    if (g.chikan || g.phase !== 'travel' || g.phaseT > C.T_TRAVEL - 8 || g.phaseT < 2) return;
    const standing = g.people.filter(p => p.state === 'stand' && p.sleep === 0 && !p.leaving && p.dest > g.station + 1 && !p.role && !p.fake);
    const victims = standing.filter(p => p.female && (p.type === 'ol' || p.type === 'student'));
    if (!victims.length || standing.length < 5) return;
    const v = g.r.pick(victims);
    // 痴漢役：近くの男性を選ぶか新たに作る
    let men = standing.filter(p => !p.female && p.id !== v.id && (p.type === 'salaryman' || p.type === 'otaku' || p.type === 'gamer') && dist2(p.x, p.z, v.x, v.z) < 3.5 && !p.undercover);
    if (men.length < 1) return;
    const c = g.r.pick(men);
    const decoys = men.filter(m => m !== c);
    // 被害者の横に移動
    releaseSlot(g, c);
    c.state = 'walk'; c.tx = v.x + (v.x > 0 ? -0.42 : 0.42); c.tz = v.z * 0.6; c.then = 'stand';
    let decoy = null;
    if (decoys.length) { decoy = g.r.pick(decoys); releaseSlot(g, decoy); decoy.state = 'walk'; decoy.tx = v.x + (v.x > 0 ? 0.42 : -0.42); decoy.tz = v.z * 0.6; decoy.then = 'stand'; decoy.role = 'decoy'; }
    c.role = 'chikan'; v.role = 'victim';
    const kind = g.r.chance(0.2 + (g.hard ? 0.15 : 0)) ? 'boxer' : g.r.chance(0.2) ? 'small' : 'normal';
    g.chikan = { stage: 'active', chikanId: c.id, victimId: v.id, decoyId: decoy ? decoy.id : -1, hp: { small: 2, normal: 4, boxer: 7 }[kind], kind, fstate: 'idle', ft: 1, counters: 0, startStation: g.station, t0: g.t };
    v.expr = 'distressed'; v.exprT = 999;
    emit(g, { type: 'chikan', id: v.id });
  }

  // ---------------------------------------------------------------- 出来事
  function updateEvents(g, dt) {
    // 揺れ
    if (g.phase === 'travel' && g.lurchPlan) {
      for (const L of g.lurchPlan) {
        if (!L.warned && g.phaseT >= L.t - 1.0) { L.warned = true; emit(g, { type: 'lurchWarn' }); g.lurchWarnT = g.t; }
        if (!L.done && g.phaseT >= L.t) {
          L.done = true;
          emit(g, { type: 'lurch' });
          withEach(g, (pl) => { if (pl.seat >= 0) return;
            const ok = pl.braceHeld || (g.t - pl.lastBraceT < 1.05 + 0.03 * ST(g, 'def') && pl.lastBraceT >= g.lurchWarnT - 0.1) || pl.buffs.legs > 0;
            if (ok) { g.stats.braces++; emit(g, { type: 'brace', ok: true }); }
            else {
              g.stats.braceFail++;
              hurt(g, Math.round(7 * (1 - 0.03 * ST(g, 'def'))), 'collapse'); pl.stagger = 0.8; emit(g, { type: 'brace', ok: false }); emit(g, { type: 'shake', amount: 1.5 });
              // ぶつかる
              const near = g.people.filter(p => (p.state === 'stand') && dist2(p.x, p.z, pl.x, pl.z) < 0.75);
              const f = near.find(p => p.female);
              if (f && g.r.chance(0.35)) { f.expr = 'angry'; f.exprT = 4; bubble(g, f, 'ちょっと！どこ触って…！', 2); addKarma(g, 8, 'ぶつかった（誤解）'); hurtMind(g, 10, '誤解された'); }
              else if (near.length) { bubble(g, near[0], 'おっと', 1); }
            }
          });
        }
      }
    }
    // 痴漢の発生
    g.nextChikanCheck -= dt;
    if (g.nextChikanCheck <= 0) {
      g.nextChikanCheck = g.r.range(9, 16);
      if (g.station >= 2 && g.r.chance(g.hard ? 0.45 : 0.28)) tryStartChikan(g);
    }
    if (g.chikan) {
      const ch = g.chikan, c = person(g, ch.chikanId), v = person(g, ch.victimId);
      if (!c || !v && ch.stage !== 'fight' && ch.stage !== 'done') { g.chikan = null; }
      else if (ch.stage === 'active' || ch.stage === 'reported') {
        c.expr = 'shifty'; c.exprT = 1;
        if (v && g.r() < 0.12 * dt) bubble(g, v, g.r.chance(0.5) ? '…っ' : '（やめて…）', 1.5);
        if (v && v.state === 'seated') endChikan(g, 'escaped');
      }
    }
    // 落とし物
    g.nextItemCheck -= dt;
    if (g.nextItemCheck <= 0) {
      // 新バランス（お試し）：落とし物は 1 駅に 1 個くらい・同時に 1 個まで
      g.nextItemCheck = g.bal2 ? g.r.range(30, 45) : g.r.range(20, 36); // 落とし物は前の半分くらい（拾ってばかりにならないように）
      if (g.items.length < (g.bal2 ? 1 : 2) && g.r.chance(g.bal2 ? 0.85 : 0.6)) dropItem(g);
    }
    for (const it of g.items) {
      const o = person(g, it.owner);
      if (o && o.state !== 'gone' && !it.noticed && g.t - it.t0 > it.noticeAfter) {
        it.noticed = true; o.expr = 'worried'; o.exprT = 8; bubble(g, o, 'あれ？' + it.name + 'がない…', 2.5);
      }
    }
    for (const pl of bodies(g)) if (pl.carrying) {
      const o = person(g, pl.carrying.owner);
      if (o && o.state !== 'gone' && g.r() < 0.08 * dt) { o.expr = 'worried'; o.exprT = 4; }
    }
  }
  function dropItem(g) {
    const cands = g.people.filter(p => (p.state === 'seated' || p.state === 'stand') && p.type !== 'alien' && !p.role);
    if (!cands.length) return;
    // 降りる直前の人が落としやすい
    const ns = nextStation(g);
    const w = cands.map(p => (p.dest - ns <= 0 ? 4 : p.dest - ns === 1 ? 2 : 1));
    let tot = w.reduce((a, b) => a + b, 0), v = g.r() * tot, owner = cands[0];
    for (let i = 0; i < cands.length; i++) { v -= w[i]; if (v <= 0) { owner = cands[i]; break; } }
    const iw = {}; ITEMS.forEach((it, i) => iw[i] = owner.type === 'elderly' && it.key === 'teeth' ? it.w * 6 : it.w);
    const def = ITEMS[parseInt(weighted(g.r, iw), 10)];
    let x = owner.x + g.r.range(-0.3, 0.3), z = owner.state === 'seated' ? Math.sign(owner.z) * 0.7 : owner.z + g.r.range(-0.3, 0.3);
    [x, z] = aisleClamp(x, z);
    const hint = owner.look.topName + 'の服の' + (owner.female ? '女性' : '男性');
    g.items.push({ id: g.nextId++, key: def.key, name: def.name, pts: def.pts, owner: owner.id, x, z, t0: g.t, noticeAfter: g.r.range(5, 14), hint, taken: false });
    emit(g, { type: 'drop', x, z });
    emit(g, { type: 'sfx', name: 'drop' });
  }

  // ---------------------------------------------------------------- 実績
  function checkAchievements(g, profile) {
    const s = g.stats, res = g.result || {}, out = [];
    const clear = res.cause === 'clear', sc = finalScore(g);
    const has = id => profile && profile.ach && profile.ach[id];
    const add = id => { if (!has(id) && !out.includes(id)) out.push(id); };
    if (s.sits > 0) add('first_sit');
    if (s.quickSits >= 5) add('quick5');
    if (s.gives >= 5) add('saint5');
    if ((profile ? (profile.chikanTotal || 0) : 0) + s.chikanKO >= 3) add('hunter3');
    if (s.counters >= 5) add('counter5');
    if (s.delivered >= 5) add('lost5');
    if (s.teeth > 0) add('teeth');
    if (clear && s.sits === 0) add('ironman');
    if (clear && g.player.karma >= 90) add('devil');
    if (clear && g.player.karma <= 0 && s.wrongPunch === 0 && s.force === 0 && s.brainwash === 0) add('pure');
    if (s.ceo) add('ceo');
    if (s.alien) add('alien_seat');
    if (s.alienPunch) add('alien_punch');
    if (res.cause === 'arrest') add('arrested');
    if (res.cause === 'collapse') add('collapse');
    if (res.cause === 'ko') add('ko');
    if (s.brainwash >= 3) add('brain3');
    if (s.wrongPunch > 0) add('wrong');
    if (s.tanuki >= 60) add('tanuki');
    if (clear) add('clear');
    if (s.oversleepSteal > 0) add('oversleep');
    if (s.braces >= 10) add('brace10');
    if (s.doorHolds >= 3) add('door3');
    if (s.maxCombo >= 5) add('combo5');
    if (sc.total >= 2000) add('score2000');
    if (g.endless && s.stations >= 30) add('endless30');
    if (g.jiji) add('jiji');
    if (g.hard && clear) add('hard');
    if (s.thiefKO) add('thief');
    if (s.suriKO) add('suri');
    if (s.fakerExposed) add('faker');
    if (s.dashBlock) add('blocker');
    if (s.hush) add('hush');
    if (s.hogAsk) add('hogask');
    if (s.emperorKO) add('emperor');
    if (s.falseAccuse) add('false');
    if (s.brawlKO) add('brawl');
    if (s.speakerKO) add('speaker');
    if (s.bagThrow) add('bagthrow');
    return out;
  }

  // 乗客タイプ診断（上から順に当てはまったもの。めずらしいものほど上）
  const PTYPES = [
    { key: 'emperor', icon: '👑', name: '帝王キラー', desc: '車内の帝王を倒した伝説の乗客', why: () => '車内の帝王を倒した', test: (s) => s.emperorKO > 0 },
    { key: 'arrest', icon: '🚨', name: '要注意人物', desc: '駅員さんに顔を覚えられている', why: () => 'カルマがあふれて連行された', test: (s, r) => r === 'arrest' },
    { key: 'dark', icon: '😈', name: '闇の乗客', desc: '座るためなら手段を選ばない', why: (s, g) => 'カルマ ' + Math.round(g.player.karma), test: (s, r, g) => g.player.karma >= 70 },
    { key: 'banchou', icon: '👊', name: '車内の番長', desc: '悪者がいる車両には必ずいる', why: (s) => '悪者を ' + villainKO(s) + ' 人撃退', test: (s) => villainKO(s) >= 3 },
    { key: 'saint', icon: '🙏', name: '聖人', desc: '自分より人の座席を優先する', why: (s) => '席を ' + s.gives + ' 回譲った', test: (s) => s.gives >= 4 },
    { key: 'lost', icon: '👛', name: '落とし物の守護神', desc: '車内の落とし物は全部この人が届ける', why: (s) => '落とし物を ' + s.delivered + ' 回届けた', test: (s) => s.delivered >= 3 },
    { key: 'detective', icon: '🕵', name: '車内の名探偵', desc: '仮病もスリも、すべてお見通し', why: () => '仮病やスリを見破った', test: (s) => s.fakerExposed > 0 && s.suriKO > 0 || s.fakerExposed >= 2 },
    { key: 'tanuki', icon: '💤', name: '狸寝入り名人', desc: '目の前にだれが立っても起きない（ふり）', why: (s) => '狸寝入り ' + Math.round(s.tanuki) + ' 秒', test: (s) => s.tanuki >= 40 },
    { key: 'ironleg', icon: '🦵', name: '鉄の脚', desc: '座らなくても平気。むしろ立ちたい', why: () => '一度も座らずに終点まで', test: (s, r) => r === 'clear' && s.sits === 0 },
    { key: 'flash', icon: '⚡', name: '秒速着席', desc: '空いた席には 1 秒で座る', why: (s) => '1 秒以内の着席 ' + s.quickSits + ' 回', test: (s) => s.quickSits >= 3 },
    { key: 'naive', icon: '🤡', name: 'お人よし', desc: '仮病にもあっさりだまされる、やさしい人', why: () => '仮病の人に席を譲った', test: (s) => s.fooled > 0 },
    { key: 'hasty', icon: '⚖', name: '早とちり', desc: '正義感が強すぎて、つい手が出る', why: (s) => '関係ない人を ' + s.wrongPunch + ' 回殴った', test: (s) => s.falseAccuse > 0 || s.wrongPunch >= 2 },
    { key: 'sitter', icon: '💺', name: '着席の達人', desc: '降りる人を見抜く目はプロ級', why: (s) => s.sits + ' 回座れた', test: (s) => s.sits >= 5 },
    { key: 'brace', icon: '🧘', name: '体幹おばけ', desc: 'どんな揺れでもびくともしない', why: (s) => '揺れを ' + s.braces + ' 回踏ん張った', test: (s) => s.braces >= 8 && s.braceFail === 0 },
    { key: 'broken', icon: '🫥', name: 'ガラスのハート', desc: 'やさしすぎて、満員電車はつらい', why: () => '心が折れて途中下車', test: (s, r) => r === 'broken' },
    { key: 'collapse', icon: '🫠', name: 'ひざ笑い', desc: '座りたい気持ちだけは誰にも負けない', why: () => '体力が尽きて倒れた', test: (s, r) => r === 'collapse' },
    { key: 'ko', icon: '🤕', name: '返り討ち', desc: '勇気はある。腕力はこれから', why: () => 'ケンカに負けた', test: (s, r) => r === 'ko' },
    { key: 'normal', icon: '🚃', name: 'ふつうの通勤者', desc: '今日もおつかれさまです', why: () => '可もなく不可もなく', test: () => true },
  ];
  function villainKO(s) { return (s.chikanKO || 0) + (s.thiefKO || 0) + (s.suriKO || 0) + (s.henchKO || 0) + (s.emperorKO || 0) + (s.brawlKO || 0); }
  function diagnose(g) {
    const s = g.stats, res = g.multi ? (g.pi >= 0 ? g.players[g.pi].result : null) : g.result, r = res ? res.cause : '';
    const t = PTYPES.find((d) => d.test(s, r, g));
    return { key: t.key, icon: t.icon, name: t.name, desc: t.desc, why: t.why(s, g) };
  }

  // 観察メモ（照準を合わせた人の様子）
  function observe(g, p) {
    const out = [];
    const T = TYPES[p.type];
    if (p.possessed) out.push('👻 目がうつろ…何かに取りつかれている？');
    if (p.role === 'bx' && !p.bxDone) { const X = BX[p.bxk]; if (!X.hidden || dist2(p.x, p.z, g.player.x, g.player.z) < 1.6) out.push(X.note); }
    const recentLooks = p.looks.filter(t => g.t - t < 30).length;
    const recentWatch = p.watches.filter(t => g.t - t < 30).length;
    if (p.role === 'chikan' && g.chikan && g.chikan.stage !== 'done') out.push('👀 目が泳いでいる…汗だく');
    if (p.role === 'victim') out.push('😣 困った顔で固まっている');
    if (p.role === 'decoy') out.push('📱 スマホに夢中');
    if (p.role === 'thief') {
      if (p.fleeing) out.push('🏃 逃げようとしている！');
      out.push(p.state === 'walk' || p.pickT > 0 ? '🤏 床や寝ている人のまわりをうろうろ' : '👀 キョロキョロしている');
      if (p.stolen) out.push('🎒 ポケットがふくらんでいる');
    }
    if (p.role === 'suri') {
      if (p.anim === 'reach') out.push('🤏 となりの人のポケットに手が…！');
      else if (p.loot) out.push(p.caught ? '🏃 逃げようとしている！' : '💼 なにかをこっそりしまった…');
      else if (p.suri && p.suri.ph === 'approach') out.push('🚶 人のすぐ後ろに寄っていく');
      else if (ST(g, 'eye') >= 5) out.push('👀 人のポケットをちらちら見ている…？（観察力）');
    }
    if (p.role === 'hog') out.push(p.hogSeat != null ? (p.hogKind === 'bag' ? '👜 となりの席にかばんを置いている' : '🦵 大股開きでとなりの席まで使っている') : '😤 ふんぞり返っている');
    if (p.aggro && p.angryFight) out.push('💢 逆ギレして向かってくる！');
    if (p.role === 'caller') out.push('📞 大声で電話している');
    if (p.role === 'leak' && dist2(p.x, p.z, g.player.x, g.player.z) < 1.9) out.push('🎧 イヤホンからシャカシャカ音がもれている');
    if (p.role === 'pack') out.push('🎒 大きなリュックを背負ったまま');
    if (p.role === 'bento') out.push('🍱 においのきつい弁当を食べている');
    if (p.role === 'door') out.push('🚪 ドアの前から動かない');
    if (p.role === 'preach') out.push(dist2(p.x, p.z, g.player.x, g.player.z) < 1.7 ? '🗣 説教が止まらない…' : '🗣 だれかに説教したそうにしている');
    if (p.role === 'tuber') out.push('📹 自撮りで配信中。床のスピーカーから爆音');
    if (p.role === 'tuberSad') out.push('😢 スピーカーが壊れてしょんぼり');
    if (p.role === 'dasher') out.push('🏃 空いた席をすごい目で探している');
    if (p.type === 'sick' && p.role !== 'faked') out.push(p.fake && g.player.buffs && g.player.buffs.glasses > 0 ? '🤥 …仮病っぽい（メガネで見えた）' : p.fake && ST(g, 'eye') >= 5 ? '🤔 具合が悪そう…でも顔色は悪くない？（観察力）' : '🤒 具合が悪そう');
    if (p.role === 'faked') out.push('😏 さっきまで具合が悪そうだったのに…');
    if (p.role === 'hench') out.push('🕶 帝王の子分。にらみをきかせている');
    if (p.role === 'emperor') out.push('👑 車内の帝王。子分に守られている');
    if (p.state === 'seated') {
      if (p.sleep === 2) out.push('💤 熟睡している');
      else if (p.sleep === 1) out.push('😪 うとうとしている');
    }
    if (p.packing) {
      // フェイントの人は、よく見ると分かる（スマホを見たまま）。観察力 5 以上かメガネなら、はっきり分かる
      out.push(p.feintNow ? '🎒 荷物をまとめている…けど、' + ({ book: '単語帳', game: 'ゲーム', makeup: '鏡', map: '路線図' }[p.idle] || 'スマホ') + 'から目を離さない' : '🎒 荷物をまとめている');
      if (p.feintNow && (ST(g, 'eye') >= 5 || (g.player.buffs && g.player.buffs.glasses > 0))) out.push('🤔 本当に降りる？ 落ち着きすぎている（' + (g.player.buffs && g.player.buffs.glasses > 0 ? 'メガネ' : '観察力') + '）');
    }
    if (recentLooks) out.push('🪧 掲示板をチラ見 ×' + recentLooks + '（30秒）');
    if (recentWatch) out.push('⌚ 時計を見た ×' + recentWatch);
    if (p.leaving || p.state === 'exit') out.push('🚪 降りる気まんまん');
    const idleTxt = { phone: '📱 スマホを見ている', book: '📖 単語帳を読んでいる', makeup: '💄 化粧をしている', map: '🗺 路線図を見ている', game: '🎮 ゲームに夢中' }[p.idle];
    if (p.state === 'seated' && p.sleep === 0 && idleTxt && !p.packing && out.length < 3) out.push(idleTxt);
    if (p.priority && p.state !== 'seated') out.push('🙇 座りたそうにしている');
    if (p.tough) out.push('😠 ちょっと怖い');
    if (p.type === 'drunk') out.push('🍶 お酒くさい');
    if (!out.length) out.push('…特に変わった様子はない');
    return { name: p.dispName || T.name, notes: out };
  }

  return {
    PTYPES, diagnose, villainKO, BOSS,
    C, LINE, TYPES, SKILLS, ITEMS, ACHIEVEMENTS, TITLES, DOORS, STATS, STAT_MAX, STAT_CAP_TOTAL, STAT_CAP_FAIR, normStats, statSum, capStats, xpNeed, levelOf, statPoints, xpGain,
    create, update, updateMulti, movePlayer, ghostStep, ghostMove, dropPlayer, botInput, finalScoreOf, standings, setCtx, PID, finalScore, checkAchievements, observe, stationName, nextStation, lastStation, person, titleFor, skillCost, rng,
    _internal: { bxHurt, sitAt, updateThief, spawnVillain, updateSuri, villainCount, planVillains, hogClaim, atOpenDoor, spawn, freeSeat, leave, placeStanding, releaseSlot, aimTarget, computePrompt, doAction, doPunch, useSkill, tryStartChikan, dropItem, witnessFactor, priorityNear, nearestFreeSeat, playerSit, playerStand, aisleClamp, headY },
  };
});
