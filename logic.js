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
    MAX_STAMINA: 100, MAX_KARMA: 100,
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
    otaku: [9], drunk: [11], pregnant: [5], injured: [5], mother: [7], gamer: [], yankee: [], ceo: [4], alien: [9],
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
  };
  const BASE_WEIGHTS = { salaryman: 22, ol: 14, student: 12, elderly: 9, pregnant: 2.5, injured: 2, mother: 2.5, obachan: 6, tourist: 4, gamer: 7, yankee: 3, drunk: 2, otaku: 4 };
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
    { key: 'glasses', name: '見極めメガネ', icon: '👓', cost: 40, dur: 30, desc: '乗客があと何駅で降りるか見える（30秒）' },
    { key: 'drink', name: 'エナドリ', icon: '🥤', cost: 30, desc: '体力+35。飲むたびに値上がり' },
    { key: 'brainwash', name: '洗脳ビーム', icon: '🌀', cost: 70, karma: 10, desc: '座っている人を狙って発射。急用を思い出して席を立つ（カルマ+10）' },
    { key: 'force', name: '強制どかし', icon: '💪', cost: 10, karma: 22, desc: '目の前の座っている人をどかして座る（カルマ+22）。強い人には反撃される' },
    { key: 'legs', name: '鉄の脚', icon: '🦵', cost: 50, dur: 40, desc: '立っていても体力が減らない＆揺れに強い（40秒）' },
    { key: 'protein', name: '鉄拳プロテイン', icon: '🥊', cost: 30, dur: 60, desc: 'パンチの威力2倍、ガードで無傷（60秒）' },
    { key: 'confess', name: '懺悔', icon: '🙏', cost: 60, desc: 'カルマ-25（30秒に1回）' },
  ];

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
  function create(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    const mode = opts.mode || 'normal'; // normal | daily | endless | hard | jiji
    const g = {
      C, seed, mode, r: rng(seed), t: 0, over: false, result: null,
      seats: null, slots: null, people: [], nextId: 1, events: [],
      phase: 'stop', phaseT: C.BOARD - 0.4, station: 0, doorSide: 1, doorsOpen: true, doorClose: C.T_STOP,
      items: [], chikan: null, lurch: null, runner: null, nextChikanCheck: 30, nextItemCheck: 12, samaritanT: 15,
      endless: mode === 'endless', hard: mode === 'hard', jiji: mode === 'jiji',
      player: {
        x: 0.4, z: 0.6, yaw: Math.PI / 2, pitch: 0, seat: -1, stamina: C.MAX_STAMINA, karma: 0, toku: 0, earned: 0,
        combo: 0, lastDeedT: -999, carrying: null, lastBraceT: -99, braceHeld: false, punchCD: 0, hitFlash: 0,
        fakeSleep: false, mode: null, modeT: 0, buffs: {}, drinkCount: 0, confessCD: 0, stagger: 0, punchAnim: 0,
        ignoreT: 0, sitT: 0,
      },
      stats: {
        sits: 0, quickSits: 0, gives: 0, chikanKO: 0, counters: 0, delivered: 0, teeth: 0, ceo: 0, alien: 0, alienPunch: 0,
        brainwash: 0, force: 0, wrongPunch: 0, thiefKO: 0, stolen: 0, tanuki: 0, oversleepSteal: 0, braces: 0, braceFail: 0, doorHolds: 0, maxCombo: 0,
        standTime: 0, sitTime: 0, stations: 0, sos: 0, deeds: 0, skillsUsed: 0, bestDeed: null,
      },
      aim: -1, prompt: null, ann: '',
    };
    g.seats = buildSeats();
    g.slots = buildSlots(g.seats);
    g.player.stamina = C.MAX_STAMINA;
    populateStart(g);
    return g;
  }

  function lastStation(g) { return g.endless ? 1e9 : LINE.length - 1; }
  function stationName(g, i) {
    if (i < LINE.length - (g.endless ? 1 : 0)) return LINE[i].name;
    if (g.endless) {
      const k = i - (LINE.length - 1);
      return ENDLESS_NAMES[k % ENDLESS_NAMES.length] + (k >= ENDLESS_NAMES.length ? ' ' + (Math.floor(k / ENDLESS_NAMES.length) + 1) + '丁目' : '');
    }
    return LINE[LINE.length - 1].name;
  }
  function nextStation(g) { return g.phase === 'travel' ? g.station + 1 : g.station; }

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
    const hairStyle = female ? r.pick(['long', 'bob', 'pony', 'bun']) : r.pick(['short', 'short', 'side', 'buzz']);
    return {
      top: top[1], topName: top[0], bottom: bottom[1], skin, hair: hairC,
      hairStyle: type === 'elderly' && !female && r.chance(0.4) ? 'bald' : type === 'alien' ? 'hat' : hairStyle,
      glasses: (type === 'otaku' || type === 'salaryman' || type === 'elderly' || type === 'ceo') && r.chance(0.45),
      mask: r.chance(0.12) && type !== 'alien',
      bag: r.chance(0.5) || type === 'tourist',
      tie: (type === 'salaryman' || type === 'ceo') ? (type === 'ceo' ? '#d8b23a' : r.pick(['#8a2a2a', '#2a3f8a', '#3a6a3a', '#777'])) : null,
      shade: r.range(-0.1, 0.1),
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
    seat.occ = p.id; seat.res = -1; seat.gift = false;
    p.seat = seat.id; p.state = 'seated'; p.x = seat.x; p.z = seat.z; p.ry = seat.side > 0 ? Math.PI : 0;
    releaseSlot(g, p);
    p.prep = -1; p.anim = 'none';
    if (p.sleep === 0) assignSleep(g, p);
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
      if (dist2(s.x, s.z, g.player.x, g.player.z) < 0.5) continue;
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
  function deed(g, base, label) {
    const pl = g.player;
    if (g.t - pl.lastDeedT < C.COMBO_WINDOW) pl.combo++; else pl.combo = 1;
    pl.lastDeedT = g.t;
    const mult = Math.min(2.5, 1 + 0.25 * (pl.combo - 1));
    const pts = Math.round(base * mult);
    pl.toku += pts; pl.earned += pts;
    pl.karma = Math.max(0, pl.karma - 5);
    g.stats.deeds++;
    g.stats.maxCombo = Math.max(g.stats.maxCombo, pl.combo);
    if (!g.stats.bestDeed || pts > g.stats.bestDeed.pts) g.stats.bestDeed = { pts, label };
    emit(g, { type: 'points', amount: pts, text: label, combo: pl.combo });
    emit(g, { type: 'sfx', name: 'coin' });
    return pts;
  }
  function hurt(g, amt, cause) {
    const pl = g.player;
    pl.stamina -= amt; pl.hitFlash = 0.4;
    if (pl.stamina <= 0) { pl.stamina = 0; gameOver(g, cause); }
  }
  function gameOver(g, cause) {
    if (g.over) return;
    g.over = true;
    const causes = {
      collapse: { title: '膝が笑った', text: '立ちっぱなしで体力が尽きた…' },
      ko: { title: 'KO負け', text: '痴漢の反撃で床に沈んだ…' },
      arrest: { title: '駅員に連行', text: 'カルマがたまりすぎて、次の駅で降ろされた…' },
      clear: { title: '終点到着！', text: 'おつかれさまでした' },
    };
    g.result = Object.assign({ cause }, causes[cause]);
    emit(g, { type: cause === 'clear' ? 'clear' : 'gameover', cause });
  }
  function finalScore(g) {
    const pl = g.player, clear = g.result && g.result.cause === 'clear';
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
      if (pr) return { act: 'give', label: TYPES[pr.type].name === '???' ? '席を譲る（？）' : TYPES[pr.type].name + 'に席を譲る', id: pr.id };
      return { act: 'stand', label: '立ち上がる' };
    }
    if (pl.carrying && ap && apd < 1.8 && ap.state !== 'ko') return { act: 'deliver', label: pl.carrying.name + 'を渡す', id: ap.id };
    if (pl.carrying && atOpenDoor(g)) return { act: 'staff', label: '駅員に' + pl.carrying.name + 'を届ける' };
    if (pl.carrying && pl.pitch < -0.55) return { act: 'putdown', label: pl.carrying.name + 'を床に置く' };
    for (const it of g.items) if (!it.taken && dist2(it.x, it.z, pl.x, pl.z) < 1.15 && !pl.carrying) return { act: 'pick', label: it.name + 'を拾う', id: it.id };
    const fs = nearestFreeSeat(g);
    if (fs) return { act: 'sit', label: fs.pri ? '優先席に座る' : '座る', id: fs.id };
    if (g.runner && g.runner.active && !g.runner.held) {
      if (Math.abs(pl.x - g.runner.door) < 0.75 && Math.sign(pl.z) === g.doorSide && Math.abs(pl.z) > 0.9) return { act: 'door', label: 'ドアを押さえる' };
    }
    for (const d of DOORS) for (const side of [-1, 1]) {
      if (dist2(pl.x, pl.z, d + 0.75, side * 1.1) < 0.55 && Math.abs(pl.z) > 0.8) return { act: 'sos', label: g.chikan && g.chikan.stage === 'active' ? '非常通報ボタン（痴漢を通報）' : '非常通報ボタン（いたずら厳禁）' };
    }
    return null;
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
    if (g.t - seat.freedAt < 1.0 && seat.freedAt > 0) g.stats.quickSits++;
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
      pl.buffs[sk.key] = sk.dur;
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
    const id = aimTarget(g, 1.6);
    const p = id >= 0 ? person(g, id) : null;
    if (!p) return;
    const ch = g.chikan;
    const dmgMul = pl.buffs.protein > 0 ? 2 : 1;
    if (ch && p.id === ch.chikanId && (ch.stage === 'active' || ch.stage === 'fight' || ch.stage === 'reported')) {
      if (ch.stage !== 'fight') {
        ch.stage = 'fight'; ch.fstate = 'idle'; ch.ft = 0.9;
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
    if (p.type === 'alien') g.stats.alienPunch++;
    g.stats.wrongPunch++;
    p.expr = 'angry'; p.exprT = 5; p.angry = 8; bubble(g, p, p.type === 'alien' ? 'ピギャッ!?' : '痛っ！なにするんですか！', 2);
    if (p.sleep) { p.sleep = 0; p.oversleep = false; }
    emit(g, { type: 'sfx', name: 'hit' }); emit(g, { type: 'hit', id: p.id });
    addKarma(g, 20, '無関係の人を殴った');
    if (p.tough) { hurt(g, 18, 'ko'); bubble(g, p, 'やんのかコラァ！', 2); emit(g, { type: 'shake', amount: 1 }); }
  }

  // ---------------------------------------------------------------- 更新
  function update(g, dt, input) {
    if (g.over) return;
    input = input || {};
    dt = Math.min(dt, 0.1);
    g.t += dt;
    const pl = g.player;
    // 視点
    if (input.yaw != null) pl.yaw = input.yaw;
    if (input.pitch != null) pl.pitch = clamp(input.pitch, -1.2, 1.2);
    pl.punchCD = Math.max(0, pl.punchCD - dt); pl.punchAnim = Math.max(0, pl.punchAnim - dt);
    pl.hitFlash = Math.max(0, pl.hitFlash - dt); pl.confessCD = Math.max(0, pl.confessCD - dt); pl.stagger = Math.max(0, pl.stagger - dt);
    for (const k in pl.buffs) { pl.buffs[k] -= dt; if (pl.buffs[k] <= 0) { delete pl.buffs[k]; toast(g, (SKILLS.find(s => s.key === k) || {}).name + 'の効果が切れた', 'info'); } }
    if (pl.mode) { pl.modeT -= dt; if (pl.modeT <= 0) pl.mode = null; }
    pl.braceHeld = !!input.brace;
    if (input.bracePressed) pl.lastBraceT = g.t;

    // 移動
    let moving = false;
    if (pl.seat < 0) {
      let mx = input.mx || 0, mz = input.mz || 0;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      if (pl.braceHeld) { mx *= 0.25; mz *= 0.25; }
      if (ml > 0.05) {
        const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
        let sp = C.PLAYER_SPEED * (pl.stagger > 0 ? 0.4 : 1);
        // 混雑による減速
        let crowd = false;
        for (const p of g.people) {
          if (p.state === 'gone' || p.state === 'seated') continue;
          if (dist2(p.x, p.z, pl.x, pl.z) < 0.5) { crowd = true; break; }
        }
        if (crowd) sp *= 0.55;
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
    }

    // 体力
    if (pl.seat >= 0) {
      const regen = C.SIT_REGEN * (pl.fakeSleep ? 1.35 : 1);
      pl.stamina = Math.min(C.MAX_STAMINA, pl.stamina + regen * dt);
      g.stats.sitTime += dt;
      if (pl.fakeSleep) g.stats.tanuki += dt;
    } else {
      g.stats.standTime += dt;
      const standing = g.people.filter(p => p.state === 'stand' || p.state === 'walk' || p.state === 'fight').length;
      const crowd = clamp((standing - 4) / 18, 0, 1);
      let drain = C.STAND_DRAIN + C.CROWD_DRAIN * crowd + (moving ? C.WALK_DRAIN : 0) + (pl.braceHeld ? C.BRACE_DRAIN : 0);
      if (g.phase === 'stop') drain *= 0.7;
      if (g.hard) drain *= 1.25;
      if (g.endless && g.station > 11) drain *= 1 + Math.min(2, (g.station - 11) * 0.05);
      if (pl.buffs.legs > 0) drain = pl.braceHeld ? C.BRACE_DRAIN * 0.5 : 0;
      pl.stamina -= drain * dt;
      if (pl.stamina <= 0) { pl.stamina = 0; gameOver(g, 'collapse'); return; }
    }

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
    if (g.over) return;

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

    if (pl.karma >= C.MAX_KARMA) { g.stats.arrestedAt = nextStation(g); gameOver(g, 'arrest'); return; }

    updatePhase(g, dt);
    updatePeople(g, dt);
    updateEvents(g, dt);
  }

  function updatePhase(g, dt) {
    g.phaseT += dt;
    const pl = g.player;
    if (g.phase === 'travel') {
      if (g.phaseT >= C.T_TRAVEL) {
        g.phase = 'stop'; g.phaseT = 0; g.station++; g.stats.stations++;
        g.doorSide = g.nextDoorSide || 1; g.doorsOpen = false; g.doorClose = C.T_STOP;
        g.ann = stationName(g, g.station) + '、' + stationName(g, g.station) + '。お出口は' + (g.doorSide > 0 ? '右側' : '左側') + 'です。';
        emit(g, { type: 'arrive', station: g.station });
        emit(g, { type: 'sfx', name: 'brake' });
        if (g.station >= lastStation(g)) { pl.stamina = Math.max(pl.stamina, 0); gameOver(g, 'clear'); return; }
        // 洗脳中の人などを降ろす準備
      }
      // 予告アナウンス
      if (g.phaseT > C.T_TRAVEL - 9 && !g.annNext) { g.annNext = true; const n = stationName(g, g.station + 1); g.ann = '次は ' + n + '、' + n + '。'; emit(g, { type: 'announce', text: g.ann }); }
    } else {
      if (!g.doorsOpen && g.phaseT >= C.DOOR_OPEN && g.phaseT < g.doorClose) { g.doorsOpen = true; emit(g, { type: 'doors', open: true, side: g.doorSide }); emit(g, { type: 'sfx', name: 'door' }); }
      if (g.phaseT >= C.ALIGHT && !g.alighted) { g.alighted = true; startAlight(g); }
      if (g.phaseT >= C.BOARD && !g.boarded) { g.boarded = true; startBoard(g); }
      if (g.phaseT >= C.CLOSE_WARN && !g.warned) {
        g.warned = true; emit(g, { type: 'sfx', name: 'chime' }); emit(g, { type: 'announce', text: 'ドアが閉まります。ご注意ください。' });
        if (g.station > 0 && g.r.chance(0.3)) g.runner = { active: true, door: g.r.pick(DOORS), held: false };
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
        if (pl.carrying) { const o = person(g, pl.carrying.owner); if (!o || o.state === 'gone') pl.carrying.ownerGone = true; }
        g.items = g.items.filter(it => g.t - it.t0 < 100);
        if (pl.carrying && !person(g, pl.carrying.owner) && !pl.carrying.told) { pl.carrying.told = true; toast(g, '持ち主は降りてしまった…次の駅で、開いたドアの近くの駅員に届けよう', 'warn'); }
        emit(g, { type: 'depart' });
        emit(g, { type: 'sfx', name: 'depart' });
        g.ann = '';
      }
    }
  }
  function planLurches(g) {
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
    // 落とし物の持ち主が降りる
    const it = g.player.carrying;
    if (it && it.owner === p.id) it.ownerLeaving = true;
  }
  function startBoard(g) {
    const st = g.station;
    let range = st < LINE.length && !g.endless ? LINE[st].board : [3, 9];
    if (g.endless && st < LINE.length - 1) range = LINE[st].board;
    if (g.endless && st >= LINE.length - 1) range = [4 + Math.min(4, (st - 11) >> 2), 8 + Math.min(6, (st - 11) >> 1)];
    let n = g.r.int(range[0], range[1]);
    if (g.hard) n = Math.round(n * 1.4);
    const alive = g.people.filter(p => p.state !== 'gone' && p.state !== 'exit').length;
    n = Math.max(0, Math.min(n, C.MAX_PEOPLE - alive));
    let i = 0;
    g.boardQueue = [];
    for (; i < n; i++) g.boardQueue.push({ at: g.phaseT + i * 0.32, type: pickType(g, st) });
    const thiefAboard = g.people.some(p => p.role === 'thief' && p.state !== 'ko');
    if (!g.endless && st >= 2 && st <= lastStation(g) - 3 && !thiefAboard && !g.jiji && (g.thiefCount || 0) < 2 && g.r.chance(g.hard ? 0.4 : 0.25) && g.boardQueue.length)
      g.boardQueue.splice(g.r.int(0, g.boardQueue.length - 1), 0, { at: 0, type: 'thief' });
    if (g.endless && st >= 2 && !thiefAboard && g.r.chance(0.3) && g.boardQueue.length) g.boardQueue.splice(0, 0, { at: 0, type: 'thief' });
    g.boardQueue.forEach((q, k) => { q.at = g.phaseT + k * 0.32; });
  }
  function updateBoardQueue(g) {
    if (!g.boardQueue || !g.boardQueue.length || g.phase !== 'stop') return;
    while (g.boardQueue.length && g.boardQueue[0].at <= g.phaseT) {
      const q = g.boardQueue.shift();
      const p = spawn(g, q.type, g.station, q.type === 'thief' ? g.station + g.r.int(3, 5) : null);
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
      if (best) { best.res = p.id; p.state = 'walk'; p.tx = best.x; p.tz = best.fz; p.then = 'sit'; p.seatTarget = best.id; }
      else if (p.priority && g.player.seat >= 0 && g.r.chance(0.55)) {
        const s = g.seats[g.player.seat]; p.state = 'walk'; p.tx = s.x + (g.r() - 0.5) * 0.3; p.tz = s.fz; p.then = 'stand'; p.targetPlayer = true;
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
            if (rem > 0 && p.packing) p.packing = false;
          }
          // 眠り：近づくと起きる
          if (g.phase === 'travel' && p.sleep && !p.oversleep && rem <= 1 && g.r() < 0.12 * dt) { p.sleep = 0; p.expr = 'sleepy'; p.exprT = 3; }
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
          if (p.slot < 0 && !p.leaving && !p.targetPlayer && !p.role) {
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
          if (p.wantSeat && !p.leaving && rem >= 1 && !p.role && !(g.phase === 'stop' && p.dest <= g.station)) {
            let best = null, bd = p.type === 'obachan' ? 4.0 : 3.0;
            for (const s of g.seats) {
              if (s.occ >= 0 || s.res >= 0) continue;
              if (s.pri && !p.priority && !p.priOK && p.type !== 'obachan' && p.type !== 'yankee' && p.type !== 'drunk') continue;
              const d = dist2(s.x, s.fz, p.x, p.z);
              if (d < bd) { bd = d; best = s; }
            }
            if (best) {
              p.scanT += dt;
              if (p.scanT >= p.react) {
                p.scanT = 0; best.res = p.id; releaseSlot(g, p);
                p.state = 'walk'; p.tx = best.x; p.tz = best.fz; p.then = 'sit'; p.seatTarget = best.id; p.targetPlayer = false;
                if (p.type === 'obachan') bubble(g, p, 'よっこいしょ！', 1.2);
              }
            } else p.scanT = 0;
          }
          // 優先の人：座っているプレイヤーの前へ寄ってくる
          if (p.priority && !p.targetPlayer && pl.seat >= 0 && g.phase === 'travel' && g.r() < 0.02 * dt) {
            const s = g.seats[pl.seat];
            if (dist2(p.x, p.z, s.x, s.fz) < 4.5) { releaseSlot(g, p); p.state = 'walk'; p.tx = s.x + 0.15; p.tz = s.fz; p.then = 'stand'; p.targetPlayer = true; }
          }
          if (p.targetPlayer && pl.seat < 0) p.targetPlayer = false;
          break;
        }
        case 'fight': updateFighter(g, p, dt); break;
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
      if (p.robbedAt && g.t > p.robbedAt && p.state !== 'gone') { p.robbedAt = 0; p.sleep = 0; p.oversleep = false; p.expr = 'worried'; p.exprT = 6; bubble(g, p, 'あれ？財布がない…！', 2.5); }
      // 降りる人（席を立って待っている）→ ドアが開いたら出る
      if (p.leaving && g.phase === 'stop' && g.doorsOpen && p.state === 'stand' && p.dest <= g.station) { p.leaving = false; leave(g, p); }
    }
    // 降りた人を消す
    g.people = g.people.filter(p => p.state !== 'gone');
    for (const s of g.seats) if (s.res >= 0) { const q = person(g, s.res); if (!q || q.state !== 'walk' || q.then !== 'sit' || q.seatTarget !== s.id) { s.res = -1; s.gift = false; } }
    for (const s of g.slots) if (s.occ >= 0) { const q = person(g, s.occ); if (!q || q.slot < 0 || g.slots[q.slot] !== s) s.occ = -1; }

    // NPC が優先の人に譲る
    g.samaritanT -= dt;
    if (g.samaritanT <= 0) {
      g.samaritanT = g.r.range(12, 22);
      const needy = g.people.filter(p => p.priority && (p.state === 'stand') && !p.targetPlayer);
      for (const n of needy) {
        const giver = g.people.find(q => q.state === 'seated' && !q.priority && q.sleep === 0 && q.type !== 'yankee' && q.type !== 'obachan' && q.type !== 'gamer' && dist2(q.x, q.z, n.x, n.z) < 1.8);
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
    const pl = g.player;
    // 床の落とし物（プレイヤーの近くは避ける）
    let goal = null, bd = 9;
    for (const it of g.items) { const d = dist2(it.x, it.z, p.x, p.z); if (d < bd && dist2(it.x, it.z, pl.x, pl.z) > 0.8) { bd = d; goal = { kind: 'item', id: it.id, x: it.x, z: it.z }; } }
    if (!goal && g.r.chance(0.45)) {
      const sl = g.people.filter(q => q.state === 'seated' && q.sleep && !q.robbedAt && !q.robbed && dist2(q.x, q.z, p.x, p.z) < 7);
      if (sl.length) { const v = g.r.pick(sl); v.robbed = true; const s = g.seats[v.seat]; goal = { kind: 'pocket', id: v.id, x: s.x, z: s.fz }; }
    }
    if (!goal) return;
    releaseSlot(g, p);
    p.thiefGoal = goal; p.state = 'walk'; p.tx = goal.x; p.tz = goal.z; p.then = 'stand';
  }

  // ---------------------------------------------------------------- 痴漢
  function updateFighter(g, p, dt) {
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
        const dmg = ch.kind === 'boxer' ? 22 : ch.kind === 'small' ? 10 : 15;
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
    const standing = g.people.filter(p => p.state === 'stand' && p.sleep === 0 && !p.leaving && p.dest > g.station + 1);
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
    const pl = g.player;
    // 揺れ
    if (g.phase === 'travel' && g.lurchPlan) {
      for (const L of g.lurchPlan) {
        if (!L.warned && g.phaseT >= L.t - 1.0) { L.warned = true; emit(g, { type: 'lurchWarn' }); g.lurchWarnT = g.t; }
        if (!L.done && g.phaseT >= L.t) {
          L.done = true;
          emit(g, { type: 'lurch' });
          if (pl.seat < 0) {
            const ok = pl.braceHeld || (g.t - pl.lastBraceT < 1.05 && pl.lastBraceT >= g.lurchWarnT - 0.1) || pl.buffs.legs > 0;
            if (ok) { g.stats.braces++; emit(g, { type: 'brace', ok: true }); }
            else {
              g.stats.braceFail++;
              hurt(g, 7, 'collapse'); pl.stagger = 0.8; emit(g, { type: 'brace', ok: false }); emit(g, { type: 'shake', amount: 1.5 });
              // ぶつかる
              const near = g.people.filter(p => (p.state === 'stand') && dist2(p.x, p.z, pl.x, pl.z) < 0.75);
              const f = near.find(p => p.female);
              if (f && g.r.chance(0.35)) { f.expr = 'angry'; f.exprT = 4; bubble(g, f, 'ちょっと！どこ触って…！', 2); addKarma(g, 8, 'ぶつかった（誤解）'); }
              else if (near.length) { bubble(g, near[0], 'おっと', 1); }
            }
          }
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
      g.nextItemCheck = g.r.range(10, 18);
      if (g.items.length < 2 && g.r.chance(0.6)) dropItem(g);
    }
    for (const it of g.items) {
      const o = person(g, it.owner);
      if (o && o.state !== 'gone' && !it.noticed && g.t - it.t0 > it.noticeAfter) {
        it.noticed = true; o.expr = 'worried'; o.exprT = 8; bubble(g, o, 'あれ？' + it.name + 'がない…', 2.5);
      }
    }
    if (pl.carrying) {
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
    return out;
  }

  // 観察メモ（照準を合わせた人の様子）
  function observe(g, p) {
    const out = [];
    const T = TYPES[p.type];
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
    if (p.state === 'seated') {
      if (p.sleep === 2) out.push('💤 熟睡している');
      else if (p.sleep === 1) out.push('😪 うとうとしている');
    }
    if (recentLooks) out.push('🪧 掲示板をチラ見 ×' + recentLooks + '（30秒）');
    if (recentWatch) out.push('⌚ 時計を見た ×' + recentWatch);
    if (p.packing) out.push('🎒 荷物をまとめている');
    if (p.leaving || p.state === 'exit') out.push('🚪 降りる気まんまん');
    const idleTxt = { phone: '📱 スマホを見ている', book: '📖 単語帳を読んでいる', makeup: '💄 化粧をしている', map: '🗺 路線図を見ている', game: '🎮 ゲームに夢中' }[p.idle];
    if (p.state === 'seated' && p.sleep === 0 && idleTxt && !p.packing && out.length < 3) out.push(idleTxt);
    if (p.priority && p.state !== 'seated') out.push('🙇 座りたそうにしている');
    if (p.tough) out.push('😠 ちょっと怖い');
    if (p.type === 'drunk') out.push('🍶 お酒くさい');
    if (!out.length) out.push('…特に変わった様子はない');
    return { name: T.name, notes: out };
  }

  return {
    C, LINE, TYPES, SKILLS, ITEMS, ACHIEVEMENTS, TITLES, DOORS,
    create, update, finalScore, checkAchievements, observe, stationName, nextStation, lastStation, person, titleFor, skillCost, rng,
    _internal: { updateThief, atOpenDoor, spawn, freeSeat, leave, placeStanding, releaseSlot, aimTarget, computePrompt, doAction, doPunch, useSkill, tryStartChikan, dropItem, witnessFactor, priorityNear, nearestFreeSeat, playerSit, playerStand, aisleClamp, headY },
  };
});
