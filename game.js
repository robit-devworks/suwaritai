/* スワリタイ！ 描画・操作・画面 */
(function () {
  'use strict';
  const SW = window.SW;
  const $ = id => document.getElementById(id);
  if (!window.THREE) { $('loading').textContent = '3D の読み込みに失敗しました。通信を確認して再読み込みしてください。'; return; }
  const T3 = THREE;
  const TAU = Math.PI * 2;
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  // 新バランスのお試し（落とし物を減らす・座ると点）：?bal=2 か、お試し用のページだけ。ランキングには載せない
  const BAL2 = /[?&]bal=2\b/.test(location.search) || !!window.__SW_BAL2;
  if (isTouch) document.body.classList.add('touch');
  const SHARE_URL = window.SUWARITAI_URL || (location.href.split('?')[0].split('#')[0] + '?ref=share');

  // ================================================================ 数える（GoatCounter）
  // 遊ばれ方の回数だけを数える（個人は分からない）。公開サイトで count.js が読めたときだけ動く
  function track(name) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); } catch (e) { /* 無視 */ }
  }
  const NEW_UNTIL = '2026-11-25'; // この日まで、新しく入ったもの（今日のルール・練習乗車）に「NEW」の印
  const MODE_JA = { bossrush: 'ボス駅ラッシュ', ranked: 'ランク線', mikiwame: '見極め線', ruletest: 'ルールのお試し', practice: '練習乗車', bosstest: 'ボス駅テスト', tutorial: 'チュートリアル', normal: 'たちっぱ線', daily: '今日のダイヤ', endless: '終点なし', hard: '満員地獄', jiji: '敬老の日' };

  // ================================================================ 保存
  const STORE_KEY = 'suwaritai.v1';
  let TUT = null; // チュートリアルの進み具合
  let profile = { name: '', best: 0, bestTitle: '', daily: { date: '', score: 0 }, ach: {}, chikanTotal: 0, plays: 0, unlock: {}, sound: true, bests: {} };
  try { const s = localStorage.getItem(STORE_KEY); if (s) profile = Object.assign(profile, JSON.parse(s)); } catch (e) { }
  function saveProfile() { try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch (e) { } }
  // 今週（月曜はじまり）の月曜の日付
  function weekKey() { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // ランク線（一人用のレート）の段位など。ほかの場所（タイトルなど）から先に使うので、ここに置く
  const rkSeason = () => todayKey().slice(0, 7);
  function rkSeed(week, i) { let h = 2166136261; for (const c of 'rk' + week + ':' + i) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const RK_TIERS = [[2100, '🌌', '伝説の乗客', '#c58bff'], [1900, '👑', '座席王', '#ffd447'], [1750, '🎯', '座席ハンター', '#ff8a5e'], [1600, '👀', '見極め上手', '#7fd1ff'], [1400, '🚃', '通勤者', '#9be39b'], [0, '🪑', '見習い乗客', '#c9c9c9']]; // はじめは 1500＝通勤者
  const rkTier = (r) => RK_TIERS.find((t) => r >= t[0]);
  const rkBadge = (r) => { const t = rkTier(r); return `<span class="rkb" style="color:${t[3]}">${t[1]} ${t[2]}</span>`; };
  function dailySeed() { const k = todayKey(); let h = 2166136261; for (const c of k) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ================================================================ レンダラー
  const canvas = $('c');
  const renderer = new T3.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
  renderer.setPixelRatio(PR);
  renderer.outputEncoding = T3.sRGBEncoding;
  const scene = new T3.Scene();
  scene.background = new T3.Color('#9ec9e8');
  scene.fog = new T3.Fog('#b9d6ea', 25, 90);
  const camera = new T3.PerspectiveCamera(72, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  // 疑似横向き：スマホが縦のままでも、画面全体を 90 度回して横長で遊ぶ（iPhone など向きを変えられない端末用）
  let pland = false, pseudoWant = false;
  const realPortrait = () => window.innerHeight > window.innerWidth;
  function applyPland() {
    const on = pseudoWant && realPortrait();
    document.documentElement.style.setProperty('--pw', window.innerWidth + 'px');
    document.documentElement.style.setProperty('--ph', window.innerHeight + 'px');
    if (on !== pland) { pland = on; document.documentElement.classList.toggle('pland', on); }
  }
  // 画面の点（指の位置）を、回した画面の中の座標にする
  const tp = (t) => pland ? { x: t.clientY, y: window.innerWidth - t.clientX } : { x: t.clientX, y: t.clientY };
  function resize() {
    applyPland();
    const w = pland ? window.innerHeight : window.innerWidth, h = pland ? window.innerWidth : window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 80 : 70;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // 光
  scene.add(new T3.HemisphereLight('#ffffff', '#6b6f78', 0.75));
  const dl = new T3.DirectionalLight('#fff6e6', 0.55); dl.position.set(3, 8, 4); scene.add(dl);
  const dl2 = new T3.DirectionalLight('#dfe9ff', 0.3); dl2.position.set(-4, 5, -6); scene.add(dl2);
  scene.add(new T3.AmbientLight('#ffffff', 0.18));

  // ================================================================ テクスチャ
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); draw(ctx, w, h);
    const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding; t.anisotropy = 4;
    t.userData = { canvas: c, ctx };
    return t;
  }
  const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  const matCache = {};
  function lam(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new T3.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    return matCache[key];
  }
  const box = (w, h, d) => new T3.BoxGeometry(w, h, d);

  // ================================================================ 車両
  const car = new T3.Group(); scene.add(car);
  const CAR_X0 = -7.1, CAR_X1 = 8.5, CAR_L = CAR_X1 - CAR_X0, CAR_CX = (CAR_X0 + CAR_X1) / 2, WALL_Z = 1.48;
  (function buildCar() {
    // 床
    const floorTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#8a8478'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},.05)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    floorTex.wrapS = floorTex.wrapT = T3.RepeatWrapping; floorTex.repeat.set(8, 2);
    const floor = new T3.Mesh(new T3.PlaneGeometry(CAR_L, WALL_Z * 2), new T3.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(CAR_CX, 0, 0); car.add(floor);
    // 通路の帯
    const aisle = new T3.Mesh(new T3.PlaneGeometry(CAR_L, 1.0), lam('#7b766c'));
    aisle.rotation.x = -Math.PI / 2; aisle.position.set(CAR_CX, 0.002, 0); car.add(aisle);
    // ドア前の黄色い線
    for (const d of SW.DOORS) for (const s of [-1, 1]) {
      const y = new T3.Mesh(new T3.PlaneGeometry(1.3, 0.12), lam('#e4c02e'));
      y.rotation.x = -Math.PI / 2; y.position.set(d, 0.004, s * 0.95); car.add(y);
    }
    // 天井
    const ceil = new T3.Mesh(new T3.PlaneGeometry(CAR_L, WALL_Z * 2), lam('#eceae4'));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(CAR_CX, 2.38, 0); car.add(ceil);
    for (const z of [-0.62, 0.62]) {
      const l = new T3.Mesh(box(CAR_L - 0.4, 0.04, 0.16), new T3.MeshBasicMaterial({ color: '#fffdf5' }));
      l.position.set(CAR_CX, 2.35, z); car.add(l);
    }
    const duct = new T3.Mesh(box(CAR_L, 0.08, 0.5), lam('#dcd9d0')); duct.position.set(CAR_CX, 2.33, 0); car.add(duct);
    // 側壁（窓の上下と柱）
    const wallMat = lam('#e2ddd2'), wallLow = lam('#cfc8b9');
    const segs = [];
    let prev = CAR_X0;
    for (const d of SW.DOORS) { segs.push([prev, d - 0.66]); prev = d + 0.66; }
    segs.push([prev, CAR_X1]);
    for (const s of [-1, 1]) {
      for (const [a, b] of segs) {
        const L = b - a, cx = (a + b) / 2;
        const low = new T3.Mesh(box(L, 0.95, 0.06), wallLow); low.position.set(cx, 0.475, s * WALL_Z); car.add(low);
        const up = new T3.Mesh(box(L, 0.5, 0.06), wallMat); up.position.set(cx, 2.13, s * WALL_Z); car.add(up);
        // 窓の柱
        const n = Math.max(1, Math.round(L / 1.6));
        for (let i = 0; i <= n; i++) {
          const px = a + (L * i) / n;
          const pil = new T3.Mesh(box(0.12, 0.95, 0.07), wallMat); pil.position.set(px, 1.4, s * WALL_Z); car.add(pil);
        }
        const sill = new T3.Mesh(box(L, 0.04, 0.12), lam('#b9b2a3')); sill.position.set(cx, 0.96, s * (WALL_Z - 0.04)); car.add(sill);
      }
      // ドア上
      for (const d of SW.DOORS) {
        const top = new T3.Mesh(box(1.32, 0.42, 0.08), wallMat); top.position.set(d, 2.17, s * WALL_Z); car.add(top);
      }
    }
    // 端の壁
    const endTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#d8d2c4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#9aa3ad'; c.fillRect(88, 30, 80, 200);
      c.fillStyle = '#bfe0f5'; c.fillRect(98, 46, 60, 90);
      c.fillStyle = '#555'; c.font = 'bold 18px ' + FONT; c.textAlign = 'center'; c.fillText('非常用', 128, 175);
    });
    for (const x of [CAR_X0, CAR_X1]) {
      const e = new T3.Mesh(new T3.PlaneGeometry(WALL_Z * 2, 2.4), new T3.MeshLambertMaterial({ map: endTex }));
      e.position.set(x, 1.2, 0); e.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; car.add(e);
    }
  })();

  // 座席
  const seatGlow = [], hogBags = [], flyBags = [];
  let speakerM = null, lastBeat = -1;
  const glowMat = new T3.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.4, depthWrite: false });
  (function buildSeats() {
    const g0 = SW.create({ seed: 1 });
    const benches = {};
    for (const s of g0.seats) {
      const key = s.side + ':' + (s.pri ? 'p' : Math.round(s.x / 3));
      (benches[key] = benches[key] || []).push(s);
    }
    const cushion = c2 => canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = c2; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 4) { c.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.08) + ')'; c.fillRect(x, 0, 2, h); }
    });
    const normalTex = cushion('#3f6aa8'), priTex = cushion('#c96a3a');
    for (const k in benches) {
      const arr = benches[k], s0 = arr[0];
      const xs = arr.map(s => s.x), x0 = Math.min(...xs) - 0.25, x1 = Math.max(...xs) + 0.25, cx = (x0 + x1) / 2, L = x1 - x0;
      const mat = new T3.MeshLambertMaterial({ map: s0.pri ? priTex : normalTex });
      const seat = new T3.Mesh(box(L, 0.1, 0.5), mat); seat.position.set(cx, 0.43, s0.side * 1.17); car.add(seat);
      const back = new T3.Mesh(box(L, 0.5, 0.08), mat); back.position.set(cx, 0.75, s0.side * 1.42); back.rotation.x = s0.side * 0.12; car.add(back);
      const base = new T3.Mesh(box(L, 0.36, 0.42), lam('#8f8a80')); base.position.set(cx, 0.19, s0.side * 1.2); car.add(base);
      // 仕切り
      for (const ex of [x0, x1]) {
        const p = new T3.Mesh(new T3.CylinderGeometry(0.02, 0.02, 0.9, 6), lam('#c9cdd3')); p.position.set(ex, 0.88, s0.side * 0.98); car.add(p);
        const arm = new T3.Mesh(box(0.04, 0.04, 0.5), lam('#c9cdd3')); arm.position.set(ex, 0.65, s0.side * 1.2); car.add(arm);
      }
      if (s0.pri) {
        const sign = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#e8762f'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px ' + FONT; c.textAlign = 'center'; c.fillText('優先席', w / 2, 62); });
        const sg = new T3.Mesh(new T3.PlaneGeometry(0.6, 0.22), new T3.MeshBasicMaterial({ map: sign }));
        sg.position.set(cx, 1.7, s0.side * (WALL_Z - 0.05)); sg.rotation.y = s0.side > 0 ? Math.PI : 0; car.add(sg);
      }
    }
    for (const s of g0.seats) {
      const m = new T3.Mesh(new T3.PlaneGeometry(0.44, 0.42), glowMat);
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.485, s.z); m.visible = false; car.add(m); seatGlow.push(m);
    }
  })();

  // 手すり・ポール・吊り革
  const strapGroup = new T3.Group(); car.add(strapGroup);
  const straps = [];
  (function buildRails() {
    const metal = new T3.MeshPhongMaterial({ color: '#d7dbe0', shininess: 80 });
    for (const s of [-1, 1]) {
      const rail = new T3.Mesh(new T3.CylinderGeometry(0.018, 0.018, CAR_L - 0.3, 8), metal);
      rail.rotation.z = Math.PI / 2; rail.position.set(CAR_CX, 1.98, s * 0.6); car.add(rail);
      for (const d of SW.DOORS) for (const dx of [-0.7, 0.7]) {
        const pole = new T3.Mesh(new T3.CylinderGeometry(0.02, 0.02, 2.35, 8), metal); pole.position.set(d + dx, 1.18, s * 1.0); car.add(pole);
      }
    }
    const bandGeo = box(0.03, 0.26, 0.01), ringGeo = new T3.TorusGeometry(0.06, 0.012, 6, 14);
    const bandMat = lam('#e2e2e2'), ringMat = lam('#f2f2f2');
    for (const s of [-1, 1]) for (let x = CAR_X0 + 0.4; x < CAR_X1 - 0.3; x += 0.42) {
      if (SW.DOORS.some(d => Math.abs(d - x) < 0.5)) continue;
      const g = new T3.Group(); g.position.set(x, 1.98, s * 0.6);
      const b = new T3.Mesh(bandGeo, bandMat); b.position.y = -0.13; g.add(b);
      const r = new T3.Mesh(ringGeo, ringMat); r.position.y = -0.31; g.add(r);
      strapGroup.add(g); straps.push(g);
    }
  })();

  // ドアと電光掲示板
  const doors = [];
  const ledTex = canvasTex(512, 64, () => { });
  const ledState = { text: '', scroll: 0 };
  (function buildDoors() {
    const doorTex = canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = '#c4c9cf'; c.fillRect(0, 0, w, h);
      c.clearRect(18, 26, w - 36, 110);
      c.strokeStyle = '#8b9096'; c.lineWidth = 6; c.strokeRect(18, 26, w - 36, 110);
      c.fillStyle = '#d23'; c.font = 'bold 16px ' + FONT; c.textAlign = 'center'; c.fillText('指をはさまないで', w / 2, 170);
    });
    const dmat = new T3.MeshLambertMaterial({ map: doorTex, transparent: true, alphaTest: 0.5, side: T3.DoubleSide });
    const ledMat = new T3.MeshBasicMaterial({ map: ledTex });
    for (const d of SW.DOORS) for (const s of [-1, 1]) {
      const pair = [];
      for (const k of [-1, 1]) {
        const m = new T3.Mesh(new T3.PlaneGeometry(0.64, 1.92), dmat);
        m.position.set(d + k * 0.32, 0.96, s * (WALL_Z - 0.01)); car.add(m);
        pair.push({ mesh: m, base: d + k * 0.32, dir: k });
      }
      doors.push({ side: s, x: d, pair, open: 0 });
      const led = new T3.Mesh(new T3.PlaneGeometry(1.0, 0.13), ledMat);
      led.position.set(d, 2.05, s * (WALL_Z - 0.06)); led.rotation.y = s > 0 ? Math.PI : 0; car.add(led);
      const frame = new T3.Mesh(box(1.06, 0.18, 0.04), lam('#222')); frame.position.set(d, 2.05, s * (WALL_Z - 0.03)); car.add(frame);
      // 非常通報ボタン
      const sos = new T3.Mesh(box(0.12, 0.16, 0.03), new T3.MeshBasicMaterial({ color: '#e53935' }));
      sos.position.set(d + 0.75, 1.25, s * (WALL_Z - 0.05)); car.add(sos);
      const sl = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#e53935'; c.font = 'bold 22px ' + FONT; c.textAlign = 'center'; c.fillText('非常通報', w / 2, 40); });
      const slm = new T3.Mesh(new T3.PlaneGeometry(0.2, 0.1), new T3.MeshBasicMaterial({ map: sl }));
      slm.position.set(d + 0.75, 1.42, s * (WALL_Z - 0.05)); slm.rotation.y = s > 0 ? Math.PI : 0; car.add(slm);
    }
  })();
  function drawLED(text, t) {
    const { ctx: c, canvas: cv } = ledTex.userData;
    c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, cv.width, cv.height);
    c.font = 'bold 40px ' + FONT; c.fillStyle = '#ff9b2f'; c.textBaseline = 'middle';
    const w = c.measureText(text).width;
    if (w < cv.width - 20) { c.textAlign = 'center'; c.fillText(text, cv.width / 2, 34); }
    else { c.textAlign = 'left'; const off = (t * 110) % (w + 200); c.fillText(text, cv.width - off, 34); c.fillText(text, cv.width - off + w + 200, 34); }
    // ドット感
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = 0; x < cv.width; x += 4) c.fillRect(x, 0, 1, cv.height);
    for (let y = 0; y < cv.height; y += 4) c.fillRect(0, y, cv.width, 1);
    ledTex.needsUpdate = true;
  }

  // 中吊り広告（ヒント入り）
  (function buildAds() {
    const ads = [
      ['降りる人の見分け方', '掲示板をチラ見する人は', 'もうすぐ降りる！', '#fff3c4', '#b45309'],
      ['鉄の脚プロテイン', '立ちっぱなしの', 'あなたに。', '#dff3ff', '#0b5394'],
      ['寝てる人ほど', '目覚めは突然。', '〜寝過ごし注意〜', '#ffe1e1', '#b91c1c'],
      ['迷惑行為は', '見て見ぬふり', 'しないで！', '#e7ffe7', '#166534'],
      ['週刊ヒマ人', '観光客は路線図ばかり', '見ている…!?', '#f3e8ff', '#6b21a8'],
      ['善い行いを。', '徳は つながる。', 'コンボ最大2.5倍', '#fff', '#c2410c'],
    ];
    ads.forEach((a, i) => {
      const tex = canvasTex(256, 180, (c, w, h) => {
        c.fillStyle = a[3]; c.fillRect(0, 0, w, h);
        c.fillStyle = a[4]; c.fillRect(0, 0, w, 44);
        c.fillStyle = '#fff'; c.font = 'bold 26px ' + FONT; c.textAlign = 'center'; c.fillText(a[0], w / 2, 31);
        c.fillStyle = '#222'; c.font = 'bold 22px ' + FONT; c.fillText(a[1], w / 2, 90); c.fillText(a[2], w / 2, 130);
      });
      const xs = [-4.6, -2.2, 2.2, 4.6, 7.4, -1.2];
      for (const r of [Math.PI / 2, -Math.PI / 2]) {
        const m = new T3.Mesh(new T3.PlaneGeometry(0.5, 0.36), new T3.MeshBasicMaterial({ map: tex }));
        m.position.set(xs[i] + (r > 0 ? 0.004 : -0.004), 2.12, i === 5 ? 0.0 : 0); m.rotation.y = r; car.add(m);
      }
    });
  })();

  // ================================================================ 外の景色
  const outside = new T3.Group(); scene.add(outside);
  const cityTex = canvasTex(1024, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8ec5ec'); gr.addColorStop(1, '#d7ebf7'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    let x = 0; const cols = ['#9aa4b1', '#b7b0a6', '#8d97a6', '#c4c0b8', '#a3aab2', '#d0c6b8'];
    while (x < w) {
      const bw = 30 + Math.random() * 70, bh = 50 + Math.random() * 150;
      c.fillStyle = cols[(Math.random() * cols.length) | 0]; c.fillRect(x, h - bh, bw, bh);
      c.fillStyle = 'rgba(40,60,90,.35)';
      for (let yy = h - bh + 8; yy < h - 10; yy += 14) for (let xx = x + 5; xx < x + bw - 8; xx += 11) c.fillRect(xx, yy, 6, 8);
      x += bw + Math.random() * 10;
    }
    c.fillStyle = '#6f7a63'; c.fillRect(0, h - 22, w, 22);
  });
  cityTex.wrapS = T3.RepeatWrapping; cityTex.repeat.set(3, 1);
  const poleTex = canvasTex(512, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#5a5248'; c.fillRect(60, 10, 10, h); c.fillRect(310, 10, 10, h);
    c.fillRect(30, 30, 70, 6); c.fillRect(280, 30, 70, 6);
    c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 40); c.quadraticCurveTo(190, 70, 512, 40); c.stroke();
    c.fillStyle = '#7d8b6a'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(Math.random() * w, h - 10 - Math.random() * 30, 14 + Math.random() * 16, 0, TAU); c.fill(); }
  });
  poleTex.wrapS = T3.RepeatWrapping; poleTex.repeat.set(6, 1);
  const outsideLayers = [];
  for (const s of [-1, 1]) {
    const far = new T3.Mesh(new T3.PlaneGeometry(180, 40), new T3.MeshBasicMaterial({ map: cityTex.clone(), fog: false }));
    far.material.map.needsUpdate = true; far.material.map.wrapS = T3.RepeatWrapping; far.material.map.repeat.set(3, 1);
    far.position.set(0, 4, s * 40); far.rotation.y = s > 0 ? Math.PI : 0; outside.add(far);
    const near = new T3.Mesh(new T3.PlaneGeometry(80, 10), new T3.MeshBasicMaterial({ map: poleTex.clone(), transparent: true, fog: false }));
    near.material.map.needsUpdate = true; near.material.map.wrapS = T3.RepeatWrapping; near.material.map.repeat.set(6, 1);
    near.position.set(0, 1.5, s * 6); near.rotation.y = s > 0 ? Math.PI : 0; outside.add(near);
    outsideLayers.push({ far, near, s });
    const ground = new T3.Mesh(new T3.PlaneGeometry(200, 40), lam('#7c8471')); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -1.2, s * 21); outside.add(ground);
  }
  // ホーム
  const platform = new T3.Group(); scene.add(platform);
  const stationSignTex = canvasTex(512, 160, () => { });
  function drawStationSign(name, kana, prev, next) {
    const { ctx: c, canvas: cv } = stationSignTex.userData;
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#1f7a3a'; c.fillRect(0, 108, cv.width, 18);
    c.fillStyle = '#111'; c.textAlign = 'center'; c.font = 'bold 60px ' + FONT; c.fillText(name, cv.width / 2, 70);
    c.font = 'bold 20px ' + FONT; c.fillStyle = '#444'; c.fillText(kana, cv.width / 2, 98);
    c.font = 'bold 18px ' + FONT; c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText('◀ ' + (prev || ''), 8, 123);
    c.textAlign = 'right'; c.fillText((next || '') + ' ▶', cv.width - 8, 123);
    c.fillStyle = '#333'; c.font = '14px ' + FONT; c.textAlign = 'center'; c.fillText('たちっぱ線', cv.width / 2, 150);
    stationSignTex.needsUpdate = true;
  }
  (function buildPlatform() {
    const top = new T3.Mesh(box(90, 0.6, 4.4), lam('#a8a397')); top.position.set(0, -0.3, 3.75); platform.add(top);
    const edge = new T3.Mesh(box(90, 0.01, 0.35), lam('#e8c534')); edge.position.set(0, 0.005, 2.05); platform.add(edge);
    const wall = new T3.Mesh(box(90, 3.4, 0.2), lam('#d5cfc2')); wall.position.set(0, 1.4, 6); platform.add(wall);
    const roof = new T3.Mesh(box(90, 0.15, 4.6), lam('#8b8f96')); roof.position.set(0, 3.1, 3.75); platform.add(roof);
    for (let x = -42; x <= 42; x += 7) {
      const p = new T3.Mesh(new T3.CylinderGeometry(0.12, 0.12, 3.1, 8), lam('#9aa0a8')); p.position.set(x, 1.55, 4.6); platform.add(p);
    }
    for (let x = -35; x <= 35; x += 14) {
      const sg = new T3.Mesh(new T3.PlaneGeometry(2.4, 0.75), new T3.MeshBasicMaterial({ map: stationSignTex }));
      sg.position.set(x, 2.3, 4.45); sg.rotation.y = Math.PI; platform.add(sg);
      const bench = new T3.Mesh(box(1.6, 0.45, 0.45), lam('#4f7fb5')); bench.position.set(x + 3.5, 0.22, 5.4); platform.add(bench);
    }
    const adTex = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#ffde59'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 28px ' + FONT; c.textAlign = 'center'; c.fillText('座れたら勝ち。', w / 2, 56); c.font = '18px ' + FONT; c.fillText('たちっぱ線', w / 2, 96); });
    for (let x = -28; x <= 28; x += 14) { const a = new T3.Mesh(new T3.PlaneGeometry(2, 1), new T3.MeshBasicMaterial({ map: adTex })); a.position.set(x, 1.5, 5.88); a.rotation.y = Math.PI; platform.add(a); }
  })();
  platform.visible = false;

  // ================================================================ 人間
  const UCAP = new T3.CapsuleGeometry(0.5, 1, 4, 10);
  const USPH = new T3.SphereGeometry(1, 18, 14);
  const FACE_GEO = new T3.SphereGeometry(1.015, 14, 12, Math.PI / 2 - 0.95, 1.9, 0.95, 1.4);
  const HAIR_CAP = new T3.SphereGeometry(1.07, 16, 10, 0, TAU, 0, Math.PI * 0.5);
  const HAIR_BOB = new T3.SphereGeometry(1.1, 16, 10, 0, TAU, 0, Math.PI * 0.62);
  const HAIR_BUZZ = new T3.SphereGeometry(1.03, 14, 8, 0, TAU, 0, Math.PI * 0.42);
  const shoeMat = lam('#1d1b1a');
  function limb(mat, r, len, parent, y) {
    const m = new T3.Mesh(UCAP, mat);
    m.scale.set(r * 2, len / 2, r * 2); m.position.y = y != null ? y : -len / 2;
    parent.add(m); return m;
  }
  function pivot(parent, x, y, z) { const g = new T3.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  function buildHuman(p) {
    const L = p.look, h = p.h, fem = p.female;
    const skin = lam(L.skin), top = lam(L.top), bottom = lam(L.bottom), hair = new T3.MeshPhongMaterial({ color: L.hair, shininess: 25 });
    const root = new T3.Group();
    const H = {
      root, p, h, legLen: h * 0.47, parts: {}, faceKey: '', bubbleKey: '', labelKey: '',
      ang: { pelvisY: h * 0.47, lean: 0, hy: 0, hp: 0, hr: 0, shLx: 0, shLz: 0.08, elL: 0, shRx: 0, shRz: -0.08, elR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, rootTilt: 0, yOff: 0, splay: 0 },
      strap: (p.id % 3) !== 0, ry: p.ry,
    };
    const pel = pivot(root, 0, H.legLen, 0); H.pelvis = pel;
    const shoulderW = h * (fem ? 0.105 : 0.118);
    // 腰
    const hips = new T3.Mesh(USPH, bottom); hips.scale.set(h * 0.088, h * 0.06, h * 0.06); hips.position.y = 0.01; pel.add(hips);
    // 胴
    const torsoG = pivot(pel, 0, 0.02, 0); H.torso = torsoG;
    const chest = new T3.Mesh(UCAP, top); chest.scale.set(shoulderW * 1.75, h * 0.17, h * 0.115); chest.position.y = h * 0.16; torsoG.add(chest);
    if (L.tie) { const tie = new T3.Mesh(box(0.05, h * 0.16, 0.01), lam(L.tie)); tie.position.set(0, h * 0.2, h * 0.06); torsoG.add(tie); const sh = new T3.Mesh(box(0.1, h * 0.12, 0.01), lam('#f2f2f2')); sh.position.set(0, h * 0.235, h * 0.057); torsoG.add(sh); }
    if (p.type === 'pregnant') { const b = new T3.Mesh(USPH, top); b.scale.set(0.15, 0.16, 0.15); b.position.set(0, h * 0.06, h * 0.07); torsoG.add(b); const badge = new T3.Mesh(new T3.CircleGeometry(0.03, 12), lam('#ff7eb6')); badge.position.set(0.08, h * 0.25, h * 0.064); torsoG.add(badge); }
    if (fem && p.type !== 'pregnant' && (p.id % 2 === 0)) { // スカート
      const sk = new T3.Mesh(new T3.CylinderGeometry(h * 0.07, h * 0.12, h * 0.2, 12, 1, true), new T3.MeshLambertMaterial({ color: L.bottom, side: T3.DoubleSide }));
      sk.position.y = -h * 0.08; pel.add(sk); H.skirt = true;
    }
    // 頭
    const headP = pivot(torsoG, 0, h * 0.3, 0); H.head = headP;
    const neck = new T3.Mesh(UCAP, skin); neck.scale.set(h * 0.04, h * 0.03, h * 0.04); neck.position.y = h * 0.015; headP.add(neck);
    const rH = h * 0.07;
    const head = new T3.Mesh(USPH, skin); head.scale.set(rH * 0.92, rH * 1.12, rH * 1.0); head.position.set(0, h * 0.075, 0.005); headP.add(head);
    H.headMesh = head;
    // 顔テクスチャ
    const fc = document.createElement('canvas'); fc.width = fc.height = 128;
    const ft = new T3.CanvasTexture(fc); ft.encoding = T3.sRGBEncoding; ft.anisotropy = 2;
    const fm = new T3.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false });
    const face = new T3.Mesh(FACE_GEO, fm); head.add(face);
    H.face = { canvas: fc, ctx: fc.getContext('2d'), tex: ft };
    // 鼻
    const nose = new T3.Mesh(USPH, skin); nose.scale.set(0.11, 0.16, 0.14); nose.position.set(0, -0.08, 0.98); head.add(nose);
    // 耳
    for (const sx of [-1, 1]) { const e = new T3.Mesh(USPH, skin); e.scale.set(0.12, 0.22, 0.12); e.position.set(sx * 0.95, 0, -0.02); head.add(e); }
    // 髪
    const st = L.hairStyle;
    if (st !== 'bald' && st !== 'hat') {
      const geo = st === 'buzz' ? HAIR_BUZZ : (st === 'bob' || st === 'long') ? HAIR_BOB : HAIR_CAP;
      const hm = new T3.Mesh(geo, hair); hm.rotation.x = -0.28; hm.position.y = 0.04; head.add(hm);
      if (st === 'long') { const back = new T3.Mesh(UCAP, hair); back.scale.set(1.7, 1.1, 0.6); back.position.set(0, -0.75, -0.55); head.add(back); }
      if (st === 'pony') { const pt = new T3.Mesh(UCAP, hair); pt.scale.set(0.45, 0.55, 0.45); pt.position.set(0, -0.35, -1.05); pt.rotation.x = 0.4; head.add(pt); }
      if (st === 'bun') { const bn = new T3.Mesh(USPH, hair); bn.scale.set(0.42, 0.42, 0.42); bn.position.set(0, 0.85, -0.6); head.add(bn); }
      if (st === 'side') { const fr = new T3.Mesh(USPH, hair); fr.scale.set(0.9, 0.3, 0.4); fr.position.set(-0.25, 0.75, 0.6); fr.rotation.z = 0.4; head.add(fr); }
    } else if (st === 'bald') {
      const ring = new T3.Mesh(new T3.SphereGeometry(1.04, 14, 6, 0, TAU, Math.PI * 0.42, Math.PI * 0.2), hair); ring.rotation.x = -0.35; head.add(ring);
    } else {
      const brim = new T3.Mesh(new T3.CylinderGeometry(1.6, 1.6, 0.08, 18), lam('#3b2f2a')); brim.position.y = 0.55; head.add(brim);
      const crown = new T3.Mesh(new T3.CylinderGeometry(0.95, 1.05, 0.8, 18), lam('#3b2f2a')); crown.position.y = 0.95; head.add(crown);
    }
    if (p.type === 'elderly' || p.type === 'ceo') { /* しわは顔に描く */ }
    if (L.crown) { const gold = new T3.MeshPhongMaterial({ color: '#f2c230', shininess: 80 }); const cr = new T3.Mesh(new T3.CylinderGeometry(0.75, 0.7, 0.45, 8, 1, true), gold); cr.position.y = 1.1; head.add(cr); for (let i = 0; i < 8; i++) { const t = new T3.Mesh(new T3.ConeGeometry(0.14, 0.32, 4), gold); const a = i / 8 * TAU; t.position.set(Math.sin(a) * 0.72, 1.45, Math.cos(a) * 0.72); head.add(t); } }
    // 腕
    const mkArm = (sx) => {
      const sh = pivot(torsoG, sx * shoulderW, h * 0.27, 0);
      limb(top, h * 0.025, h * 0.165, sh);
      const el = pivot(sh, 0, -h * 0.165, 0);
      limb(top, h * 0.021, h * 0.14, el);
      const hand = new T3.Mesh(USPH, skin); hand.scale.set(h * 0.022, h * 0.03, h * 0.016); hand.position.y = -h * 0.155; el.add(hand);
      return { sh, el, hand };
    };
    H.armL = mkArm(-1); H.armR = mkArm(1);
    // 脚
    const mkLeg = (sx) => {
      const hp = pivot(root, sx * h * 0.05, H.legLen, 0);
      limb(bottom, h * 0.043, h * 0.24, hp);
      const kn = pivot(hp, 0, -h * 0.235, 0);
      limb(H.skirt ? skin : bottom, h * 0.033, h * 0.22, kn);
      const shoe = new T3.Mesh(box(h * 0.055, h * 0.04, h * 0.14), shoeMat); shoe.position.set(0, -h * 0.23, h * 0.03); kn.add(shoe);
      return { hp, kn };
    };
    H.legL = mkLeg(-1); H.legR = mkLeg(1);
    // 持ち物
    if (L.bag) {
      const bg = new T3.Mesh(box(0.3, 0.24, 0.1), lam(p.type === 'student' ? '#222' : p.type === 'tourist' ? '#d14' : '#5b3a26'));
      root.add(bg); H.bag = bg;
    }
    if (p.type === 'injured') { const cr = new T3.Mesh(new T3.CylinderGeometry(0.015, 0.015, 1.2, 6), lam('#999')); root.add(cr); H.crutch = cr; }
    if (p.type === 'mother') {
      const kid = new T3.Group();
      const kb = new T3.Mesh(UCAP, lam('#f59ec4')); kb.scale.set(0.16, 0.13, 0.13); kid.add(kb);
      const kh = new T3.Mesh(USPH, skin); kh.scale.set(0.085, 0.09, 0.085); kh.position.y = 0.17; kid.add(kh);
      const khr = new T3.Mesh(HAIR_CAP, hair); khr.scale.set(0.088, 0.09, 0.088); khr.position.y = 0.18; khr.rotation.x = -0.3; kid.add(khr);
      kid.position.set(0, h * 0.2, h * 0.11); torsoG.add(kid);
    }
    if (p.type === 'tourist') { const sc = new T3.Mesh(box(0.38, 0.55, 0.22), lam('#e0a020')); root.add(sc); H.suitcase = sc; }
    if (p.type === 'otaku') { const ub = new T3.Mesh(box(0.22, 0.04, 0.04), new T3.MeshBasicMaterial({ color: '#ff3fa4' })); H.armR.el.add(ub); ub.position.y = -h * 0.17; ub.rotation.z = Math.PI / 2; }
    if (p.type === 'yankee') yankeeStyle(H, p);
    H.costume = costumeOf(p);
    if (H.costume) addCostume(H, p, H.costume);
    root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    scene.add(root);
    return H;
  }
  // ---------------------------------------------------------------- 衣装（ボス駅・注意できる悪者の 3D の見た目）
  // p.look.costume で決まる。体の上に部品を足したり、頭を動物に取りかえたりする
  function costumeOf(p) { return (p.look && p.look.costume) || ''; }
  function addCostume(H, p, c) {
    const h = p.h, L = p.look, head = H.headMesh, headP = H.head, torso = H.torso;
    const M = (col) => lam(col), P = (col, sh) => new T3.MeshPhongMaterial({ color: col, shininess: sh || 30 });
    const hideHuman = () => { for (const ch of head.children) ch.visible = false; head.material = M(L.skin); };
    const ball = (mat, sx, sy, sz, x, y, z, parent) => { const m = new T3.Mesh(USPH, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); (parent || head).add(m); return m; };
    if (c.startsWith('animal:')) {
      const a = c.slice(7);
      H.animal = a;
      if (a === 'サル') {
        hideHuman(); head.material = M('#7a5230');
        ball(M('#e8b896'), 0.75, 0.62, 0.4, 0, -0.12, 0.72); // 顔
        for (const sx of [-1, 1]) { ball(M('#e8b896'), 0.32, 0.36, 0.14, sx * 1.02, 0.05, 0); ball(M('#1a1a1a'), 0.1, 0.12, 0.06, sx * 0.25, 0.08, 1.05); }
        ball(M('#c98a6a'), 0.32, 0.18, 0.2, 0, -0.38, 1.0); // 口
        const tail = new T3.Mesh(new T3.TorusGeometry(0.16, 0.025, 6, 12, Math.PI * 1.4), M('#7a5230')); tail.position.set(0, 0.05, -0.12); tail.rotation.y = Math.PI / 2; H.pelvis.add(tail);
      } else if (a === 'ペンギン') {
        hideHuman(); head.material = M('#1d2024');
        ball(M('#f2f2f2'), 0.62, 0.55, 0.3, 0, -0.18, 0.78);
        for (const sx of [-1, 1]) ball(M('#111'), 0.1, 0.12, 0.06, sx * 0.28, 0.12, 0.98);
        const beak = new T3.Mesh(new T3.ConeGeometry(0.2, 0.55, 8), M('#f2a03a')); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.12, 1.2); head.add(beak);
        const belly = new T3.Mesh(USPH, M('#f2f2f2')); belly.scale.set(h * 0.11, h * 0.16, h * 0.05); belly.position.set(0, h * 0.14, h * 0.07); torso.add(belly);
        H.waddle = true;
      } else if (a === 'カピバラ') {
        // 体ごと横長のカピバラにする（人の体はかくす）
        for (const o of [H.pelvis, H.torso, H.legL.hp, H.legR.hp]) o.visible = false;
        const cap = new T3.Group(); H.root.add(cap); H.capy = cap;
        const fur = M('#a07850');
        const body = new T3.Mesh(UCAP, fur); body.scale.set(0.42, 0.42, 0.42); body.rotation.x = Math.PI / 2; body.position.y = 0.32; cap.add(body);
        const hd = new T3.Mesh(box(0.28, 0.26, 0.4), fur); hd.position.set(0, 0.45, 0.45); cap.add(hd);
        const nose = new T3.Mesh(box(0.26, 0.2, 0.12), M('#6b4a32')); nose.position.set(0, 0.42, 0.68); cap.add(nose);
        for (const sx of [-1, 1]) { const e = new T3.Mesh(USPH, M('#111')); e.scale.set(0.03, 0.03, 0.03); e.position.set(sx * 0.1, 0.52, 0.6); cap.add(e); const ear = new T3.Mesh(USPH, M('#7a5a40')); ear.scale.set(0.05, 0.05, 0.03); ear.position.set(sx * 0.12, 0.6, 0.32); cap.add(ear); }
        for (const [x, z] of [[-0.14, 0.3], [0.14, 0.3], [-0.14, -0.25], [0.14, -0.25]]) { const lg = new T3.Mesh(UCAP, fur); lg.scale.set(0.09, 0.12, 0.09); lg.position.set(x, 0.1, z); cap.add(lg); }
        const towel = new T3.Mesh(box(0.2, 0.04, 0.16), M('#f2f2f2')); towel.position.set(0, 0.6, 0.42); cap.add(towel); // 頭に手ぬぐい
      } else if (a === '子ゾウ') {
        hideHuman(); head.material = M('#8a8f96'); head.scale.multiplyScalar(1.25);
        for (const sx of [-1, 1]) { const ear = new T3.Mesh(new T3.CircleGeometry(0.75, 16), new T3.MeshLambertMaterial({ color: '#7d828a', side: T3.DoubleSide })); ear.position.set(sx * 1.05, 0.05, -0.1); ear.rotation.y = sx * 1.2; head.add(ear); ball(M('#111'), 0.09, 0.11, 0.05, sx * 0.32, 0.18, 0.95); }
        const trunk = new T3.Group(); trunk.position.set(0, -0.2, 0.9); head.add(trunk); H.trunk = trunk;
        let par = trunk; for (let i = 0; i < 4; i++) { const seg = new T3.Group(); seg.position.y = i ? -0.32 : 0; par.add(seg); const m = new T3.Mesh(UCAP, M('#8a8f96')); m.scale.set(0.24 - i * 0.03, 0.2, 0.24 - i * 0.03); m.position.y = -0.16; seg.add(m); par = seg; (H.trunkSegs = H.trunkSegs || []).push(seg); }
      }
    } else if (c === 'ghost') {
      H.ghost = true;
      H.root.traverse((o) => { if (o.isMesh && o.material && !o.material.map) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.depthWrite = false; } });
      H.legL.hp.visible = H.legR.hp.visible = false;
      const tri = new T3.Mesh(new T3.ConeGeometry(0.35, 0.5, 3), new T3.MeshBasicMaterial({ color: '#ffffff' })); tri.rotation.set(-0.2, 0, Math.PI); tri.position.set(0, 0.55, 0.75); head.add(tri); // 三角の布
      const tail = new T3.Mesh(new T3.ConeGeometry(h * 0.1, h * 0.35, 10), new T3.MeshLambertMaterial({ color: '#eef2f6', transparent: true, opacity: 0.45, depthWrite: false })); tail.rotation.x = Math.PI; tail.position.y = -h * 0.15; H.pelvis.add(tail);
    } else if (c === 'gym') {
      H.gym = true;
    } else if (c === 'tori') {
      const cam = new T3.Group(); const body = new T3.Mesh(box(0.14, 0.09, 0.07), M('#1a1a1a')); cam.add(body);
      const lens = new T3.Mesh(new T3.CylinderGeometry(0.035, 0.04, 0.12, 10), M('#333')); lens.rotation.x = Math.PI / 2; lens.position.z = 0.08; cam.add(lens);
      const fl = new T3.Mesh(USPH, new T3.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 })); fl.scale.set(0.12, 0.12, 0.12); fl.position.set(0, 0.07, 0.05); cam.add(fl); H.flash = fl;
      cam.position.set(0, h * 0.32, h * 0.1); torso.add(cam); H.camera = cam; H.tori = true;
    } else if (c === 'cand') {
      const sash = new T3.Mesh(box(0.08, h * 0.42, 0.012), M('#f2f2f2')); sash.position.set(0, h * 0.17, h * 0.062); sash.rotation.z = 0.75; torso.add(sash);
      const stripe = new T3.Mesh(box(0.03, h * 0.42, 0.014), M('#c0392b')); stripe.position.copy(sash.position); stripe.rotation.z = 0.75; torso.add(stripe);
      H.cand = true;
    } else if (c === 'balloon') {
      const col = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'][p.id % 4];
      // 手（小さく縮めてある）ではなく、ひじから先につける。腕を上げると -y が上になる
      const bl = new T3.Mesh(USPH, P(col, 80)); bl.scale.set(0.16, 0.2, 0.16); bl.position.set(0, -h * 0.155 - 0.62, 0); H.armR.el.add(bl); H.balloon = bl;
      const str = new T3.Mesh(new T3.CylinderGeometry(0.004, 0.004, 0.45, 4), M('#eee')); str.position.y = -h * 0.155 - 0.24; H.armR.el.add(str);
    } else if (c === 'yanki') {
      H.yanki = true;
      // 学ラン（長ラン）：金ボタン・つめえり・ひざまである長いすそ
      const gold = new T3.MeshPhongMaterial({ color: '#e8c25a', shininess: 90 });
      for (let i = 0; i < 5; i++) { const b = new T3.Mesh(USPH, gold); b.scale.setScalar(h * 0.011); b.position.set(0, h * (0.27 - i * 0.055), h * 0.066); torso.add(b); }
      const collar = new T3.Mesh(new T3.CylinderGeometry(h * 0.045, h * 0.05, h * 0.05, 12, 1, true), new T3.MeshLambertMaterial({ color: '#15161c', side: T3.DoubleSide })); collar.position.y = h * 0.315; torso.add(collar);
      const hem = new T3.Mesh(new T3.CylinderGeometry(h * 0.09, h * 0.12, h * 0.3, 12, 1, true), new T3.MeshLambertMaterial({ color: '#15161c', side: T3.DoubleSide })); hem.position.y = -h * 0.12; H.pelvis.add(hem);
    } else if (c === 'yukata') {
      const robe = new T3.Mesh(new T3.CylinderGeometry(h * 0.085, h * 0.11, h * 0.47, 12, 1, true), new T3.MeshLambertMaterial({ color: L.top, side: T3.DoubleSide })); robe.position.y = h * 0.235; H.root.add(robe); H.robe = robe;
      const obi = new T3.Mesh(new T3.CylinderGeometry(h * 0.075, h * 0.075, h * 0.06, 12), M(p.id % 2 ? '#f1c40f' : '#c0392b')); obi.position.y = h * 0.07; torso.add(obi);
      const uchiwa = new T3.Mesh(new T3.CircleGeometry(0.1, 12), new T3.MeshLambertMaterial({ color: '#f5e6a8', side: T3.DoubleSide })); uchiwa.position.y = -h * 0.17; H.armL.el.add(uchiwa);
    } else if (c === 'keiba') {
      const np = new T3.Mesh(box(0.62, 0.42, 0.01), M('#e8e4d8')); np.position.set(0, h * 0.3, h * 0.2); torso.add(np); H.paper = np;
      const pen = new T3.Mesh(new T3.CylinderGeometry(0.008, 0.008, 0.14, 5), M('#c0392b')); pen.position.set(0.95, 0.15, 0); pen.rotation.x = 1.3; head.add(pen); // 耳に赤ペン
    } else if (c === 'nomi') {
      const band = new T3.Mesh(new T3.TorusGeometry(1.0, 0.12, 6, 16), M(L.tie || '#c0392b')); band.rotation.x = Math.PI / 2 - 0.3; band.position.y = 0.45; head.add(band); // ネクタイのはちまき
      H.drunk = true;
    } else if (c === 'ninja') {
      const hood = new T3.Mesh(USPH, M('#1c1c22')); hood.scale.set(1.08, 1.1, 1.08); head.add(hood);
      const eyes = new T3.Mesh(box(1.4, 0.32, 0.4), M(L.skin)); eyes.position.set(0, 0.12, 0.85); head.add(eyes);
      for (const sx of [-1, 1]) ball(M('#111'), 0.09, 0.1, 0.05, sx * 0.28, 0.12, 1.06);
      H.ninja = true;
    } else if (c === 'maou' || c === 'maouHench') {
      const big = c === 'maou';
      for (const sx of [-1, 1]) { const hn = new T3.Mesh(new T3.ConeGeometry(big ? 0.22 : 0.13, big ? 0.8 : 0.4, 8), P('#f2e6c8', 60)); hn.position.set(sx * 0.55, 0.95, 0); hn.rotation.z = -sx * 0.45; head.add(hn); }
      if (big) { const cape = new T3.Mesh(new T3.PlaneGeometry(h * 0.32, h * 0.62), new T3.MeshLambertMaterial({ color: '#5a0f1e', side: T3.DoubleSide })); cape.position.set(0, h * 0.0, -h * 0.08); cape.rotation.x = 0.12; torso.add(cape); H.cape = cape; }
    } else if (c === 'leak') {
      const bandM = M('#222');
      const band = new T3.Mesh(new T3.TorusGeometry(1.08, 0.08, 6, 16, Math.PI), bandM); band.rotation.z = 0; band.position.y = 0.1; head.add(band);
      for (const sx of [-1, 1]) { const cup = new T3.Mesh(new T3.CylinderGeometry(0.32, 0.32, 0.2, 12), bandM); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 1.05, 0.05, 0); head.add(cup); }
      H.leak = true;
    } else if (c === 'bento') {
      const bx = new T3.Mesh(box(0.2, 0.06, 0.14), M('#1a1a1a')); bx.position.set(0, h * 0.2, h * 0.17); torso.add(bx);
      const food = new T3.Mesh(box(0.18, 0.02, 0.12), M('#f5d76e')); food.position.y = 0.035; bx.add(food);
      const chop = new T3.Mesh(box(0.008, 0.008, 0.2), M('#b5835a')); chop.position.set(0.05, 0.05, 0.02); chop.rotation.x = -0.6; bx.add(chop);
      H.bento = bx;
    } else if (c === 'pack') {
      const bp = new T3.Mesh(box(0.38, 0.5, 0.26), M(['#2c3e50', '#c0392b', '#16a085'][p.id % 3])); bp.position.set(0, h * 0.17, -h * 0.13); torso.add(bp);
    }
  }
  // ヤンキー：リーゼントかパンチパーマ＋グラサン（ふつうのヤンキーも、不良高校前のヤンキーも）
  function yankeeStyle(H, p) {
    const head = H.headMesh;
    for (const ch of head.children) if (ch.material && ch.material.isMeshPhongMaterial) ch.visible = false; // もとの髪をかくす
    const dyed = p.id % 3 === 0;
    const hairM = new T3.MeshPhongMaterial({ color: dyed ? '#d9b04a' : '#1a1410', shininess: 70 });
    if (p.id % 2 === 0) {
      // リーゼント：前に長くつき出した髪＋なでつけた横と後ろ
      const top = new T3.Mesh(UCAP, hairM); top.scale.set(0.95, 0.75, 0.95); top.rotation.x = Math.PI / 2 - 0.35; top.position.set(0, 0.85, 0.75); head.add(top);
      const side = new T3.Mesh(HAIR_CAP, hairM); side.scale.set(1.02, 0.9, 1.02); side.rotation.x = -0.15; side.position.y = 0.05; head.add(side);
    } else {
      // パンチパーマ：小さな丸いカールがびっしり
      const permM = new T3.MeshPhongMaterial({ color: dyed ? '#7a3b2e' : '#1d1612', shininess: 20 });
      const base = new T3.Mesh(HAIR_CAP, permM); base.scale.set(1.04, 1.0, 1.04); base.rotation.x = -0.2; head.add(base);
      for (let i = 0; i < 46; i++) {
        const u = (i * 0.618) % 1, v = Math.min(1, (i + 0.5) / 46);
        const th = u * TAU, ph = Math.acos(1 - v * 1.15) ; if (ph > 1.45) continue;
        const r = 1.08, b = new T3.Mesh(USPH, permM);
        b.scale.setScalar(0.17); b.position.set(Math.sin(ph) * Math.sin(th) * r, Math.cos(ph) * r + 0.02, Math.sin(ph) * Math.cos(th) * r - 0.05);
        if (b.position.z > 0.55 && b.position.y < 0.55) continue; // おでこは出す
        head.add(b);
      }
    }
    // グラサン
    const gl = new T3.MeshPhongMaterial({ color: '#0d0d10', shininess: 120 });
    for (const sx of [-1, 1]) { const lens = new T3.Mesh(box(0.62, 0.3, 0.08), gl); lens.position.set(sx * 0.36, 0.14, 0.98); lens.rotation.y = sx * 0.18; head.add(lens); }
    const bridge = new T3.Mesh(box(0.2, 0.06, 0.06), gl); bridge.position.set(0, 0.2, 1.02); head.add(bridge);
  }
  // 衣装ごとの動き（ポーズ）。tgt は poseHuman の目標の角度
  function costumePose(H, p, tgt, now, g) {
    const st = p.state, standing = st === 'stand', t = now + p.id * 0.7;
    if (st === 'ko' || st === 'fight') return;
    if (H.gym && standing && !p.bxDone) {
      const ph = (t * 0.32) % 3;
      const crouch = (y) => { tgt.pelvisY = H.h * 0.47 - H.h * 0.17 * y; tgt.hipL = tgt.hipR = -1.0 * y; tgt.kneeL = tgt.kneeR = 1.9 * y; };
      if (ph < 1) { // バク転：しゃがむ → 腕をふり上げて跳ぶ → ひざを抱えて回る → 着地してしゃがむ → 立つ
        H.flip = -1; H.flipA = 0; H.flipL = 0; H.flipFast = true; H.gymHang = 0;
        if (ph < 0.22) { const y = Math.sin(ph / 0.22 * Math.PI / 2); crouch(y); tgt.shLx = tgt.shRx = 0.9 * y; tgt.elL = tgt.elR = 0; } // 腕を後ろに引いてしゃがむ
        else if (ph < 0.72) {
          const u = (ph - 0.22) / 0.5, v = Math.min(1, u / 0.82), e = v * v * (3 - 2 * v); // 着地より少し前に回りきる
          H.flip = u; H.flipA = e * TAU; H.flipL = Math.sin(u * Math.PI) * H.h * 0.32;
          const tuck = Math.sin(Math.min(1, u * 1.45) * Math.PI); // 回りきる前に足をのばして着地にそなえる
          tgt.pelvisY = H.h * 0.47; tgt.hipL = tgt.hipR = -2.1 * tuck - (u > 0.7 ? 0.5 : 0); tgt.kneeL = tgt.kneeR = 2.3 * tuck + (u > 0.7 ? 0.8 : 0);
          tgt.shLx = tgt.shRx = u < 0.25 ? -2.9 : -1.3; tgt.elL = tgt.elR = u < 0.25 ? 0 : -0.6; tgt.hp = -0.3 * tuck;
        } else { const y = Math.sin((1 - (ph - 0.72) / 0.28) * Math.PI / 2); crouch(y); tgt.shLx = tgt.shRx = -1.6 * y; tgt.shLz = 0.4 * y; tgt.shRz = -0.4 * y; } // 着地（手を広げてバランス）
      }
      else if (ph < 1.4) { // 着地のあと「ビシッ」：背すじをのばして両手を V の字に上げる
        H.flip = -1; H.flipFast = true; H.gymHang = 0;
        tgt.pelvisY = H.h * 0.47; tgt.hipL = tgt.hipR = 0; tgt.kneeL = tgt.kneeR = 0; tgt.lean = 0; tgt.hp = -0.15;
        tgt.shLx = tgt.shRx = -2.7; tgt.shLz = -GYM_IN * 1.6; tgt.shRz = GYM_IN * 1.6; tgt.elL = tgt.elR = 0;
      } else if (ph < 1.62) { // 軽くしゃがんで、つり革へジャンプ（手が輪に届くように costumeAfter で位置を合わせる）
        H.flip = -1; H.flipFast = true;
        const u = (ph - 1.4) / 0.22;
        if (u < 0.35) { crouch(Math.sin(u / 0.35 * Math.PI / 2) * 0.6); tgt.shLx = tgt.shRx = 0.6; tgt.elL = tgt.elR = 0; H.gymHang = 0; }
        else { const v = (u - 0.35) / 0.65; H.gymHang = Math.min(1, v * 1.5); tgt.shLx = tgt.shRx = -Math.PI; tgt.shLz = GYM_IN; tgt.shRz = -GYM_IN; tgt.elL = tgt.elR = 0; tgt.hipL = tgt.hipR = -1.5 * v; tgt.kneeL = tgt.kneeR = 0.6 * (1 - v); }
      }
      else { H.flip = -1; H.flipFast = false; H.gymHang = 1; tgt.shLx = tgt.shRx = -Math.PI; tgt.shLz = GYM_IN; tgt.shRz = -GYM_IN; tgt.elL = tgt.elR = 0; tgt.hipL = tgt.hipR = -1.5; tgt.kneeL = tgt.kneeR = 0; } // つり革で L 字支持
    } else { H.flip = -1; H.flipFast = false; H.gymHang = 0; }
    if (H.yanki && standing && !p.bxDone) { tgt.pelvisY = 0.32; tgt.hipL = tgt.hipR = -1.65; tgt.kneeL = tgt.kneeR = 2.5; tgt.splay = 0.35; tgt.lean = 0.25; tgt.shLx = tgt.shRx = -0.6; tgt.elL = tgt.elR = -0.5; tgt.hp = -0.15; } // 床に座りこむ
    if (H.animal === 'サル' && standing && !p.bxDone) { tgt.shLx = tgt.shRx = -2.95; tgt.elL = tgt.elR = -0.1; tgt.hipL = tgt.hipR = -1.1; tgt.kneeL = tgt.kneeR = 1.7; tgt.yOff = 0.5 + Math.sin(t * 3) * 0.05; tgt.lean = Math.sin(t * 2.2) * 0.2; } // つり革にぶら下がる
    if (H.waddle && (st === 'stand' || st === 'walk')) { tgt.shLz = 0.55; tgt.shRz = -0.55; tgt.shLx = tgt.shRx = 0; tgt.elL = tgt.elR = 0; tgt.hr = Math.sin(t * 6) * 0.2; }
    if (H.trunkSegs) H.trunkSegs.forEach((s, i) => { s.rotation.x = 0.25 + Math.sin(t * 2 + i) * 0.25; s.rotation.z = Math.sin(t * 1.3 + i) * 0.2; });
    if (H.ghost) { tgt.shLx = tgt.shRx = -1.35; tgt.elL = tgt.elR = -0.2; tgt.yOff = 0.12 + Math.sin(t * 1.6) * 0.06; tgt.hp = 0.25; } // うらめしや
    if (H.tori && !p.bxDone) { tgt.shLx = tgt.shRx = -1.25; tgt.shLz = 0.35; tgt.shRz = -0.35; tgt.elL = tgt.elR = -1.7; tgt.hp = 0.05; if (H.flash) H.flash.material.opacity = (t * 1.3) % 2 < 0.08 ? 0.95 : 0; }
    if (H.cand && !p.bxDone) { tgt.shRx = -2.6; tgt.shRz = 0.25 + Math.sin(t * 5) * 0.3; tgt.elR = -0.4; } // 手をふる
    if (H.balloon) { tgt.shRx = -2.2; tgt.elR = -0.3; H.balloon.position.x = Math.sin(t * 1.5) * 0.05; }
    if (H.paper && !p.bxDone) { tgt.shLx = tgt.shRx = -1.2; tgt.shLz = 0.5; tgt.shRz = -0.5; tgt.elL = tgt.elR = -0.9; } else if (H.paper) H.paper.visible = false;
    if (H.drunk && !p.bxDone && st !== 'seated') { tgt.lean = Math.sin(t * 1.4) * 0.18; tgt.hr = Math.sin(t * 1.1) * 0.25; }
    if (H.ninja) { tgt.shLx = tgt.shRx = -1.2; tgt.shLz = -0.45; tgt.shRz = 0.45; tgt.elL = tgt.elR = -1.5; } // ニンニン
    if (H.bento && st === 'seated' && p.role === 'bento') { tgt.shLx = tgt.shRx = -0.7; tgt.elL = -1.2; tgt.elR = -2.0; tgt.hp = 0.3; }
    if (H.leak && p.role === 'leak') { tgt.hr = Math.sin(t * 4) * 0.12; } // ノリノリ
    if (p.role === 'preach' && Math.hypot(p.x - g.player.x, p.z - g.player.z) < 1.8) { tgt.shRx = -1.4; tgt.shRz = 0.1; tgt.elR = -0.2 + Math.sin(t * 6) * 0.25; } // 指をさして説教
  }
  // 体ごと回る動き（バク転・カピバラ）は、角度を反映したあとに足す
  // 体操部：両手のまん中が、いちばん近いつり革の輪に来るように体ごと動かす（gymW でなめらかに）
  const GYM_IN = 0.36, _v1 = new T3.Vector3(), _v2 = new T3.Vector3(), _v3 = new T3.Vector3();
  function gymSnap(H, p) { // 人の root は scene の直下なので、ワールド座標のまま足し引きできる
    const want = H.gymHang || 0;
    H.gymW = (H.gymW || 0) + (want - (H.gymW || 0)) * (want > (H.gymW || 0) ? 0.35 : 0.12);
    if (H.gymW < 0.01) { H.gymRing = null; return; }
    if (!H.gymRing) { let b = null, bd = 1e9; for (const s of straps) { const d = Math.hypot(s.position.x - p.x, s.position.z - p.z); if (d < bd) { bd = d; b = s; } } H.gymRing = b; }
    if (!H.gymRing) return;
    H.root.updateMatrixWorld(true);
    H.armL.hand.getWorldPosition(_v1); H.armR.hand.getWorldPosition(_v2); _v1.add(_v2).multiplyScalar(0.5);
    H.gymRing.children[1].getWorldPosition(_v3); _v3.y -= 0.02;
    H.root.position.addScaledVector(_v3.sub(_v1), H.gymW);
  }
  function costumeAfter(H, p) {
    if (H.gym) gymSnap(H, p);
    if (H.flip >= 0 && H.gym) { // 腰のあたりを中心にうしろへ一回転（足もとを軸にしない）
      const c = H.h * 0.5, th = -H.flipA, lz = -c * Math.sin(th), ly = c - c * Math.cos(th) + H.flipL, back = -Math.sin(H.flip * Math.PI) * 0.3;
      H.root.rotation.x = th;
      H.root.position.x += Math.sin(H.ry) * (lz + back); H.root.position.z += Math.cos(H.ry) * (lz + back); H.root.position.y += ly;
    }
    if (H.capy) { H.capy.position.y = p.state === 'seated' ? 0.38 : 0; }
  }
  function disposeHuman(H) {
    scene.remove(H.root);
    H.face.tex.dispose(); H.face.mesh && H.face.mesh.material.dispose();
    if (H.bubble) { H.bubble.material.map.dispose(); H.bubble.material.dispose(); }
    if (H.label) { H.label.material.map.dispose(); H.label.material.dispose(); }
  }

  // 顔を描く
  function drawFace(H, expr, blink, lookX, lookY) {
    const p = H.p, L = p.look, c = H.face.ctx;
    c.clearRect(0, 0, 128, 128);
    const ey = 57, ex = 21, alien = p.type === 'alien';
    const elder = p.type === 'elderly' || p.type === 'ceo';
    // 頬
    const blushA = expr === 'happy' ? 0.35 : expr === 'distressed' || expr === 'worried' ? 0.25 : p.type === 'drunk' ? 0.55 : expr === 'angry' ? 0.3 : 0.1;
    c.fillStyle = `rgba(230,90,90,${blushA})`;
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(64 + sx * 27, 76, 10, 6, 0, 0, TAU); c.fill(); }
    if (elder) { c.strokeStyle = 'rgba(90,50,30,.35)'; c.lineWidth = 1.2; for (const y of [30, 36]) { c.beginPath(); c.moveTo(46, y); c.quadraticCurveTo(64, y - 3, 82, y); c.stroke(); } for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(64 + sx * 14, 80); c.quadraticCurveTo(64 + sx * 20, 92, 64 + sx * 16, 100); c.stroke(); } }
    // 眉
    const browCol = alien ? 'rgba(0,0,0,0)' : shadeHair(L.hair);
    c.strokeStyle = browCol; c.lineWidth = p.female ? 2.2 : 3.4; c.lineCap = 'round';
    let bIn = 0, bOut = 0;
    if (expr === 'angry' || expr === 'glare' || expr === 'pain') { bIn = 5; bOut = -2; }
    if (expr === 'worried' || expr === 'distressed' || expr === 'sad' || expr === 'panic' || expr === 'sick') { bIn = -5; bOut = 2; }
    if (expr === 'surprised' || expr === 'shifty') { bIn = -5; bOut = -5; }
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(64 + sx * 9, ey - 15 + bIn * 1.3); c.quadraticCurveTo(64 + sx * 20, ey - 20 + (bIn + bOut) / 2 - 2, 64 + sx * 32, ey - 13 + bOut); c.stroke(); }
    // 目
    const closed = blink || expr === 'sleep' || expr === 'ko' && false;
    for (const sx of [-1, 1]) {
      const cx = 64 + sx * ex;
      if (alien) { c.fillStyle = '#050505'; c.beginPath(); c.ellipse(cx, ey + 2, 11, 7, sx * 0.4, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx - 3, ey - 1, 2, 0, TAU); c.fill(); continue; }
      if (expr === 'ko') { c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 6, ey - 5); c.lineTo(cx + 6, ey + 5); c.moveTo(cx + 6, ey - 5); c.lineTo(cx - 6, ey + 5); c.stroke(); continue; }
      if (expr === 'happy' || expr === 'relief') { c.strokeStyle = '#2a1d16'; c.lineWidth = 3.4; c.beginPath(); c.arc(cx, ey + 4, 9, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); continue; }
      if (closed) { c.strokeStyle = '#2a1d16'; c.lineWidth = 3; c.beginPath(); c.arc(cx, ey - 3, 9, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); if (p.female) { c.beginPath(); c.moveTo(cx + sx * 7, ey + 1); c.lineTo(cx + sx * 9, ey + 3); c.stroke(); } continue; }
      let oh = expr === 'surprised' || expr === 'panic' ? 7.5 : expr === 'sleepy' || expr === 'dazed' || expr === 'sick' ? 3 : expr === 'glare' || expr === 'angry' ? 4.5 : 5.5;
      oh *= 1.25;
      c.fillStyle = '#fbfbf8'; c.beginPath(); c.ellipse(cx, ey, 11.5, oh, 0, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.ellipse(cx, ey, 11.5, oh, 0, 0, TAU); c.clip();
      const ix = cx + lookX * 5, iy = ey + lookY * 3.5;
      c.fillStyle = expr === 'dazed' ? '#d23ad8' : '#4a2c18'; c.beginPath(); c.arc(ix, iy, 6.4, 0, TAU); c.fill();
      c.fillStyle = '#0c0806'; c.beginPath(); c.arc(ix, iy, 3.1, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(ix - 2, iy - 2.2, 1.8, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = '#2a1d16'; c.lineWidth = p.female ? 3.2 : 2.6; c.beginPath(); c.ellipse(cx, ey, 12, oh + 0.6, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      if (p.female) { c.beginPath(); c.moveTo(cx + sx * 11.5, ey - 2); c.lineTo(cx + sx * 15, ey - 5); c.stroke(); }
      c.strokeStyle = 'rgba(120,70,50,.35)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx, ey + 1, 11, oh + 1, 0, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
      if (expr === 'dazed') { c.strokeStyle = '#d23ad8'; c.lineWidth = 1.2; c.beginPath(); c.arc(ix, iy, 3.5, 0, Math.PI * 1.5); c.stroke(); }
    }
    // メガネ
    if (L.glasses && !alien) { c.strokeStyle = '#222'; c.lineWidth = 2.6; for (const sx of [-1, 1]) { roundRect(c, 64 + sx * ex - 15, ey - 10, 30, 20, 6); if (L.shades && expr !== 'ko') { c.fillStyle = '#111'; c.fill(); } c.stroke(); } c.beginPath(); c.moveTo(56, ey - 3); c.lineTo(72, ey - 3); c.stroke(); }
    // 口
    const my = 96;
    if (L.mask && expr !== 'ko') {
      c.fillStyle = '#f4f6f8'; roundRect(c, 38, 72, 52, 38, 12); c.fill(); c.strokeStyle = '#cdd2d8'; c.lineWidth = 1; c.beginPath(); c.moveTo(42, 86); c.lineTo(86, 86); c.moveTo(42, 96); c.lineTo(86, 96); c.stroke();
    } else if (!alien) {
      const lip = p.female ? '#c4515a' : '#8a4b40';
      c.strokeStyle = lip; c.fillStyle = '#5a1f1f'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath();
      switch (expr) {
        case 'happy': case 'relief': c.moveTo(52, my - 4); c.quadraticCurveTo(64, my + 10, 76, my - 4); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(56, my - 4, 16, 3); break;
        case 'angry': case 'glare': c.moveTo(54, my + 3); c.quadraticCurveTo(64, my - 5, 74, my + 3); c.stroke(); break;
        case 'surprised': case 'panic': c.ellipse(64, my, 6, 8, 0, 0, TAU); c.fill(); break;
        case 'distressed': case 'worried': case 'sad': c.moveTo(54, my + 2); c.quadraticCurveTo(59, my - 2, 64, my + 1); c.quadraticCurveTo(69, my + 4, 74, my); c.stroke(); break;
        case 'shifty': c.moveTo(55, my); c.quadraticCurveTo(66, my + 3, 75, my - 4); c.stroke(); break;
        case 'sleep': c.ellipse(64, my, 4, 3, 0, 0, TAU); c.fill(); break;
        case 'pain': c.fillStyle = '#fff'; roundRect(c, 52, my - 5, 24, 9, 3); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 1; c.stroke(); break;
        case 'ko': c.ellipse(64, my, 7, 5, 0, 0, TAU); c.fill(); break;
        case 'sick': c.moveTo(52, my + 2); c.bezierCurveTo(56, my - 4, 60, my + 6, 64, my); c.bezierCurveTo(68, my - 6, 72, my + 4, 76, my - 1); c.stroke(); break;
        case 'dazed': c.moveTo(54, my); c.bezierCurveTo(58, my + 5, 62, my - 5, 66, my); c.bezierCurveTo(70, my + 5, 72, my - 2, 75, my); c.stroke(); break;
        default: c.moveTo(55, my); c.quadraticCurveTo(64, my + 2, 73, my); c.stroke();
      }
      if (!p.female && (p.id % 4 === 1) && !elder) { c.fillStyle = 'rgba(40,30,30,.18)'; for (let i = 0; i < 40; i++) c.fillRect(46 + Math.random() * 36, 100 + Math.random() * 16, 1.5, 1.5); }
    }
    // 汗・涙
    if (expr === 'sick') { c.fillStyle = 'rgba(110,190,110,.28)'; c.beginPath(); c.ellipse(64, 70, 46, 50, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(60,110,60,.5)'; c.lineWidth = 1.5; for (const sx of [-1, 1]) { c.beginPath(); c.arc(64 + sx * ex, ey + 9, 7, 0.2, Math.PI - 0.2); c.stroke(); } }
    if (expr === 'shifty' || expr === 'panic' || expr === 'worried' || expr === 'sick') { c.fillStyle = '#7cc8ff'; c.beginPath(); c.moveTo(98, 34); c.quadraticCurveTo(106, 48, 98, 52); c.quadraticCurveTo(90, 48, 98, 34); c.fill(); }
    if (expr === 'sad' || expr === 'distressed') { c.fillStyle = 'rgba(120,200,255,.8)'; c.fillRect(64 - ex - 1, ey + 6, 2.5, 14); }
    if (expr === 'sleep' && p.type !== 'alien') { c.fillStyle = 'rgba(160,220,255,.7)'; c.beginPath(); c.arc(70, my + 6, 2, 0, TAU); c.fill(); }
    H.face.tex.needsUpdate = true;
  }
  function shadeHair(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (r + g + b) / 3 > 150 ? 0.7 : 0.8;
    return `rgb(${(r * f) | 0},${(g * f) | 0},${(b * f) | 0})`;
  }

  // 吹き出し・ラベル
  function makeSpriteText(text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 44px ' + FONT;
    const w = Math.min(500, ctx.measureText(text).width + 44);
    const bg = opts.bg || 'rgba(255,255,255,.95)', fg = opts.fg || '#222';
    ctx.fillStyle = bg; roundRect(ctx, (512 - w) / 2, 10, w, 84, 30); ctx.fill();
    if (!opts.noTail) { ctx.beginPath(); ctx.moveTo(240, 92); ctx.lineTo(256, 118); ctx.lineTo(272, 92); ctx.fill(); }
    if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 5; roundRect(ctx, (512 - w) / 2, 10, w, 84, 30); ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = 44; while (ctx.measureText(text).width > 470 && fs > 20) { fs -= 2; ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.fillText(text, 256, 53);
    const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding;
    const s = new T3.Sprite(new T3.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(0.8, 0.2, 1); s.renderOrder = 10;
    return s;
  }

  // ================================================================ 姿勢
  const lerp = (a, b, k) => a + (b - a) * k;
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
  function poseHuman(H, g, dt, now) {
    const p = H.p, h = H.h, A = H.ang;
    const tgt = { pelvisY: H.legLen, lean: 0, hy: 0, hp: 0, hr: 0, shLx: 0.04, shLz: -0.08, elL: -0.12, shRx: 0.04, shRz: 0.08, elR: -0.12, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, rootTilt: 0, yOff: 0, splay: 0 };
    let faceRy = p.ry;
    const st = p.state;
    const ch = g.chikan;
    const pl = g.player;
    const seated = st === 'seated';
    let anim = p.anim, idle = p.idle;
    H.hold = null; H.bagUp = false; // 手に持つ物・膝のかばん（このあとのポーズで決める）
    if (seated) {
      tgt.pelvisY = 0.47; tgt.hipL = tgt.hipR = -1.42; tgt.kneeL = tgt.kneeR = 1.42; tgt.lean = -0.06;
      tgt.shLx = tgt.shRx = -0.45; tgt.elL = tgt.elR = -0.95;
      // 降りる合図を見た目で：荷物をまとめる（かばんを膝に・持ち手をにぎる）・しまう・フェイント・浅く座り直す・そわそわ・ハッと起きる
      const holdIdle = HOLD_KINDS[idle] && anim === 'none' && p.type !== 'drunk' ? idle : null;
      if (p.packing && !H.prevPack && holdIdle && !p.feintNow) { H.stowT = 0.9; H.stowKind = holdIdle; } // スマホや本をしまう
      H.prevPack = !!p.packing;
      if (H.stowT > 0) H.stowT -= dt;
      if (p.sleep) { tgt.hp = 0.6; tgt.hr = (p.id % 2 ? 0.32 : -0.32) + Math.sin(now * 0.6 + p.id) * 0.04; tgt.lean = 0.12; }
      else if (p.packing) {
        H.bagUp = true;
        tgt.shLx = tgt.shRx = 0; tgt.elL = tgt.elR = -1.85; tgt.shLz = 0.14; tgt.shRz = -0.14; tgt.lean = 0.1; tgt.hp = 0.05; // 両手でかばんの持ち手
        if (p.feintNow) { tgt.shRx = -0.45; tgt.elR = -1.7; tgt.shRz = -0.15; tgt.hp = 0.42; H.hold = { kind: HOLD_KINDS[idle] ? idle : 'phone', hand: 'R' }; } // フェイント：かばんは膝に、でも目はスマホ
        else if (H.stowT > 0) { tgt.shRx = 0.3; tgt.shRz = -0.4; tgt.elR = -0.45; H.hold = { kind: H.stowKind, hand: 'R', scale: Math.max(0.15, H.stowT / 0.9) }; } // しまう
      }
      else if (anim === 'none' && idle !== 'none' && p.type !== 'drunk') { applyIdle(tgt, idle); if (holdIdle) H.hold = { kind: idle, hand: idle === 'makeup' ? 'L' : 'B' }; }
      // 浅く座り直す（降りる駅に着く直前）
      const rem = p.dest - SW.nextStation(g);
      if (!p.sleep && rem <= 0 && g.phase === 'travel' && SW.C.T_TRAVEL - g.phaseT < 4.5 && !p.feintNow) { tgt.lean = 0.3; tgt.kneeL = tgt.kneeR = 1.75; tgt.hp = Math.min(tgt.hp, 0); }
      // そわそわ（何回も掲示板を見た人）
      if (!p.sleep && p.looks && p.looks.filter((t) => g.t - t < 25).length >= 2) { tgt.kneeL += Math.max(0, Math.sin(now * 15 + p.id)) * 0.14; if (anim === 'none' && !p.feintNow) tgt.hy += Math.sin(now * 0.9 + p.id) * 0.35; }
      // ハッと起きて、うしろの窓の外（駅名）を見る
      if (!p.sleep && p.expr === 'sleepy' && p.exprT > 0) { tgt.hy = Math.sin(now * 1.4 + p.id) * 1.15; tgt.hp = -0.08; }
      if (p.role === 'hog' && p.hogKind !== 'bag') { tgt.splay = 0.5; tgt.lean = -0.22; tgt.shLz = 0.9; tgt.shLx = -0.2; tgt.elL = -0.3; }
      if (p.role === 'emperor') { tgt.splay = 0.35; tgt.lean = -0.18; tgt.shLz = 0.5; tgt.shRz = -0.5; }
    } else if (st === 'walk' || st === 'exit') {
      const ph = p.walkPhase;
      tgt.hipL = Math.sin(ph) * 0.45; tgt.hipR = -Math.sin(ph) * 0.45;
      tgt.kneeL = Math.max(0, Math.sin(ph + 1.6)) * 0.7; tgt.kneeR = Math.max(0, -Math.sin(ph + 1.6)) * 0.7;
      tgt.shLx = -Math.sin(ph) * 0.35; tgt.shRx = Math.sin(ph) * 0.35; tgt.elL = tgt.elR = -0.35;
      tgt.lean = p.speed > 2 ? 0.2 : 0.06; tgt.yOff = Math.abs(Math.sin(ph)) * 0.02;
    } else if (st === 'ko') {
      tgt.rootTilt = -Math.PI / 2; tgt.yOff = 0.13; tgt.shLz = -1.3; tgt.shRz = 1.3; tgt.hr = 0.4;
    } else if (st === 'fight' && (ch || p.bfs || p.brute)) {
      const fs = p.bfs || (ch ? ch.fstate : 'idle'), ft = p.bfs ? (p.bft || 0) : ch ? ch.ft : 0;
      tgt.shLx = tgt.shRx = -1.1; tgt.elL = tgt.elR = -2.05; tgt.lean = 0.08; tgt.hipL = -0.25; tgt.kneeL = 0.35; tgt.hipR = 0.15;
      if (fs === 'windup') { tgt.shRx = -0.15; tgt.shRz = 0.55; tgt.elR = -2.3; tgt.lean = -0.12; }
      if (fs === 'recover' && ft > 0.4) { tgt.shRx = -1.55; tgt.shRz = 0; tgt.elR = -0.1; tgt.lean = 0.22; }
      if (p.stunned > 0) tgt.lean = -0.3;
      faceRy = p.ry;
    } else {
      // 立っている
      const sway = Math.sin(now * 1.3 + p.id) * 0.02;
      tgt.lean = sway;
      const slot = p.slot >= 0 ? g.slots[p.slot] : null;
      if (p.leaving) faceRy = (g.phase === 'stop' ? g.doorSide : (p.z >= 0 ? 1 : -1)) > 0 ? 0 : Math.PI;
      else if (slot && slot.kind === 'front') faceRy = slot.z > 0 ? 0 : Math.PI;
      else if (slot && slot.kind === 'mid') faceRy = p.id % 2 ? 0 : Math.PI;
      else if (slot && slot.kind === 'door') faceRy = slot.side > 0 ? Math.PI : 0;
      else if (p.targetPlayer && pl.seat >= 0) { const s = g.seats[pl.seat]; faceRy = s.side > 0 ? 0 : Math.PI; }
      if (p.role === 'victim') { tgt.shLx = tgt.shRx = -0.35; tgt.elL = tgt.elR = -1.9; tgt.shLz = 0.25; tgt.shRz = -0.25; tgt.hp = 0.35; tgt.lean = -0.04; }
      else if (p.role === 'chikan' && ch && ch.stage !== 'fight') { // 絡み屋：相手のほうを向いて、指をさしながら話しかける
        const v = g.people.find((q) => q.id === ch.victimId); if (v) faceRy = Math.atan2(v.x - p.x, v.z - p.z);
        tgt.lean = 0.12; tgt.shRx = -1.35; tgt.shRz = 0.1; tgt.elR = -0.25 + Math.sin(now * 5 + p.id) * 0.3; tgt.hp = -0.05; tgt.hr = Math.sin(now * 2 + p.id) * 0.15; }
      else if (H.strap && anim === 'none' && idle !== 'map' && idle !== 'game') { tgt.shRx = -2.85; tgt.shRz = 0.12; tgt.elR = -0.25; if (idle === 'phone' || idle === 'book') { tgt.shLx = -0.45; tgt.elL = -1.65; tgt.hp = 0.4; H.hold = { kind: idle, hand: 'L' }; } }
      else if (anim === 'none') { applyIdle(tgt, idle); if (HOLD_KINDS[idle] && p.type !== 'drunk') H.hold = { kind: idle, hand: idle === 'makeup' ? 'L' : 'B' }; }
      if (p.priority && p.targetPlayer) { tgt.lean = 0.12; tgt.hp = 0.15; }
      if (anim === 'reach') { tgt.shRx = -0.75; tgt.shRz = 0.25; tgt.elR = -0.25; tgt.lean = 0.14; tgt.hp = 0.35; tgt.hy = 0.25; faceRy = p.ry; }
      if (p.role === 'thief' && p.pickT > 0) { tgt.lean = 0.55; tgt.hp = 0.5; tgt.shRx = tgt.shLx = -0.9; tgt.elR = tgt.elL = -0.3; tgt.hipL = tgt.hipR = -0.3; tgt.kneeL = tgt.kneeR = 0.5; }
      if (p.type === 'elderly' && !H.strap) tgt.lean += 0.12;
    }
    if (st === 'walk' || st === 'exit' || st === 'stand') { /* 向きはそのまま */ }
    // 掲示板チラ見・時計
    if (!seated || !p.sleep) {
      if (anim === 'board' && st !== 'ko') {
        const side = seated ? -Math.sign(p.z || 1) : (faceRy === 0 ? 1 : -1);
        let bx = SW.DOORS[0]; for (const d of SW.DOORS) if (Math.abs(d - p.x) < Math.abs(bx - p.x)) bx = d;
        const dx = bx - p.x, dz = side * 1.42 - p.z, dy = 2.05 - (seated ? 1.15 : h * 0.93);
        const yaw = angDiff(H.ry, Math.atan2(dx, dz));
        tgt.hy = Math.max(-1.3, Math.min(1.3, yaw)); tgt.hp = -Math.atan2(dy, Math.hypot(dx, dz)); tgt.hr = 0;
        H.lookUp = true;
      } else H.lookUp = false;
      if (anim === 'watch') { tgt.shLx = -0.75; tgt.shLz = 0.45; tgt.elL = -1.75; tgt.hp = 0.55; tgt.hy = -0.35; }
    }
    // 怒り・にらむ人はプレイヤーを見る
    if ((p.expr === 'angry' || p.expr === 'glare' || p.bubble) && st !== 'ko' && !p.sleep && anim !== 'board' && !(p.role === 'chikan' && ch && ch.stage !== 'fight')) { // 絡み屋は相手を見たまま
      const yaw = angDiff(H.ry, Math.atan2(pl.x - p.x, pl.z - p.z));
      if (Math.abs(yaw) < 1.6) { tgt.hy = yaw * 0.8; tgt.hp = 0; }
    }
    if (H.costume) costumePose(H, p, tgt, now, g);
    // 補間
    const k = Math.min(1, dt * (st === 'fight' || H.flipFast ? 14 : 7));
    for (const key in tgt) A[key] = lerp(A[key], tgt[key], key === 'rootTilt' ? Math.min(1, dt * 4) : k);
    H.ry += angDiff(H.ry, faceRy) * Math.min(1, dt * (st === 'walk' || st === 'exit' || st === 'fight' ? 10 : 4));
    // 反映
    H.root.position.set(p.x, A.yOff, p.z);
    H.root.rotation.set(A.rootTilt, H.ry, 0, 'YXZ');
    H.pelvis.position.y = A.pelvisY;
    H.legL.hp.position.y = H.legR.hp.position.y = A.pelvisY;
    H.torso.rotation.x = A.lean;
    H.head.rotation.set(A.hp, A.hy, A.hr, 'YXZ');
    H.armL.sh.rotation.set(A.shLx, 0, A.shLz); H.armL.el.rotation.x = A.elL;
    H.armR.sh.rotation.set(A.shRx, 0, A.shRz); H.armR.el.rotation.x = A.elR;
    H.legL.hp.rotation.set(A.hipL, 0, -A.splay, 'YXZ'); H.legL.kn.rotation.x = A.kneeL;
    H.legR.hp.rotation.set(A.hipR, 0, A.splay, 'YXZ'); H.legR.kn.rotation.x = A.kneeR;
    placeHeld(H, seated);
    // 持ち物
    if (H.bag) {
      if (seated) H.bag.position.set(0, H.bagUp ? 0.64 : 0.6, H.bagUp ? 0.26 : 0.22), H.bag.rotation.set(0, 0, 0);
      else H.bag.position.set(-h * 0.13, h * 0.47, 0.02), H.bag.rotation.set(0, Math.PI / 2, 0);
    }
    if (H.crutch) H.crutch.position.set(h * 0.17, 0.6, 0.12);
    if (H.suitcase) { if (seated) H.suitcase.position.set(0, 0.28, 0.75); else H.suitcase.position.set(h * 0.2, 0.28, 0.1); }
    if (H.costume) costumeAfter(H, p);
  }
  // 手に持つ物（スマホ・単語帳・ゲーム機・鏡）と、荷物をまとめるときの膝のかばん。必要になったときに作る
  const HOLD_KINDS = { phone: 1, book: 1, game: 1, makeup: 1 };
  const _hv1 = new T3.Vector3(), _hv2 = new T3.Vector3();
  function heldMesh(H, kind) {
    H.props = H.props || {};
    if (H.props[kind]) return H.props[kind];
    const g = new T3.Group(), dark = lam('#1d1f26');
    if (kind === 'phone') { g.add(new T3.Mesh(box(0.075, 0.14, 0.012), dark)); const sc = new T3.Mesh(box(0.064, 0.122, 0.002), new T3.MeshBasicMaterial({ color: '#8fd3ff' })); sc.position.z = 0.007; g.add(sc); }
    else if (kind === 'book') { const cols = ['#d6453d', '#2f6fb8', '#f2c230', '#3c9a5f']; g.add(new T3.Mesh(box(0.11, 0.16, 0.035), lam(cols[H.p.id % 4]))); const pg = new T3.Mesh(box(0.1, 0.15, 0.002), lam('#fafafa')); pg.position.z = 0.019; g.add(pg); }
    else if (kind === 'game') { g.add(new T3.Mesh(box(0.19, 0.085, 0.022), lam('#3a3d48'))); const sc = new T3.Mesh(box(0.09, 0.06, 0.002), new T3.MeshBasicMaterial({ color: '#b9f5a8' })); sc.position.z = 0.012; g.add(sc); for (const [x, c] of [[-0.07, '#e04848'], [0.07, '#4878e0']]) { const b = new T3.Mesh(box(0.02, 0.02, 0.006), lam(c)); b.position.set(x, 0, 0.013); g.add(b); } }
    else if (kind === 'makeup') { const m = new T3.Mesh(new T3.CylinderGeometry(0.05, 0.05, 0.012, 16), lam('#e8b7c8')); m.rotation.x = Math.PI / 2; g.add(m); const gl = new T3.Mesh(new T3.CircleGeometry(0.043, 16), new T3.MeshBasicMaterial({ color: '#dff1ff' })); gl.position.z = 0.007; g.add(gl); }
    else if (kind === 'lapbag') { g.add(new T3.Mesh(box(0.3, 0.22, 0.09), lam(['#5b3a26', '#222', '#6b6f7a', '#7a2f3a'][H.p.id % 4]))); const hd = new T3.Mesh(new T3.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), lam('#222')); hd.position.y = 0.11; g.add(hd); }
    g.visible = false; H.root.add(g); H.props[kind] = g;
    return g;
  }
  function placeHeld(H, seated) {
    if (H.props) for (const k in H.props) H.props[k].visible = false;
    if (H.bagUp && seated && !H.bag) { const b = heldMesh(H, 'lapbag'); b.visible = true; b.position.set(0, 0.64, 0.26); b.rotation.set(0, 0, 0); }
    const hd = H.hold; if (!hd) return;
    const m = heldMesh(H, hd.kind);
    H.root.updateMatrixWorld(true);
    if (hd.hand === 'B') { H.armL.hand.getWorldPosition(_hv1); H.armR.hand.getWorldPosition(_hv2); _hv1.add(_hv2).multiplyScalar(0.5); }
    else (hd.hand === 'L' ? H.armL : H.armR).hand.getWorldPosition(_hv1);
    H.root.worldToLocal(_hv1);
    m.position.copy(_hv1); m.position.z += 0.02;
    m.rotation.set(hd.kind === 'game' ? -1.0 : hd.kind === 'makeup' ? 0.2 : -0.75, hd.kind === 'makeup' ? Math.PI : 0, 0); // 鏡は自分の顔に向ける
    m.scale.setScalar((hd.scale || 1) * (hd.kind === 'makeup' ? 1.4 : 1));
    m.visible = true;
  }
  function applyIdle(t, idle) {
    if (idle === 'phone' || idle === 'book' || idle === 'game') { t.shLx = -0.45; t.elL = -1.7; t.shRx = -0.45; t.elR = -1.7; t.shLz = 0.15; t.shRz = -0.15; t.hp = idle === 'game' ? 0.55 : 0.42; }
    else if (idle === 'map') { t.shLx = t.shRx = -0.65; t.elL = t.elR = -1.3; t.shLz = -0.15; t.shRz = 0.15; t.hp = 0.3; }
    else if (idle === 'call') { t.shRx = -0.55; t.shRz = 0.45; t.elR = -2.45; t.hy = -0.2; t.hr = 0.12; }
    else if (idle === 'makeup') { t.shRx = -0.95; t.shRz = 0.15; t.elR = -2.35; t.shLx = -0.6; t.elL = -1.55; t.hp = 0.08; }
  }

  // 表情
  function faceState(H, g, now) {
    const p = H.p, pl = g.player;
    let expr = p.expr;
    if (expr === 'neutral') {
      if (p.sleep && p.state === 'seated') expr = 'sleep';
      else if (p.type === 'yankee' || p.type === 'henchman' || p.type === 'emperor') expr = 'glare';
      else if (p.type === 'sick' && p.role !== 'faked') expr = 'sick';
      else if (p.role === 'caller') expr = 'happy';
      else if (p.priority && p.targetPlayer && pl.seat >= 0) expr = 'worried';
      else if (p.type === 'drunk') expr = 'sleepy';
    }
    const blink = p.blink < 0 && expr !== 'sleep';
    let lx = 0, ly = 0;
    if (H.lookUp) { ly = -1; lx = 0; }
    else if (expr === 'shifty') { lx = Math.sin(now * 4 + p.id) > 0 ? 1 : -1; }
    else if (p.idle === 'phone' || p.idle === 'book' || p.idle === 'game' || p.anim === 'watch') ly = 0.8;
    else { lx = Math.round(Math.sin(now * 0.3 + p.id * 1.7) * 1.2) * 0.6; }
    const key = expr + (blink ? 'b' : '') + lx + ',' + ly;
    if (key !== H.faceKey) { H.faceKey = key; drawFace(H, expr, blink, lx, ly); }
  }

  // ================================================================ 世界の同期
  const humans = new Map();
  const itemMeshes = new Map();
  const ITEM_GEO = {
    wallet: [box(0.11, 0.025, 0.08), '#6b3f22'], phone: [box(0.075, 0.012, 0.15), '#111'], pass: [box(0.09, 0.006, 0.06), '#3ba0e0'],
    hanky: [box(0.14, 0.01, 0.14), '#f39ac0'], teeth: [new T3.TorusGeometry(0.045, 0.018, 6, 12, Math.PI), '#f5f0e8'], scroll: [new T3.CylinderGeometry(0.03, 0.03, 0.2, 10), '#d9c08a'],
  };
  function makeItemMesh(key) {
    const [geo, col] = ITEM_GEO[key] || ITEM_GEO.wallet;
    const g = new T3.Group();
    const m = new T3.Mesh(geo, lam(col)); g.add(m);
    if (key === 'teeth') { m.rotation.x = -Math.PI / 2; const gum = new T3.Mesh(new T3.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), lam('#e57a8a')); gum.rotation.x = -Math.PI / 2; gum.position.y = 0.012; g.add(gum); }
    if (key === 'scroll') m.rotation.z = Math.PI / 2;
    if (key === 'phone') { const sc = new T3.Mesh(new T3.PlaneGeometry(0.065, 0.13), new T3.MeshBasicMaterial({ color: '#5ab0ff' })); sc.rotation.x = -Math.PI / 2; sc.position.y = 0.007; g.add(sc); }
    const sp = makeSpriteText('✨', { bg: 'rgba(0,0,0,0)', fg: '#ffe680', noTail: true }); sp.scale.set(0.5, 0.125, 1); sp.position.y = 0.18; g.add(sp); g.userData.spark = sp;
    return g;
  }
  // 駅員と駆け込み客（ホーム）
  function fakePerson(id, opts) {
    return Object.assign({ id, type: 'staff', female: 0, h: 1.72, x: 0, z: 0, ry: 0, state: 'stand', look: { top: '#1d2b4f', bottom: '#1d2b4f', skin: '#e8b88f', hair: '#1d1612', hairStyle: 'short', glasses: false, mask: false, bag: false, tie: '#8a2a2a', topName: '紺' }, expr: 'neutral', blink: 1, idle: 'none', anim: 'none', sleep: 0, slot: -1, walkPhase: 0, speed: 1 }, opts || {});
  }
  const staffH = buildHuman(fakePerson(-1));
  { const cap = new T3.Mesh(new T3.CylinderGeometry(1.05, 1.08, 0.5, 16), lam('#1d2b4f')); cap.position.y = 0.75; staffH.headMesh.add(cap); const bill = new T3.Mesh(box(1.6, 0.08, 0.9), lam('#111')); bill.position.set(0, 0.55, 0.7); staffH.headMesh.add(bill); }
  staffH.root.visible = false;
  const runnerH = buildHuman(fakePerson(-2, { look: { top: '#2f5fae', bottom: '#1b1b1d', skin: '#f1c9a5', hair: '#2b2018', hairStyle: 'side', tie: '#2a3f8a', bag: true, topName: '青' }, state: 'walk', speed: 3 }));
  runnerH.root.visible = false;

  // 一人称の手
  const hands = new T3.Group(); camera.add(hands);
  const handSkin = lam('#efc39b'), sleeve = lam('#3a3f4a');
  function mkFPArm(sx) {
    const g = new T3.Group();
    const sl = new T3.Mesh(UCAP, sleeve); sl.scale.set(0.09, 0.2, 0.09); sl.rotation.x = Math.PI / 2; sl.position.z = 0.15; g.add(sl);
    const fist = new T3.Mesh(USPH, handSkin); fist.scale.set(0.05, 0.045, 0.055); fist.position.z = -0.06; g.add(fist);
    g.position.set(sx * 0.22, -0.3, -0.45); hands.add(g);
    return g;
  }
  const fpR = mkFPArm(1), fpL = mkFPArm(-1);
  let fpItem = null, fpItemKey = '';

  // ビーム
  const beams = [];
  function addBeam(from, to) {
    const dir = new T3.Vector3().subVectors(to, from); const len = dir.length();
    const m = new T3.Mesh(new T3.CylinderGeometry(0.03, 0.06, len, 8, 1, true), new T3.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), dir.normalize());
    scene.add(m); beams.push({ m, t: 0.6 });
  }

  // 列車の速度と景色
  const VMAX = 14;
  let trainPos = 0, lastSignStation = -1;
  function trainSpeed(g) {
    if (g.phase !== 'travel') return 0;
    const t = g.phaseT, T = SW.C.T_TRAVEL;
    if (t < 6) return VMAX * t / 6;
    if (t > T - 6) return VMAX * (T - t) / 6;
    return VMAX;
  }
  function updateWorld(g, dt, now) {
    // 乗客
    const alive = new Set();
    for (const p of g.people) {
      alive.add(p.id);
      let H = humans.get(p.id);
      if (H && H.costume !== costumeOf(p)) { disposeHuman(H); humans.delete(p.id); H = null; } // 衣装が変わった（忍者を見破った など）
      if (!H) { H = buildHuman(p); H.ry = p.ry; humans.set(p.id, H); }
      H.p = p;
      poseHuman(H, g, dt, now);
      const d = Math.hypot(p.x - g.player.x, p.z - g.player.z);
      if (d < 11) faceState(H, g, now);
      // 吹き出し
      const btxt = p.bubble && d < 10 ? p.bubble : '';
      if (btxt !== H.bubbleKey) {
        H.bubbleKey = btxt;
        if (H.bubble) { scene.remove(H.bubble); H.bubble.material.map.dispose(); H.bubble.material.dispose(); H.bubble = null; }
        if (btxt) { H.bubble = makeSpriteText(btxt); scene.add(H.bubble); }
      }
      const hy = SW._internal.headY(p);
      if (H.bubble) H.bubble.position.set(p.x, hy + 0.32, p.z);
      // メガネのラベル
      let ltxt = '';
      if (g.player.buffs.glasses > 0 && p.state !== 'ko' && d < 12) {
        const rem = p.dest - SW.nextStation(g);
        if (p.undercover) ltxt = '👮 変装した駅員';
        else if (p.sleep && p.oversleep) ltxt = '💤 寝過ごしそう…';
        else if (p.state === 'exit' || p.leaving) ltxt = '🚪 降りる';
        else ltxt = rem <= 0 ? '次で降りる！' : 'あと' + (rem + 1) + '駅';
        if (p.type === 'alien') ltxt = '👽 宇宙人';
        if (p.role === 'suri') ltxt = '🕵 スリ';
        if (p.fake && p.role !== 'faked') ltxt = '🤥 仮病';
      }
      if (ltxt !== H.labelKey) {
        H.labelKey = ltxt;
        if (H.label) { scene.remove(H.label); H.label.material.map.dispose(); H.label.material.dispose(); H.label = null; }
        if (ltxt) {
          const rem = p.dest - SW.nextStation(g);
          const col = rem <= 0 ? '#ff4d4d' : rem === 1 ? '#ff9f2e' : rem === 2 ? '#e6c229' : '#5aa9ff';
          H.label = makeSpriteText(ltxt, { bg: col, fg: '#fff', noTail: true }); H.label.scale.set(0.5, 0.125, 1); scene.add(H.label);
        }
      }
      if (H.label) H.label.position.set(p.x, hy + (H.bubble ? 0.5 : 0.3), p.z);
    }
    for (const [id, H] of humans) if (!alive.has(id)) { disposeHuman(H); humans.delete(id); }
    // 落とし物
    const ids = new Set();
    for (const it of g.items) {
      ids.add(it.id);
      let m = itemMeshes.get(it.id);
      if (!m) { m = makeItemMesh(it.key); scene.add(m); itemMeshes.set(it.id, m); }
      m.position.set(it.x, 0.02, it.z); m.rotation.y = it.id;
      m.userData.spark.material.opacity = 0.5 + 0.5 * Math.sin(now * 5);
    }
    for (const [id, m] of itemMeshes) if (!ids.has(id)) { scene.remove(m); itemMeshes.delete(id); }
    // 空席
    const pulse = 0.25 + 0.2 * Math.sin(now * 6);
    glowMat.opacity = pulse;
    g.seats.forEach((s, i) => {
      seatGlow[i].visible = s.occ < 0 && s.res < 0 && g.player.seat !== s.id;
      // 席に置かれたかばん（2 人分使う人）
      const q = s.hog ? SW.person(g, s.hog) : null, bag = s.hog && (s.hogBag != null ? s.hogBag : q && q.hogKind === 'bag');
      if (bag && !hogBags[i]) { const m = new T3.Mesh(box(0.34, 0.26, 0.2), lam('#8a3b5c')); m.position.set(s.x, 0.62, s.z * 0.97); m.rotation.y = 0.2; const h = new T3.Mesh(new T3.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), lam('#5a2238')); h.position.y = 0.13; m.add(h); scene.add(m); hogBags[i] = m; }
      if (!bag && hogBags[i]) { scene.remove(hogBags[i]); hogBags[i] = null; }
    });
    // 迷惑YouTuberのスピーカー
    const sp = g.speaker;
    if (sp && sp.on && !speakerM) {
      speakerM = new T3.Group();
      const bodyM = new T3.Mesh(box(0.26, 0.4, 0.22), lam('#1c1c22')); bodyM.position.y = 0.2; speakerM.add(bodyM);
      for (const [y, r] of [[0.28, 0.07], [0.12, 0.05]]) { const c = new T3.Mesh(new T3.CircleGeometry(r, 16), lam('#55555e')); c.position.set(0, y, 0.111); speakerM.add(c); }
      const led = new T3.Mesh(box(0.2, 0.02, 0.005), new T3.MeshBasicMaterial({ color: '#ff3fd2' })); led.position.set(0, 0.38, 0.112); speakerM.add(led); speakerM.userData.led = led;
      const nt = makeSpriteText('♪ ♫ ♪', { bg: 'rgba(0,0,0,0)', fg: '#ff7ee0', noTail: true }); nt.scale.set(0.6, 0.15, 1); nt.position.y = 0.62; speakerM.add(nt); speakerM.userData.notes = nt;
      scene.add(speakerM);
    }
    if (speakerM && (!sp || !sp.on)) { scene.remove(speakerM); speakerM = null; }
    if (speakerM) {
      speakerM.position.set(sp.x, 0, sp.z); speakerM.rotation.y = Math.atan2(g.player.x - sp.x, g.player.z - sp.z);
      if (sp.broken) { speakerM.rotation.z = 0.5; speakerM.userData.notes.visible = false; speakerM.userData.led.material.color.set('#333'); speakerM.position.y = -0.04; }
      else {
        const bt = Math.floor(now / 0.42);
        speakerM.scale.setScalar(1 + (bt % 2 ? 0.04 : 0));
        speakerM.userData.notes.position.y = 0.62 + (now % 0.84) * 0.15;
        const d = Math.hypot(sp.x - g.player.x, sp.z - g.player.z);
        if (bt !== lastBeat && d < 6 && !g.over) { lastBeat = bt; const v = 0.14 * (1 - d / 6); if (bt % 2 === 0) tone(70, 0.12, 'sine', v * 1.6, 0, 40); else noise(0.05, 7000, v * 0.5, 'highpass'); if (bt % 4 === 1) tone([330, 392, 440, 523][(bt >> 2) % 4], 0.18, 'square', v * 0.35); }
      }
    }
    for (let k = flyBags.length - 1; k >= 0; k--) {
      const f = flyBags[k]; f.t += dt; f.v.y -= 9.8 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt * 9; f.m.rotation.z += dt * 6;
      if (f.m.position.y < 0.12) { f.m.position.y = 0.12; f.v.set(0, 0, 0); }
      if (f.t > 2.5) { scene.remove(f.m); flyBags.splice(k, 1); }
    }
    // ドア
    for (const d of doors) {
      const want = g.doorsOpen && d.side === g.doorSide ? 1 : 0;
      d.open += (want - d.open) * Math.min(1, dt * 5);
      for (const pp of d.pair) pp.mesh.position.x = pp.base + pp.dir * 0.62 * d.open;
    }
    // 景色
    const v = trainSpeed(g);
    trainPos += v * dt;
    for (const L of outsideLayers) {
      const sgn = L.s > 0 ? -1 : 1;
      L.far.material.map.offset.x = sgn * trainPos * 0.0016;
      L.near.material.map.offset.x = sgn * trainPos * 0.075;
    }
    // ホーム
    const T = SW.C.T_TRAVEL;
    let px = null, pside = g.doorSide;
    if (g.phase === 'stop') px = 0;
    else if (g.phaseT > T - 6) { px = VMAX * Math.pow(T - g.phaseT, 2) / 12; pside = g.nextDoorSide || 1; }
    else if (g.phaseT < 6) px = -VMAX * g.phaseT * g.phaseT / 12;
    if (px != null && Math.abs(px) < 70) {
      platform.visible = true; platform.position.x = px; platform.rotation.y = pside > 0 ? 0 : Math.PI;
      const sti = g.phase === 'stop' || g.phaseT < 6 ? g.station : g.station + 1;
      if (sti !== lastSignStation) {
        lastSignStation = sti;
        const kana = sti < SW.LINE.length ? SW.LINE[sti].kana : '';
        drawStationSign(SW.stationName(g, sti), kana, sti > 0 ? SW.stationName(g, sti - 1) : '', sti < SW.lastStation(g) ? SW.stationName(g, sti + 1) : '終点');
      }
      for (const L of outsideLayers) L.near.visible = L.s !== pside;
    } else { platform.visible = false; for (const L of outsideLayers) L.near.visible = true; }
    // 駅員（停車中のホーム）
    const showStaff = g.phase === 'stop' && g.station > 0;
    staffH.root.visible = showStaff;
    if (showStaff) { staffH.p.x = (function () { let b = SW.DOORS[0]; for (const d of SW.DOORS) if (Math.abs(d - g.player.x) < Math.abs(b - g.player.x)) b = d; return b + 0.9; })(); staffH.p.z = g.doorSide * 2.3; staffH.p.ry = g.doorSide > 0 ? Math.PI : 0; staffH.p.state = 'stand'; poseHuman(staffH, g, dt, now); faceState(staffH, g, now); }
    // 駆け込み客
    const R = g.runner;
    runnerH.root.visible = !!(R && R.active && g.phase === 'stop' && !R.held);
    if (runnerH.root.visible) {
      const rp = runnerH.p; const t = g.phaseT - SW.C.CLOSE_WARN;
      rp.x = R.door + Math.max(0, 7 - t * 4.5); rp.z = g.doorSide * 2.0; rp.ry = -Math.PI / 2; rp.state = 'walk'; rp.walkPhase = now * 14; rp.speed = 3;
      rp.expr = 'panic'; rp.bubble = null; poseHuman(runnerH, g, dt, now); faceState(runnerH, g, now);
    }
    // 吊り革の揺れ
    const sw = Math.sin(now * 1.7) * 0.08 * (v / VMAX) + lurchKick * 0.5;
    for (const s of straps) s.rotation.z = sw;
    updateAvatars(g, dt, now);
    updateSelfFig(g, dt, now);
    // ビーム
    for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t -= dt; b.m.material.opacity = Math.max(0, b.t / 0.6); b.m.rotation.y += dt * 20; if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); beams.splice(i, 1); } }
  }
  let lurchKick = 0, shakeAmt = 0, bobT = 0;

  // ================================================================ 音
  const AU = { ctx: null, master: null, rumbleGain: null, nextThump: 0, on: profile.sound !== false };
  function initAudio() {
    if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C(); AU.ctx = ctx;
      AU.master = ctx.createGain(); AU.master.gain.value = AU.on ? 0.6 : 0; AU.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      AU.noise = buf;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      AU.rumbleGain = ctx.createGain(); AU.rumbleGain.gain.value = 0;
      src.connect(lp); lp.connect(AU.rumbleGain); AU.rumbleGain.connect(AU.master); src.start();
    } catch (e) { AU.ctx = null; }
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    const ctx = AU.ctx; if (!ctx || !AU.on) return;
    const t0 = ctx.currentTime + (when || 0) + (AU.tOff || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AU.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, vol, type, when) {
    const ctx = AU.ctx; if (!ctx || !AU.on || !AU.noise) return;
    const t0 = ctx.currentTime + (when || 0) + (AU.tOff || 0);
    const s = ctx.createBufferSource(); s.buffer = AU.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 1000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(AU.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  // 心臓の音（ドクン・ドクン）：体力 15 未満で鳴る
  function heartbeat() { tone(75, 0.3, 'sine', 0.35, 0, 40); tone(62, 0.3, 'sine', 0.25, 0.18, 35); }
  function sfx(name) {
    if (window.__sfxLog) window.__sfxLog.push([performance.now() / 1000, name]); // 宣伝動画用の記録
    switch (name) {
      case 'coin': tone(988, 0.08, 'square', 0.12); tone(1319, 0.25, 'square', 0.12, 0.07); break;
      case 'hit': noise(0.15, 600, 0.7, 'lowpass'); tone(110, 0.15, 'sine', 0.5, 0, 50); break;
      case 'whoosh': noise(0.12, 2500, 0.15, 'highpass'); break;
      case 'block': tone(1400, 0.06, 'triangle', 0.2); noise(0.08, 3000, 0.2); break;
      case 'ko': tone(500, 0.6, 'sawtooth', 0.15, 0, 80); break;
      case 'beam': tone(300, 0.5, 'sine', 0.2, 0, 1800); tone(310, 0.5, 'triangle', 0.1, 0, 1500); break;
      case 'buzzer': tone(160, 0.5, 'square', 0.15); break;
      case 'drink': for (let i = 0; i < 5; i++) tone(500 + i * 120, 0.06, 'sine', 0.15, i * 0.05); break;
      case 'sit': tone(140, 0.12, 'sine', 0.3, 0, 70); break;
      case 'push': noise(0.2, 400, 0.5, 'lowpass'); break;
      case 'pick': tone(660, 0.07, 'triangle', 0.15); tone(880, 0.1, 'triangle', 0.15, 0.06); break;
      case 'drop': tone(1200, 0.05, 'triangle', 0.08); tone(900, 0.05, 'triangle', 0.08, 0.05); break;
      case 'door': noise(0.6, 900, 0.18, 'bandpass'); tone(120, 0.15, 'sine', 0.2, 0.5); break;
      case 'chime': [784, 659, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, i * 0.16)); break;
      case 'arrive': tone(880, 0.35, 'sine', 0.14); tone(698, 0.6, 'sine', 0.14, 0.32); break;
      case 'brake': noise(1.6, 2600, 0.06, 'bandpass'); tone(2400, 1.4, 'sine', 0.02, 0, 1800); break;
      case 'depart': tone(80, 1.2, 'sawtooth', 0.04, 0, 180); break;
      case 'warn': tone(1000, 0.08, 'square', 0.1); tone(1000, 0.08, 'square', 0.1, 0.14); break;
      case 'lurch': noise(0.3, 200, 0.9, 'lowpass'); tone(70, 0.3, 'sine', 0.5); break;
      case 'snore': tone(90, 0.6, 'sawtooth', 0.05, 0, 70); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.22)); break;
      case 'clear': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.1, i * 0.12)); break;
      case 'whistle': tone(2600, 0.25, 'sine', 0.15); tone(2600, 0.5, 'sine', 0.15, 0.3); break;
      case 'free': tone(520, 0.05, 'triangle', 0.06); break;
      case 'combo': tone(1568, 0.12, 'square', 0.08, 0.15); break;
    }
  }
  function updateAudio(g, dt) {
    if (!AU.ctx || !AU.rumbleGain) return;
    const v = g ? trainSpeed(g) / VMAX : 0;
    AU.rumbleGain.gain.value = AU.on ? 0.05 + 0.25 * v : 0;
    AU.nextThump -= dt * (0.3 + v);
    if (v > 0.15 && AU.nextThump <= 0) { AU.nextThump = 1.2; noise(0.09, 150, 0.35 * v, 'lowpass'); noise(0.09, 130, 0.3 * v, 'lowpass', 0.16); }
  }
  let speechOK = false;
  try { speechOK = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; } catch (e) { }
  function speak(text) {
    if (!speechOK || !AU.on) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 1.05; u.pitch = 1.1; u.volume = 0.6; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { }
  }

  // ================================================================ 入力
  const keys = {};
  const inp = { yaw: Math.PI / 2, pitch: 0, action: false, punch: false, bracePressed: false, braceTouch: false, fakeSleep: false, skill: -1, joyX: 0, joyY: 0 };
  let state = 'loading', G = null, demo = null, locked = false, noLock = false, endT = 0, pendingResult = false;
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    konami(e.code);
    if (state !== 'play') return;
    if (e.code === 'KeyE' || e.code === 'Enter') inp.action = true;
    if (e.code === 'KeyF') inp.punch = true;
    if (e.code === 'Space') { if (!e.repeat) inp.bracePressed = true; e.preventDefault(); }
    if (e.code === 'KeyQ') inp.fakeSleep = true;
    if (/^Digit[1-7]$/.test(e.code)) inp.skill = +e.code.slice(5) - 1;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!locked) pause(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });
  // マウス
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && state === 'play' && !isTouch && !noLock) pause();
  });
  document.addEventListener('pointerlockerror', () => { noLock = true; });
  let drag = null;
  canvas.addEventListener('mousedown', e => {
    if (isTouch || state !== 'play') return;
    initAudio();
    if (!locked && !noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { noLock = true; }); } catch (err) { noLock = true; } drag = { x: e.clientX, y: e.clientY, moved: 0, btn: e.button }; return; }
    if (locked) { if (e.button === 0) inp.action = true; else if (e.button === 2) inp.punch = true; return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0, btn: e.button };
  });
  window.addEventListener('mousemove', e => {
    if (state !== 'play') return;
    if (locked) { inp.yaw -= e.movementX * 0.0024; inp.pitch -= e.movementY * 0.0024; }
    else if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy); inp.yaw -= dx * 0.005; inp.pitch -= dy * 0.005; }
    inp.pitch = Math.max(-1.2, Math.min(1.2, inp.pitch));
  });
  window.addEventListener('mouseup', e => {
    if (drag && state === 'play' && !locked && drag.moved < 6) { if (drag.btn === 2) inp.punch = true; else if (noLock) inp.action = true; }
    drag = null;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // タッチ
  const joyEl = $('joy'), joyBase = $('joyBase'), joyKnob = $('joyKnob');
  let joyId = null, joyO = null, lookId = null, lookP = null;
  joyEl.addEventListener('touchstart', e => {
    initAudio();
    const t = e.changedTouches[0], q = tp(t); joyId = t.identifier; joyO = q;
    const H = pland ? window.innerWidth : window.innerHeight;
    joyBase.style.display = 'block'; joyBase.style.left = q.x + 'px'; joyBase.style.top = (q.y - (H - joyEl.offsetHeight)) + 'px';
    joyKnob.style.transform = ''; $('joyHint').style.display = 'none'; e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        const q = tp(t); let dx = q.x - joyO.x, dy = q.y - joyO.y; const l = Math.hypot(dx, dy), m = 48;
        if (l > m) { dx *= m / l; dy *= m / l; }
        inp.joyX = dx / m; inp.joyY = dy / m; joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === lookId) {
        const q = tp(t), dx = q.x - lookP.x, dy = q.y - lookP.y; lookP = q;
        inp.yaw -= dx * 0.0062; inp.pitch = Math.max(-1.2, Math.min(1.2, inp.pitch - dy * 0.0062));
      }
    }
    if (state === 'play') e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; inp.joyX = inp.joyY = 0; joyBase.style.display = 'none'; $('joyHint').style.display = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
  canvas.addEventListener('touchstart', e => {
    initAudio();
    if (state !== 'play') return;
    const t = e.changedTouches[0];
    if (lookId == null) { lookId = t.identifier; lookP = tp(t); }
    e.preventDefault();
  }, { passive: false });
  function holdBtn(el, down, up) {
    let tid = null;
    const release = () => { if (tid === null && !el.classList.contains('down')) return; tid = null; el.classList.remove('down'); up && up(); };
    el.addEventListener('touchstart', e => { initAudio(); tid = e.changedTouches[0].identifier; el.classList.add('down'); down(); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    el.addEventListener('touchend', e => { release(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchcancel', release);
    // 念のため：画面のどこで離しても、押していた指なら解除する
    const winEnd = (e) => { if (tid !== null && [...e.changedTouches].some((t) => t.identifier === tid)) release(); };
    window.addEventListener('touchend', winEnd); window.addEventListener('touchcancel', winEnd);
    el.addEventListener('mousedown', e => { down(); e.stopPropagation(); }); el.addEventListener('mouseup', () => { up && up(); });
  }
  holdBtn($('bAct'), () => { inp.action = true; });
  holdBtn($('bPunch'), () => { inp.punch = true; });
  holdBtn($('bGuard'), () => { inp.braceTouch = true; inp.bracePressed = true; }, () => { inp.braceTouch = false; });
  holdBtn($('bSleep'), () => { inp.fakeSleep = true; });

  // 隠しコマンド
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let kIdx = 0;
  function konami(code) {
    if (state !== 'title') return;
    kIdx = code === KONAMI[kIdx] ? kIdx + 1 : (code === KONAMI[0] ? 1 : 0);
    if (kIdx === KONAMI.length) { kIdx = 0; unlock('hard', '満員地獄モードが開放された！'); }
  }
  let logoTaps = 0, logoTimer = 0;
  $('logo').addEventListener('click', () => {
    logoTaps++; clearTimeout(logoTimer); logoTimer = setTimeout(() => logoTaps = 0, 1500);
    $('logo').style.transform = 'scale(' + (1 + logoTaps * 0.02) + ')';
    if (logoTaps >= 7) { logoTaps = 0; $('logo').style.transform = ''; unlock('jiji', '敬老の日モードが開放された！'); }
    // スワイプでの上下左右（スマホ用のコナミコマンド）
  });
  function unlock(k, msg) {
    if (!profile.unlock[k]) track('隠しモード開放：' + ({ endless: '終点なし', hard: '満員地獄', jiji: '敬老の日' }[k] || k));
    if (!profile.unlock[k]) { profile.unlock[k] = true; saveProfile(); }
    titleToast(msg); sfx('clear'); renderModes();
  }
  function titleToast(msg) { const el = document.createElement('div'); el.className = 'toast good'; el.textContent = msg; el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:60'; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
  // スマホ：タイトルでスワイプ上上下下左右左右→ロゴ2回タップ
  (function swipeKonami() {
    let sx = 0, sy = 0; const seq = [];
    window.addEventListener('touchstart', e => { if (state !== 'title') return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchend', e => {
      if (state !== 'title') return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      seq.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
      while (seq.length > 8) seq.shift();
      if (seq.join() === KONAMI.slice(0, 8).join()) { seq.length = 0; unlock('hard', '満員地獄モードが開放された！'); }
    }, { passive: true });
  })();

  // ================================================================ HUD
  const hud = { stam: -1, karma: -1, toku: -1, st: '', sub: '', prompt: '', target: '', skills: '', buffs: '' };
  // スキル：タップ（クリック）で使う／長押し（マウスを乗せる）で説明。はじめての 1 回は説明を出して、もう一回タップで使う
  const skillsEl = $('skills');
  const skTip = document.createElement('div'); skTip.id = 'skTip'; skTip.className = 'hidden'; skillsEl.appendChild(skTip);
  let skTipT = 0;
  const skBtns = []; // スキルのボタン（skillsEl.children は先頭が説明の吹き出しなので、ずれないようにこちらを使う）
  function showSkTip(i, first, ms) {
    const s = SW.SKILLS[i], cost = G ? SW.skillCost(G, i) : s.cost;
    skTip.innerHTML = `<b>${s.icon} ${s.name}</b>（${cost}徳）<br>${s.desc}` + (s.karma ? `<br><span class="k">⚠ 悪いこと：カルマ +${s.karma}</span>` : '') +
      `<small>${first ? '👆 もう一回タップで使う' : isTouch ? '長押しで説明・タップで使う' : 'クリック（または ' + (i + 1) + ' キー）で使う'}</small>`;
    skTip.classList.remove('hidden'); clearTimeout(skTipT); if (ms) skTipT = setTimeout(hideSkTip, ms);
  }
  function hideSkTip() { clearTimeout(skTipT); skTip.classList.add('hidden'); }
  SW.SKILLS.forEach((s, i) => {
    const b = document.createElement('button'); b.className = 'sk';
    b.innerHTML = `<kbd>${i + 1}</kbd>${s.icon}<small id="skc${i}">${s.cost}</small><div class="cd" id="skd${i}" style="height:0"></div>`;
    const use = () => { initAudio(); if (state === 'play') inp.skill = i; };
    let hold = 0, long = false;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); long = false; b.classList.add('down');
      clearTimeout(hold); hold = setTimeout(() => { long = true; showSkTip(i, false); }, 420);
    }, { passive: false });
    const end = (e) => {
      if (e) e.preventDefault(); clearTimeout(hold); b.classList.remove('down');
      if (long) { skTipT = setTimeout(hideSkTip, 1800); return; }
      profile.skSeen = profile.skSeen || {};
      if (!profile.skSeen[s.key]) { profile.skSeen[s.key] = 1; saveProfile(); showSkTip(i, true, 4000); return; } // はじめて：まず説明
      hideSkTip(); use();
    };
    b.addEventListener('touchend', end, { passive: false });
    b.addEventListener('touchcancel', () => { clearTimeout(hold); b.classList.remove('down'); hideSkTip(); });
    b.addEventListener('mouseenter', () => { if (!isTouch) showSkTip(i, false); });
    b.addEventListener('mouseleave', () => { if (!isTouch) hideSkTip(); });
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (!isTouch) use(); });
    skillsEl.appendChild(b); skBtns.push(b);
  });
  $('skillHelp').innerHTML = `<div class="small" style="color:var(--sub);margin:2px 0 4px">${isTouch ? 'スキルのボタンは<b>長押しで説明</b>・タップで使う' : 'スキルのボタンに<b>マウスを乗せると説明</b>・クリックか数字キーで使う'}</div>` + SW.SKILLS.map(s => `<div style="font-size:13px;margin:3px 0">${s.icon} <b>${s.name}</b>（${s.cost}徳）… ${s.desc}</div>`).join('');
  function addToast(text, kind) {
    const box = $('toasts');
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text; box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 2800);
  }
  let popN = 0;
  function addPop(html, cls) {
    const el = document.createElement('div'); el.className = 'pop ' + (cls || ''); el.innerHTML = html;
    el.style.top = ((popN++ % 3) * 30) + 'px'; $('pops').appendChild(el); setTimeout(() => el.remove(), 1850);
  }
  let warnT = 0, annT = 0, targetT = 0;
  const tgtV = new T3.Vector3();
  function placeTarget(g) {
    const el = $('target');
    const p = g.aim >= 0 && g.aim < SW.PID ? SW.person(g, g.aim) : null;
    if (!p || el.classList.contains('hidden')) { if (el.style.top) el.style.top = ''; return; }
    const H = $('hud').clientHeight || window.innerHeight;
    tgtV.set(p.x, SW._internal.headY(p) - 0.2, p.z).project(camera); // あごの少し下
    if (tgtV.z > 1) { el.style.top = ''; return; }
    let y = (1 - tgtV.y) / 2 * H + 4;
    y = Math.max(H / 2 + 22, Math.min(y, H - el.offsetHeight - (isTouch ? 150 : 100))); // 照準のすぐ下より上には出さない・下のボタンに重ねない
    el.style.top = Math.round(y) + 'px';
  }
  function updateHUD(g, dt) {
    const pl = g.player;
    const st = Math.ceil(pl.stamina);
    if (st !== hud.stam) { hud.stam = st; $('stamF').style.width = st + '%'; $('stamV').textContent = st; $('stamBar').classList.toggle('danger', st < 30); $('stamF').style.background = st < 30 ? 'linear-gradient(90deg,#b8261d,#ff5a4f)' : st < 50 ? 'linear-gradient(90deg,#c9971c,#f2c23a)' : ''; }
    const ka = Math.floor(pl.karma);
    const mi = Math.ceil(pl.mind == null ? 100 : pl.mind);
    if (mi !== hud.mind) { hud.mind = mi; $('mindF').style.width = mi + '%'; $('mindV').textContent = mi; $('mindBar').classList.toggle('danger', mi <= 25); }
    if (ka !== hud.karma) { hud.karma = ka; $('karmaF').style.width = ka + '%'; $('karmaV').textContent = ka; $('karmaBar').classList.toggle('danger', ka >= 75); }
    // スコア（集めた徳の合計。スキルを使っても減らない）と、スキルに使える徳を分けて出す
    const scoreNow = Math.max(0, pl.earned + g.stats.stations * 10 - Math.round(pl.karma));
    if (scoreNow !== hud.toku) { hud.toku = scoreNow; $('toku').textContent = scoreNow; }
    if (pl.toku !== hud.wallet) { hud.wallet = pl.toku; $('walletV').textContent = pl.toku; }
    $('combo').textContent = pl.combo > 1 && g.t - pl.lastDeedT < SW.C.COMBO_WINDOW ? '善行コンボ ×' + Math.min(2.5, 1 + 0.25 * (pl.combo - 1)).toFixed(2).replace(/0$/, '') + '（' + Math.ceil(SW.C.COMBO_WINDOW - (g.t - pl.lastDeedT)) + '秒）' : '';
    // 駅
    const last = SW.lastStation(g);
    const total = g.endless ? '∞' : last;
    let sName, sSub, prog;
    if (g.phase === 'travel') { sName = '次は ' + SW.stationName(g, g.station + 1); sSub = (g.station + 1) + ' / ' + total + ' 駅目' + (g.station + 1 === last ? '（終点）' : '') + '・出口 ' + ((g.nextDoorSide || 1) > 0 ? '右' : '左') + '側'; prog = g.phaseT / SW.C.T_TRAVEL; }
    else { sName = SW.stationName(g, g.station) + ' 停車中'; sSub = (g.doorsOpen ? 'ドアが開いています' : 'まもなく発車') + '（' + ((g.doorSide > 0) ? '右' : '左') + '側）'; prog = 1; }
    if (sName !== hud.st) { hud.st = sName; $('stName').textContent = sName; }
    if (sSub !== hud.sub) { hud.sub = sSub; $('stSub').textContent = sSub; }
    $('stProg').firstChild.style.width = (prog * 100).toFixed(1) + '%';
    // バフ
    const bl = [];
    for (const k in pl.buffs) { const s = SW.SKILLS.find(s => s.key === k); bl.push(s.icon + ' ' + Math.ceil(pl.buffs[k]) + '秒'); }
    if (pl.mode) bl.push((pl.mode === 'brainwash' ? '🌀' : '💪') + ' 照準中 ' + Math.ceil(pl.modeT) + '秒');
    // 落とし物の持ち主の表示
    // PC：画面の上のまん中に大きなカード。スマホ縦：右上のあいているところに小さなカード。スマホ横：左上の小さな表示
    {
      const it = pl.carrying, mini = isTouch && isPortrait();
      let html = '';
      if (it && (!isTouch || mini)) {
        const o = it.owner != null ? SW.person(g, it.owner) : null;
        const sw = o && o.look && o.look.top ? `<i style="background:${o.look.top}"></i>` : '';
        const gone = it.ownerGone || (it.owner != null && (!o || o.state === 'gone'));
        html = mini
          ? `<b>👜 ${esc(it.name)}</b>` + (gone ? '<span class="cw">持ち主は降りた→駅員へ</span>' : it.hint ? `<span>${sw}<em>${esc(it.hint)}</em></span>` + (it.ownerLeaving ? '<span class="cw">⚠ もうすぐ降りる！</span>' : '') : '')
          : `<b>👜 ${esc(it.name)}を持っている</b>` + (gone ? '<span class="cw">持ち主は降りた → 次の駅で、開いたドアの近くの駅員へ</span>'
            : it.hint ? `<span>持ち主：${sw}<em>${esc(it.hint)}</em></span>` + (it.ownerLeaving ? '<span class="cw">⚠ 持ち主がもうすぐ降りる！</span>' : '') : '');
      }
      const key = (mini ? 'm' : '') + html;
      if (key !== hud.carry) { hud.carry = key; $('carryCard').innerHTML = html; $('carryCard').classList.toggle('hidden', !html); $('carryCard').classList.toggle('mini', mini); }
      if (it && isTouch && !mini) {
        const o = it.owner != null ? SW.person(g, it.owner) : null;
        const gone = it.ownerGone || (it.owner != null && (!o || o.state === 'gone'));
        const sw = o && o.look && o.look.top ? `<i class="sw" style="background:${o.look.top}"></i>` : '';
        bl.push('👜 ' + esc(it.name) + (gone ? '→駅員へ' : it.hint ? '→' + sw + esc(it.hint) + (it.ownerLeaving ? '（降りそう！）' : '') : 'を持っている'));
      }
    }
    const bs = bl.join('|');
    if (bs !== hud.buffs) { hud.buffs = bs; $('buffs').innerHTML = bl.map(b => `<span class="buff">${b}</span>`).join(''); }
    // スキル
    SW.SKILLS.forEach((s, i) => {
      const cost = SW.skillCost(g, i);
      const el = skBtns[i];
      const on = !!pl.buffs[s.key] || pl.mode === s.key;
      const off = pl.toku < cost || (s.key === 'confess' && pl.confessCD > 0) || (s.key === 'drink' && SW.hasRule(g, 'nodrink'));
      const key = cost + (on ? 'o' : '') + (off ? 'x' : '');
      if (el.dataset.k !== key) { el.dataset.k = key; el.classList.toggle('on', on); el.classList.toggle('off', off && !on); $('skc' + i).textContent = cost; }
      if (s.key === 'confess') $('skd' + i).style.height = (pl.confessCD / 30 * 100) + '%';
      else if (s.dur && pl.buffs[s.key]) $('skd' + i).style.height = (pl.buffs[s.key] / s.dur * 100) + '%';
      else $('skd' + i).style.height = '0';
    });
    // プロンプト
    const pr = g.prompt;
    const ptxt = pr ? pr.label : '';
    if (ptxt !== hud.prompt) {
      hud.prompt = ptxt;
      $('prompt').classList.toggle('hidden', !ptxt || isTouch);
      $('prompt').innerHTML = ptxt ? `<kbd>${noLock ? 'E' : 'E/クリック'}</kbd>${ptxt}` : '';
      $('bActL').textContent = ptxt ? (ptxt.length > 7 ? ptxt.slice(0, 7) + '…' : ptxt) : 'アクション';
      $('bAct').classList.toggle('dim', !ptxt);
      if (isTouch && ptxt) { $('prompt').classList.remove('hidden'); $('prompt').textContent = '✋ ' + ptxt; }
    }
    $('bSleep').classList.toggle('hidden', pl.seat < 0);
    // ボタンの文字は変わったときだけ書きかえる（押している最中に中身を作り直すと、指を離したのが届かなくなる）
    const sleepH = pl.fakeSleep ? '<span style="font-size:18px">👀</span>起きる' : '<span style="font-size:18px">😪</span>狸寝入り';
    if (hud.sleepH !== sleepH) { hud.sleepH = sleepH; $('bSleep').innerHTML = sleepH; }
    const guardH = g.chikan && g.chikan.stage === 'fight' || g.people.some((p) => p.aggro) ? '<span>🛡</span>ガード' : '<span>🛡</span>踏ん張る';
    if (hud.guardH !== guardH) { hud.guardH = guardH; $('bGuard').innerHTML = guardH; }
    // 照準
    targetT -= dt;
    const cross = $('cross');
    cross.classList.toggle('aim', g.aim >= 0); cross.classList.toggle('mode', !!pl.mode);
    if (targetT <= 0) {
      targetT = 0.15;
      const p = g.aim >= 0 && g.aim < SW.PID ? SW.person(g, g.aim) : null;
      let html = '', o = null;
      if (!pl.fakeSleep) {
        if (RP.active) o = RP.obs;
        else if (MP.active && !MP.isHost) o = MP.myObs;
        else if (p) o = SW.observe(g, p);
        else if (g.multi && g.aim >= SW.PID) o = playerObs(g, g.aim - SW.PID);
      }
      if (o) html = `<h4>${esc(o.name)}</h4>` + o.notes.slice(0, 3).map(n => `<div>${esc(n)}</div>`).join('');
      if (html !== hud.target) { hud.target = html; $('target').innerHTML = html; $('target').classList.toggle('hidden', !html); }
    }
    // 様子カードは、照準を合わせた人の「あごの下」に出す（顔にかぶらず、目もあまり動かさずに読める）
    placeTarget(g);
    // 揺れ警告
    if (warnT > 0) { warnT -= dt; if (warnT <= 0) $('warn').classList.add('hidden'); }
    if (annT > 0) { annT -= dt; if (annT <= 0) $('ann').classList.add('hidden'); }
    // 画面効果
    $('hitFlash').style.opacity = Math.min(1, pl.hitFlash * 2.5);
    $('sleepFx').style.opacity = pl.fakeSleep ? 1 : 0;
    // 体力が減ってきたら画面のふち：50 未満は黄色（点滅なし）、30 未満は赤く点滅（減るほど速く）、15 未満は濃い赤＋心臓の音。立っているときだけ
    const sta = pl.stamina, standing = pl.seat < 0 && !g.over;
    let fx = 'none';
    if (standing && sta < 30) {
      const per = sta < 15 ? 0.5 : 1.0 - (30 - sta) / 15 * 0.35; // 1 秒〜0.65 秒、15 未満は 0.5 秒（1 秒に 2 回まで）
      const w = 0.5 + 0.5 * Math.sin(performance.now() / 1000 / per * TAU);
      fx = sta < 15 ? `inset 0 0 ${110 + 40 * w}px ${20 + 20 * w}px rgba(255,10,10,${(0.4 + 0.38 * w).toFixed(2)})`
        : `inset 0 0 ${70 + 50 * w}px ${4 + 22 * w}px rgba(255,30,30,${(0.25 + 0.37 * w).toFixed(2)})`;
    } else if (standing && sta < 50) fx = 'inset 0 0 90px 10px rgba(255,200,40,.45)';
    $('lowFx').style.boxShadow = fx;
    if (standing && sta < 15) {
      AU.hbT = (AU.hbT || 0) - dt;
      if (AU.hbT <= 0) { AU.hbT = 60 / (80 + (15 - sta) * 3); heartbeat(); }
    } else AU.hbT = 0;
  }
  function showAnn(text) { $('ann').textContent = '📢 ' + text; $('ann').classList.remove('hidden'); annT = 5; }

  // ================================================================ 出来事
  const tipsDone = {};
  function tip(key, text) {
    if (tipsDone[key] || (profile.plays || 0) >= 3 || TUT) return;
    tipsDone[key] = true;
    const box = $('toasts'); const el = document.createElement('div'); el.className = 'toast warn'; el.textContent = '💡 ' + text; box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }
  function tipsTick(g) {
    const pl = g.player;
    if (g.t > 3) tip('observe', '座っている人に照準を合わせると「様子」が見える。掲示板をチラ見する人は、降りるのが近い');
    if (g.t > 14 && pl.seat < 0) tip('stand', '立っていると体力が減る。降りそうな人の前で待ち、空いたらすぐアクションで座ろう');
    if (pl.toku >= 25) tip('shop', '徳がたまった！ スキルのボタンが使える（使ってもスコアは減らない。👓メガネで降りる駅が見える）');
    if (pl.seat >= 0 && SW._internal.priorityNear(g)) tip('give', '目の前に座りたそうな人が。譲ると徳が入る…けど、また立つことに。無視するとカルマ');
    if (pl.karma >= 40) tip('karma', 'カルマが100になると駅員に連行される。🙏懺悔か善行で減らそう');
  }
  function handleEvents(g) {
    tipsTick(g);
    for (const e of g.events) {
      if (e.type === 'seatFree') { const s = g.seats[e.id]; if (s && Math.hypot(s.x - g.player.x, s.fz - g.player.z) < 3.5 && g.player.seat < 0) tip('seat', '🟩 光っている席は空席！ 近づいてアクションで座れ'); }
      if (e.type === 'thiefSteal') tip('thief', '落とし物泥棒がいる！ キョロキョロしている人を探してパンチ。逃げたら追いかけてもう一発');
      if (e.type === 'chikan') tip('chikan', '困っている人のそばに絡み屋が。照準を合わせて見極めてからパンチ！ 間違えるとカルマ。非常通報ボタンでも助けられる');
      if (e.type === 'drop') tip('drop', '落とし物！ 拾って持ち主に届けよう。持ち主は「あれ？」と探しはじめる');
      switch (e.type) {
        case 'toast': addToast(e.text, e.kind); break;
        case 'points': if (e.amount >= 50 && G) addMoment(e.amount, e.text); addPop(`+${e.amount} 徳<small>${e.text}</small>`); if (e.combo > 1) { addToast('善行コンボ ×' + e.combo + '！', 'good'); sfx('combo'); } break;
        case 'mind': addPop(`${e.amount} 精神<small>${e.text}</small>`, 'm'); if (e.amount <= -8) shakeAmt = Math.max(shakeAmt, 0.3); break;
        case 'karma': if (e.amount > 0) addPop(`+${e.amount} カルマ<small>${e.text}</small>`, 'k'); else addPop(`${e.amount} カルマ<small>${e.text}</small>`, 'k'); break;
        case 'sfx': sfx(e.name); break;
        case 'shake': shakeAmt = Math.max(shakeAmt, e.amount); break;
        case 'lurchWarn': if (g.player.seat < 0) { $('warn').classList.remove('hidden'); $('warn').firstChild.textContent = '⚠ 揺れるぞ！'; $('warnSub').textContent = isTouch ? '🛡「踏ん張る」を押せ！' : '[Space] で踏ん張れ！'; warnT = 1.15; sfx('warn'); } break;
        case 'lurch': lurchKick = 1; sfx('lurch'); break;
        case 'brace': if (e.ok) addPop('踏ん張った！'); else addToast('よろけた！ 体力-7', 'bad'); $('warn').classList.add('hidden'); break;
        case 'chikan': addToast('…どこかで困っている人がいる？（絡まれているかも）', 'warn'); break;
        case 'bossResult': if (e.ok && G) addMoment(80 + e.tier * 60, '🏆 ボス駅「' + e.name + '」をクリア'); if (!RP.active && !(MP.active && !MP.isHost)) track('ボス駅：' + e.name + '：' + (e.ok ? 'クリア' : '失敗') + (G.modeName === 'bossrush' ? '（ラッシュ）' : '')); break;
        case 'thiefSteal': if (!G.__thiefTold) { G.__thiefTold = true; addToast('…だれかが落とし物をこっそり持っていった？（泥棒かも）', 'warn'); } break;
        case 'rare': { const p = SW.person(g, e.id); if (p) addToast(p.type === 'ceo' ? '金のネクタイの紳士が乗ってきた…' : '…なにか様子のおかしい乗客が乗ってきた', 'warn'); break; }
        case 'arrive': sfx('arrive'); showAnn(g.ann); speak(SW.stationName(g, g.station) + '、' + SW.stationName(g, g.station)); break;
        case 'announce': showAnn(e.text); if (/^次は/.test(e.text)) speak(e.text); break;
        case 'seatFree': { const s = g.seats[e.id]; if (s && Math.hypot(s.x - g.player.x, s.fz - g.player.z) < 3.5) sfx('free'); break; }
        case 'bagThrow': { const m = new T3.Mesh(box(0.34, 0.26, 0.2), lam('#8a3b5c')); m.position.set(e.x, 0.62, e.z); scene.add(m); flyBags.push({ m, t: 0, v: new T3.Vector3((Math.random() - 0.5) * 2.5, 3.2, -e.side * 2.2) }); shakeAmt = Math.max(shakeAmt, 0.5); addPop('ぶん投げた！', 'k'); break; }
        case 'speakerHit': addPop('バキッ！'); break;
        case 'crit': addPop('クリティカル！'); shakeAmt = Math.max(shakeAmt, 0.5); break;
        case 'suriSteal': { const p = SW.person(g, e.id); if (p && Math.hypot(p.x - g.player.x, p.z - g.player.z) < 3.5) sfx('pick'); break; }
        case 'counter': addPop('カウンター！'); shakeAmt = Math.max(shakeAmt, 0.6); break;
        case 'windup': sfx('warn'); if (Math.hypot((SW.person(g, e.id) || g.player).x - g.player.x, (SW.person(g, e.id) || g.player).z - g.player.z) < 2.5) { $('warn').classList.remove('hidden'); $('warn').firstChild.textContent = '👊 構えた！ '; $('warnSub').textContent = isTouch ? '今パンチでカウンター／🛡でガード' : '今 F でカウンター／Space でガード'; warnT = 0.6; } break;
        case 'guarded': addPop('ガードされた！', 'k'); break;
        case 'beam': { const p = SW.person(g, e.id); if (p) addBeam(camera.getWorldPosition(new T3.Vector3()).add(new T3.Vector3(0, -0.15, 0)), new T3.Vector3(p.x, SW._internal.headY(p), p.z)); break; }
        case 'sit': case 'stand': inp.yaw = g.player.yaw; inp.pitch = 0; break;
        case 'skill': { const s = SW.SKILLS.find(s => s.key === e.key); addToast(s.icon + ' ' + s.name + '！', 'good'); break; }
        case 'clear': sfx('clear'); break;
        case 'gameover': sfx(e.cause === 'arrest' ? 'whistle' : 'over'); break;
      }
    }
    g.events.length = 0;
  }

  // ================================================================ カメラ
  let eyeH = 1.6;
  function updateCamera(g, dt, now) {
    const pl = g.player;
    const v = trainSpeed(g) / VMAX;
    eyeH = lerp(eyeH, pl.seat >= 0 ? SW.C.EYE_SIT : SW.C.EYE_STAND, Math.min(1, dt * 6));
    let y = eyeH, roll = Math.sin(now * 1.1) * 0.006 * v;
    const moving = pl.seat < 0 && (Math.abs(inp.joyX) + Math.abs(inp.joyY) > 0.1 || keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || keys.ArrowUp || keys.ArrowDown);
    if (moving) { bobT += dt * 9; y += Math.sin(bobT) * 0.025; }
    lurchKick = Math.max(0, lurchKick - dt * 2.5);
    shakeAmt = Math.max(0, shakeAmt - dt * 3);
    let ox = lurchKick * 0.18 * Math.sin(now * 30) + (Math.random() - 0.5) * shakeAmt * 0.08;
    let oy = (Math.random() - 0.5) * shakeAmt * 0.06;
    roll += lurchKick * 0.05 + (pl.stagger > 0 ? Math.sin(now * 12) * 0.03 : 0);
    let yaw = pl.yaw, pitch = pl.pitch;
    if (g.coop && MP.active && g.players[MP.me] && g.players[MP.me].down) { y = 0.45; roll = 0.5; pitch = Math.min(pitch, 0.1); } // 共闘で倒れているあいだは床から
    if (g.over) {
      endT += dt;
      const c = g.result.cause;
      if (c === 'collapse' || c === 'ko') { y = lerp(eyeH, 0.32, Math.min(1, endT * 1.5)); roll = Math.min(1.3, endT * 1.6); pitch = c === 'ko' ? Math.min(1.1, endT) : pitch; }
      if (c === 'arrest') { pitch = lerp(pitch, -0.2, Math.min(1, endT)); }
    }
    camera.position.set(pl.x + ox, y + oy, pl.z);
    camera.rotation.set(pitch, yaw, roll);
    if (tpvOn()) { tpvCamera(g, dt); fpR.visible = fpL.visible = false; return; }
    // 手
    const guard = pl.seat < 0 && (pl.braceHeld) && !g.over;
    const pa = pl.punchAnim > 0 ? 1 - pl.punchAnim / 0.3 : 0;
    fpR.visible = !!(pl.seat < 0 && !g.over && (guard || pa > 0 || (g.chikan && g.chikan.stage === 'fight')));
    if (pa > 0) fpR.position.set(0.12, -0.2, -0.45 - Math.sin(pa * Math.PI) * 0.35);
    else if (guard || (g.chikan && g.chikan.stage === 'fight')) fpR.position.set(0.14, -0.17, -0.36);
    fpL.visible = !!((guard || pl.carrying || (g.chikan && g.chikan.stage === 'fight' && pl.seat < 0)) && !g.over);
    if (pl.carrying) {
      fpL.position.set(-0.24, -0.27, -0.45);
      if (fpItemKey !== pl.carrying.key) { if (fpItem) fpL.remove(fpItem); fpItem = makeItemMesh(pl.carrying.key); fpItem.remove(fpItem.userData.spark); fpItem.scale.setScalar(1.3); fpItem.position.set(0, 0.04, -0.08); fpItem.rotation.set(0.6, 0.3, 0); fpL.add(fpItem); fpItemKey = pl.carrying.key; }
    } else { if (fpItem) { fpL.remove(fpItem); fpItem = null; fpItemKey = ''; } fpL.position.set(-0.14, -0.17, -0.36); }
    sleeve.color.set(pl.buffs.protein ? '#c0392b' : '#3a3f4a');
  }

  // ================================================================ 画面
  const screens = ['title', 'modes', 'howto', 'rank', 'ach', 'stat', 'videos', 'namegacha', 'tutask', 'pause', 'result', 'online', 'mpres'];
  let backTo = 'title';
  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { show(backTo); }));
  // ---- 名前ガチャ（デストロイ碁と同じしくみ）：「〇〇の」＋「△△」＋2けたの数字。名前はゲームが組み合わせて作る
  // たまにレアな言葉が出て、片方なら金色（レア・およそ 4%）、両方なら虹色（伝説・およそ 0.04%）。色は言葉で決まるので、ほかの人の画面でも同じ
  const NAME_A = ['立ちっぱの', '寝不足の', '満員の', '始発の', '終電の', '各停の', '快速の', 'ねむい', '通勤中の', '腰痛の', '吊り革の', '優先席の', '急ぎの', 'ほろ酔いの',
    '月曜の', '金曜の', '週末の', '雨の日の', 'はらぺこの', '謎の', '静かな', 'のんびり', 'せっかちな', '寝過ごし', '見極めの', '徳の高い', '窓際の', '網棚の', '早起きの', '定時の',
    '残業の', '遅延の', '乗換の', '終点の', '揺れる', '踏ん張る', '狸寝入り', 'やさしい', 'こわもての', '迷子の', '眼鏡の', '無口な', '腹ぺこの', 'まったり', '期待の'];
  const NAME_B = ['乗客', 'リーマン', 'OL', '学生', '車掌', '駅員', '吊り革', '網棚', '座席', 'ドア', '急行', '各駅', '定期券', '改札', 'ホーム', '始発', '終電', '車両',
    '侍', '忍者', '勇者', '魔王', 'おばちゃん', 'ヤンキー', '紳士', '旅人', '番長', '探偵', '聖人'];
  // 動物（顔アイコンがその動物になる）はレア寄り：およそ 33 回に 1 回
  const NAME_ANIMAL = ['タヌキ', '狸', 'ペンギン', 'ハト', 'カラス', 'ネコ', 'パンダ', 'ゴリラ', 'ロボ'];
  const ANIMAL_P = 0.03;
  const RARE_A = ['神座りの', '覇王の', '幻の', '永遠の', '銀河の', '光速の', '伝説の', '帝王の'];
  const RARE_B = ['帝王', '座席王', '座り神', '終着駅', '銀河鉄道', '予言者', '吊革王', '大聖人'];
  const rareP = () => 0.02;
  const pickW = (a) => a[Math.floor(Math.random() * a.length)];
  // 動物は「顔」ごとに同じ確率にする（「タヌキ」と「狸」はどちらもタヌキの顔なので、2 つで 1 種類ぶん）
  const pickAnimal = () => { const w = pickW(NAME_ANIMAL.filter((x) => x !== '狸')); return w === 'タヌキ' && Math.random() < 0.5 ? '狸' : w; };
  function pickB() { const r = Math.random(); return r < rareP() ? pickW(RARE_B) : r < rareP() + ANIMAL_P ? pickAnimal() : pickW(NAME_B); }
  function makeName() {
    for (let i = 0; i < 50; i++) {
      const n = `${Math.random() < rareP() ? pickW(RARE_A) : pickW(NAME_A)}${pickB()}${Math.floor(10 + Math.random() * 90)}`;
      if (n.length <= 12) return n; // ランキングの名前は 12 文字まで
    }
    return '立ちっぱの' + pickW(NAME_B.filter((w) => w.length <= 5)) + Math.floor(10 + Math.random() * 90);
  }
  // 名前は自分で入れられない（ガチャの組み合わせだけ）。組み合わせになっていない名前（前に自分で入れた名前など）は使わない
  // 「ROBIT」「開発」入りは開発者の端末だけ（データベースの決まりで止めている）
  const NAME_A_ALL = NAME_A.concat(RARE_A), NAME_B_ALL = NAME_B.concat(RARE_B, NAME_ANIMAL);
  function validName(n) {
    n = String(n || ''); if (/ROBIT|開発/.test(n)) return true;
    const m = n.match(/^(.+?)(\d{2})$/); if (!m) return false;
    return NAME_A_ALL.some((a) => m[1].startsWith(a) && NAME_B_ALL.includes(m[1].slice(a.length)));
  }
  // 組み合わせでない名前（前に自分で入れた名前・空）は「名無しの乗客」と出す（顔もみんな同じ。ガチャで変えればよい）
  const dispName = (n) => (validName(n) ? String(n) : '名無しの乗客');
  // 0：ふつう、1：レア（金色）、2：伝説（虹色）
  const nameRank = (n) => (RARE_A.some((w) => String(n).startsWith(w)) ? 1 : 0) + (RARE_B.some((w) => String(n).includes(w)) ? 1 : 0);
  // ---------------------------------------------------------------- 顔アイコン（名前から決まる 12×12 のドット絵。同じ名前ならいつも同じ顔）
  // 動物の名前（「〇〇のタヌキ」など）は、その動物の顔にする。目は 4,6 と 7,6 にそろえて、メガネや寝てる目も重ねられるように
  const AV_ANIMALS = ['タヌキ', '狸', 'ペンギン', 'ハト', 'カラス', 'ネコ', 'パンダ', 'ゴリラ', 'ロボ'];
  function drawAnimal(px, R, a, eyeForce) {
    const dark = '#1a1a1a', eyes = (col = dark) => { px(col, 4, 6); px(col, 7, 6); };
    const head = (col) => { px(col, 3, 3, 6, 8); px(col, 2, 4, 8, 6); };
    if (a === 'タヌキ') {
      const f = ['#8a6a48', '#9a7650', '#7a5c40'][R(3)];
      px(f, 2, 2, 2, 2); px(f, 8, 2, 2, 2); px('#3a2a20', 3, 3); px('#3a2a20', 8, 3); head(f);
      px('#3a2a20', 2, 5, 4, 3); px('#3a2a20', 6, 5, 4, 3); px('#f0e0c8', 4, 8, 4, 3); px('#f0e0c8', 3, 9, 6, 1);
      px('#fff', 4, 6); px('#fff', 7, 6); px(dark, 5, 8, 2, 1); px(dark, 5, 10, 2, 1);
    } else if (a === 'ネコ') {
      const f = ['#e8963a', '#9a9a9a', '#3a3a3a', '#f2f2f2', '#c8a070'][R(5)], ear = f === '#3a3a3a' ? '#f08aa0' : '#f0a0b0';
      px(f, 2, 1, 2, 3); px(f, 8, 1, 2, 3); px(ear, 3, 2); px(ear, 8, 2); head(f);
      if (R(2)) { px('#00000033', 5, 3, 2, 2); }
      px('#b8e05a', 3, 6, 2, 1); px('#b8e05a', 7, 6, 2, 1); px(dark, 4, 6); px(dark, 7, 6);
      px('#f08aa0', 5, 8, 2, 1); px(dark, 5, 9); px(dark, 6, 9);
      px('#cfcfcf', 0, 8, 2, 1); px('#cfcfcf', 10, 8, 2, 1); px('#cfcfcf', 0, 9, 2, 1); px('#cfcfcf', 10, 9, 2, 1);
    } else if (a === 'パンダ') {
      px(dark, 1, 2, 3, 3); px(dark, 8, 2, 3, 3); head('#f4f4f4');
      px(dark, 3, 5, 2, 3); px(dark, 7, 5, 2, 3); px('#fff', 4, 6); px('#fff', 7, 6);
      px(dark, 5, 8, 2, 1); px(dark, 5, 9, 1, 1); px(dark, 6, 9, 1, 1); px(dark, 4, 10, 1, 1); px(dark, 7, 10, 1, 1);
      if (R(3) === 0) { px('#f0a0b0', 3, 9); px('#f0a0b0', 8, 9); }
    } else if (a === 'ゴリラ') {
      const f = ['#3a3a3a', '#4a4040', '#2e2e34'][R(3)];
      px(f, 3, 2, 6, 1); head(f); px(f, 1, 5, 1, 3); px(f, 10, 5, 1, 3);
      px('#7a6458', 3, 5, 6, 6); px('#7a6458', 2, 7, 8, 3); px('#2a2222', 3, 5, 6, 1);
      px('#fff', 4, 6); px('#fff', 7, 6); px(dark, 4, 6); px(dark, 7, 6);
      px('#3a2a2a', 5, 7, 2, 1); px(dark, 4, 8); px(dark, 7, 8); px('#3a2a2a', 4, 9, 4, 1);
    } else if (a === 'ペンギン') {
      head('#22262e'); px('#22262e', 4, 2, 4, 1); px('#fff', 3, 5, 6, 6); px('#fff', 4, 4, 1, 1); px('#fff', 7, 4, 1, 1);
      eyes(); px('#f2a03a', 5, 7, 2, 2); px('#f2a03a', 4, 8, 4, 1);
      if (R(3) === 0) { px('#f08aa0', 3, 8); px('#f08aa0', 8, 8); }
    } else if (a === 'ハト') {
      const f = ['#9aa0aa', '#b0b4bc', '#7a808a'][R(3)];
      head(f); px(f, 4, 2, 4, 1); px('#5a9a7a', 2, 9, 8, 2); px('#8a5aa0', 3, 10, 6, 1);
      px('#f2902a', 3, 6, 2, 1); px('#f2902a', 7, 6, 2, 1); px(dark, 4, 6); px(dark, 7, 6);
      px('#eee', 5, 7, 2, 1); px('#3a3a3a', 5, 8, 2, 1);
    } else if (a === 'カラス') {
      head('#16181e'); px('#16181e', 4, 2, 4, 1); px('#2a3048', 3, 3, 2, 1);
      px('#fff', 4, 6); px('#fff', 7, 6); px(dark, 4, 6); px(dark, 7, 6); px('#fff', 3, 5); px('#fff', 8, 5);
      px('#3a3e48', 4, 7, 4, 2); px('#3a3e48', 5, 9, 2, 1); px('#5a5e68', 4, 7, 4, 1);
    } else { // ロボ
      const f = a === 'ROBIT' ? '#d0a040' : ['#a8b0bc', '#c8ccd4', '#8a94a4', '#d0a040'][R(4)]; // 開発者は金色のロボ
      px('#555', 5, 1, 2, 2); px('#ff4a4a', 5, 0, 2, 1); px(f, 2, 3, 8, 8); px('#606a78', 1, 5, 1, 3); px('#606a78', 10, 5, 1, 3);
      px('#2a2e38', 3, 5, 6, 3); px('#5affe0', 4, 6); px('#5affe0', 7, 6);
      px('#2a2e38', 4, 9, 4, 1); px('#c8ccd4', 5, 9); px('#c8ccd4', 7, 9);
    }
    // 名前で決まる目（眼鏡の・狸寝入りなど）を上から重ねる
    if (eyeForce === 3) { px('#e8e8e8', 3, 5, 3, 3); px('#e8e8e8', 6, 5, 3, 3); px('#88a', 4, 6); px('#88a', 7, 6); px(dark, 4, 6); px(dark, 7, 6); }
    else if (eyeForce === 2) { // 寝てる目：まぶたの線だけ
      const mask = a === 'パンダ' ? dark : a === 'タヌキ' ? '#3a2a20' : null;
      if (mask) { px(mask, 3, 5, 2, 3); px(mask, 7, 5, 2, 3); px('#fff', 3, 7, 2, 1); px('#fff', 7, 7, 2, 1); }
      else { const lid = a === 'カラス' ? '#fff' : a === 'ロボ' ? '#2a8a7a' : dark; px(lid, 3, 6, 2, 1); px(lid, 7, 6, 2, 1); }
    }
  }
  const AV_CACHE = new Map();
  function avHash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function avatarUrl(name) {
    name = String(name || '名無しの乗客');
    if (AV_CACHE.has(name)) return AV_CACHE.get(name);
    let h = avHash(name);
    const R = (n) => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h % n; };
    const BG = ['#3d5a80', '#4a6b52', '#6b4a6b', '#7a5c3a', '#3a6b6b', '#5c4a7a', '#7a3d3d', '#4f5d6b'];
    const SKIN = ['#f5d0b0', '#e8b896', '#d29b72', '#a8714a', '#f0c8a0'];
    const HAIR = ['#2b2321', '#4a3426', '#7a5230', '#c9a227', '#9a9a9a', '#b8433a', '#3a4a8a', '#e8e8e8'];
    const SHIRT = ['#2f3b52', '#d8d8d8', '#8a2f2f', '#2f6b4a', '#c98a2f', '#5a3f7a', '#3f6fa8'];
    const cv = document.createElement('canvas'); cv.width = cv.height = 12;
    const c = cv.getContext('2d');
    const px = (col, x, y, w = 1, hh = 1) => { c.fillStyle = col; c.fillRect(x, y, w, hh); };
    const rank = nameRank(name);
    px(rank === 2 ? '#2a1f4a' : rank === 1 ? '#6b5a1a' : BG[R(BG.length)], 0, 0, 12, 12);
    const base = name.replace(/\d+$/, ''), dark = '#1a1a1a';
    const animal = /ROBIT/.test(base) ? 'ROBIT' : AV_ANIMALS.find((w) => base.endsWith(w));
    const eyeForce = /^眼鏡の/.test(base) ? 3 : /^(狸寝入り|寝不足の|ねむい|寝過ごし)/.test(base) ? 2 : -1;
    if (animal) drawAnimal(px, R, animal === '狸' ? 'タヌキ' : animal, eyeForce);
    else {
      const skin = SKIN[R(SKIN.length)], hair = HAIR[R(HAIR.length)], shirt = SHIRT[R(SHIRT.length)];
      // 服と首
      px(shirt, 2, 11, 8, 1); px(shirt, 1, 11, 1, 1); px(shirt, 10, 11, 1, 1); px(skin, 5, 11, 2, 1);
      if (R(3) === 0) px('#c03030', 5, 11, 2, 1); // ネクタイ
      // 顔
      px(skin, 3, 3, 6, 8); px(skin, 2, 4, 8, 6);
      // 髪型
      const hs = R(7);
      if (hs === 0) { px(hair, 3, 2, 6, 1); px(hair, 2, 3, 8, 1); px(hair, 2, 4, 1, 1); px(hair, 9, 4, 1, 1); } // 短髪
      else if (hs === 1) { px(hair, 3, 2, 6, 1); px(hair, 2, 3, 8, 1); px(hair, 3, 1, 1, 1); px(hair, 5, 1, 1, 1); px(hair, 7, 1, 1, 1); px(hair, 8, 1, 1, 1); } // ツンツン
      else if (hs === 2) { px(hair, 3, 2, 6, 1); px(hair, 2, 3, 8, 1); px(hair, 1, 4, 2, 6); px(hair, 9, 4, 2, 6); } // ロング
      else if (hs === 3) { px(hair, 2, 4, 1, 2); px(hair, 9, 4, 1, 2); } // つるつる
      else if (hs === 4) { const cap = SHIRT[R(SHIRT.length)]; px(cap, 3, 1, 6, 2); px(cap, 2, 3, 9, 1); px(hair, 2, 4, 1, 1); } // 帽子
      else if (hs === 5) { px(hair, 3, 1, 6, 1); px(hair, 2, 2, 8, 1); px(hair, 1, 3, 10, 1); px(hair, 1, 4, 1, 3); px(hair, 10, 4, 1, 3); } // もじゃもじゃ
      else { px(hair, 5, 0, 2, 4); } // モヒカン
      // 目
      let ey = R(6); const dark = '#1a1a1a';
      if (eyeForce >= 0) ey = eyeForce;
      if (ey === 0 || ey === 1) { px(dark, 4, 6, 1, 1); px(dark, 7, 6, 1, 1); } // 点の目
      else if (ey === 2) { px(dark, 3, 6, 2, 1); px(dark, 7, 6, 2, 1); } // 寝てる目（狸寝入り）
      else if (ey === 3) { px('#d8d8d8', 3, 5, 3, 3); px('#d8d8d8', 7, 5, 3, 3); px(skin, 4, 6, 1, 1); px(skin, 8, 6, 1, 1); px(dark, 4, 6, 1, 1); px(dark, 8, 6, 1, 1); px('#d8d8d8', 6, 6, 1, 1); } // メガネ
      else if (ey === 4) { px(dark, 3, 6, 6, 1); px(dark, 3, 5, 2, 1); px(dark, 7, 5, 2, 1); } // サングラス
      else { px('#fff', 3, 6, 2, 1); px('#fff', 7, 6, 2, 1); px(dark, 4, 6, 1, 1); px(dark, 7, 6, 1, 1); } // 大きい目
      if (R(3) === 0) { px(dark, 3, 4, 2, 1); px(dark, 7, 4, 2, 1); } // 太まゆ
      // 口・マスク・ひげ
      const mo = R(10);
      if (mo < 2) { px('#f2f2f2', 3, 8, 6, 3); px('#cfcfcf', 2, 8, 1, 1); px('#cfcfcf', 9, 8, 1, 1); } // マスク
      else {
        if (mo === 2) { px(dark, 4, 8, 1, 1); px(dark, 7, 8, 1, 1); px(dark, 5, 9, 2, 1); } // にっこり
        else if (mo === 3) { px('#8a2a2a', 5, 8, 2, 2); } // ぽかん
        else if (mo === 4) { px(dark, 4, 9, 4, 1); px('#fff', 5, 9, 2, 1); } // にやり
        else if (mo === 5) { px(dark, 5, 9, 2, 1); px(dark, 4, 10, 1, 1); px(dark, 7, 10, 1, 1); } // へ の字
        else px(dark, 5, 9, 2, 1); // ふつう
        if (R(5) === 0) px(hair === '#e8e8e8' ? '#bbb' : hair, 4, 8, 4, 1); // ひげ
        if (R(4) === 0) { px('#f08a8a', 3, 8, 1, 1); px('#f08a8a', 8, 8, 1, 1); } // ほっぺ
      }
    }
    // レアは王冠
    if (rank) { px('#ffd23f', 3, 0, 6, 1); px('#ffd23f', 3, 1, 1, 1); px('#ffd23f', 5, 1, 2, 1); px('#ffd23f', 8, 1, 1, 1); if (rank === 2) { px('#ff5a8a', 5, 0, 2, 1); } }
    const url = cv.toDataURL();
    AV_CACHE.set(name, url);
    return url;
  }
  const avHtml = (n, cls = '') => { const r = nameRank(n); return `<img class="av ${r === 2 ? 'av2' : r === 1 ? 'av1' : ''} ${cls}" src="${avatarUrl(n)}" alt="">`; };
  const nameHtml = (n, noAv) => { const r = nameRank(n); return `${noAv ? '' : avHtml(n)}<span class="${/ROBIT/.test(n) ? 'nm-dev' : r === 2 ? 'nm-legend' : r === 1 ? 'nm-rare' : ''}"${r ? ` title="${r === 2 ? '伝説の名前' : 'レアな名前'}"` : ''}>${esc(n)}</span>`; };
  // 引き直しは 1 日 3 回（Lv20 からは 5 回）。気に入った名前（顔アイコンも名前で決まる）は 3 つまで「キープ」でき、いつでも戻せる（回数は使わない）
  const KEEP_MAX = 3;
  const isAnimalName = (n) => NAME_ANIMAL.some((w) => String(n).replace(/\d+$/, '').endsWith(w));
  const special = (n) => nameRank(n) > 0 || isAnimalName(n);
  const nameRolls = () => (SW.levelOf(profile.xp || 0).lv >= 20 ? 5 : 3);
  function rollsLeft() { const v = profile.nameRolls; return v && v.d === todayKey() ? Math.max(0, nameRolls() - v.n) : nameRolls(); }
  // ランキングのごほうびの「名前ガチャチケット」（profile.nameTickets）。その日の回数を使い切ったあとに使う
  const ticketsLeft = () => Math.max(0, profile.nameTickets || 0);
  const canRoll = () => rollsLeft() + ticketsLeft() > 0;
  function useRoll() {
    if (rollsLeft() > 0) { profile.nameRolls = { d: todayKey(), n: nameRolls() - rollsLeft() + 1 }; return; }
    if (ticketsLeft() > 0) { profile.nameTickets = ticketsLeft() - 1; track('名前ガチャチケットを使った'); }
  }
  const keepList = () => { const k = (profile.nameKeep || []).filter(Boolean); if (k.length > KEEP_MAX) { k.sort((x, y) => nameRank(y) - nameRank(x)); k.length = KEEP_MAX; profile.nameKeep = k; } return k; };
  const isKept = (n) => keepList().includes(n);
  function keepName(n) { // 空きがあればキープ。できたら true
    if (!n) return false; const k = keepList();
    if (k.includes(n)) return true;
    if (k.length >= KEEP_MAX) return false;
    k.push(n); profile.nameKeep = k; saveProfile(); return true;
  }
  function unkeepName(n) { profile.nameKeep = keepList().filter((x) => x !== n); saveProfile(); }
  if ((profile.nameKeep || []).some((n) => !validName(n))) profile.nameKeep = profile.nameKeep.filter(validName);
  keepList();
  // 名前がない人・前に自分で入れた名前の人には、ガチャで 1 つ引いておく（ランキングの名前も次に送るときに変わる）
  if (!validName(profile.name)) { profile.name = makeName(); profile.nameFix = 1; saveProfile(); }
  function showName() {
    $('nameShow').innerHTML = nameHtml(profile.name || '名無しの乗客');
    $('nameIn').value = profile.name || '';
    if ($('olNameShow')) $('olNameShow').innerHTML = nameHtml(profile.name || '名無しの乗客');
    if ($('olName')) $('olName').value = profile.name || '';
  }
  function renderNameGacha() {
    const left = rollsLeft(), keep = keepList(), kept = keep.includes(profile.name);
    $('ngName').innerHTML = avHtml(profile.name, 'avbig') + '<div>' + nameHtml(profile.name, 1) + '</div>'
      + `<button class="ngpin ${kept ? 'on' : ''}" id="ngPin" ${!kept && keep.length >= KEEP_MAX ? 'disabled' : ''}>${kept ? '📌 キープ中' : keep.length >= KEEP_MAX ? 'キープ枠がいっぱい' : '📌 この名前をキープ'}</button>`;
    const tk = ticketsLeft();
    $('ngRoll').disabled = !left && !tk; $('ngRoll').textContent = left ? '🎲 名前を引き直す（今日あと ' + left + ' 回' + (tk ? '＋🎟' + tk + '枚' : '') + '）' : tk ? '🎟 チケットで引き直す（あと ' + tk + ' 枚）' : '🎲 明日また引けます';
    $('ngNote').textContent = !left && !tk ? '' : kept ? '今の名前はキープしてあるので、いつでも戻せます' : 'キープしていない今の名前は、引き直すと消えます';
    let h = `<div class="small" style="width:100%;color:var(--sub)">キープ ${keep.length}/${KEEP_MAX}（押すとその名前と顔にする・✕ で外す）</div>`;
    for (let i = 0; i < KEEP_MAX; i++) {
      const n = keep[i];
      h += n ? `<div class="ngslot ${n === profile.name ? 'cur' : ''}"><button data-keep="${i}">${nameHtml(n)}${n === profile.name ? ' <span class="pill">使用中</span>' : ''}</button><button class="x" data-unkeep="${i}" title="キープから外す">✕</button></div>`
        : '<div class="ngslot empty">（あき）</div>';
    }
    $('ngKeep').innerHTML = h;
  }
  function setName(n) { profile.name = n; profile.nameFix = 0; saveProfile(); showName(); syncName(); }
  function fixName() { if (profile.nameFix) setName(profile.name); } // ランキングに載っている前の名前も、ガチャの名前に変える
  $('bName').addEventListener('click', () => { backTo = 'title'; renderNameGacha(); show('namegacha'); track('名前ガチャを開いた'); });
  $('ngName').addEventListener('click', (e) => {
    if (!e.target.closest('#ngPin')) return;
    if (isKept(profile.name)) unkeepName(profile.name); else keepName(profile.name);
    renderNameGacha();
  });
  $('ngRoll').addEventListener('click', () => {
    if (!canRoll()) return;
    if (special(profile.name) && !isKept(profile.name) && !confirm('今の名前「' + profile.name + '」はキープしていません。引き直すと消えますが、いいですか？')) return;
    useRoll();
    const n = makeName(); setName(n);
    const r = nameRank(n), an = isAnimalName(n);
    let kept = false; if (r || an) kept = keepName(n);
    renderNameGacha();
    const tail = (r || an) ? (kept ? '（自動でキープしました）' : '（キープ枠がいっぱい。残すならどれかを外してキープしてね）') : '';
    if (r === 2) { addToast('🌈 伝説の名前！「' + n + '」 虹色に光ります' + tail, 'good'); sfx('clear'); }
    else if (r === 1) { addToast('✨ レアな名前！「' + n + '」 金色に光ります' + tail, 'good'); sfx('combo'); }
    else if (an) { addToast('🐾 動物の名前！「' + n + '」 顔も動物になります' + tail, 'good'); sfx('combo'); }
    else sfx('coin');
    track(r ? ['', '名前ガチャで金色の名前', '名前ガチャで虹色の名前'][r] : an ? '名前ガチャで動物の名前' : '名前ガチャを引いた（ふつう）');
  });
  $('ngKeep').addEventListener('click', (e) => {
    const keep = keepList();
    const x = e.target.closest('[data-unkeep]');
    if (x) { const n = keep[+x.dataset.unkeep]; if (n && (n === profile.name || confirm('「' + n + '」をキープから外しますか？'))) { unkeepName(n); renderNameGacha(); } return; }
    const b = e.target.closest('[data-keep]'); if (!b) return;
    const n = keep[+b.dataset.keep]; if (n && n !== profile.name) { setName(n); renderNameGacha(); }
  });
  // 開発者の名前：一度だけ ?dev=robit をつけて開くと「ROBIT（開発者）」になる（キープにも入る）
  // ランキングやオンラインに書けるのは、データベースの決まりで開発者の端末だけ（ほかの端末は「名無しの乗客」で送られる）
  const DEV_NAME = 'ROBIT（開発者）';
  if (/[?&]dev=robit\b/.test(location.search)) {
    keepName(DEV_NAME); profile.name = DEV_NAME; profile.nameFix = 1; saveProfile(); // ランキングへは fixName で送る
    try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]dev=robit\b/, '').replace(/^&/, '?') + location.hash); } catch (e) { }
  }
  showName(); setTimeout(fixName, 0);
  $('bSnd').textContent = AU.on ? '🔊' : '🔇';
  $('bSnd').addEventListener('click', () => { AU.on = !AU.on; profile.sound = AU.on; saveProfile(); $('bSnd').textContent = AU.on ? '🔊' : '🔇'; initAudio(); if (AU.master) AU.master.gain.value = AU.on ? 0.6 : 0; if (!AU.on && speechOK) try { speechSynthesis.cancel(); } catch (e) { } });
  function titleScreen() {
    state = 'title'; backTo = 'title';
    if (TUT) tutClose();
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('mpBoard').classList.add('hidden'); $('mpOut').classList.add('hidden');
    if (RP.active) { RP.active = false; RP.fr = null; } document.body.classList.remove('replay'); $('rpBar').classList.add('hidden'); $('rpEnd').classList.add('hidden');
    $('sleepFx').style.opacity = 0; $('hitFlash').style.opacity = 0; $('lowFx').style.boxShadow = 'none';
    if (document.pointerLockElement) document.exitPointerLock();
    if (!demo || demo.over) demo = SW.create({ seed: (Math.random() * 1e9) | 0 });
    G = null; clearWorld();
    show('title'); showInapp(true);
    const dk = todayKey();
    const dr = SW.dailyRule(dk); // 今日の特別ルール
    showResume();
    $('rkPill').textContent = profile.rk && profile.rk.s === rkSeason() ? rkTier(profile.rk.r)[1] + ' ' + profile.rk.r : 'レート戦';
    // 新しく入ったもの（今日のルール・練習乗車）に「NEW」の印（2 週間だけ）
    const isNew = dk <= NEW_UNTIL;
    $('bDaily').querySelector('.newb') || (isNew && $('bDaily').insertAdjacentHTML('afterbegin', '<span class="newb">NEW</span>'));
    $('dailyBest').textContent = dr ? dr.icon + dr.name : (profile.daily && profile.daily.date === dk ? 'ベスト ' + profile.daily.score : '未挑戦'); // ボタンが 3 つ並ぶので短く
    $('bestLine').textContent = profile.best ? `自己ベスト ${profile.best}点「${profile.bestTitle}」・乗車 ${profile.plays} 回` : '降りる人を見極めて、座って、徳を積め。';
    if (BAL2) $('bestLine').textContent = '🧪 新バランスのお試し版（落とし物が少なめ・座ると点）';
    renderModes();
  }
  function renderModes() {
    const n = (profile.unlock.endless ? 1 : 0) + (profile.unlock.hard ? 1 : 0) + (profile.unlock.jiji ? 1 : 0);
    $('bModes').innerHTML = (todayKey() <= NEW_UNTIL ? '<span class="newb">NEW</span>' : '') + '路線・練習';
    const list = [
      ['endless', '♾ 終点なしモード', '終点がない。どこまで立っていられるか。だんだん疲れやすくなる', '開放条件：一度、終点まで行く'],
      ['hard', '🔥 満員地獄モード', '超満員・席取りおばちゃん倍増・絡み屋多め', '開放条件：タイトル画面で伝説のコマンド（スマホはスワイプで）'],
      ['jiji', '👴 敬老の日モード', '乗客がほぼ全員お年寄り。譲り放題…体力がもつか？', '開放条件：タイトルのロゴを何度もタップ'],
    ];
    $('modeList').innerHTML = list.map(([k, name, desc, cond]) => profile.unlock[k]
      ? `<button class="btn" data-mode="${k}">${name}</button><p class="modeinfo">${desc}${profile.bests[k] ? '・ベスト ' + profile.bests[k] : ''}</p>`
      : `<button class="btn" disabled style="opacity:.45">🔒 ？？？</button><p class="modeinfo">${cond}</p>`).join('');
    $('modeList').innerHTML = `<button class="btn sub2" data-mode="bossrush">${todayKey() <= NEW_UNTIL ? '<span class="newb">NEW</span>' : ''}⚠ ボス駅ラッシュ</button><p class="modeinfo">毎駅がボス駅。倒れるまでに、いくつクリアできるか${profile.bests.bossrush ? '・ベスト ' + profile.bests.bossrush : ''}</p>` + `<button class="btn sub2" data-mode="practice">${todayKey() <= NEW_UNTIL ? '<span class="newb">NEW</span>' : ''}🔰 練習乗車</button><p class="modeinfo">体力や精神が 0 になっても倒れない。まずは慣れたい人に（最終ボス駅は本番だけ・ランキングなし・経験値は少なめ）</p>` + $('modeList').innerHTML;
    // ボス駅テスト（作者のお試し用）：claude.ai 版か ?bosstest=1 か開発者の名前のときだけ
    if (inClaude || /[?&]bosstest=1\b/.test(location.search) || /ROBIT/.test(profile.name || '')) {
      const B = SW.BOSS, tierJ = ['イベント', '初級', '中級', '最終'];
      $('modeList').innerHTML += '<h3 style="margin:12px 0 4px">🧪 ボス駅テスト（毎駅がボス駅・倒れない・ランキングなし）</h3><div class="btest">'
        + '<button class="btn sub2" data-mode="bosstest:all">全部を順番に</button>'
        + Object.keys(B).sort((a, b) => (B[a].tier || 9) - (B[b].tier || 9)).map((k) => `<button class="btn sub2" data-mode="bosstest:${k}">${tierJ[B[k].tier]}：${B[k].name}</button>`).join('') + '</div>'
        + '<h3 style="margin:12px 0 4px">📅 今日のルールのお試し（ランキングなし）</h3><div class="btest">' + SW.DAILY_RULES.map((r) => `<button class="btn sub2" data-mode="ruletest:${r.key}">${r.icon} ${r.name}</button>`).join('') + '</div>';
    }
    $('modeList').querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode)));
  }
  function clearWorld() {
    for (const [, H] of humans) disposeHuman(H); humans.clear();
    for (const [, m] of itemMeshes) scene.remove(m); itemMeshes.clear();
  }
  function startGame(mode, resume) {
    // 一人プレイの途中保存（オンラインに飛んだとき）があれば、新しく始める前に確かめる
    if (!resume && loadSave() && !confirm('保存してある続き（' + loadSave().desc + '）は消えます。新しく始めますか？')) return;
    if (!resume) clearSave();
    track(resume ? '続きから再開：' + (MODE_JA[mode.split(':')[0]] || mode) : (profile.plays ? '出発した：' : '初めて出発した：') + (MODE_JA[mode.split(':')[0]] || mode));
    initAudio();
    clearWorld();
    const rkTrain = mode.startsWith('ranked:') ? +mode.slice(7) : -1; // ランク線：今週の電車（rkSeed）
    if (rkTrain >= 0) mode = 'ranked';
    const seed = mode === 'daily' ? dailySeed() : rkTrain >= 0 ? rkSeed(weekKey(), rkTrain) : (Math.random() * 1e9) | 0;
    const bossTest = mode.startsWith('bosstest:') ? mode.slice(9) : null; // ボス駅テスト（ランキングには載らない）
    const practice = mode === 'practice'; // 練習乗車：たちっぱ線と同じ路線で、倒れない
    const bossRush = mode === 'bossrush'; // ボス駅ラッシュ：倒れるまで毎駅がボス駅
    const mikiwame = mode === 'mikiwame'; // 見極め線：しぐさだけで降りる人を読む（カード・悪者・落とし物・スキルなし）
    const ruleTest = mode.startsWith('ruletest:') ? SW.DAILY_RULES.find((r) => r.key === mode.slice(9)) : null; // ルールのお試し（開発者用・ランキングなし）
    const rule = mode === 'daily' ? SW.dailyRule(todayKey()) : ruleTest; // 今日のダイヤの特別ルール
    G = resume ? SW.loadGame(resume.d) : SW.create({ seed, mode: bossTest || bossRush ? 'endless' : practice || ruleTest || mikiwame || mode === 'ranked' ? 'normal' : mode, bossTest, bossRush, practice, mikiwame, rules: rule ? [rule.key] : [], bal2: BAL2, stats: profile.st, statCap: mode === 'normal' || mode === 'daily' || mode === 'mikiwame' || mode === 'ranked' ? SW.STAT_CAP_FAIR : SW.STAT_CAP_TOTAL });
    G.modeName = bossTest ? 'bosstest' : ruleTest ? 'ruletest' : mode;
    G.rkTrain = rkTrain; G.rkWeek = resume ? resume.meta.rkWeek : weekKey();
    // 見習い乗車：はじめての 1 回だけ体力がへりにくい（ランキング・リプレイには載らない）
    G.rookie = resume ? !!resume.meta.rookie : mode === 'normal' && !profile.plays && !profile.rookieDone;
    $('rookieTag').classList.toggle('hidden', !G.rookie); document.body.classList.toggle('rookie', !!G.rookie);
    document.body.classList.toggle('rookie', !!G.rookie || !!rule); // 右上の札の分、落とし物の小さいカードを下げる
    G.moments = []; SHOT.url = null; SHOT.p = 0; SHOT.pending = null;
    G.rule = rule; $('ruleTag').textContent = rule ? rule.icon + ' ' + rule.name : ''; $('ruleTag').classList.toggle('hidden', !rule);
    inp.yaw = G.player.yaw; inp.pitch = 0; endT = 0; pendingResult = false; eyeH = 1.6;
    state = 'play'; show(null); showInapp(false);
    $('hud').classList.remove('hidden');
    if (isTouch) $('touch').classList.remove('hidden');
    hud.st = hud.sub = hud.prompt = hud.target = hud.buffs = ''; hud.stam = hud.karma = hud.toku = hud.wallet = hud.mind = -1;
    $('toasts').innerHTML = ''; $('pops').innerHTML = '';
    if (!isTouch) {
      $('pcHint').innerHTML = '<b>画面をクリック</b>でマウス操作開始<br>WASD 移動 ／ E・クリック アクション ／ F・右クリック パンチ<br>Space 踏ん張る・ガード ／ Q 狸寝入り ／ 1〜7 スキル ／ Esc 一時停止';
      $('pcHint').classList.remove('hidden');
      setTimeout(() => $('pcHint').classList.add('hidden'), 9000);
      if (!noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
    }
    if (isTouch && isPortrait()) setTimeout(() => { if (state === 'play' && isPortrait()) addToast('📱 スマホを横にすると遊びやすいよ', 'warn'); }, 4000);
    if (!G.rookie && !BAL2 && !resume) recStart(mode); else REC = null; // 続きからのときはリプレイなし
    document.body.classList.toggle('nosk', mikiwame);
    if (resume) { addToast('▶ 続きから再開：' + resume.desc, 'good'); showAnn(G.ann); return; }
    if (G.rookie) addToast('🔰 見習い乗車：はじめの 1 回は体力がへりにくい（ランキングには載りません）', 'good');
    if (rule) { addToast('📅 今日のルール「' + rule.icon + ' ' + rule.name + '」：' + rule.desc, 'warn'); track('今日のルール：' + rule.name + '：出発'); }
    document.body.classList.toggle('nosk', mikiwame);
    if (mikiwame) addToast('👀 見極め線：様子のカードはなし。しぐさだけで降りる人を読もう。座れたら次の駅で席を譲って、また読む', 'good');
    if (bossRush) addToast('⚠ ボス駅ラッシュ：毎駅がボス駅！ 倒れるまで、いくつクリアできるか', 'warn');
    if (rkTrain >= 0) addToast('🏅 ランク線：今週の電車 No.' + (rkTrain + 1) + '。同じ電車を走った、レートの近い人と点数で勝負', 'good');
    if (practice) addToast('🔰 練習乗車：体力や精神が 0 になっても倒れません（ランキングには載りません）', 'good');
    else if (mode !== 'tutorial') addToast(mode === 'daily' ? '📅 今日のダイヤ：今日はみんな同じ乗客・同じ揺れ' : 'たちっぱ線へようこそ。降りそうな人の前に立て！', 'good');
    showAnn(G.ann);
  }
  // ================================================================ オンラインの待合室（ランダムマッチ・レート戦）
  // suwaritai/mm/q/{uid} に並ぶ。いちばん長く待っている人（リーダー）が相手を選んで部屋を作り、相手の q に room（合言葉）を書く。
  // 書かれた人はその部屋に入る。ホストは人がそろうか 12 秒たったら自動で始める。レート戦はオンライン対戦のレート（suwaritai/mm/r）が動く
  const MM = { on: false, kind: null, t0: 0, pollT: 0, hbT: 0, count: 0 };
  const mmRateNow = () => (profile.mmr && profile.mmr.s === rkSeason() ? profile.mmr.r : RK_START);
  async function mmJoin(kind) {
    if (!profile.name) { olNote('タイトルの「乗客名」から名前を引いてください'); return; }
    if (MP.code) return;
    try {
      const N = await net();
      MM.on = true; MM.kind = kind; MM.t0 = Date.now(); MM.pollT = 0; MM.hbT = 10;
      await N.set('suwaritai/mm/q/' + N.uid, { n: rankName(), r: mmRateNow(), k: kind, t: N.TS, s: SW.STATS.map((d) => SW.capStats(profile.st, SW.STAT_CAP_FAIR)[d.key]).join(',') });
      N.onDisconnectRemove('suwaritai/mm/q/' + N.uid);
      mmRender(); track('オンライン：' + (kind === 'rate' ? 'レート戦' : 'ランダムマッチ') + 'で待った');
    } catch (e) { MM.on = false; olNote('待合室に入れませんでした（' + (e && e.message || e) + '）'); mmRender(); }
  }
  async function mmCancel(silent) {
    MM.on = false; mmRender();
    try { const N = await net(); await N.remove('suwaritai/mm/q/' + N.uid); } catch (e) { }
    if (!silent) olNote('');
  }
  function mmRender() {
    if (!$('mmNote')) return;
    const sec = MM.on ? Math.floor((Date.now() - MM.t0) / 1000) : 0;
    $('mmAny').classList.toggle('hidden', MM.on); $('mmRate').classList.toggle('hidden', MM.on); $('mmCancel').classList.toggle('hidden', !MM.on);
    $('mmNote').innerHTML = (MM.on ? `🔎 ${MM.kind === 'rate' ? '🏅 レートの近い人' : '🎲 だれか'}をさがしています…（${sec} 秒）<br>` : '') + `待合室：<b>${MM.count}</b> 人　あなたの対戦レート ${rkBadge(mmRateNow())} ${mmRateNow()}`;
  }
  async function mmCreateRoom(N) {
    for (let k = 0; k < 8; k++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const ex = await N.get(roomP(code)); if (ex) continue;
      await N.update(roomP(code), { host: N.uid, created: N.TS, state: { s: 'lobby', cpu: false, mode: 'vs' } });
      return code;
    }
    return null;
  }
  async function mmTick(dt) {
    if (DB || !onlineAvailable()) return;
    // ホスト：人がそろうか 12 秒たったら始める。20 秒たっても 1 人なら待合室にもどる
    if (MP.code && MP.isHost && MP.mmExpect && !MP.active && MP.state && MP.state.s === 'lobby') {
      const n = mpSortedMembers().length, w = Date.now() - MP.mmT0;
      if (n >= MP.mmExpect || (n >= 2 && w > 12000)) { MP.mmExpect = 0; $('olCpu').checked = false; MP.modeSel = 'vs'; mpStart(); }
      else if (w > 20000 && n < 2) { const kind = MP.mmRated ? 'rate' : 'any'; MP.mmExpect = 0; await mpLeave(true); olNote('相手が来なかったので、もう一度さがします'); mmJoin(kind); }
      return;
    }
    if (!MM.on && !MP.code && !$('online').classList.contains('hidden')) { // オンラインの画面を開いているあいだは、待合室の人数を 5 秒ごとに見る
      MM.pollT -= dt; if (MM.pollT > 0) return; MM.pollT = 5;
      const N = await net(); const q = (await N.get('suwaritai/mm/q')) || {}, now = Date.now();
      MM.count = Object.values(q).filter((v) => v && now - (v.t || 0) < 30000).length; mmRender(); return;
    }
    if (!MM.on || MP.code) return;
    MM.pollT -= dt; MM.hbT -= dt;
    if (MM.pollT > 0) { if (Math.floor((Date.now() - MM.t0) / 1000) !== MM.lastSec) { MM.lastSec = Math.floor((Date.now() - MM.t0) / 1000); mmRender(); } return; }
    MM.pollT = 2;
    const N = await net(), me0 = N.uid;
    if (MM.hbT <= 0) { MM.hbT = 10; N.update('suwaritai/mm/q/' + me0, { t: N.TS }).catch(() => { }); }
    const q = (await N.get('suwaritai/mm/q')) || {};
    const now = Date.now(), fresh = Object.entries(q).filter(([, v]) => v && now - (v.t || 0) < 30000);
    MM.count = fresh.length; mmRender();
    const me = q[me0];
    if (!MM.on) return;
    if (me && me.room) { // 誘われた
      const code = me.room, rated = MM.kind === 'rate';
      MM.on = false; await N.remove('suwaritai/mm/q/' + me0).catch(() => { });
      MP.isHost = false; await mpEnter(code); MP.mmRated = rated; track('オンライン：マッチした（参加）');
      return;
    }
    if (!me) { MM.on = false; mmRender(); return; }
    // リーダー（同じ種類で、いちばん前から待っている人）だけが組み合わせを決める
    const same = fresh.filter(([, v]) => v.k === MM.kind && !v.room).sort((a, b) => a[1].t - b[1].t);
    if (!same.length || same[0][0] !== me0) return;
    const waited = (now - MM.t0) / 1000, myR = me.r;
    let others = same.slice(1);
    if (MM.kind === 'rate') others = others.filter(([, v]) => Math.abs(v.r - myR) <= 150 + 15 * waited).sort((a, b) => Math.abs(a[1].r - myR) - Math.abs(b[1].r - myR));
    others = others.slice(0, 3);
    if (!(others.length >= 3 || (others.length >= 1 && waited >= 8))) return;
    const code = await mmCreateRoom(N); if (!code) return;
    MM.on = false; await N.remove('suwaritai/mm/q/' + me0).catch(() => { });
    for (const [u] of others) await N.set('suwaritai/mm/q/' + u + '/room', code).catch(() => { });
    MP.isHost = true; await mpEnter(code);
    $('olPub').checked = false; $('olCpu').checked = false; MP.modeSel = 'vs';
    MP.mmRated = MM.kind === 'rate'; MP.mmExpect = others.length + 1; MP.mmT0 = Date.now();
    track('オンライン：マッチした（ホスト・' + (others.length + 1) + '人）');
  }
  $('mmAny').addEventListener('click', () => mmJoin('any'));
  $('mmRate').addEventListener('click', () => mmJoin('rate'));
  $('mmCancel').addEventListener('click', () => mmCancel());
  // 対戦が終わったら、オンライン対戦のレートを動かす（人間どうしのとき。自分の分だけ書く）
  async function mmRateUpdate(res) {
    try {
      const humans = res.filter((r) => !r.cpu); if (humans.length < 2) return '';
      const N = await net(); const F = { uid: N.uid }; // 通信は net()（?online=local でも試せる）
      const season = rkSeason(), path = 'suwaritai/mm/r/' + season + '/' + F.uid;
      const meDoc = await N.get(path);
      const R0 = meDoc ? meDoc.r : RK_START, games = meDoc ? meDoc.g : 0;
      const mine = humans.find((r) => r.uid === F.uid); if (!mine) return '';
      let sum = 0, n = 0;
      for (const o of humans) {
        if (o.uid === F.uid) continue;
        const od = await N.get('suwaritai/mm/r/' + season + '/' + o.uid).catch(() => null);
        const Ro = od ? od.r : RK_START;
        sum += (mine.score > o.score ? 1 : mine.score === o.score ? 0.5 : 0) - 1 / (1 + Math.pow(10, (Ro - R0) / 400)); n++;
      }
      const delta = Math.max(-60, Math.min(60, Math.round((games < 10 ? 40 : 24) * sum / n * Math.min(1, (n + 1) / 3))));
      const R1 = meDoc ? Math.max(0, R0 + delta) : Math.max(1440, Math.min(1560, R0 + delta));
      await N.set(path, { r: R1, n: rankName(), g: games + 1, t: N.TS });
      profile.mmr = { r: R1, s: season }; saveProfile();
      track('オンライン：レート戦の結果（' + rkTier(R1)[2] + '）');
      return `🏅 対戦レート ${R0} → <b>${R1}</b>（${R1 - R0 >= 0 ? '+' : ''}${R1 - R0}）${rkBadge(R1)}`;
    } catch (e) { return ''; }
  }
  // ================================================================ 一人プレイの途中保存と、募集中のオンライン部屋のお知らせ
  // 一人で遊んでいるときに「だれでも入れる」部屋が募集中なら、上にお知らせを出す。参加すると、今の一人プレイは保存して、あとで「▶ 続きから」で再開できる
  const SAVE_KEY = 'suwaritai.save';
  function loadSave() { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && Date.now() - v.at < 86400000 ? v : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }
  function saveSolo() {
    const g = G; if (!g || g.multi || g.over || RP.active) return false;
    const d = SW.saveGame(g); if (!d) return false;
    const desc = (MODE_JA[g.modeName] || g.modeName) + '・' + SW.stationName(g, Math.min(g.station + (g.phase === 'travel' ? 1 : 0), SW.lastStation(g))) + (g.phase === 'travel' ? 'の手前' : '');
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ d, at: Date.now(), desc, meta: { modeName: g.modeName, rkTrain: g.rkTrain, rkWeek: g.rkWeek, rookie: !!g.rookie, rule: g.rule ? g.rule.key : null } })); } catch (e) { return false; }
    track('一人プレイを保存した');
    return true;
  }
  function resumeSolo() {
    const v = loadSave(); if (!v) return;
    clearSave();
    const m = v.meta, mode = m.modeName === 'ranked' ? 'ranked:' + m.rkTrain : m.modeName === 'ruletest' && m.rule ? 'ruletest:' + m.rule : m.modeName;
    startGame(mode, v);
  }
  $('bResume').addEventListener('click', () => resumeSolo());
  function showResume() {
    const v = loadSave();
    $('bResume').classList.toggle('hidden', !v); $('bLand').classList.toggle('hidden', !!v || !isTouch || !isPortrait());
    if (v) $('bResume').textContent = '▶ 続きから（' + v.desc + '）';
  }
  // 募集中の部屋：ホストは 20 秒ごとに suwaritai/lobby/{合言葉} を書く。ひとりの人は 45 秒ごとに読む
  const LOBBY = { pubT: 0, pub: null, pollT: 5, shown: null, dismissed: {} };
  function lobbyTick(dt) {
    if (DB || !fbAllowed) return;
    // ホスト側
    const pubOn = MP.code && MP.isHost && !MP.active && $('olPub') && $('olPub').checked && MP.state && MP.state.s === 'lobby';
    if (pubOn) {
      LOBBY.pubT -= dt;
      if (LOBBY.pubT <= 0) {
        LOBBY.pubT = 20; const code = MP.code, c = Math.max(1, mpSortedMembers().length);
        net().then((N) => { N.set('suwaritai/lobby/' + code, { h: N.uid, n: rankName(), m: MP.modeSel || 'vs', c, t: N.TS }).catch(() => { }); N.onDisconnectRemove('suwaritai/lobby/' + code); LOBBY.pub = code; });
      }
    } else if (LOBBY.pub) { const code = LOBBY.pub; LOBBY.pub = null; LOBBY.pubT = 0; net().then((N) => N.remove('suwaritai/lobby/' + code)).catch(() => { }); }
    // ひとりの人の側（遊んでいる最中か、タイトル）
    const solo = (state === 'play' && G && !G.multi && !RP.active && !MP.code) || (state === 'title' && !MP.code);
    if (!solo) { if (LOBBY.shown) lobbyHide(); return; }
    LOBBY.pollT -= dt;
    if (LOBBY.pollT > 0) return;
    LOBBY.pollT = 45;
    firebaseReady().then(async (F) => {
      if (!F) return;
      const v = (await withTimeout(F.db.ref('suwaritai/lobby').orderByChild('t').limitToLast(6).get(), 8000)).val() || {};
      const now = Date.now();
      const room = Object.entries(v).map(([code, x]) => Object.assign({ code }, x)).filter((x) => x.h !== F.uid && x.c < 4 && now - x.t < 75000 && !LOBBY.dismissed[x.code]).sort((a, b) => b.t - a.t)[0];
      if (room) { lobbyShow(room); return; }
      // 待合室（ランダムマッチ・レート戦）で相手を待っている人がいれば知らせる
      const q = (await withTimeout(F.db.ref('suwaritai/mm/q').orderByChild('t').limitToLast(8).get(), 8000)).val() || {};
      const w = Object.entries(q).filter(([u, x]) => u !== F.uid && x && !x.room && now - x.t < 30000);
      if (w.length && !LOBBY.dismissed.mm) lobbyShow({ mm: true, n: w[0][1].n, k: w.some(([, x]) => x.k === 'any') ? 'any' : 'rate', c: w.length }); else lobbyHide();
    }).catch(() => { });
  }
  function lobbyShow(room) {
    LOBBY.shown = room;
    const el = $('lobbyBan');
    el.innerHTML = room.mm ? `<span>${room.k === 'any' ? '🎲 ランダムマッチ' : '🏅 レート戦'}で ${room.c} 人が相手を待っています</span><button id="lbGo">参加する</button><button id="lbX">✕</button>`
      : `<span>🌐 ${nameHtml(dispName(room.n), 1)} さんが${room.m === 'coop' ? '🤝 共闘' : '⚔ 対戦'}の仲間を募集中（${room.c}/4人）</span><button id="lbGo">参加する</button><button id="lbX">✕</button>`;
    el.classList.remove('hidden');
    $('lbX').onclick = () => { LOBBY.dismissed[room.mm ? 'mm' : room.code] = 1; lobbyHide(); };
    $('lbGo').onclick = () => {
      const playing = state === 'play' || state === 'pause';
      if (playing && !confirm('今の一人プレイを保存して、オンラインの部屋に参加しますか？（あとでタイトルの「▶ 続きから」で再開できます）')) return;
      if (playing) { saveSolo(); if (document.pointerLockElement) document.exitPointerLock(); G = null; clearWorld(); }
      lobbyHide(); track('募集中の部屋に参加した（' + (playing ? '一人プレイから' : 'タイトルから') + '）');
      titleScreen(); openOnline();
      if (room.mm) mmJoin(room.k); else { $('olCode').value = room.code; mpJoin(); }
    };
    if (state === 'play') sfx('chime');
  }
  function lobbyHide() { LOBBY.shown = null; $('lobbyBan').classList.add('hidden'); }
  // ================================================================ 全画面（デストロイ碁と同じ仕組み）
  const fsTarget = document.documentElement;
  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  let EMBEDDED = false; try { EMBEDDED = window.self !== window.top; } catch (e) { EMBEDDED = true; }
  // ホーム画面のアイコンから開いているとき（もう画面いっぱい）
  const standalone = !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches));
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  function fsToast(msg) { if (state === 'play') addToast(msg, 'bad'); else titleToast(msg); }
  function toggleFullscreen(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try {
      const r = fsElement() ? exit.call(document) : req.call(fsTarget);
      if (r && r.catch) r.catch(() => fsToast('この画面では全画面にできません'));
    } catch (err) { fsToast('この画面では全画面にできません'); }
  }
  function updateFsButtons() {
    const on = !!fsElement();
    $('fsBtn').textContent = on ? '✕' : '⛶';
    $('bFs').textContent = on ? '全画面を終了' : '⛶ 全画面';
    $('bFs2').textContent = on ? '全画面を終了' : '⛶ 全画面';
  }
  // X・Instagram・LINE などのアプリの中のブラウザ（ホーム画面に追加・全画面ができない）
  const INAPP = /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|musical_ly|BytedanceWebview|Discord|Threads|; wv\)/i.test(navigator.userAgent);
  const MENU_KEY = isIOS ? '「…」' : '「⋮」';
  const OPEN_IN_BROWSER = (isIOS ? '右下（または右上）の<b>「…」</b>' : '右上の<b>「⋮」</b>') + 'から「<b>ブラウザで開く</b>」を選ぶ（アプリが用意しているボタンです）';
  $('a2hsSteps').innerHTML = (INAPP ? ['いまは <b>アプリの中のブラウザ</b>で開いています。' + OPEN_IN_BROWSER + '。見つからないときは、下の「URL をコピー」で <b>robit-devworks.github.io/suwaritai</b> をコピーして、ブラウザに貼りつけて開く（同じページです）'] : []).concat(isIOS ? [
    'アドレスバーの右にある<b>共有ボタン</b>（□に↑のマーク）を押す。見つからなければ右下の「…」→「共有」',
    '「<b>表示を増やす</b>」を押して、「<b>ホーム画面に追加</b>」を選ぶ',
    'ホーム画面にできた<b>スワリタイのアイコン</b>から開く',
  ] : isAndroid ? [
    'Chrome の右上の<b>「⋮」</b>を押す',
    '「<b>ホーム画面に追加</b>」（または「アプリをインストール」）を選ぶ',
    'ホーム画面にできた<b>スワリタイのアイコン</b>から開く',
  ] : [
    'Chrome / Edge のアドレスバーの右にある<b>インストールのマーク</b>を押す（なければ右上の「⋮」→「キャスト、保存、共有」→「ページをアプリとしてインストール」）',
    'できた<b>スワリタイのアイコン</b>から開く',
  ]).map(t => `<li>${t}</li>`).join('');
  $('a2hsCopy').classList.toggle('hidden', !INAPP);
  function openA2hs(e) { if (e) { e.preventDefault(); e.stopPropagation(); } if (state === 'play') pause(); $('a2hs').classList.remove('hidden'); }
  $('a2hsClose').addEventListener('click', () => $('a2hs').classList.add('hidden'));
  const copyUrl = (el) => { const u = SHARE_URL.split('?')[0]; try { const p = navigator.clipboard.writeText(u); if (p && p.then) p.then(() => { el.textContent = 'コピーしました'; }, () => { el.textContent = u; }); } catch (e) { el.textContent = u; } };
  $('a2hsCopy').addEventListener('click', () => copyUrl($('a2hsCopy')));
  // タイトルに「ブラウザで開いてね」の帯を出す（アプリの中のとき）
  const APP_NAME = /Twitter/i.test(navigator.userAgent) ? 'X' : /Instagram/i.test(navigator.userAgent) ? 'Instagram' : /Line\//.test(navigator.userAgent) ? 'LINE' : /TikTok|musical_ly|Bytedance/i.test(navigator.userAgent) ? 'TikTok' : 'アプリ';
  $('inappText').innerHTML = '📱 ' + (APP_NAME === 'アプリ' ? 'アプリ' : APP_NAME + ' ') + 'の中のブラウザで開いています（<b>このままでも遊べます</b>）。<br><small>全画面やホーム画面に追加したいときは、' + MENU_KEY + '→「ブラウザで開く」がおすすめ</small>';
  $('inappClose').addEventListener('click', () => { $('inapp').classList.add('hidden'); try { localStorage.setItem('sw-inapp-closed', '1'); } catch (e) { } });
  function showInapp(on) { let closed = false; try { closed = localStorage.getItem('sw-inapp-closed') === '1'; } catch (e) { } const v = on && INAPP && !closed; $('inapp').classList.toggle('hidden', !v); document.body.classList.toggle('inapp', v); }
  document.querySelectorAll('.fs-btn').forEach(b => {
    b.addEventListener('touchstart', ev => ev.stopPropagation(), { passive: true });
    if (fsSupported) { b.addEventListener('click', toggleFullscreen); return; } // パソコンや Android
    b.classList.toggle('hidden', standalone || !isIOS || EMBEDDED); // iPhone は「ホーム画面に追加」の案内
    b.addEventListener('click', openA2hs);
  });
  document.addEventListener('fullscreenchange', () => { updateFsButtons(); resize(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFsButtons(); resize(); });

  // ---------------------------------------------------------------- 横向き・全画面で遊ぶ
  const isPortrait = () => !pland && realPortrait();
  let wantLand = false;
  function updateLand() {
    const fsOn = !!fsElement() || standalone;
    $('bPort').classList.toggle('hidden', !pland); $('bPort2').classList.toggle('hidden', !pland);
    $('bLand').classList.toggle('landed', pland || (!isPortrait() && (fsOn || !fsSupported))); // iPhone は全画面にできないので、横になっていれば十分
    if (wantLand && !isPortrait()) { $('rotate').classList.add('hidden'); wantLand = false; }
  }
  async function playLandscape(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    initAudio();
    // 1) 全画面（できる端末だけ）
    if (fsSupported && !fsElement()) {
      try { const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen; await req.call(fsTarget, { navigationUI: 'hide' }); } catch (err) { /* できなくても続ける */ }
    }
    // 2) 横に固定（Android の Chrome など。全画面のときだけできる）
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (err) { /* iPhone などはできない */ }
    // 3) まだ縦なら、画面を回して横長にする（疑似横向き）
    setTimeout(() => {
      if (realPortrait()) {
        pseudoWant = true; resize();
        titleToast('📱 スマホを横にして持ってね（画面の上が右側になるように）');
        track('疑似横向きになった');
      }
      updateLand();
    }, 350);
    track('横向き・全画面で遊ぶを押した');
  }
  $('bLand').addEventListener('click', playLandscape);
  const backPortrait = () => { pseudoWant = false; resize(); updateLand(); };
  $('bPort').addEventListener('click', backPortrait); $('bPort2').addEventListener('click', backPortrait);
  $('rotClose').addEventListener('click', () => { wantLand = false; $('rotate').classList.add('hidden'); });
  window.addEventListener('resize', updateLand);
  window.addEventListener('orientationchange', () => setTimeout(updateLand, 300));
  document.addEventListener('fullscreenchange', updateLand);
  document.addEventListener('webkitfullscreenchange', updateLand);

  function pause() {
    if (state !== 'play') return;
    state = 'pause'; backTo = 'pause'; show('pause');
  }
  $('bStart').addEventListener('click', () => startGame('normal')); // 最初はまず体験してもらう（チュートリアルは聞かない）
  // ---- チュートリアル
  const I = SW._internal;
  const TUT_STEPS = [
    { t: '① 歩いて、見回してみよう', d: () => isTouch ? '左下のスティックで歩く。画面の右側をなぞると見回せる' : 'W A S D で歩く。マウスで見回す（画面をクリックするとマウスで操作）',
      start(g) { TUT.x0 = g.player.x; TUT.z0 = g.player.z; }, done(g) { return Math.hypot(g.player.x - TUT.x0, g.player.z - TUT.z0) > 1.2; } },
    { t: '② 座っている人の「様子」を見よう', d: () => '座っている人に照準（＋）を合わせると、様子のメモが出る。<b>掲示板をチラ見・時計を見る・荷物をまとめる</b>人は、もうすぐ降りる',
      start() { TUT.aimT = 0; }, done(g, dt) { const p = g.aim >= 0 ? SW.person(g, g.aim) : null; if (p && p.state === 'seated') TUT.aimT += dt; return TUT.aimT > 1.2; } },
    { t: '③ 空いた席に座ろう', d: () => '目の前の席が空いた！ 光っている席の前で「' + (isTouch ? '✋ アクション' : 'E') + '」で座る。座ると体力が回復する',
      start(g) {
        const pl = g.player; let best = null, bd = 1e9;
        for (const s of g.seats) { const q = s.occ > 0 ? SW.person(g, s.occ) : null; if (!q || q.role) continue; const d = Math.hypot(s.x - pl.x, s.fz - pl.z); if (d < bd) { bd = d; best = s; } }
        if (!best) return;
        const q = SW.person(g, best.occ); I.freeSeat(g, best, q.id); q.seat = -1; q.state = 'stand'; q.z = best.fz; q.wantSeat = false; q.dest = 99; q.bubble = 'あ、どうぞ'; q.bubbleT = 2; I.placeStanding(g, q, false);
        TUT.seat = best.id;
      }, done(g) { return g.player.seat >= 0; },
      retry(g) { if (g.player.seat >= 0) I.playerStand(g); this.start(g); } },
    { t: '④ 席を譲ろう', d: () => 'お年寄りが前に来た。「' + (isTouch ? '✋ アクション' : 'E') + '」で席を譲ると<b>徳</b>（スコア）がもらえる。無視するとカルマがたまる',
      start(g) {
        const pl = g.player; if (pl.seat < 0) return;
        const s = g.seats[pl.seat], p = I.spawn(g, 'elderly', g.station, g.station + 6);
        p.x = s.x + 0.25; p.z = s.fz; p.state = 'stand'; p.targetPlayer = true; p.targetSeat = s.id; p.wantSeat = false; g.people.push(p); TUT.eld = p.id; TUT.spawned.push(p.id);
      }, done(g) { return g.stats.gives > 0; },
      retry(g) { if (g.player.seat < 0) { TUT.i -= 2; tutNext(g); return; } this.start(g); },
      tick(g) { if (g.player.seat < 0 && !g.stats.gives) { const e = SW.person(g, TUT.eld); if (e) { g.people = g.people.filter((p) => p !== e); } addToast('もう一回座ってから、席を譲ろう', 'warn'); TUT.i -= 2; tutNext(g); } } },
    { t: '⑤ 揺れに踏ん張ろう', d: () => '立っていると電車が揺れる。「⚠ 揺れるぞ！」が出たら' + (isTouch ? '「🛡 踏ん張る」' : '<b>Space</b>') + 'で踏ん張る',
      start() { TUT.lurch = null; TUT.failed = false; }, done(g) { return g.stats.braces > 0; },
      tick(g) {
        if (g.player.seat >= 0 || TUT.failed) return; // 失敗したら「↺ やり直す」を押すまで待つ（揺れはくり返さない）
        const L = TUT.lurch;
        if (L && L.done) { if (!g.stats.braces) tutFail(isTouch ? '「⚠ 揺れるぞ！」が出たら、右下の 🛡 を押そう' : '「⚠ 揺れるぞ！」が出たら Space を押そう'); return; }
        if (g.phase !== 'travel' || g.phaseT > 19) return;
        if (L) { if (!g.lurchPlan.includes(L)) g.lurchPlan = [L]; return; }
        TUT.lurch = { t: g.phaseT + 2.5, done: false, warned: false }; g.lurchPlan = [TUT.lurch];
      } },
    { t: '⑥ スリをつかまえよう', d: () => 'スリが乗客のポケットに手を入れる瞬間を見て、<b>抜いたあとに' + (isTouch ? '「👊 パンチ」' : 'F（パンチ）') + '</b>。抜く前に殴ると冤罪でカルマ！',
      start(g) {
        const pl = g.player; const dx = pl.x < 5 ? 1 : -1;
        const v = I.spawn(g, 'ol', g.station, 99); [v.x, v.z] = I.aisleClamp(pl.x + dx * 1.3, 0); v.state = 'stand'; v.wantSeat = false; g.people.push(v);
        const su = I.spawnVillain(g, 'suri', ...I.aisleClamp(pl.x + dx * 2.6, 0)); su.suri.ph = 'approach'; su.suri.target = { kind: 'npc', id: v.id }; su.suri.t = 20; su.dest = 99;
        TUT.suri = su.id; TUT.vic = v.id; TUT.spawned.push(su.id, v.id);
      }, done(g) { return g.stats.suriKO > 0; },
      tick(g) {
        const su = SW.person(g, TUT.suri), v = SW.person(g, TUT.vic);
        if (v && v.state === 'stand') v.wantSeat = false;
        if (TUT.failed) return;
        if (!su || su.state === 'gone' || su.state === 'exit' || su.state === 'ko' && !g.stats.suriKO) { tutFail('スリに逃げられた…'); return; }
        if (su.suri && su.suri.ph === 'roam' && !su.loot && v) { su.suri.ph = 'approach'; su.suri.target = { kind: 'npc', id: v.id }; su.suri.t = 20; }
        if (su.loot && g.phase === 'stop' && g.phaseT > 0.7) g.phaseT = 0.7; // 練習なので、逃げる前に追いつけるよう少し待つ
      } },
  ];
  function tutBegin(after) {
    startGame('tutorial');
    TUT = { i: -1, after: after || 'title', spawned: [] };
    $('tut').classList.remove('hidden'); $('tutBtns').classList.add('hidden'); $('tutSkip').classList.remove('hidden');
    track('チュートリアルを始めた');
    tutNext(G);
  }
  function tutNext(g) {
    TUT.i++; TUT.failed = false;
    if (TUT.i >= TUT_STEPS.length) {
      $('tutT').textContent = '🎉 チュートリアル完了！'; $('tutD').innerHTML = 'あとは降りる人を見極めて、終点まで座って帰ろう。悪者はほかにもいるよ';
      $('tutBtns').classList.remove('hidden'); $('tutSkip').classList.add('hidden');
      profile.tutDone = true; saveProfile(); track('チュートリアルを完了した'); sfx('clear');
      tutLayout(); return;
    }
    const S = TUT_STEPS[TUT.i];
    $('tutT').textContent = S.t; $('tutD').innerHTML = S.d();
    if (S.start) S.start(g);
    if (TUT.i > 0) sfx('coin');
    tutLayout();
  }
  // 失敗：「ブー」を 1 回だけ鳴らして、3 秒後に自動でもう一回
  function tutFail(msg) {
    if (!TUT || TUT.failed) return;
    TUT.failed = true; TUT.failAt = G ? G.t + 3 : 0; sfx('buzzer');
    $('tutD').innerHTML = '❌ 失敗… ' + msg + '<br><b>3 秒後にもう一回</b>';
    tutLayout();
  }
  // いまのステップをやり直す（出した人を消して、最初から）
  function tutRetry(g) {
    TUT && (TUT.failed = false);
    if (!TUT || TUT.i >= TUT_STEPS.length || !g) return;
    g.people = g.people.filter((p) => { if (TUT.spawned.includes(p.id)) { I.releaseSlot(g, p); return false; } return true; });
    TUT.spawned = []; g.player.carrying = null; g.player.mode = null;
    const S = TUT_STEPS[TUT.i];
    if (S.retry) S.retry(g); else if (S.start) S.start(g);
    if (TUT.i < TUT_STEPS.length && TUT_STEPS[TUT.i] === S) { $('tutT').textContent = S.t; $('tutD').innerHTML = S.d(); }
    tutLayout();
  }
  function tutLayout() { $('toasts').style.marginTop = TUT ? ($('tut').offsetHeight + 6) + 'px' : ''; }
  function tutTick(g, dt) {
    if (!TUT || TUT.i >= TUT_STEPS.length) return;
    if (TUT.failed && g.t > TUT.failAt) tutRetry(g);
    const S = TUT_STEPS[TUT.i];
    if (S.tick) S.tick(g, dt);
    if (TUT.i < TUT_STEPS.length && TUT_STEPS[TUT.i] === S && S.done(g, dt)) tutNext(g);
  }
  function tutClose() { TUT = null; $('tut').classList.add('hidden'); tutLayout(); }
  $('tutSkip').addEventListener('click', () => { profile.tutDone = true; saveProfile(); track('チュートリアルをスキップした（' + (TUT ? TUT.i + 1 : 0) + '）'); const after = TUT && TUT.after; tutClose(); if (after === 'normal') startGame('normal'); else { state = 'title'; titleScreen(); } });
  $('tutGo').addEventListener('click', () => { tutClose(); startGame('normal'); });
  $('tutEnd').addEventListener('click', () => { tutClose(); state = 'title'; titleScreen(); });
  $('tutYes').addEventListener('click', () => tutBegin('normal'));
  $('tutNo').addEventListener('click', () => { profile.tutDone = true; saveProfile(); track('チュートリアルをスキップした（最初）'); startGame('normal'); });
  $('bTut').addEventListener('click', () => tutBegin('title'));
  // 動画で見る（1 分版・3 分版）。URL は YouTube に上げたら入れる
  const VIDEO_1MIN = 'https://youtu.be/ErsstCp5flw', VIDEO_3MIN = 'https://youtu.be/OGOFh99BOPc';
  // URL がまだないものは「準備中」と出して押せないようにする
  $('bVideo').classList.remove('hidden');
  for (const [cls, url, nm] of [['.vid1', VIDEO_1MIN, '1分'], ['.vid3', VIDEO_3MIN, '3分']]) {
    document.querySelectorAll(cls).forEach((a) => {
      if (url) { a.href = url; a.addEventListener('click', () => track('動画を見た（' + nm + '）')); }
      else { a.removeAttribute('href'); a.classList.add('soon'); a.textContent += '　準備中'; }
    });
  }
  $('bVideo').addEventListener('click', () => { backTo = 'title'; show('videos'); track('動画で見るを開いた'); });
  $('bDaily').addEventListener('click', () => startGame('daily'));
  $('bMiki').addEventListener('click', () => startGame('mikiwame'));
  $('bRk').addEventListener('click', () => startRanked());
  $('bModes').addEventListener('click', () => { backTo = 'title'; renderModes(); show('modes'); });
  $('bHow').addEventListener('click', () => { backTo = 'title'; show('howto'); track('遊び方を開いた'); });
  $('bHow2').addEventListener('click', () => { backTo = 'pause'; show('howto'); });
  $('bAch').addEventListener('click', () => { backTo = 'title'; renderAch(); show('ach'); });
  // ---- レベルとステータス
  function myLevel() { return SW.levelOf(profile.xp || 0); }
  let statSel = 'hp';
  function myStats() { return SW.capStats(profile.st, SW.statPoints(myLevel().lv)); }
  function freePoints() { return SW.statPoints(myLevel().lv) - SW.statSum(myStats()); }
  function updateLvBadge() { $('lvTxt').textContent = myLevel().lv; $('lvDot').classList.toggle('hidden', freePoints() <= 0); }
  function drawHex() {
    const c = $('stHex'), x = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2, cy = H / 2 + 6, R = 130;
    x.clearRect(0, 0, W, H);
    const st = myStats(), fair = SW.capStats(st, SW.STAT_CAP_FAIR), n = SW.STATS.length;
    const pt = (i, r) => [cx + Math.sin(i / n * Math.PI * 2) * r, cy - Math.cos(i / n * Math.PI * 2) * r];
    x.strokeStyle = 'rgba(255,255,255,.15)'; x.lineWidth = 2;
    for (let k = 1; k <= 5; k++) { x.beginPath(); for (let i = 0; i <= n; i++) { const [a, b] = pt(i % n, R * k / 5); i ? x.lineTo(a, b) : x.moveTo(a, b); } x.stroke(); }
    for (let i = 0; i < n; i++) { const [a, b] = pt(i, R); x.beginPath(); x.moveTo(cx, cy); x.lineTo(a, b); x.stroke(); }
    const poly = (o, fill, stroke, dash) => { x.beginPath(); SW.STATS.forEach((d, i) => { const [a, b] = pt(i, R * Math.max(0.04, o[d.key] / SW.STAT_MAX)); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.setLineDash(dash || []); if (fill) { x.fillStyle = fill; x.fill(); } x.strokeStyle = stroke; x.lineWidth = 4; x.stroke(); x.setLineDash([]); };
    poly(st, 'rgba(255,196,64,.35)', '#ffc440');
    if (SW.statSum(st) > SW.STAT_CAP_FAIR) poly(fair, null, '#7ad7ff', [10, 8]);
    x.font = 'bold 26px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    SW.STATS.forEach((d, i) => { const [a, b] = pt(i, R + 30); x.fillText(d.icon + st[d.key], a, b); });
  }
  function renderStat() {
    const L = myLevel(), st = myStats(), free = freePoints();
    $('stLv').textContent = 'Lv.' + L.lv;
    $('stXp').style.width = (L.into / L.need * 100).toFixed(1) + '%';
    $('stXpTxt').textContent = '経験値 ' + L.into + ' / ' + L.need + '　レベルが上がるごとに 1 ポイント（最大 ' + SW.STAT_CAP_TOTAL + '）';
    $('stFree').textContent = (free > 0 ? '🎁 のこり ' + free + ' ポイント' : '合計 ' + SW.statSum(st)) + '　※ランキング・オンラインは合計 ' + SW.STAT_CAP_FAIR + ' まで';
    const sel = SW.STATS.find((d) => d.key === statSel) || SW.STATS[0];
    $('stDesc').textContent = sel.icon + ' ' + sel.name + '：' + sel.desc;
    $('stList').innerHTML = SW.STATS.map((d) => `<div class="strow${d === sel ? ' sel' : ''}" data-s="${d.key}"><span>${d.icon} ${d.name}</span><button data-k="${d.key}" data-d="-1" ${st[d.key] <= 0 ? 'disabled' : ''}>−</button><b>${st[d.key]}</b><button data-k="${d.key}" data-d="1" ${st[d.key] >= SW.STAT_MAX || free <= 0 ? 'disabled' : ''}>＋</button></div>`).join('');
    drawHex(); updateLvBadge();
  }
  $('stList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-s]'); if (row) statSel = row.dataset.s;
    const b = e.target.closest('button[data-k]'); if (!b) { renderStat(); return; }
    const st = myStats(), k = b.dataset.k, d = +b.dataset.d;
    if (d > 0 && freePoints() <= 0) return;
    st[k] = Math.max(0, Math.min(SW.STAT_MAX, st[k] + d)); profile.st = st; saveProfile(); renderStat();
  });
  $('stReset').addEventListener('click', () => { profile.st = SW.normStats(null); saveProfile(); renderStat(); track('ステータスを振り直した'); });
  $('rLv').addEventListener('click', () => { backTo = 'result'; renderStat(); show('stat'); track('結果からステータスを開いた'); });
  $('bStat').addEventListener('click', () => { backTo = 'title'; renderStat(); show('stat'); track('ステータスを開いた'); });
  updateLvBadge();
  $('bRank').addEventListener('click', () => { backTo = 'title'; show('rank'); setRankTab(rankTab); track('ランキングを開いた'); });
  $('pauseBtn').addEventListener('click', () => pause());
  $('pauseBtn').addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
  $('bResume').addEventListener('click', () => { state = 'play'; show(null); if (!isTouch && !noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } });
  $('bQuit').addEventListener('click', () => { if (MP.active || MP.code) mpLeave(false); else titleScreen(); });
  $('bRetry').addEventListener('click', () => { if (G && G.modeName === 'ranked') { startRanked(); return; } startGame(G && G.modeName && G.modeName !== 'practice' ? G.modeName : 'normal'); }); // 練習のあとは本番へ・ランク線は別の電車へ
  $('bToTitle').addEventListener('click', () => titleScreen());

  function renderAch() {
    const got = profile.ach || {};
    const n = SW.ACHIEVEMENTS.filter(a => got[a.id]).length;
    $('achCount').textContent = n + ' / ' + SW.ACHIEVEMENTS.length;
    $('achList').innerHTML = SW.ACHIEVEMENTS.map(a => got[a.id]
      ? `<div class="ach"><b>🎖 ${a.name}</b>${a.desc}</div>`
      : `<div class="ach lock"><b>🔒 ${a.hidden ? '？？？' : a.name}</b>${a.hidden ? 'ひみつ' : a.desc}</div>`).join('');
    // 乗客タイプ図鑑
    const ty = profile.types || {}, tn = SW.PTYPES.filter((d) => ty[d.key]).length;
    $('achList').innerHTML += `<h3 style="grid-column:1/-1;margin:10px 0 2px">🪪 乗客タイプ図鑑 <span class="pill">${tn} / ${SW.PTYPES.length}</span></h3>` + SW.PTYPES.map((d) => ty[d.key]
      ? `<div class="ach"><b>${d.icon} ${d.name}</b>${d.desc}</div>`
      : `<div class="ach lock"><b>❔ ？？？</b>まだ診断されていない</div>`).join('');
  }

  // ================================================================ 結果
  let lastResult = null;
  function finishGame() {
    if (G && G.modeName === 'tutorial') { titleScreen(); return; }
    const g = G; state = 'result'; backTo = 'result';
    $('lowFx').style.boxShadow = 'none'; $('hitFlash').style.opacity = 0; $('sleepFx').style.opacity = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    $('touch').classList.add('hidden');
    const sc = SW.finalScore(g), r = g.result, s = g.stats;
    const newAch = g.modeName === 'practice' || g.modeName === 'mikiwame' ? [] : SW.checkAchievements(g, profile); // 練習・見極め線では実績なし
    profile.plays = (profile.plays || 0) + 1;
    profile.chikanTotal = (profile.chikanTotal || 0) + s.chikanKO;
    for (const a of newAch) profile.ach[a] = Date.now();
    const mode = g.modeName;
    let newBest = false;
    if (mode === 'normal' || mode === 'daily') {
      if (sc.total > (profile.best || 0)) { profile.best = sc.total; profile.bestTitle = sc.title; newBest = true; }
      if (mode === 'daily') { const dk = todayKey(); if (!profile.daily || profile.daily.date !== dk || sc.total > profile.daily.score) profile.daily = { date: dk, score: sc.total, title: sc.title }; }
    } else if (mode !== 'practice') { if (sc.total > (profile.bests[mode] || 0)) { profile.bests[mode] = sc.total; newBest = true; } }
    let unlockMsg = '';
    if (r.cause === 'clear' && mode !== 'practice' && mode !== 'mikiwame' && !profile.unlock.endless) { profile.unlock.endless = true; unlockMsg = '♾ 終点なしモードが開放された！'; }
    const xpGot = Math.round(SW.xpGain(g) * (mode === 'practice' ? 0.3 : 1)), lv0 = SW.levelOf(profile.xp || 0).lv;
    profile.xp = (profile.xp || 0) + xpGot;
    const lv1 = SW.levelOf(profile.xp).lv;
    const xpMsg = lv1 > lv0 ? `⬆ Lv.${lv1} に上がった！ タイトルの「📊」でステータスを割り振ろう` : `経験値 +${xpGot}（Lv.${lv1}）`;
    if (lv1 > lv0) track('レベルアップ：Lv' + lv1);
    const dg = SW.diagnose(g);
    profile.types = profile.types || {};
    const dgNew = !profile.types[dg.key]; profile.types[dg.key] = profile.types[dg.key] || Date.now();
    track('診断：' + dg.name);
    profile.history = (profile.history || []).concat([{ s: sc.total, t: sc.title, m: mode, d: Date.now() }]).sort((a, b) => b.s - a.s).slice(0, 20);
    if (g.rookie) profile.rookieDone = true;
    saveProfile();
    const causeTxt = { clear: '🎉 終点到着！', collapse: '🦵 膝が笑った…', ko: '💥 KO負け', arrest: '🚨 駅員に連行', broken: '🧠 心が折れた…' }[r.cause];
    const stName = SW.stationName(g, Math.min(g.station + (g.phase === 'travel' ? 1 : 0), SW.lastStation(g)));
    $('rCause').textContent = causeTxt; $('rCause').className = 'res-cause ' + (r.cause === 'clear' ? 'good' : 'bad');
    $('rText').innerHTML = `<b class="dg">${dg.icon} あなたは「${dg.name}」タイプ${dgNew ? ' <span class="pill">NEW</span>' : ''}</b><br><span style="color:var(--sub)" title="${dg.desc}">${dg.why}${g.endless ? '（' + s.stations + '駅）' : ''}</span>${g.practice ? `<br><b style="color:#ff8a5e">🔰 練習乗車：本番なら ${s.saves ? s.saves + ' 回終わってた' : '一度も倒れなかった！'}</b>` : ''}${g.bossRush ? `<br><b style="color:#ffb35e">⚠ ボス駅ラッシュ：クリア ${s.bossClear || 0} 駅 / 挑戦 ${(s.bossLog || []).length} 駅</b><br><span class="small" style="color:var(--sub)">${(s.bossLog || []).map(([k, ok]) => (ok ? '○' : '×') + esc(SW.BOSS[k].name)).join('　')}</span>` : ''}${g.mikiwame ? `<br><b style="color:#7fd1ff">👀 見極め線：座れた ${s.mkSits} 回・🎯 読み的中 ${s.mkHits} 回（最大 ${s.mkBest} 連続）</b>` : ''}`;
    $('rScore').textContent = sc.total;
    $('rTitle').textContent = '称号「' + sc.title + '」' + (newBest ? ' 🆕自己ベスト！' : '');
    $('rBrk').innerHTML = `<span>集めた徳</span><span>${sc.earned}</span><span>駅ボーナス（${s.stations}駅）</span><span>+${sc.stationBonus}</span><span>完走ボーナス</span><span>+${sc.clearBonus}</span><span>カルマ</span><span>−${sc.karmaPen}</span>`;
    const statsArr = [['🪑', '譲った席', s.gives], ['👊', '撃退した悪者', s.chikanKO + s.thiefKO + (s.suriKO || 0) + (s.henchKO || 0) + (s.emperorKO || 0) + (s.brawlKO || 0)], ['👛', '届けた落とし物', s.delivered], ['💺', '座れた回数', s.sits], ['💥', 'カウンター', s.counters], ['😈', '洗脳・どかし', s.brainwash + s.force]];
    $('rStats').innerHTML = statsArr.map(([i, n, v]) => `<div><b>${i} ${v}</b>${n}</div>`).join('');
    const achNames = newAch.map(id => (SW.ACHIEVEMENTS.find(a => a.id === id) || {}).name).filter(Boolean);
    $('rAch').innerHTML = (achNames.length ? '🎖 実績：' + achNames.join('、') : '') + (unlockMsg ? '<br>' + unlockMsg : '') + (s.bestDeed ? `<br><span style="color:var(--sub)">最大の善行：${s.bestDeed.label}（+${s.bestDeed.pts}）</span>` : '');
    $('rLv').textContent = lv1 > lv0 ? '⬆ Lv.' + lv1 + ' にアップ！' : 'Lv.' + lv1 + '　経験値 +' + xpGot;
    $('rLv').classList.toggle('up', lv1 > lv0); $('rLv').title = xpMsg;
    updateLvBadge();
    $('rRank').textContent = ''; $('rMiniBox').classList.add('hidden'); $('rMini').innerHTML = '';
    lastResult = { sc, cause: r.cause, causeTxt, stats: s, mode, stName, endless: g.endless, koText: r.text, dg, rookie: !!g.rookie, rule: g.rule || null, rkTrain: g.rkTrain, rkWeek: g.rkWeek };
    if (g.rule) { $('rText').innerHTML += `<br><b style="color:#ffd447">📅 今日のルール：${g.rule.icon} ${esc(g.rule.name)}</b>`; track('今日のルール：' + g.rule.name + '：' + ({ clear: '終点到着', collapse: '膝が笑った', ko: 'KO負け', arrest: '連行', broken: '心が折れた' }[r.cause] || r.cause)); }
    {
      const causeJa = { clear: '終点到着', collapse: '膝が笑った', ko: 'KO負け', arrest: '連行', broken: '心が折れた' }[r.cause] || r.cause;
      const band = sc.total >= 2000 ? '2000〜' : sc.total >= 1000 ? '1000〜1999' : sc.total >= 500 ? '500〜999' : sc.total >= 200 ? '200〜499' : '0〜199';
      track('結果：' + (MODE_JA[mode] || mode) + '：' + causeJa);
      if (g.boss && r.cause !== 'clear' && SW.BOSS[g.boss.key]) track('ボス駅：' + SW.BOSS[g.boss.key].name + '：倒れた' + (mode === 'bossrush' ? '（ラッシュ）' : '')); // どのボス駅でつまずいたか
      if (mode === 'bossrush') track('ボス駅ラッシュ：クリア ' + Math.min(20, g.stats.bossClear || 0) + ' 駅');
      track('スコア：' + band);
      if (!g.endless) track('終わった駅：' + Math.min(g.stats.stations, SW.lastStation(g)) + '駅目');
      if (g.rookie) { track('見習い乗車：' + causeJa); track('見習い乗車：終わった駅：' + Math.min(g.stats.stations, SW.lastStation(g)) + '駅目'); }
      for (const a of newAch) { const ach = SW.ACHIEVEMENTS.find(x => x.id === a); if (ach) track('実績：' + ach.name); }
    }
    lastResult.moment = momentText(g); setShareHref(); showNudge(g);
    $('bRetry').textContent = mode === 'practice' ? '🚃 本番に挑戦！' : 'もう一回乗る';
    show('result');
    submitScore(lastResult);
  }
  // ---- シェアのきっかけ：見せ場（大きな善行・ボス駅クリア・めずらしいこと・新記録）をためて、結果画面で「自慢しよう」と出す
  const SHOT = { url: null, p: 0, pending: null, label: '' };
  function addMoment(p, text) {
    if (!G || RP.active || (MP.active && !MP.isHost)) return;
    G.moments = G.moments || []; G.moments.push({ p, t: text });
    if (p > SHOT.p && state === 'play') { SHOT.pending = text; SHOT.pp = p; } // その瞬間の画面を写真に
  }
  function takeShot() {
    try {
      const src = renderer.domElement, k = 720 / Math.max(src.width, src.height), cv = document.createElement('canvas');
      cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
      const c = cv.getContext('2d'); c.drawImage(src, 0, 0, cv.width, cv.height);
      const fs = Math.round(cv.width * 0.05); c.font = 'bold ' + fs + 'px ' + FONT; c.textAlign = 'center';
      c.lineWidth = fs * 0.22; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(SHOT.pending, cv.width / 2, fs * 1.6); c.fillStyle = '#ffd447'; c.fillText(SHOT.pending, cv.width / 2, fs * 1.6);
      const f2 = Math.round(fs * 0.6); c.font = 'bold ' + f2 + 'px ' + FONT; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, cv.height - f2 * 1.8, cv.width, f2 * 1.8);
      c.fillStyle = '#fff'; c.fillText('スワリタイ！　#スワリタイ', cv.width / 2, cv.height - f2 * 0.6);
      SHOT.url = cv.toDataURL('image/jpeg', 0.85); SHOT.p = SHOT.pp; SHOT.label = SHOT.pending;
    } catch (e) { }
    SHOT.pending = null;
  }
  function momentText(g) {
    const m = (g.moments || []).slice(), s = g.stats, R = lastResult;
    if (R && /自己ベスト/.test($('rTitle').textContent) && R.sc.total >= 300) m.push({ p: 260, t: '🆕 自己ベスト ' + R.sc.total + ' 点' });
    if (s.ceo) m.push({ p: 350, t: '🎩 謎の紳士に席を譲った' });
    if (s.alien) m.push({ p: 380, t: '👽 宇宙人に席を譲った' });
    if (g.mikiwame && s.mkBest >= 5) m.push({ p: 300 + s.mkBest, t: '🎯 見極め線で ' + s.mkBest + ' 連続で読み的中' });
    if (g.bossRush && (s.bossClear || 0) >= 3) m.push({ p: 250 + s.bossClear * 10, t: '⚠ ボス駅ラッシュで ' + s.bossClear + ' 駅クリア' });
    m.sort((a, b) => b.p - a.p);
    return m.length && m[0].p >= 150 ? m[0].t : '';
  }
  function setShareHref() { if (lastResult) $('bShareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(lastResult)); }
  // シェアのお礼：1 日 1 回、名前ガチャ +1
  function shareReward() {
    if (profile.shareDay === todayKey()) return;
    profile.shareDay = todayKey(); profile.nameTickets = ticketsLeft() + 1; saveProfile();
    setTimeout(() => addToast('🎟 シェアのお礼：名前ガチャが 1 回ふえた！（1 日 1 回）', 'good'), 600);
    track('シェアのお礼をもらった');
  }
  // 結果画面の「自慢しよう」：見せ場があればそれを、なければ今週のお題を出す
  function showNudge(g, extra) {
    const R = lastResult; if (!R) return;
    const mt = extra || R.moment;
    const reward = profile.shareDay === todayKey() ? '' : '<small>シェアすると名前ガチャ +1（1 日 1 回）</small>';
    $('rNudge').innerHTML = (mt ? `<b>📣 ${esc(mt)}${/[！!]$/.test(mt) ? '' : '！'}</b><span>みんなに自慢しよう</span>` : `<b>📝 今週のお題：${esc(weekTheme())}</b><span>#スワリタイ で投稿しよう</span>`) + reward
      + `<div><a class="btn main" id="nuX" target="_blank" rel="noopener" style="text-decoration:none">𝕏 でシェア</a>${SHOT.url ? '<button class="btn" id="nuShot">📸 見せ場の写真</button>' : ''}</div>`;
    if (extra) { R.moment = extra; setShareHref(); }
    $('nuX').href = $('bShareX').href;
    $('nuX').onclick = () => { track('自慢しようからシェア'); shareReward(); try { navigator.clipboard && navigator.clipboard.writeText(shareText(R)).catch(() => { }); } catch (e) { } };
    if ($('nuShot')) $('nuShot').onclick = () => shareShot();
    $('rNudge').classList.remove('hidden');
  }
  async function shareShot() {
    if (!SHOT.url) return;
    track('見せ場の写真をシェア・保存した');
    const blob = await (await fetch(SHOT.url)).blob(), file = 'suwaritai-mise.jpg';
    try { if (isTouch && navigator.canShare && navigator.canShare({ files: [new File([blob], file, { type: 'image/jpeg' })] })) { await navigator.share({ files: [new File([blob], file, { type: 'image/jpeg' })], text: shareText(lastResult) }); shareReward(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { if (window.claude && window.claude.use) { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: file, data: blob }); return; } } } catch (e) { }
    const a = document.createElement('a'); a.href = SHOT.url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
  }
  // ---- シェア：今日のダイヤは Wordle のような絵文字の結果（1 駅 1 マス）。見せ場があれば先頭に
  const WEEK_THEMES = ['ボス駅ラッシュで何駅まで行けた？', '今日のダイヤ、どの駅で倒れた？', '見極め線で何連続で読めた？', 'あなたの乗客タイプ診断は？', 'ランク線の段位は？', 'いちばん笑えた倒れかたは？'];
  function weekTheme() { const d = new Date(weekKey() + 'T00:00:00'); return WEEK_THEMES[Math.floor(d.getTime() / (7 * 86400000)) % WEEK_THEMES.length]; }
  function shareText(R) {
    const s = R.stats, grid = (s.stLog || []).join('');
    if (R.mode === 'daily') { // 今日のダイヤ：ネタバレなしで、くらべたくなる形
      const top = R.rk && R.rk.rank && R.rk.total ? Math.max(1, Math.ceil(R.rk.rank / R.rk.total * 100)) : 0;
      const pct = top && top <= 50 ? '（上位' + top + '%）' : R.rk && R.rk.rank && R.rk.rank <= 100 ? '（' + R.rk.rank + '位）' : '';
      return `${R.moment ? R.moment + '\n\n' : ''}スワリタイ！ 今日のダイヤ ${todayKey().slice(5).replace('-', '/').replace(/^0/, '')}\n${R.rule ? R.rule.icon + R.rule.name + '\n' : ''}${grid}\n${R.sc.total}点${pct}\n\nあなたは何点？\n${SHARE_URL}\n\n#スワリタイ`;
    }
    const modeTxt = R.mode === 'daily' ? (R.rule ? '【今日のダイヤ：' + R.rule.icon + R.rule.name + '】' : '【今日のダイヤ】') : R.mode === 'normal' ? '' : '【' + ({ endless: '終点なし', hard: '満員地獄', jiji: '敬老の日', practice: '練習乗車', mikiwame: '見極め線', ranked: 'ランク線', bossrush: 'ボス駅ラッシュ' }[R.mode] || '') + '】';
    const how = R.cause === 'clear' ? '終点に到着！' : R.cause === 'collapse' ? R.stName + 'の手前で膝が笑った…' : R.cause === 'ko' ? (R.koText || '絡み屋に返り討ちにされた…') : R.cause === 'broken' ? '心が折れて途中下車…' : '駅員に連行された…';
    const dg = R.dg ? `わたしは「${R.dg.icon}${R.dg.name}」タイプの乗客でした！\n（${R.dg.desc}）\n\n` : '';
    return `${R.moment ? R.moment + '\n\n' : ''}${dg}${modeTxt}スワリタイ！で ${R.sc.total}点・${how}\n${grid ? grid + '\n' : ''}${R.mode === 'mikiwame' ? '座れた' + s.mkSits + '回・🎯読み的中' + s.mkHits + '回（最大' + s.mkBest + '連続）' : `譲った席${s.gives}・撃退した悪者${SW.villainKO(s)}・落とし物${s.delivered}${s.brainwash + s.force ? '・悪事' + (s.brainwash + s.force) : ''}`}\n\n▶ ブラウザですぐ遊べます（無料）\n${SHARE_URL}\n\n#スワリタイ #乗客タイプ診断 #バカゲー`;
  }
  $('bShareX').addEventListener('click', () => {
    track('X でシェアを押した');
    shareReward();
    if (!lastResult) return;
    try { const p = navigator.clipboard && navigator.clipboard.writeText(shareText(lastResult)); if (p && p.catch) p.catch(() => { }); } catch (e) { }
  });
  document.querySelectorAll('.dg-link').forEach((a) => a.addEventListener('click', () => track('デストロイ碁へ（' + a.dataset.from + '）')));
  document.querySelectorAll('.follow-yt').forEach((a) => a.addEventListener('click', () => track('作者の YouTube を押した（タイトル）')));
  document.querySelectorAll('.follow-x').forEach((a) => a.addEventListener('click', () => track('作者をフォローを押した（' + (a.id === 'bFollow' ? '結果' : a.closest('#title') ? 'タイトル' : a.closest('#mpres') ? 'オンライン結果' : '遊び方') + '）')));
  $('bShareImg').addEventListener('click', async () => {
    track('結果の画像を作った');
    if (!lastResult) return;
    const cv = drawShareImage(lastResult);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const file = 'suwaritai-' + lastResult.sc.total + '.png';
    try {
      if (isTouch && navigator.canShare && navigator.canShare({ files: [new File([blob], file, { type: 'image/png' })] })) {
        await navigator.share({ files: [new File([blob], file, { type: 'image/png' })], text: shareText(lastResult) }); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      if (window.claude && window.claude.use) { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: file, data: blob }); return; } }
    } catch (e) { }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); a.remove();
  });
  function drawShareImage(R) {
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630; const c = cv.getContext('2d');
    // 背景：電車の中
    const gr = c.createLinearGradient(0, 0, 0, 630); gr.addColorStop(0, '#f3efe6'); gr.addColorStop(1, '#cfc7b8'); c.fillStyle = gr; c.fillRect(0, 0, 1200, 630);
    c.fillStyle = '#9ec9e8'; for (let i = 0; i < 4; i++) c.fillRect(60 + i * 290, 70, 230, 170);
    c.fillStyle = '#3f6aa8'; c.fillRect(0, 420, 1200, 70); c.fillStyle = '#2f5590'; c.fillRect(0, 390, 1200, 34);
    c.strokeStyle = '#ddd'; c.lineWidth = 6; for (let x = 80; x < 1200; x += 110) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 40); c.stroke(); c.beginPath(); c.arc(x, 58, 18, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(10,12,18,.82)'; roundRect(c, 80, 110, 1040, 430, 36); c.fill();
    c.textAlign = 'center';
    const fit = (txt, size, maxW) => { let fs = size; c.font = 'bold ' + fs + 'px ' + FONT; while (c.measureText(txt).width > maxW && fs > 20) { fs -= 2; c.font = 'bold ' + fs + 'px ' + FONT; } };
    c.fillStyle = '#fff'; c.font = 'bold 34px ' + FONT; c.fillText('スワリタイ！　乗客タイプ診断', 600, 168);
    const dg = R.dg || { icon: '🚃', name: 'ふつうの通勤者', desc: '' };
    c.fillStyle = '#b8bdc8'; c.font = 'bold 30px ' + FONT; c.fillText('あなたは…', 600, 222);
    c.fillStyle = '#ffd447'; fit(dg.icon + ' ' + dg.name + ' タイプ', 92, 980); c.fillText(dg.icon + ' ' + dg.name + ' タイプ', 600, 318);
    c.fillStyle = '#fff'; fit(dg.desc, 34, 960); c.fillText(dg.desc, 600, 378);
    c.fillStyle = R.cause === 'clear' ? '#5fe08a' : '#ff6b5e'; c.font = 'bold 30px ' + FONT; c.fillText(R.causeTxt + '　' + R.sc.total + '点', 600, 440);
    const s = R.stats;
    c.fillStyle = '#b8bdc8'; c.font = 'bold 26px ' + FONT;
    c.fillText(`🪑譲った席 ${s.gives}　👊撃退 ${SW.villainKO(s)}　👛落とし物 ${s.delivered}　💺着席 ${s.sits}`, 600, 500);
    c.fillStyle = '#333'; c.font = 'bold 24px ' + FONT; c.fillText('#スワリタイ', 600, 590);
    return cv;
  }

  // ================================================================ ランキング（オンライン）
  // claude.ai の中では Artifact の保存場所（db）、公開サイトでは Firebase（デストロイ碁と同じプロジェクトの suwaritai の下）を使う
  const FB_CONFIG = {
    apiKey: 'AIzaSyDFyXeLsfvOTFrJhPFBFuSbk5_GcDffR9k',
    authDomain: 'destroy-go.firebaseapp.com',
    databaseURL: 'https://destroy-go-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'destroy-go',
    storageBucket: 'destroy-go.firebasestorage.app',
  };
  const FB_VER = '10.12.2';
  const inClaude = !!(window.claude && window.claude.use);
  const fbAllowed = !inClaude && /^https?:$/.test(location.protocol) && !/[?&]rank=off/.test(location.search);
  let DB = null, myId = null, rankTab = 'day', fbWait = null;
  (async function initClaude() {
    try {
      if (!inClaude) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      DB = db;
      if (user) { try { myId = await user.id(); } catch (e) { myId = null; } }
    } catch (e) { DB = null; }
  })();
  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
  // Firebase は、ランキングを見る・記録するときに初めて読み込む（匿名ログイン）
  // つなぎっぱなしにしない：使い終わって 30 秒たったら切る（無料枠の「同時接続 100」をすぐ使い切らないように）
  // オンライン対戦の部屋にいるあいだは切らない
  let fbIdleT = 0, fbOff = false;
  function fbTouch(F) {
    if (!F) return F;
    if (fbOff) { try { F.db.goOnline(); } catch (e) { } fbOff = false; }
    clearTimeout(fbIdleT);
    fbIdleT = setTimeout(function idle() {
      if (MP.code || MP.active) { fbIdleT = setTimeout(idle, 30000); return; }
      try { F.db.goOffline(); fbOff = true; } catch (e) { }
    }, 30000);
    return F;
  }
  function firebaseReady() {
    if (!fbAllowed) return Promise.resolve(null);
    if (fbWait) return fbWait.then(fbTouch);
    if (!fbWait) fbWait = withTimeout((async () => {
      if (!window.firebase) for (const m of ['app', 'auth', 'database']) await loadScript(`https://cdn.jsdelivr.net/npm/firebase@${FB_VER}/firebase-${m}-compat.js`);
      const fb = window.firebase;
      const app = fb.apps.length ? fb.app() : fb.initializeApp(FB_CONFIG);
      const auth = app.auth();
      const prev = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
      const user = prev || (await auth.signInAnonymously()).user;
      return { db: app.database(), uid: user.uid, TS: fb.database.ServerValue.TIMESTAMP };
    })(), 12000).catch(e => { fbWait = null; throw e; });
    return fbWait.then(fbTouch);
  }
  function rankName() {
    return validName(profile.name) ? String(profile.name).slice(0, 12) : '名無しの乗客';
  }
  // 「ROBIT」「開発」が入った名前は、決まりで開発者の端末しか書けない。断られたら名無しで書き直す
  let nameRefused = false;
  async function fbSet(ref, data) {
    try { await withTimeout(ref.set(data), 10000); nameRefused = false; return data.n; }
    catch (e) {
      if (!/ROBIT|開発/.test(data.n)) throw e;
      nameRefused = true;
      await withTimeout(ref.set(Object.assign({}, data, { n: '名無しの乗客' })), 10000);
      return '名無しの乗客';
    }
  }
  function nameNote(text) { const el = $('nameNote'); if (!el) return; el.textContent = text || ''; }
  // 名前を変えたら、もう載っている記録の名前も変える
  let nameSync = Promise.resolve();
  function syncName() {
    nameSync = nameSync.then(async () => {
      const name = rankName();
      try {
        if (DB && myId) {
          const ref = DB.doc('scores/' + myId);
          const snap = await withTimeout(ref.get(), 10000);
          const od = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : null;
          if (od && od.name !== name) { await withTimeout(ref.set(Object.assign({}, od, { name })), 10000); nameNote('ランキングの名前も「' + name + '」に変えました'); }
          return;
        }
        if (!fbAllowed) return;
        const F = await firebaseReady(); if (!F) return;
        let changed = false, used = name;
        for (const path of ['suwaritai/best/' + F.uid, 'suwaritai/daily/' + todayKey() + '/' + F.uid, 'suwaritai/day/' + todayKey() + '/' + F.uid, 'suwaritai/week/' + weekKey() + '/' + F.uid]) {
          const ref = F.db.ref(path);
          const old = (await withTimeout(ref.get(), 10000)).val();
          if (old && old.n !== name) { used = await fbSet(ref, Object.assign({ n: name, s: old.s, ti: old.ti || '', t: F.TS }, old.v ? { v: old.v } : {})); changed = true; }
        }
        if (nameRefused) nameNote('「ROBIT」「開発」が入った名前はランキングでは使えません（名無しの乗客になります）');
        else if (changed) nameNote('ランキングの名前も「' + used + '」に変えました');
        else nameNote('');
      } catch (e) { nameNote('ランキングの名前を変えられませんでした（次に遊んだときにもう一度送ります）'); }
    });
  }
  // 1 件ずつ順番に書く（同じ場所への書きこみを重ねない）
  let submitting = Promise.resolve();
  function submitScore(R) {
    if (BAL2) { $('rRank').textContent = '🧪 新バランスのお試し版なので、ランキングには載りません'; return; }
    if (R.rookie) { $('rRank').textContent = '🔰 見習い乗車なので、ランキングには載りません。次から本番！'; return; }
    if (R.mode === 'mikiwame') { if (!DB && fbAllowed) submitMk(R); return; }
    if (R.mode === 'ranked') { const rec = REC && REC.done ? REC : null; REC = null; if (!DB && fbAllowed) submitRanked(R, rec); return; } // 見極め線は自分のランキング（今週・歴代）
    if (R.mode !== 'normal' && R.mode !== 'daily') return;
    if (!DB && !fbAllowed) return;
    if (DB && !myId) return;
    $('rRank').textContent = 'ランキングに記録中…';
    submitting = submitting.then(async () => {
      try {
        const rec = REC && REC.done ? REC : null; REC = null;
        const res = DB ? await submitClaude(R) : await submitFirebase(R);
        if (!DB) recUpload(R, res, rec);
        const rk = (x) => x ? (x.rank ? x.rank + '位' : '100位より下') : '-';
        const main = res && (R.mode === 'daily' ? res.daily : res.day);
        if (main && R === lastResult) { R.rk = { rank: main.rank, total: main.total }; setShareHref(); }
        if (state === 'result' && main) $('rRank').textContent = `🏆 ${R.mode === 'daily' ? '今日のダイヤ' : '今日'} ${rankTxt(main)}・今週 ${rk(res.week)}・歴代 ${rk(res.best)}${res.best && res.best.improved ? '（自己ベスト更新！）' : ''}` + (nameRefused ? '　※「ROBIT」「開発」が入った名前は使えないため、名無しの乗客で載せました' : '');
        else if (state === 'result') $('rRank').textContent = '';
        if (state === 'result' && main) showMiniBoard(R.mode === 'daily' ? 'daily' : 'day');
        if (!DB) claimGifts();
      } catch (e) {
        if (state === 'result') $('rRank').textContent = 'ランキングに記録できませんでした（記録はこの端末に残っています）';
      }
    });
  }
  // ---- 順位と人数：50 点ごとの人数（suwaritai/hist/{種類}/{日付など}/b{点数÷50}）で出す
  // 自分より上のかたまりの人数を足し、同じかたまりの中だけ実際に数える。分布は 1 時間ごとに作り直している（Actions の suwaritai-hist）
  const HIST_W = 50;
  const histB = (s) => 'b' + Math.floor(Math.max(0, s) / HIST_W);
  function histPath(parent) { const a = parent.split('/'); return 'suwaritai/hist/' + a[1] + '/' + (a[2] || 'all'); }
  async function histAdd(F, hp, b, d) { try { await withTimeout(F.db.ref(hp + '/' + b).transaction((v) => Math.max(0, (v || 0) + d)), 8000); } catch (e) { } }
  async function rankOf(F, parent, myS) {
    try {
      if (/\/mk\//.test(parent)) throw new Error('mk'); // 見極め線は点数の分布がないので、上の人を数える
      const hist = (await withTimeout(F.db.ref(histPath(parent)).get(), 8000)).val() || {};
      const myB = Math.floor(Math.max(0, myS) / HIST_W);
      let above = 0, total = 0;
      for (const k in hist) { const n = +hist[k] || 0, b = +k.slice(1); total += n; if (b > myB) above += n; }
      const top = (myB + 1) * HIST_W - 0.001;
      const inB = (await withTimeout(F.db.ref(parent).orderByChild('s').startAt(myS + 0.5).endAt(top).get(), 8000)).numChildren();
      const rank = above + inB + 1;
      return { rank, total: Math.max(total, rank) };
    } catch (e) {
      const above = (await withTimeout(F.db.ref(parent).orderByChild('s').startAt(myS + 0.5).limitToFirst(TOP_N).get(), 10000)).numChildren();
      return { rank: above < TOP_N ? above + 1 : null, total: null };
    }
  }
  const rankTxt = (x) => x && x.rank ? x.rank + '位' + (x.total ? '/' + x.total.toLocaleString() + '人（上位' + Math.max(1, Math.ceil(x.rank / x.total * 100)) + '%）' : '') : x ? '100位より下' : '-';
  // ランキングの記録に「どの版で出した点か」の印 v をつける（1 = 印なし＝2026-11-11 のアップデート前。ボス駅などを入れた版が 2）
  const SCORE_VER = 2;
  const verTag = (x) => x && x.v >= SCORE_VER ? '<span class="vtag" title="アップデート後（ボス駅あり）の記録">新</span>' : '';
  async function submitFirebase(R) {
    const F = await firebaseReady(); if (!F) return null;
    const dk = todayKey(), name = rankName();
    const put = async (path) => {
      const ref = F.db.ref(path);
      const old = (await withTimeout(ref.get(), 10000)).val();
      const better = !old || R.sc.total > old.s;
      if (better || old.n !== name) await fbSet(ref, Object.assign({ n: name, s: better ? R.sc.total : old.s, ti: better ? R.sc.title : old.ti, t: F.TS }, better ? { v: SCORE_VER } : old.v ? { v: old.v } : {}));
      const myS = better ? R.sc.total : old.s;
      const parent = path.slice(0, path.lastIndexOf('/'));
      // 点数の分布（50 点ごとの人数）を足し引きしておく（順位と人数を、全員分を読まずに出すため）
      const hp = histPath(parent);
      if (better) {
        const nb = histB(R.sc.total), ob = old ? histB(old.s) : null;
        if (ob !== nb) { await histAdd(F, hp, nb, 1); if (ob != null) await histAdd(F, hp, ob, -1); }
      }
      const rt = await rankOf(F, parent, myS);
      return { rank: rt.rank, total: rt.total, improved: better && !!old, mine: better };
    };
    const best = await put('suwaritai/best/' + F.uid);
    const day = await put('suwaritai/day/' + dk + '/' + F.uid);
    const week = await put('suwaritai/week/' + weekKey() + '/' + F.uid);
    const daily = R.mode === 'daily' ? await put('suwaritai/daily/' + dk + '/' + F.uid) : null;
    return { best, day, week, daily };
  }
  // ================================================================ ランク線（一人用のレート）
  // 今週の電車を RK_TRAINS 本用意する（週と番号で決まる＝みんな同じ電車）。遊び終わったら、同じ電車を走ったレートの近い人と点数で比べて、イロレートを上げ下げする
  // Firebase：suwaritai/rk/r/{シーズン}/{uid}＝レート、rk/s/{週}/{番号}/{uid}＝点数、rk/c/{週}/{番号}＝人数、rk/rp/{週}/{番号}/{uid}＝リプレイ
  const RK_TRAINS = 30, RK_START = 1500;
  // どの電車にするか：まだ走っていない電車で、ほかの人が 3〜300 人走っているものを優先（比べる相手がいるように）
  async function startRanked() {
    if (!fbAllowed || DB) { addToast('ランク線は遊ぶサイトのオンラインで遊べます', 'warn'); return; }
    const wk = weekKey();
    profile.rkPlayed = profile.rkPlayed && profile.rkPlayed.w === wk ? profile.rkPlayed : { w: wk, l: [] };
    let counts = {};
    try { const F = await firebaseReady(); if (F) counts = (await withTimeout(F.db.ref('suwaritai/rk/c/' + wk).get(), 8000)).val() || {}; } catch (e) { counts = {}; }
    const free = [...Array(RK_TRAINS).keys()].filter((i) => !profile.rkPlayed.l.includes(i));
    if (!free.length) { addToast('今週の電車は全部走りました！ 来週の月曜に新しい電車が来ます', 'warn'); return; }
    const good = free.filter((i) => (counts[i] || 0) >= 3 && (counts[i] || 0) <= 300);
    const pool = good.length ? good : free;
    const i = pool[Math.floor(Math.random() * pool.length)];
    profile.rkPlayed.l.push(i); saveProfile(); // 同じ電車で何回もやり直せないように、始めた時点で走ったことにする
    startGame('ranked:' + i);
  }
  async function submitRanked(R, rec) {
    $('rRank').textContent = 'レートを計算中…';
    try {
      const F = await firebaseReady(); if (!F) { $('rRank').textContent = ''; return; }
      const wk = R.rkWeek, i = R.rkTrain, season = rkSeason(), name = rankName(), score = R.sc.total;
      const myRef = F.db.ref('suwaritai/rk/r/' + season + '/' + F.uid);
      const me = (await withTimeout(myRef.get(), 10000)).val();
      const R0 = me ? me.r : RK_START, games = me ? me.g : 0;
      const sPath = 'suwaritai/rk/s/' + wk + '/' + i;
      const all = (await withTimeout(F.db.ref(sPath).orderByChild('r').startAt(R0 - 400).endAt(R0 + 400).get(), 10000)).val() || {};
      const opps = Object.entries(all).filter(([u]) => u !== F.uid).map(([u, v]) => ({ uid: u, s: v.s, r: v.r, n: v.n }))
        .sort((a, b) => Math.abs(a.r - R0) - Math.abs(b.r - R0)).slice(0, 10);
      // 人が足りないときは CPU で補う（いつも自分＋3 人以上で比べる）。CPU は同じ電車を実際に走らせた点数をもとに、弱・普通・強の 3 段
      if (opps.length < 3) {
        await new Promise((r) => setTimeout(r, 30));
        const base = rkCpuScore(rkSeed(wk, i));
        const cpus = [['CPU（弱）', 0.75, 1300], ['CPU（普通）', 1, 1500], ['CPU（強）', 1.3, 1700]].sort((a, b) => Math.abs(a[2] - R0) - Math.abs(b[2] - R0));
        for (const [n, k, r] of cpus.slice(0, 3 - opps.length)) opps.push({ uid: 'cpu', s: Math.round(base * k), r, n, cpu: true });
      }
      let delta = 0, held = false;
      if (opps.length) {
        const K = games < 10 ? 40 : 24;
        let sum = 0; for (const o of opps) { const E = 1 / (1 + Math.pow(10, (o.r - R0) / 400)); sum += (score > o.s ? 1 : score === o.s ? 0.5 : 0) - E; }
        delta = Math.round(K * sum / opps.length * Math.min(1, opps.length / 3));
        const hum = opps.filter((o) => !o.cpu);
        if (score > Math.max(...opps.map((o) => o.s)) * 1.6 + 400 && (hum.length >= 3 || score > 6000)) { held = true; delta = 0; } // ありえないほど高い点は保留
      }
      delta = Math.max(-60, Math.min(60, delta));
      const R1 = Math.max(0, R0 + delta);
      await withTimeout(F.db.ref(sPath + '/' + F.uid).set({ s: score, r: R0, n: name, t: F.TS }), 10000).catch(() => { });
      await withTimeout(myRef.set({ r: me ? R1 : Math.max(1440, Math.min(1560, R1)), n: name, g: games + 1, t: F.TS }), 10000);
      F.db.ref('suwaritai/rk/c/' + wk + '/' + i).transaction((v) => (v || 0) + 1).catch(() => { });
      profile.rk = { r: R1, s: season }; saveProfile();
      const place = opps.filter((o) => o.s > score).length + 1;
      const t0 = rkTier(R0), t1 = rkTier(R1);
      let txt = `🏅 レート ${R0} → <b>${R1}</b>（${delta >= 0 ? '+' : ''}${delta}）　${rkBadge(R1)}`;
      const nCpu = opps.filter((o) => o.cpu).length;
      txt += `<br>同じ電車の ${opps.length + 1} 人中 ${place} 位` + (nCpu ? `（うち CPU ${nCpu}）` : '');
      if (held) txt += '<br>⚠ 点数が高すぎるので、レートは保留にしました';
      if (t1[0] > t0[0]) { txt += `<br>🎉 段位が上がった！ ${t1[1]} ${t1[2]}`; sfx('clear'); showNudge(G, t1[1] + ' ランク線で「' + t1[2] + '」に昇格'); }
      if (state === 'result') { $('rRank').innerHTML = txt; }
      // リプレイを載せる（同じ電車の人がいつでも見られるように）
      if (rec && rec.done) { try { const d = await gz(JSON.stringify({ v: 1, seed: rec.seed, mode: 'normal', fr: rec.fr })); if (d.length < 900000) await withTimeout(F.db.ref('suwaritai/rk/rp/' + wk + '/' + i + '/' + F.uid).set({ n: name, s: score, d, t: F.TS }), 20000); } catch (e) { } }
      // 同じ電車のリプレイを、ボタンで切りかえて見られるように
      const list = [{ uid: F.uid, n: name, s: score }].concat(opps.filter((o) => !o.cpu).map((o) => ({ uid: o.uid, n: o.n, s: o.s }))).sort((a, b) => b.s - a.s);
      if (state === 'result') $('rRank').insertAdjacentHTML('beforeend', '<div class="rkOpp">' + [{ n: name, s: score, me: 1 }].concat(opps).sort((a, b) => b.s - a.s).map((o, k) => `<span class="${o.me ? 'me' : ''}">${k + 1}. ${o.cpu ? '🤖 ' + o.n : esc(dispName(o.n))} ${o.s}</span>`).join('') + '</div>');
      RK_LIST = { wk, i, list };
      if (state === 'result') $('rRank').insertAdjacentHTML('beforeend', `<br><button class="btn sub2" id="rkWatch" style="margin-top:6px">▶ 同じ電車のリプレイを見る（${list.length} 人）</button>`);
      const wb = $('rkWatch'); if (wb) wb.addEventListener('click', () => playReplayList(RK_LIST, 0));
      track('ランク線：結果（' + t1[2] + '）');
    } catch (e) { if (state === 'result') $('rRank').textContent = 'レートを記録できませんでした'; }
  }
  let RK_LIST = null;
  // CPU の点数：同じ電車（シード）を CPU に走らせる（毎回同じ結果になる）
  const rkCpuCache = {};
  function rkCpuScore(seed) {
    if (rkCpuCache[seed] != null) return rkCpuCache[seed];
    const g = SW.create({ seed, mode: 'normal', players: [{ name: 'CPU', cpu: true }] });
    for (let n = 0; !g.over && n < 15 * 60 * 15; n++) { SW.updateMulti(g, 1 / 15, [null]); for (const P of g.players) P.events.length = 0; }
    return (rkCpuCache[seed] = Math.max(100, SW.finalScoreOf(g, 0).total));
  }
  function playReplayList(L, k) {
    if (!L || !L.list.length) return;
    k = ((k % L.list.length) + L.list.length) % L.list.length;
    const x = L.list[k];
    playReplay('rk', x.uid, { path: 'suwaritai/rk/rp/' + L.wk + '/' + L.i + '/' + x.uid, list: L, k });
  }
  // 見極め線のランキング：suwaritai/mk/best・suwaritai/mk/week/{週}。人数が少ないうちは点数の分布は使わず、上の人を数える
  async function submitMk(R) {
    $('rRank').textContent = 'ランキングに記録中…';
    try {
      const F = await firebaseReady(); if (!F) { $('rRank').textContent = ''; return; }
      const name = rankName(), out = [];
      for (const [lab, path] of [['今週', 'suwaritai/mk/week/' + weekKey()], ['歴代', 'suwaritai/mk/best']]) {
        const ref = F.db.ref(path + '/' + F.uid);
        const old = (await withTimeout(ref.get(), 10000)).val();
        const better = !old || R.sc.total > old.s;
        if (better || old.n !== name) await fbSet(ref, Object.assign({ n: name, s: better ? R.sc.total : old.s, ti: better ? R.sc.title : old.ti, t: F.TS }, better ? { v: SCORE_VER } : old.v ? { v: old.v } : {}));
        const myS = better ? R.sc.total : old.s;
        const above = (await withTimeout(F.db.ref(path).orderByChild('s').startAt(myS + 0.5).limitToFirst(TOP_N).get(), 10000)).numChildren();
        out.push(lab + ' ' + (above < TOP_N ? (above + 1) + '位' : '100位より下') + (better && old ? '（更新！）' : ''));
      }
      if (state === 'result') $('rRank').textContent = '🏆 見極め線 ' + out.join('・');
    } catch (e) { if (state === 'result') $('rRank').textContent = 'ランキングに記録できませんでした'; }
  }
  async function submitClaude(R) {
    const ref = DB.doc('scores/' + myId);
    const snap = await withTimeout(ref.get(), 10000);
    const od = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : null;
    const cur = Object.assign({ name: '', best: 0, title: '', dailyDate: '', dailyScore: 0, dailyTitle: '', dayDate: '', dayScore: 0, dayTitle: '', weekKey: '', weekScore: 0, weekTitle: '', plays: 0 }, od || {});
    const dk = todayKey(), wk = weekKey();
    const name = rankName();
    let improved = false;
    cur.name = name;
    if (R.sc.total > cur.best) { cur.best = R.sc.total; cur.title = R.sc.title; improved = true; }
    if (R.mode === 'daily' && (cur.dailyDate !== dk || R.sc.total > cur.dailyScore)) { cur.dailyDate = dk; cur.dailyScore = R.sc.total; cur.dailyTitle = R.sc.title; }
    if (cur.dayDate !== dk || R.sc.total > cur.dayScore) { cur.dayDate = dk; cur.dayScore = R.sc.total; cur.dayTitle = R.sc.title; }
    if (cur.weekKey !== wk || R.sc.total > cur.weekScore) { cur.weekKey = wk; cur.weekScore = R.sc.total; cur.weekTitle = R.sc.title; }
    cur.plays = (cur.plays || 0) + 1; cur.updated = Date.now();
    await withTimeout(ref.set(cur), 10000);
    const out = {};
    for (const tab of ['normal', 'day', 'week'].concat(R.mode === 'daily' ? ['daily'] : [])) {
      const b = await fetchBoard(tab);
      out[tab === 'normal' ? 'best' : tab] = b && b.mine ? { rank: b.mine.rank, total: b.total, improved: tab === 'normal' && improved } : null;
    }
    return out;
  }
  async function fetchClaude() {
    const snap = await withTimeout(DB.collection('scores').limit(1000).get(), 10000);
    return snap.docs.map(d => { const v = typeof d.data === 'function' ? d.data() : d.data; return Object.assign({ id: d.id }, v || {}); });
  }
  // 表に出す形 [{id, name, score, title}]
  // 表に出す形 { list:[{id, name, score, title}]（上位）, me:自分の id, mine:{rank, score, name, title} | null, total }
  const TOP_N = 100;
  // ---- 自分の点数のまわり（100 位より下のとき）：自分のすぐ上と下を NEAR_N 人ずつ読む（全員分は読まない）
  const NEAR_N = 5;
  // 並べた人に順位をつける：自分の順位 myRank をもとに、上下の人は 1 つずつずらす（同じ点数は同じ順位）
  function withRanks(list, myId, myRank) {
    const m = list.findIndex((x) => x.id === myId); if (m < 0) return null;
    let prev = null, prevRank = 0;
    return list.map((x, i) => {
      const r = typeof myRank === 'number' ? (x.score === list[m].score ? myRank : myRank + (i - m)) : x.id === myId ? myRank : null;
      const rank = x.score === prev ? prevRank : r; prev = x.score; prevRank = rank;
      return Object.assign({}, x, { rank });
    });
  }
  async function fetchNear(F, path, mine) {
    const ref = () => F.db.ref(path); // 問い合わせごとに作る
    const [up, down] = await Promise.all([
      withTimeout(ref().orderByChild('s').startAt(mine.score).limitToFirst(NEAR_N + 1).get(), 8000),
      withTimeout(ref().orderByChild('s').endAt(mine.score).limitToLast(NEAR_N + 1).get(), 8000),
    ]);
    const seen = new Set(), arr = [];
    for (const snap of [up, down]) snap.forEach((c) => { if (seen.has(c.key)) return; seen.add(c.key); const v = c.val() || {}; arr.push({ id: c.key, name: dispName(v.n, c.key), score: v.s || 0, title: v.ti, v: v.v || 1 }); });
    if (!seen.has(mine.id)) arr.push(mine);
    // 点数の高い順。同じ点数なら自分をいちばん上に（自分の順位＝同じ点数の人の順位）
    arr.sort((a, b) => b.score - a.score || (a.id === mine.id ? -1 : b.id === mine.id ? 1 : 0));
    const m = arr.findIndex((x) => x.id === mine.id);
    return withRanks(arr.slice(Math.max(0, m - NEAR_N), m + NEAR_N + 1), mine.id, mine.rank);
  }
  // ---- ランキングのごほうび（Actions の suwaritai-gifts が置く）：名前ガチャチケットと、先週 1 位の 👑
  let crownCache = null, giftChecked = false;
  async function fetchCrown(F) {
    if (crownCache) return crownCache;
    try { crownCache = (await withTimeout(F.db.ref('suwaritai/crown').get(), 8000)).val() || {}; } catch (e) { crownCache = {}; }
    return crownCache;
  }
  const crownOf = (b, id) => { const c = b && b.crown && b.crown[id]; return c && c.until >= todayKey() ? '<span class="crown" title="先週の今週ランキング 1 位">👑</span>' : ''; };
  async function claimGifts() {
    if (giftChecked || DB || !fbAllowed) return; giftChecked = true;
    try {
      const F = await firebaseReady(); if (!F) return;
      const ref = F.db.ref('suwaritai/gifts/' + F.uid);
      const v = (await withTimeout(ref.get(), 8000)).val();
      if (!v || !(v.t > 0)) return;
      await withTimeout(ref.remove(), 8000); // 先に消す（消せなかったら受け取らない＝2 回もらえないように）
      profile.nameTickets = ticketsLeft() + Math.min(20, v.t); saveProfile();
      track('ランキングのごほうびを受け取った');
      const bn = document.createElement('div'); bn.id = 'giftBanner';
      bn.innerHTML = `<b>🎁 ${esc(v.msg || 'ランキングのお礼')}</b><span>名前ガチャチケット 🎟×${Math.min(20, v.t)} をプレゼント！ 遊んでくれてありがとう</span><div><button class="btn main" id="giftGo">🎲 名前ガチャを引く</button><button class="btn sub2" id="giftX">あとで</button></div>`;
      document.body.appendChild(bn);
      sfx('clear');
      $('giftX').addEventListener('click', () => bn.remove());
      $('giftGo').addEventListener('click', () => { bn.remove(); if (state === 'play') return; backTo = state === 'result' ? 'result' : 'title'; renderNameGacha(); show('namegacha'); });
    } catch (e) { giftChecked = false; }
  }
  async function fetchBoard(tab) {
    const dk = todayKey();
    if (DB) {
      if (/^mk/.test(tab)) return { list: [], me: myId, mine: null, total: 0 }; // Claude 版では見極め線のランキングは記録しない
      const all = await fetchClaude();
      const wk = weekKey();
      const arr = (tab === 'daily' ? all.filter(x => x.dailyDate === dk && x.dailyScore > 0).map(x => ({ id: x.id, name: x.name, score: x.dailyScore, title: x.dailyTitle }))
        : tab === 'day' ? all.filter(x => x.dayDate === dk && x.dayScore > 0).map(x => ({ id: x.id, name: x.name, score: x.dayScore, title: x.dayTitle }))
        : tab === 'week' ? all.filter(x => x.weekKey === wk && x.weekScore > 0).map(x => ({ id: x.id, name: x.name, score: x.weekScore, title: x.weekTitle }))
        : all.filter(x => x.best > 0).map(x => ({ id: x.id, name: x.name, score: x.best, title: x.title }))).sort((a, b) => b.score - a.score);
      arr.forEach((x) => { x.name = dispName(x.name, x.id); });
      const i = arr.findIndex(x => x.id === myId);
      const near = i >= TOP_N ? withRanks(arr.slice(Math.max(0, i - NEAR_N), i + NEAR_N + 1), myId, i + 1) : null;
      return { list: arr.slice(0, TOP_N), me: myId, mine: i >= 0 ? Object.assign({ rank: i + 1 }, arr[i]) : null, total: arr.length, near };
    }
    const F = await firebaseReady(); if (!F) return null;
    const path = tab === 'mkweek' ? 'suwaritai/mk/week/' + weekKey() : tab === 'mkbest' ? 'suwaritai/mk/best' : tab === 'daily' ? 'suwaritai/daily/' + dk : tab === 'day' ? 'suwaritai/day/' + dk : tab === 'week' ? 'suwaritai/week/' + weekKey() : 'suwaritai/best';
    const snap = await withTimeout(F.db.ref(path).orderByChild('s').limitToLast(TOP_N).get(), 10000);
    const arr = [];
    snap.forEach(c => { const v = c.val() || {}; arr.push({ id: c.key, name: dispName(v.n, c.key), score: v.s || 0, title: v.ti, v: v.v || 1 }); });
    arr.sort((a, b) => b.score - a.score);
    let mine = null, total = arr.length, near = null;
    const own = (await withTimeout(F.db.ref(path + '/' + F.uid).get(), 10000)).val();
    if (own) {
      const inTop = arr.findIndex((x) => x.id === F.uid);
      let rank = inTop >= 0 ? inTop + 1 : null; // 上位にいるときも順位を入れる（「あなたの順位へ」に出す）
      if (inTop < 0) { const rt = await rankOf(F, path, own.s); rank = rt.rank || '100+'; if (rt.total) total = rt.total; }
      mine = { id: F.uid, rank, score: own.s, name: dispName(own.n, F.uid), title: own.ti, v: own.v || 1 };
      if (inTop < 0) { try { near = await fetchNear(F, path, mine); } catch (e) { near = null; } }
    }
    if (arr.length >= TOP_N && total === arr.length && !/^mk/.test(tab)) {
      // 全員の人数は、点数の分布から数える（全員分は読まない）
      try { const h = (await withTimeout(F.db.ref(histPath(path)).get(), 8000)).val() || {}; let t = 0; for (const k in h) t += +h[k] || 0; total = t >= arr.length ? t : null; } catch (e) { total = null; }
    }
    const rp = await fetchRpInfo(F, tab).catch(() => null);
    const crown = await fetchCrown(F);
    claimGifts();
    return { list: arr, me: F.uid, mine, total, rp, near, crown };
  }
  document.querySelectorAll('[data-rt]').forEach(b => b.addEventListener('click', () => setRankTab(b.dataset.rt)));
  function setRankTab(tab) {
    rankTab = tab;
    $('mkTabs').classList.toggle('hidden', !/^mk/.test(tab));
    document.querySelectorAll('[data-mt]').forEach((x) => x.classList.toggle('on', 'mk' + x.dataset.mt === tab));
    $('rkTabs').classList.toggle('hidden', tab !== 'rk' && tab !== 'rkon');
    document.querySelectorAll('[data-kt]').forEach((x) => x.classList.toggle('on', x.dataset.kt === tab));
    if (tab === 'rk' || tab === 'rkon') { $('mkTabs').classList.add('hidden'); $('coopTabs').classList.add('hidden'); document.querySelectorAll('[data-rt]').forEach((x) => x.classList.toggle('on', x.dataset.rt === 'rk')); loadRanking(tab); return; }
    if (/^mk/.test(tab)) { document.querySelectorAll('[data-rt]').forEach((x) => x.classList.toggle('on', x.dataset.rt === 'mkweek')); $('coopTabs').classList.add('hidden'); loadRanking(tab); return; }
    $('coopTabs').classList.toggle('hidden', !/^coop/.test(tab));
    document.querySelectorAll('[data-ct]').forEach((x) => x.classList.toggle('on', 'coop' + x.dataset.ct === tab));
    if (/^coop/.test(tab)) { document.querySelectorAll('[data-rt]').forEach((x) => x.classList.toggle('on', x.dataset.rt === 'coop2')); loadRanking(tab); return; }
    document.querySelectorAll('[data-rt]').forEach(x => x.classList.toggle('on', x.dataset.rt === tab));
    loadRanking(tab);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  // 同じ点数は同じ順位にする
  function rankRows(b, limit) {
    let html = '', prev = null, rank = 0, meShown = false;
    b.list.slice(0, limit).forEach((x, i) => {
      if (x.score !== prev) { rank = i + 1; prev = x.score; }
      const me = x.id === b.me; if (me) meShown = true;
      const rp = b.rp && rank <= RP_TOP && b.rp.has[x.id] === x.score ? b.rp : null;
      html += `<div class="rk ${me ? 'me' : ''}"><span class="n">${rank}</span><span class="nm">${crownOf(b, x.id)}${nameHtml(x.name || '名無しの乗客')}${me ? ' <span class="pill">あなた</span>' : ''}<div class="ttl">${verTag(x)}${esc(x.title)}${rpStats(rp, x.id)}</div></span><span class="sc">${x.score}</span>${rp ? `<button class="rpb" data-rp="${esc(x.id)}" data-kind="${rp.kind}" title="リプレイを見る">▶</button>` : ''}</div>`;
    });
    if (b.mine && !meShown) {
      // 100 位より下：自分の点数のまわり（上と下の数人）を出す。結果画面の小さい表では上下 1 人ずつ
      const near = b.near && b.near.length ? b.near : [b.mine];
      const m = near.findIndex((x) => x.id === b.me), k = limit <= 5 ? 1 : NEAR_N;
      html += `<div class="rk" style="justify-content:center;color:var(--sub)">⋮ あなたのまわり ⋮</div>`;
      const inList = new Set(b.list.slice(0, limit).map((x) => x.id));
      near.slice(Math.max(0, m - k), m + k + 1).filter((x) => !inList.has(x.id)).forEach((x) => {
        const me = x.id === b.me;
        html += `<div class="rk ${me ? 'me' : ''}"><span class="n">${x.rank == null ? '-' : x.rank}</span><span class="nm">${crownOf(b, x.id)}${nameHtml(x.name || '名無しの乗客')}${me ? ' <span class="pill">あなた</span>' : ''}<div class="ttl">${verTag(x)}${esc(x.title)}</div></span><span class="sc">${x.score}</span></div>`;
      });
    }
    return html;
  }
  // 共闘ランキング（人数ごと）
  document.querySelectorAll('[data-kt]').forEach((b) => b.addEventListener('click', () => setRankTab(b.dataset.kt)));
  document.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => setRankTab('mk' + b.dataset.mt)));
  document.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('click', () => setRankTab('coop' + b.dataset.ct)));
  // ランク線のレートのランキング（今のシーズン）
  async function loadRk(listEl, tab) {
    const online = tab === 'rkon'; // rk：ひとり（ランク線）、rkon：オンライン対戦のレート
    try {
      if (DB) { $('rankNote').textContent = 'ランク線は遊ぶサイトで'; listEl.innerHTML = '<p class="small">Claude 版ではランク線は遊べません</p>'; return; }
      const F = await firebaseReady(); if (!F) throw new Error('none');
      const season = rkSeason();
      const snap = await withTimeout(F.db.ref('suwaritai/' + (online ? 'mm' : 'rk') + '/r/' + season).orderByChild('r').limitToLast(TOP_N).get(), 10000);
      if (rankTab !== tab) return;
      const arr = []; snap.forEach((c) => { const v = c.val() || {}; arr.push({ id: c.key, name: dispName(v.n, c.key), r: v.r || 0, g: v.g || 0 }); });
      arr.sort((a, b) => b.r - a.r);
      $('rankNote').textContent = (online ? '🌐 オンライン対戦のレート（レート戦）' : '🏅 ランク線のレート（ひとり）') + '・' + season.replace('-', '年') + '月のシーズン・' + arr.length + '人';
      let prev = null, rank = 0;
      listEl.innerHTML = arr.length ? arr.map((x, i) => { if (x.r !== prev) { rank = i + 1; prev = x.r; } const me = x.id === F.uid; return `<div class="rk ${me ? 'me' : ''}"><span class="n">${rank}</span><span class="nm">${nameHtml(x.name)}${me ? ' <span class="pill">あなた</span>' : ''}<div class="ttl">${rkBadge(x.r)}・${x.g} 回</div></span><span class="sc">${x.r}</span></div>`; }).join('') : '<p class="small">まだだれもいません。ランク線で一番乗りしよう！</p>';
    } catch (e) { $('rankNote').textContent = 'ランク線のランキングを読めませんでした'; }
  }
  async function loadCoop(tab, listEl) {
    const n = tab.slice(4);
    try {
      if (DB) { $('rankNote').textContent = '共闘ランキングは遊ぶサイトのオンラインで'; listEl.innerHTML = '<p class="small">Claude 版ではオンライン対戦ができないので、共闘ランキングはありません</p>'; return; }
      const F = await firebaseReady(); if (!F) throw new Error('none');
      const snap = await withTimeout(F.db.ref('suwaritai/coop/' + n).orderByChild('s').limitToLast(TOP_N).get(), 10000);
      if (rankTab !== tab) return;
      const arr = []; snap.forEach((c) => { const v = c.val() || {}; arr.push({ id: c.key, names: String(v.n || '').split('・'), score: v.s || 0, rv: v.rv || 0, mine: c.key.split('_').includes(F.uid) }); });
      arr.sort((a, b) => b.score - a.score);
      $('rankNote').textContent = '🤝 共闘ランキング（' + n + '人・歴代）・オンラインの「共闘」を CPU なしで遊ぶと載る';
      let prev = null, rank = 0;
      listEl.innerHTML = arr.length ? arr.map((x, i) => { if (x.score !== prev) { rank = i + 1; prev = x.score; } return `<div class="rk ${x.mine ? 'me' : ''}"><span class="n">${rank}</span><span class="nm">${x.names.map((m) => nameHtml(dispName(m))).join('<br>')}${x.mine ? ' <span class="pill">あなたのチーム</span>' : ''}<div class="ttl">復活 ${x.rv} 回</div></span><span class="sc">${x.score}</span></div>`; }).join('') : '<p class="small">まだだれもいません。友だちと一番乗りしよう！</p>';
    } catch (e) { $('rankNote').textContent = '共闘ランキングを読めませんでした'; }
  }
  async function loadRanking(tab) {
    const dk = todayKey();
    const listEl = $('rankList');
    const local = () => {
      const wk0 = new Date(weekKey() + 'T00:00:00').getTime(), today = new Date().toDateString();
      const h = (profile.history || []).filter(x => tab === 'daily' ? x.m === 'daily' && new Date(x.d).toDateString() === today : (x.m === 'normal' || x.m === 'daily') && (tab === 'day' ? new Date(x.d).toDateString() === today : tab === 'week' ? x.d >= wk0 : true)).slice(0, 10);
      listEl.innerHTML = h.length ? h.map((x, i) => `<div class="rk"><span class="n">${i + 1}</span><span class="nm">${nameHtml(profile.name || 'あなた')}<div class="ttl">${esc(x.t)}・${new Date(x.d).toLocaleDateString()}</div></span><span class="sc">${x.s}</span></div>`).join('') : '<p class="small">まだ記録がありません</p>';
    };
    if (!DB && !fbAllowed) { $('rankNote').textContent = 'この端末の記録'; local(); return; }
    $('rankNote').textContent = '読み込み中…'; listEl.innerHTML = '';
    if (/^coop/.test(tab)) { loadCoop(tab, listEl); return; }
    if (tab === 'rk' || tab === 'rkon') { loadRk(listEl, tab); return; }
    try {
      const b = await fetchBoard(tab);
      if (!b) throw new Error('none');
      if (rankTab !== tab) return;
      const wk = weekKey().slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
      $('rankNote').textContent = ({ daily: '今日のダイヤ（' + dk + '）・全員同じ電車', day: '今日のランキング（' + dk + '）・毎日 0 時にリセット', week: '今週のランキング（' + wk + '〜）・毎週月曜にリセット', mkweek: '👀 見極め線・今週（' + wk + '〜）', mkbest: '👀 見極め線・歴代' }[tab] || '歴代ランキング（みんなの自己ベスト）') + (b.total == null ? '・上位' + TOP_N + '人' : '・' + b.total + '人');
      listEl.innerHTML = b.list.length ? rankRows(b, TOP_N) : '<p class="small">まだだれもいません。一番乗りしよう！</p>';
      // 自分が下のほうにいるときは「あなたの順位へ」ボタン（押すと自分の行まで動く）
      const meRow = listEl.querySelector('.rk.me');
      if (meRow && b.mine && (typeof b.mine.rank !== 'number' || b.mine.rank > 8)) {
        const jb = document.createElement('button'); jb.className = 'btn sub2 jumpMe'; jb.textContent = '⬇ あなたの順位へ（' + b.mine.rank + (typeof b.mine.rank === 'number' ? '位' : '') + '）';
        jb.addEventListener('click', () => { meRow.scrollIntoView({ block: 'center', behavior: 'smooth' }); track('ランキングで自分の順位へ'); });
        listEl.prepend(jb);
      }
    } catch (e) { $('rankNote').textContent = 'オンラインのランキングを読めませんでした。この端末の記録：'; local(); }
  }
  // 結果画面の小さい順位表（上位 5 人と自分）
  async function showMiniBoard(tab) {
    try {
      const b = await fetchBoard(tab);
      if (!b || state !== 'result' || !b.list.length) return;
      $('rMini').innerHTML = rankRows(b, 5);
      $('rMiniBox').classList.remove('hidden');
    } catch (e) { /* 出さない */ }
  }
  $('bRankR').addEventListener('click', () => { backTo = 'result'; show('rank'); setRankTab(lastResult && lastResult.mode === 'ranked' ? 'rk' : lastResult && lastResult.mode === 'mikiwame' ? 'mkweek' : lastResult && lastResult.mode === 'daily' ? 'daily' : 'day'); track('結果からランキングを開いた'); });

  // ================================================================ リプレイ（ランキング上位 10 位）
  // 遊んでいるあいだ 0.2 秒ごとに様子（オンライン対戦と同じ形）を記録しておき、上位 10 位に入ったら gzip して Firebase に送る
  // suwaritai/rp/{種類}/{uid}：中身　rpi/{種類}/{uid}：目次（点数・日付）　rpv/{uid}：見られた数　rpl/{uid}/{見た人}：いいね
  const RP_TOP = 10, RP_MAXF = 6000; // 6000 コマ＝20 分まで
  const RP_KIND = { day: 'day', week: 'week', normal: 'best', daily: 'daily' };
  let REC = null;
  const RP = { active: false };
  function recStart(mode) {
    REC = null;
    if ((mode !== 'normal' && mode !== 'daily' && mode !== 'ranked') || !fbAllowed || typeof CompressionStream === 'undefined') return;
    REC = { T: { k: 0, sentMax: G.nextId - 1, newIds: [] }, fr: [], acc: 1, ev: [], seed: G.seed, mode: mode === 'ranked' ? 'normal' : mode, done: false, ranked: mode === 'ranked' };
  }
  function recTick(g, dt) {
    if (!REC || REC.done) return;
    for (const e of g.events) REC.ev.push(e);
    REC.acc += dt;
    if (REC.acc < 0.2 && !g.over) return;
    REC.acc = 0; REC.T.k++;
    const snap = worldSnap(g, REC.T);
    let obs = 0; if (g.aim >= 0 && g.aim < SW.PID) { const q = SW.person(g, g.aim); if (q) obs = SW.observe(g, q); }
    snap.pl = [plArr(g, { pl: g.player, aim: g.aim, prompt: g.prompt, out: g.over, ghost: false, result: g.result, tricks: 0 }, obs)];
    snap.ev = REC.ev.slice(-40); REC.ev = [];
    REC.fr.push(snap);
    if (g.over || REC.fr.length >= RP_MAXF) REC.done = true;
  }
  async function gz(str) {
    const buf = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    let bin = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function gunz(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  // 上位 10 位に入ったランキングの種類ぶんだけ送る（res は submitFirebase の結果）
  async function recUpload(R, res, rec) {
    if (!rec || !rec.done || !res) return;
    const kinds = [['best', res.best, 'all'], ['day', res.day, todayKey()], ['week', res.week, weekKey()], ['daily', res.daily, todayKey()]]
      .filter(([, r]) => r && r.mine && r.rank != null && r.rank <= RP_TOP);
    if (!kinds.length) return;
    try {
      const F = await firebaseReady(); if (!F) return;
      const d = await gz(JSON.stringify({ v: 1, seed: rec.seed, mode: rec.mode, fr: rec.fr }));
      if (d.length > 900000) return;
      const name = rankName();
      for (const [kind, , k] of kinds) {
        await withTimeout(F.db.ref('suwaritai/rp/' + kind + '/' + F.uid).set({ n: name, s: R.sc.total, k, d, t: F.TS }), 20000);
        await withTimeout(F.db.ref('suwaritai/rpi/' + kind + '/' + F.uid).set({ n: name, s: R.sc.total, k, t: F.TS }), 10000);
      }
      if (state === 'result') addToast('🎬 上位 ' + RP_TOP + ' 位に入ったので、リプレイを載せました', 'good');
      track('リプレイを載せた');
    } catch (e) { /* 載せられなくても遊ぶのには困らない */ }
  }
  // ランキングの表に出す：リプレイがある行（目次と点数・日付が合う）と、見られた数・いいね
  async function fetchRpInfo(F, tab) {
    const kind = RP_KIND[tab]; if (!kind) return null;
    const key = kind === 'best' ? 'all' : kind === 'week' ? weekKey() : todayKey();
    const [idx, views, likes] = await Promise.all(['suwaritai/rpi/' + kind, 'suwaritai/rpv', 'suwaritai/rpl'].map((p) => withTimeout(F.db.ref(p).get(), 10000).then((s) => s.val() || {}).catch(() => ({}))));
    const out = { kind, has: {}, v: {}, l: {} };
    for (const uid in idx) if (idx[uid] && idx[uid].k === key) out.has[uid] = idx[uid].s;
    for (const uid in views) out.v[uid] = +views[uid] || 0;
    for (const uid in likes) out.l[uid] = Object.keys(likes[uid] || {}).length;
    return out;
  }
  const rpStats = (rp, id) => rp ? `<span class="rpst">👁 ${rp.v[id] || 0}　❤️ ${rp.l[id] || 0}</span>` : '';
  async function playReplay(kind, uid, opt) {
    opt = opt || {};
    const F = await firebaseReady().catch(() => null); if (!F) return;
    $('rankNote').textContent = 'リプレイを読み込み中…';
    let data = null, meta = null;
    try {
      meta = (await withTimeout(F.db.ref(opt.path || ('suwaritai/rp/' + kind + '/' + uid)).get(), 20000)).val();
      if (meta && meta.d) data = JSON.parse(await gunz(meta.d));
    } catch (e) { data = null; }
    if (!data || !data.fr || !data.fr.length) {
      $('rankNote').textContent = 'リプレイを読めませんでした';
      if (opt.list) addToast('この人のリプレイはまだありません（ほかの人を見てね）', 'warn');
      return;
    }
    // 見られた数（自分のは数えない）
    if (uid !== F.uid) F.db.ref('suwaritai/rpv/' + uid).transaction((v) => (v || 0) + 1).catch(() => { });
    track('リプレイを見た');
    initAudio(); clearWorld();
    G = SW.create({ seed: data.seed, mode: data.mode });
    G.modeName = data.mode;
    const looks = {};
    for (const f of data.fr) if (f.nw) Object.assign(looks, f.nw);
    Object.assign(RP, { active: true, nextI: -2, np: null, fr: data.fr, i: -1, t: 0, t0: data.fr[0].t, speed: 1, paused: false, ended: false, looks, uid, kind, name: dispName(meta.n, uid), score: meta.s, obs: null, liked: false, me: F.uid, P: { pl: G.player, out: false, ghost: false, prompt: null, aim: -1, result: null, tricks: 0 }, list: opt.list || null, k: opt.k || 0 });
    $('rpPrevP').classList.toggle('hidden', !RP.list || RP.list.list.length < 2); $('rpNextP').classList.toggle('hidden', !RP.list || RP.list.list.length < 2);
    if (RP.list) $('rpName').dataset.k = (RP.k + 1) + '/' + RP.list.list.length;
    G.player.yaw = 0; endT = 0; pendingResult = false; eyeH = 1.6;
    state = 'play'; show(null);
    $('hud').classList.remove('hidden'); $('touch').classList.add('hidden');
    hud.st = hud.sub = hud.prompt = hud.target = hud.buffs = ''; hud.stam = hud.karma = hud.toku = hud.wallet = hud.mind = -1;
    $('toasts').innerHTML = ''; $('pops').innerHTML = '';
    $('rpName').innerHTML = (RP.list ? `<small>${RP.k + 1}/${RP.list.list.length}</small> ` : '') + nameHtml(RP.name) + ` <b>${RP.score}</b>点`;
    $('rpBar').classList.remove('hidden'); $('rpEnd').classList.add('hidden'); document.body.classList.add('replay');
    rpButtons();
    // いいね済みか
    F.db.ref('suwaritai/rpl/' + uid + '/' + F.uid).get().then((s) => { RP.liked = !!s.val(); rpButtons(); }).catch(() => { });
    F.db.ref('suwaritai/rpl/' + uid).get().then((s) => { RP.likes = s.numChildren(); rpButtons(); }).catch(() => { });
  }
  function rpButtons() {
    $('rpPlay').textContent = RP.paused ? '▶' : '⏸';
    $('rpSpeed').textContent = RP.speed + '×';
    const self = RP.uid === RP.me;
    for (const id of ['rpLike', 'rpLike2']) {
      const b = $(id); b.disabled = RP.liked || self;
      b.textContent = (RP.liked ? '❤️ いいね済み' : self ? '❤️ 自分のリプレイ' : '🤍 いいね') + (RP.likes != null ? ' ' + RP.likes : '');
    }
  }
  function rpTick(dt) {
    const g = G, fr = RP.fr;
    if (!RP.paused && !RP.ended && state === 'play') RP.t += dt * RP.speed;
    const now = RP.t0 + RP.t;
    while (RP.i + 1 < fr.length && fr[RP.i + 1].t <= now) {
      RP.i++;
      const f = fr[RP.i], a = f.pl[0], b = g.player;
      applyWorld(g, f, RP.looks);
      b._tx = a[0] / 100; b._tz = a[1] / 100; b._tyaw = a[2] / 100; b._tpitch = a[3] / 100;
      applyPl(g, RP.P, a);
      g.aim = RP.P.aim; g.prompt = RP.P.prompt; RP.obs = a[27] || null;
      if (RP.speed <= 2) for (const e of f.ev || []) g.events.push(e);
    }
    // なめらかに動かす：今のコマ（i）と次のコマ（i+1）のあいだを、時間でまっすぐつなぐ（0.2 秒ごとの記録でもカクカクしない）
    if (RP.nextI !== RP.i) { RP.nextI = RP.i; rpPrepNext(g); }
    const f0 = fr[RP.i], f1 = fr[RP.i + 1];
    const al = f0 && f1 && f1.t > f0.t ? Math.max(0, Math.min(1, (now - f0.t) / (f1.t - f0.t))) : 1;
    const lerpA = (x, y) => { let d = y - x; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return x + d * al; };
    for (const p of g.people) {
      if (p._tx == null) continue;
      const bx = p._nx != null ? p._nx : p._tx, bz = p._nz != null ? p._nz : p._tz, br = p._nry != null ? p._nry : p._try;
      const nx = p._tx + (bx - p._tx) * al, nz = p._tz + (bz - p._tz) * al;
      const d = Math.hypot(nx - p.x, nz - p.z);
      if (d > 1.5) { p.x = nx; p.z = nz; } // ワープ（乗ってきた・座った）はそのまま
      else { if (d > 0.002 && p.state !== 'seated') p.walkPhase += d * 18; p.x = nx; p.z = nz; }
      p.ry = lerpA(p._try, br);
      if (p.bubble) p.bubbleT = 1;
    }
    const b = g.player;
    if (b._tx != null) {
      const n = RP.np;
      b.x = n ? b._tx + (n[0] - b._tx) * al : b._tx; b.z = n ? b._tz + (n[1] - b._tz) * al : b._tz;
      b.yaw = n ? lerpA(b._tyaw, n[2]) : b._tyaw; b.pitch = n ? b._tpitch + (n[3] - b._tpitch) * al : b._tpitch;
    }
    b.punchAnim = Math.max(0, b.punchAnim - dt);
    $('rpProg').style.width = Math.min(100, (RP.i + 1) / fr.length * 100) + '%';
    if (!RP.ended && RP.i >= fr.length - 1) {
      RP.ended = true;
      setTimeout(() => { if (RP.active && RP.ended) { $('rpEnd').classList.remove('hidden'); $('rpEndT').innerHTML = nameHtml(RP.name) + ' のリプレイ　<b>' + RP.score + '</b>点'; rpButtons(); } }, 1500);
    }
  }
  // 次のコマの場所を、乗客ごとに覚えておく（座っている人は座席の場所）
  function rpPrepNext(g) {
    const f1 = RP.fr[RP.i + 1];
    for (const p of g.people) { p._nx = p._nz = p._nry = null; }
    RP.np = null;
    if (!f1) return;
    const map = new Map(g.people.map((p) => [p.id, p]));
    for (const a of f1.pe || []) {
      const p = map.get(a[0]); if (!p) continue;
      if (STC[a[4]] === 'seated' && a[5] >= 0 && g.seats[a[5]]) { p._nx = g.seats[a[5]].x; p._nz = g.seats[a[5]].z; }
      else { p._nx = a[1] / 100; p._nz = a[2] / 100; }
      p._nry = a[3] / 100;
      // 座る・立つ・乗り降りの切りかわりは、まっすぐつながない
      if (STC[a[4]] !== p.state && (STC[a[4]] === 'seated' || p.state === 'seated')) { p._nx = p._nz = p._nry = null; }
    }
    const a = f1.pl && f1.pl[0];
    if (a && a[4] === g.player.seat) RP.np = [a[0] / 100, a[1] / 100, a[2] / 100, a[3] / 100];
  }
  function rpStop(toRank) {
    RP.active = false; RP.fr = null;
    $('rpBar').classList.add('hidden'); $('rpEnd').classList.add('hidden');
    titleScreen();
    if (toRank) { backTo = 'title'; show('rank'); setRankTab(rankTab); }
  }
  $('rpPlay').addEventListener('click', () => { RP.paused = !RP.paused; rpButtons(); });
  // 同じ電車のリプレイ（ランク線）：見る人を切りかえる
  $('rpPrevP').addEventListener('click', () => { if (RP.list) playReplayList(RP.list, RP.k - 1); });
  $('rpNextP').addEventListener('click', () => { if (RP.list) playReplayList(RP.list, RP.k + 1); });
  for (const id of ['rpTpv', 'spTpv']) $(id).addEventListener('click', () => setTpv(!TPV));
  for (const id of ['rpTpv', 'spTpv']) $(id).textContent = profile.tpv ? '👁 1人称' : '🎥 3人称'; // TPV はこのあとで宣言するので profile を見る
  $('rpSpeed').addEventListener('click', () => { RP.speed = RP.speed >= 4 ? 1 : RP.speed * 2; rpButtons(); });
  $('rpClose').addEventListener('click', () => rpStop(true));
  $('rpBack').addEventListener('click', () => rpStop(true));
  $('rpAgain').addEventListener('click', () => { const keep = { fr: RP.fr, looks: RP.looks }; clearWorld(); const seed = G.seed, mode = G.mode; G = SW.create({ seed, mode }); RP.P.pl = G.player; Object.assign(RP, { i: -1, t: 0, ended: false, paused: false, nextI: -2, np: null }, keep); RP.P.out = false; RP.P.result = null; $('rpEnd').classList.add('hidden'); });
  for (const id of ['rpLike', 'rpLike2']) $(id).addEventListener('click', async () => {
    if (RP.liked || RP.uid === RP.me) return;
    RP.liked = true; RP.likes = (RP.likes || 0) + 1; rpButtons(); sfx('combo');
    try { const F = await firebaseReady(); await withTimeout(F.db.ref('suwaritai/rpl/' + RP.uid + '/' + F.uid).set(true), 10000); track('リプレイにいいね'); } catch (e) { }
  });
  $('rankList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp]'); if (!b) return;
    playReplay(b.dataset.kind, b.dataset.rp);
  });

  // ================================================================ オンライン対戦（β・フレンド戦）
  // 部屋を作った人（ホスト）の端末がゲームを進め、ほかの人は操作を送って、様子（スナップショット）を受け取る。
  // 通信は Firebase（suwaritai/rooms/合言葉）。?online=local をつけると、同じブラウザの別タブどうしでつながる（試す用）
  const NET_LOCAL = /[?&]online=local\b/.test(location.search);
  const MPCOL = ['#e85d75', '#3d8bfd', '#2fbf71', '#f2a33a'];
  const CPU_NAMES = ['CPUのたなか', 'CPUのすずき', 'CPUのさとう', 'CPUのやまだ'];
  const roomP = (c) => 'suwaritai/rooms/' + c;
  let NET = null;
  function localNet() {
    const ch = new BroadcastChannel('suwaritai-net');
    let store = {};
    const subs = [], disc = [];
    let uid = null; try { uid = sessionStorage.getItem('sw-uid'); } catch (e) { }
    if (!uid) { uid = 'L' + Math.random().toString(36).slice(2, 8); try { sessionStorage.setItem('sw-uid', uid); } catch (e) { } }
    const segs = (p) => p.split('/').filter(Boolean);
    const clone = (v) => v == null ? null : JSON.parse(JSON.stringify(v));
    const getP = (p) => { const v = segs(p).reduce((o, k) => o == null ? undefined : o[k], store); return v === undefined ? null : v; };
    const setP = (p, v) => {
      const ks = segs(p); if (!ks.length) { store = v || {}; return; }
      let o = store; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
      if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(v);
    };
    const notify = (p) => { for (const s of subs.slice()) if (s.path.startsWith(p) || p.startsWith(s.path)) s.cb(clone(getP(s.path))); };
    const ts = (v) => { if (v && typeof v === 'object') { if (v['.sv']) return Date.now(); const o = Array.isArray(v) ? [] : {}; for (const k in v) o[k] = ts(v[k]); return o; } return v; };
    const apply = (op, p, v) => { if (op === 'set') setP(p, v); else if (op === 'update') { for (const k in v) setP(p + '/' + k, v[k]); } else setP(p, null); notify(p); };
    ch.onmessage = (e) => { const m = e.data; if (m.t === 'op') apply(m.op, m.p, m.v); else if (m.t === 'hello') ch.postMessage({ t: 'store', s: store }); else if (m.t === 'store' && !Object.keys(store).length && m.s) { store = m.s; notify(''); } };
    ch.postMessage({ t: 'hello' });
    window.addEventListener('pagehide', () => { for (const p of disc) ch.postMessage({ t: 'op', op: 'remove', p }); });
    const write = (op, p, v) => { v = ts(v); apply(op, p, v); ch.postMessage({ t: 'op', op, p, v }); return Promise.resolve(); };
    return {
      uid, TS: { '.sv': 'timestamp' },
      get: (p) => Promise.resolve(clone(getP(p))),
      set: (p, v) => write('set', p, v), update: (p, v) => write('update', p, v), remove: (p) => write('remove', p),
      on: (p, cb) => { const s = { path: p, cb }; subs.push(s); setTimeout(() => cb(clone(getP(p)))); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
      onDisconnectRemove: (p) => { disc.push(p); },
    };
  }
  async function fbNet() {
    const F = await firebaseReady(); if (!F) throw new Error('オンラインが使えない環境です');
    const db = F.db;
    return {
      uid: F.uid, TS: F.TS,
      get: async (p) => (await withTimeout(db.ref(p).get(), 10000)).val(),
      set: (p, v) => withTimeout(db.ref(p).set(v), 10000), update: (p, v) => withTimeout(db.ref(p).update(v), 10000), remove: (p) => db.ref(p).remove(),
      on: (p, cb) => { const r = db.ref(p); const h = (s) => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
      onDisconnectRemove: (p) => { try { db.ref(p).onDisconnect().remove(); } catch (e) { } },
    };
  }
  let netWait = null;
  function net() {
    if (!netWait) netWait = NET_LOCAL ? new Promise((res) => { const n = localNet(); setTimeout(() => { NET = n; res(n); }, 250); }) // ほかのタブから中身を受け取るのを少し待つ
      : fbNet().then((n) => (NET = n)).catch((e) => { netWait = null; throw e; });
    return netWait;
  }
  if (NET_LOCAL) net();
  const MP = {};
  function mpReset() {
    for (const off of (MP.offs || [])) { try { off(); } catch (e) { } }
    Object.assign(MP, {
      active: false, code: null, isHost: false, uid: null, hostUid: null, me: -1, offs: [], members: {}, state: null, players: [],
      remote: {}, last: {}, evRing: [], seq: 0, k: 0, lastK: -1, snapT: 0, sendT: 0, cnt: { a: 0, p: 0, bp: 0, fs: 0, sk: 0 }, skIdx: -1,
      seen: 0, looks: {}, newIds: [], sentMax: 0, base: 0, modeSel: 'vs', mmRated: false, mmExpect: 0, mmT0: 0, spect: false, ghost: false, watching: false, outShown: false, resSent: false, scoreT: 0, scores: [], myObs: null, avatars: {},
    });
  }
  mpReset();
  const onlineAvailable = () => NET_LOCAL || fbAllowed;
  function olNote(t) { $('olNote').textContent = t || ''; }
  function openOnline() {
    backTo = 'title'; show('online'); olNote(''); mmRender(); MM.pollT = 0;
    showName();
    $('olMenu').classList.toggle('hidden', !!MP.code); $('olRoom').classList.toggle('hidden', !MP.code);
    track('オンライン：画面を開いた');
  }
  $('bOnline').classList.toggle('hidden', !onlineAvailable());
  $('bOnline').addEventListener('click', openOnline);
  $('olCreate').addEventListener('click', () => mpCreate());
  $('olJoin').addEventListener('click', () => mpJoin());
  $('olWatch').addEventListener('click', () => mpSpectate());
  $('spNext').addEventListener('click', () => {
    if (!MP.active || !G) return;
    MP.me = (MP.me + 1) % G.players.length; SW.setCtx(G, MP.me);
    const b = G.player; if (b._tx != null) { b.x = b._tx; b.z = b._tz; } spName();
  });
  $('spQuit').addEventListener('click', async () => { await mpLeave(false); openOnline(); });
  function spName() { const P = G && G.players[MP.me]; if (P) $('spName').innerHTML = '<i style="background:' + MPCOL[MP.me] + '"></i>' + nameHtml(P.name) + (P.cpu ? ' 🤖' : ''); }
  // 観戦：合言葉の部屋の様子を見るだけ（メンバーには入らない・何も送らない）
  async function mpSpectate() {
    const code = ($('olCode').value || '').replace(/\D/g, '');
    if (code.length !== 4) { olNote('合言葉は 4 けたの数字です'); return; }
    try {
      const N = await net(); olNote('さがしています…');
      const r = await N.get(roomP(code));
      if (!r || !r.host) { olNote('その合言葉の部屋はありません'); return; }
      MP.spect = true; MP.isHost = false; MP.code = code; MP.uid = N.uid;
      $('olMenu').classList.add('hidden'); $('olRoom').classList.remove('hidden'); $('olCodeShow').textContent = code; olNote('');
      MP.offs.push(N.on(roomP(code) + '/members', (v) => { MP.members = v || {}; mpRenderRoom(); }));
      MP.offs.push(N.on(roomP(code) + '/state', (v) => mpOnState(v)));
      MP.offs.push(N.on(roomP(code) + '/host', (v) => { MP.hostUid = v; if (!v && MP.code) mpAbort('部屋がなくなりました'); }));
      track('オンライン：観戦で部屋に入った');
    } catch (e) { olNote('見られませんでした（' + (e && e.message || e) + '）'); }
  }
  $('olCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') mpJoin(); });
  $('olBack').addEventListener('click', () => { if (MP.code) mpLeave(true); else { if (MM.on) mmCancel(true); titleScreen(); } });
  $('olStart').addEventListener('click', () => mpStart());
  $('olCopy').addEventListener('click', () => { try { const p = navigator.clipboard.writeText('スワリタイ！のオンライン対戦で遊ぼう。合言葉は ' + MP.code + '\n' + SHARE_URL.split('?')[0]); if (p && p.catch) p.catch(() => { }); olNote('合言葉をコピーしました'); } catch (e) { } });
  // 対戦／共闘の切りかえ（ホストだけ）
  document.querySelectorAll('[data-olmode]').forEach((b) => b.addEventListener('click', () => {
    if (!MP.isHost || !MP.code) return;
    MP.modeSel = b.dataset.olmode; mpRenderRoom();
    net().then((N) => N.update(roomP(MP.code) + '/state', { mode: MP.modeSel }));
  }));
  $('olCpu').addEventListener('change', () => { if (MP.isHost && MP.code) net().then((N) => N.update(roomP(MP.code) + '/state', { cpu: $('olCpu').checked })); mpRenderRoom(); });
  $('mpGhost').addEventListener('click', () => { MP.ghost = true; MP.watching = false; $('mpOut').classList.add('hidden'); if (MP.isHost) G.players[MP.me].ghost = true; addToast('👻 ニセ乗客になった。座っている人を狙ってアクション', 'good'); track('オンライン：ニセ乗客になった'); });
  $('mpWatch').addEventListener('click', () => { MP.watching = true; $('mpOut').classList.add('hidden'); });
  $('mpQuit').addEventListener('click', () => mpLeave(false));
  $('mpAgain').addEventListener('click', () => mpAgain());
  $('mpLeave').addEventListener('click', () => mpLeave(false));

  async function mpCreate() {
    if (!profile.name) { olNote('タイトルの「乗客名」から名前を引いてください'); return; }
    try {
      const N = await net(); olNote('部屋をつくっています…');
      for (let k = 0; k < 8; k++) {
        const code = String(1000 + Math.floor(Math.random() * 9000));
        const ex = await N.get(roomP(code));
        if (ex) {
          if (ex.created && ex.created < Date.now() - 3600000) { try { await N.remove(roomP(code)); } catch (e) { continue; } }
          else continue;
        }
        await N.update(roomP(code), { host: N.uid, created: N.TS, state: { s: 'lobby', cpu: true } });
        MP.isHost = true;
        await mpEnter(code);
        track('オンライン：部屋をつくった');
        return;
      }
      olNote('部屋をつくれませんでした。もう一度ためしてください');
    } catch (e) { olNote('オンラインにつなげませんでした（' + (e && e.message || e) + '）'); }
  }
  async function mpJoin() {
    const code = ($('olCode').value || '').replace(/\D/g, '');
    if (code.length !== 4) { olNote('合言葉は 4 けたの数字です'); return; }
    if (!profile.name) { olNote('タイトルの「乗客名」から名前を引いてください'); return; }
    try {
      const N = await net(); olNote('さがしています…');
      const r = await N.get(roomP(code));
      if (!r || !r.host) { olNote('その合言葉の部屋はありません'); return; }
      if (r.state && r.state.s === 'play') { olNote('その部屋はもう始まっています'); return; }
      const mem = r.members || {};
      if (Object.keys(mem).length >= 4 && !mem[N.uid]) { olNote('その部屋は満員です（4 人まで）'); return; }
      MP.isHost = r.host === N.uid;
      await mpEnter(code);
      track('オンライン：部屋に入った');
    } catch (e) { olNote('入れませんでした（' + (e && e.message || e) + '）'); }
  }
  async function mpEnter(code) {
    const N = await net();
    MP.code = code; MP.uid = N.uid;
    try { await N.set(roomP(code) + '/members/' + N.uid, { n: rankName(), t: N.TS, s: SW.STATS.map((d) => SW.capStats(profile.st, SW.STAT_CAP_FAIR)[d.key]).join(',') }); }
    catch (e) { olNote('この乗客名は使えません。名前を変えてください'); MP.code = null; return; }
    N.onDisconnectRemove(roomP(code) + '/members/' + N.uid);
    N.onDisconnectRemove(roomP(code) + '/inputs/' + N.uid);
    $('olMenu').classList.add('hidden'); $('olRoom').classList.remove('hidden'); $('olCodeShow').textContent = code; olNote('');
    MP.offs.push(N.on(roomP(code) + '/members', (v) => { MP.members = v || {}; mpRenderRoom(); mpMembersChanged(); }));
    MP.offs.push(N.on(roomP(code) + '/state', (v) => mpOnState(v)));
    MP.offs.push(N.on(roomP(code) + '/host', (v) => { MP.hostUid = v; if (!v && MP.code) mpAbort('部屋がなくなりました'); }));
  }
  function mpSortedMembers() { return Object.entries(MP.members || {}).sort((a, b) => (a[1].t || 0) - (b[1].t || 0)).slice(0, 4); }
  function mpRenderRoom() {
    if (!MP.code) return;
    const mem = mpSortedMembers(), cpu = MP.isHost ? $('olCpu').checked : !!(MP.state && MP.state.cpu);
    let html = '';
    for (let i = 0; i < 4; i++) {
      const m = mem[i];
      if (m) html += `<div class="olm"><i style="background:${MPCOL[i]}"></i>${nameHtml(dispName(m[1].n, m[0]))}${m[0] === MP.hostUid ? ' <span class="pill">ホスト</span>' : ''}${m[0] === MP.uid ? ' <span class="pill">あなた</span>' : ''}</div>`;
      else html += `<div class="olm empty"><i style="background:${MPCOL[i]}"></i>${cpu ? '🤖 ' + CPU_NAMES[i] : '（あき）'}</div>`;
    }
    $('olMembers').innerHTML = html;
    $('olCpu').disabled = !MP.isHost; $('olCpu').checked = cpu;
    const md = MP.modeSel || 'vs';
    document.querySelectorAll('[data-olmode]').forEach((b) => { b.classList.toggle('on', b.dataset.olmode === md); b.disabled = !MP.isHost; });
    $('olModeNote').textContent = md === 'coop' ? '🤝 共闘：みんなの合計がチームのスコア。倒れた仲間は徳で復活。CPU なしで遊ぶと、人数ごとのランキングに載ります' : '⚔ 対戦：いちばん徳を積んだ人の勝ち';
    $('olStart').classList.toggle('hidden', !MP.isHost);
    $('olWait').textContent = MP.spect ? '👀 観戦で入っています。試合が始まると見られます' : MP.isHost ? (mem.length < 2 && !cpu ? 'ほかの人が入るのを待っています（合言葉を送ってね）' : '') : 'ホストがスタートするのを待っています…';
  }
  function mpMembersChanged() {
    if (!MP.active || !G) return;
    // ホスト：抜けた人は脱落あつかい
    if (MP.isHost) {
      MP.players.forEach((p, i) => { if (!p.cpu && i !== MP.me && !MP.members[p.uid] && !G.players[i].out) { SW.dropPlayer(G, i, 'leave'); SW.setCtx(G, MP.me); } });
    } else if (MP.hostUid && !MP.members[MP.hostUid]) mpAbort('ホストが抜けたので、試合は終わりです');
  }
  function mpOnState(v) {
    MP.state = v;
    if (!v) return;
    if (!MP.isHost && typeof v.cpu === 'boolean') $('olCpu').checked = v.cpu;
    if (!MP.isHost && v.mode) MP.modeSel = v.mode;
    if (v.s === 'play' && !MP.active) mpBegin(v);
    else if (v.s === 'done' && MP.active) mpShowResult(v.res || [], v);
    else if (v.s === 'lobby') { if (state === 'result' && $('mpres').classList.contains('hidden') === false || MP.active) { MP.active = false; openOnline(); } mpRenderRoom(); }
  }
  async function mpStart() {
    const N = await net();
    const mem = mpSortedMembers();
    const players = mem.map(([uid, m]) => ({ uid, name: dispName(m.n, uid).slice(0, 12), cpu: false, st: String(m.s || '') }));
    if ($('olCpu').checked) while (players.length < 4) players.push({ uid: 'cpu' + players.length, name: CPU_NAMES[players.length], cpu: true });
    if (players.length < 2) { olNote('2 人以上（CPU をふくむ）で始められます'); return; }
    try {
      await N.remove(roomP(MP.code) + '/snap');
      await N.update(roomP(MP.code), { state: { s: 'play', seed: (Math.random() * 1e9) | 0, players, cpu: $('olCpu').checked, mode: MP.modeSel || 'vs', rated: !!MP.mmRated, t: N.TS } });
    } catch (e) { olNote('スタートできませんでした（' + (e && e.message || e) + '）'); }
  }
  function mpBegin(st) {
    let idx = (st.players || []).findIndex((p) => p.uid === MP.uid);
    if (MP.spect) idx = Math.max(0, (st.players || []).findIndex((p) => !p.cpu)); // 観戦：まず人間のプレイヤーを追いかける
    if (idx < 0) { olNote('始まった試合に入れませんでした'); return; }
    Object.assign(MP, { active: true, me: idx, players: st.players, base: 0, remote: {}, last: {}, evRing: [], seq: 0, k: 0, lastK: -1, snapT: 0, sendT: 0, seen: 0, newIds: [], ghost: false, watching: false, outShown: false, resSent: false, scores: [], myObs: null });
    MP.cnt = { a: 0, p: 0, bp: 0, fs: 0, sk: 0 };
    for (const k in MP.avatars) { scene.remove(MP.avatars[k].H.root); if (MP.avatars[k].tag) scene.remove(MP.avatars[k].tag); } MP.avatars = {};
    initAudio(); clearWorld();
    MP.modeSel = st.mode || 'vs';
    G = SW.create({ seed: st.seed, mode: 'online', coop: st.mode === 'coop', players: st.players.map((p) => { const a = String(p.st || '').split(','), o = {}; SW.STATS.forEach((d, k) => { o[d.key] = +a[k] || 0; }); return { name: p.name, cpu: p.cpu, stats: o }; }) });
    G.modeName = 'online';
    MP.sentMax = G.nextId - 1; MP.base = MP.isHost ? G.nextId - 1 : 0;
    SW.setCtx(G, MP.me);
    inp.yaw = G.player.yaw; inp.pitch = 0; endT = 0; pendingResult = false; eyeH = 1.6;
    state = 'play'; show(null);
    $('hud').classList.remove('hidden'); $('mpBoard').classList.remove('hidden');
    if (isTouch && !MP.spect) $('touch').classList.remove('hidden');
    hud.st = hud.sub = hud.prompt = hud.target = hud.buffs = ''; hud.stam = hud.karma = hud.toku = hud.wallet = hud.mind = -1;
    $('toasts').innerHTML = ''; $('pops').innerHTML = '';
    if (MP.spect) { document.body.classList.add('replay'); $('spBar').classList.remove('hidden'); spName(); addToast('👀 観戦中。「次の人」で見る人を切りかえ', 'good'); track('オンライン：観戦をはじめた'); }
    else if (!isTouch && !noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
    if (!MP.spect) addToast(G.coop ? '🤝 共闘スタート！ みんなの合計で勝負。倒れた仲間はそばで「復活させる」' : '🌐 オンライン対戦（β）スタート！ 7 駅でいちばん徳を積んだ人の勝ち', 'good');
    net().then((N) => {
      if (MP.isHost) MP.offs.push(N.on(roomP(MP.code) + '/inputs', (v) => { MP.remote = v || {}; }));
      else MP.offs.push(N.on(roomP(MP.code) + '/snap', (v) => { if (v) mpApply(v); }));
    });
    track('オンライン：' + (G.coop ? '共闘' : '対戦') + '開始（人間' + st.players.filter((p) => !p.cpu).length + '人）');
  }
  // ---- ホスト：ほかの人の操作を受け取る
  function mpRemoteInput(i) {
    const p = MP.players[i], v = MP.remote[p.uid], P = G.players[i];
    if (!v) return {};
    let L = MP.last[p.uid];
    if (!L) L = MP.last[p.uid] = { a: v.a || 0, p: v.p || 0, bp: v.bp || 0, fs: v.fs || 0, sk: v.sk ? v.sk[0] : 0 };
    const r = { yaw: v.yaw, pitch: v.pitch, brace: !!v.b, pos: v.pos, mv: !!v.mv };
    if ((v.a || 0) > L.a) { r.action = true; L.a = v.a; }
    if ((v.p || 0) > L.p) { r.punch = true; L.p = v.p; }
    if ((v.bp || 0) > L.bp) { r.bracePressed = true; L.bp = v.bp; }
    if ((v.fs || 0) > L.fs) { r.fakeSleep = true; L.fs = v.fs; }
    if (v.sk && v.sk[0] > L.sk) { r.skill = v.sk[1]; L.sk = v.sk[0]; }
    if (v.gh && P.out) P.ghost = true;
    return r;
  }
  const r2 = (v) => Math.round(v * 100);
  const STC = ['seated', 'stand', 'walk', 'exit', 'gone', 'fight', 'ko'];
  function playerObs(g, j) {
    const P = g.players[j], s = P.pl.stamina;
    return { name: P.name + '（ライバル）', notes: [s <= 20 ? '🤢 具合が悪そう…（トドメのチャンス？）' : s < 45 ? '😓 ちょっと疲れている' : '💪 まだ元気そう', P.pl.seat >= 0 ? '💺 座っている' : '🧍 立っている'] };
  }
  // 世界の様子（乗客・座席・アイテムなど）を小さな配列にする。オンライン対戦とリプレイで同じ形を使う
  // T = { k, sentMax, newIds }：新しく出てきた乗客の見た目（nw）を何コマか続けて入れるための記録
  function worldSnap(g, T) {
    const pe = g.people.map((p) => [p.id, r2(p.x), r2(p.z), r2(p.ry), STC.indexOf(p.state), p.seat, p.anim === 'board' ? 1 : p.anim === 'watch' ? 2 : 0, p.sleep, p.expr, p.bubble || '',
      (p.packing ? 1 : 0) | (p.leaving ? 2 : 0) | (p.targetPlayer ? 4 : 0) | (p.priority ? 8 : 0) | (p.stunned > 0 ? 16 : 0) | (p.fleeing ? 32 : 0) | (p.pickT > 0 ? 64 : 0) | (p.sleep && p.oversleep ? 128 : 0) | (p.undercover ? 256 : 0) | (p.anim === 'reach' ? 512 : 0) | (p.bfs === 'windup' ? 1024 : 0) | (p.fake ? 2048 : 0) | (p.hogKind === 'bag' ? 4096 : 0) | (p.state === 'fight' && p.brute ? 8192 : 0),
      p.slot, p.idle, p.dest, p.role || '', Math.round((p.speed || 1) * 10)]);
    for (const p of g.people) if (p.id > T.sentMax) { T.newIds.push([p.id, T.k]); T.sentMax = Math.max(T.sentMax, p.id); }
    T.newIds = T.newIds.filter((a) => a[1] > T.k - 20);
    const nw = {};
    for (const [id] of T.newIds) { const p = SW.person(g, id); if (p) nw[id] = [p.type, p.female, Math.round(p.h * 100), p.look]; }
    // 途中から観戦に来た人のために、ときどき（5 秒ごと）途中で乗ってきた人みんなの見た目も入れる
    if (T.base && T.k % 25 === 0) for (const p of g.people) if (p.id > T.base && !nw[p.id]) nw[p.id] = [p.type, p.female, Math.round(p.h * 100), p.look];
    return {
      k: T.k, t: Math.round(g.t * 100) / 100, ph: g.phase === 'stop' ? 's' : 't', pt: Math.round(g.phaseT * 100) / 100, st: g.station, ds: g.doorSide, nds: g.nextDoorSide || 1, do: g.doorsOpen ? 1 : 0, ann: g.ann || '',
      se: g.seats.map((s) => s.occ === 0 ? 'p' : s.hog ? ((SW.person(g, s.hog) || {}).hogKind === 'bag' ? 'b' : 's') : s.occ > 0 ? 'n' : s.res >= 0 ? 'r' : '-').join(''),
      pe, nw, it: g.items.map((it) => [it.id, it.key, r2(it.x), r2(it.z), it.name]),
      sp: g.speaker && g.speaker.on ? [r2(g.speaker.x), r2(g.speaker.z), g.speaker.broken ? 1 : 0] : 0,
      ch: g.chikan ? [g.chikan.stage, g.chikan.fstate, Math.round(g.chikan.ft * 100), g.chikan.chikanId, g.chikan.victimId] : 0,
      ru: g.runner ? [g.runner.door, g.runner.held ? 1 : 0] : 0,
    };
  }
  // プレイヤー 1 人ぶん（P = { pl, aim, prompt, out, ghost, result, tricks }）
  function plArr(g, P, obs) {
    const b = P.pl, aim = P.aim;
    return [r2(b.x), r2(b.z), r2(b.yaw), r2(b.pitch), b.seat, Math.round(b.stamina * 10) / 10, Math.round(b.karma), b.toku, b.earned, b.combo, Math.round((g.t - b.lastDeedT) * 10),
        P.out ? 1 : 0, P.ghost ? 1 : 0, b.carrying ? [b.carrying.key, b.carrying.name, b.carrying.hint || '', b.carrying.owner == null ? -1 : b.carrying.owner, (b.carrying.ownerLeaving ? 1 : 0) | (b.carrying.ownerGone ? 2 : 0)] : 0, b.buffs, b.mode || '', Math.round(b.modeT * 10), Math.round(b.punchAnim * 100), b.braceHeld ? 1 : 0, b.fakeSleep ? 1 : 0,
        Math.round(b.stagger * 10), Math.round(b.hitFlash * 10), P.prompt ? P.prompt.label : '', P.prompt ? P.prompt.act : '', aim, P.result ? P.result.cause : '', P.tricks, obs, P.result ? (P.result.text || '') : '', b.drinkCount, Math.round(b.confessCD * 10), Math.round(b.mind)];
  }
  function mpSendSnap() {
    const g = G; MP.k++;
    const snap = worldSnap(g, MP);
    snap.pl = g.players.map((P, i) => {
      let obs = 0;
      if (!MP.players[i].cpu && i !== MP.me) {
        if (P.aim >= SW.PID) obs = playerObs(g, P.aim - SW.PID);
        else if (P.aim >= 0) { const q = SW.person(g, P.aim); if (q) obs = SW.observe(g, q); }
      }
      return plArr(g, P, obs);
    });
    snap.ev = MP.evRing.slice(-60); snap.sc = MP.scores;
    if (g.coop) snap.co = [g.coopRev, g.coopPen, g.players.reduce((m, P, i) => m | (P.down ? 1 << i : 0), 0)]; // 共闘：復活の回数・引かれた点・倒れている人
    net().then((N) => N.set(roomP(MP.code) + '/snap', snap)).catch(() => { });
  }
  // ---- 参加者：受け取った様子を手元に写す
  function mkMirrorPerson(id, lk) {
    const L = lk || ['salaryman', 0, 172, { top: '#6c7078', bottom: '#1b1b1d', skin: '#e8b88f', hair: '#2b2018', hairStyle: 'short', glasses: false, mask: false, bag: false, tie: null, topName: '灰色' }];
    return { id, type: L[0], female: L[1], h: L[2] / 100, look: L[3], x: 0, z: 0, ry: 0, state: 'stand', seat: -1, slot: -1, anim: 'none', animT: 0, sleep: 0, expr: 'neutral', bubble: null, idle: 'none', dest: 0, role: null, speed: 1, walkPhase: 0, blink: Math.random() * 4, looks: [], watches: [], priority: 0, _new: true };
  }
  function applyWorld(g, snap, looks, strict) {
    g.t = snap.t; g.phase = snap.ph === 's' ? 'stop' : 'travel'; g.phaseT = snap.pt; g.station = snap.st; g.doorSide = snap.ds; g.nextDoorSide = snap.nds; g.doorsOpen = !!snap.do; g.ann = snap.ann;
    for (let k = 0; k < g.seats.length; k++) { const c = snap.se[k]; g.seats[k].occ = c === 'p' ? 0 : c === 'n' || c === 'b' || c === 's' ? 1 : -1; g.seats[k].res = c === 'r' ? 1 : -1; g.seats[k].hog = c === 'b' || c === 's' ? 1 : 0; g.seats[k].hogBag = c === 'b'; }
    if (snap.nw) for (const id in snap.nw) looks[id] = snap.nw[id];
    const map = new Map(g.people.map((p) => [p.id, p])), next = [];
    for (const a of snap.pe || []) {
      let p = map.get(a[0]);
      if (!p && strict && !looks[a[0]]) continue; // 見た目がまだ届いていない人は、届くまで出さない（観戦の途中参加）
      if (!p) { p = mkMirrorPerson(a[0], looks[a[0]]); p.x = a[1] / 100; p.z = a[2] / 100; p.ry = a[3] / 100; }
      p._tx = a[1] / 100; p._tz = a[2] / 100; p._try = a[3] / 100;
      p.state = STC[a[4]] || 'stand'; p.seat = a[5]; p.anim = a[6] === 1 ? 'board' : a[6] === 2 ? 'watch' : 'none'; p.sleep = a[7]; p.expr = a[8]; p.bubble = a[9] || null;
      const f = a[10]; p.packing = !!(f & 1); p.leaving = !!(f & 2); p.targetPlayer = !!(f & 4); p.priority = f & 8 ? 1 : 0; p.stunned = f & 16 ? 0.2 : 0; p.fleeing = !!(f & 32); p.pickT = f & 64 ? 1 : 0; p.oversleep = !!(f & 128); p.undercover = !!(f & 256); if (f & 512) { p.anim = 'reach'; } p.fake = !!(f & 2048); p.hogKind = f & 4096 ? 'bag' : 'spread'; p.bfs = f & 8192 ? (f & 1024 ? 'windup' : 'idle') : null;
      p.slot = a[11]; p.idle = a[12]; p.dest = a[13]; p.role = a[14] || null; p.speed = a[15] / 10;
      if (p.state === 'seated' && p.seat >= 0) { const s = g.seats[p.seat]; p._tx = s.x; p._tz = s.z; }
      next.push(p);
    }
    g.people = next;
    g.items = (snap.it || []).map((a) => ({ id: a[0], key: a[1], x: a[2] / 100, z: a[3] / 100, name: a[4] }));
    g.chikan = snap.ch ? { stage: snap.ch[0], fstate: snap.ch[1], ft: snap.ch[2] / 100, chikanId: snap.ch[3], victimId: snap.ch[4] } : null;
    g.runner = snap.ru ? { active: true, door: snap.ru[0], held: !!snap.ru[1] } : null;
    g.speaker = snap.sp ? { on: true, x: snap.sp[0] / 100, z: snap.sp[1] / 100, broken: !!snap.sp[2] } : null;
  }
  // プレイヤーの数字（体力・徳など）を写す。場所と向きは呼ぶ側で決める
  function applyPl(g, P, a) {
    const b = P.pl;
    b.seat = a[4]; b.stamina = a[5]; b.karma = a[6]; b.toku = a[7]; b.earned = a[8]; b.combo = a[9]; b.lastDeedT = g.t - a[10] / 10;
    P.out = !!a[11]; P.ghost = !!a[12];
    b.carrying = a[13] ? { key: a[13][0], name: a[13][1], hint: a[13][2] || '', owner: a[13][3] >= 0 ? a[13][3] : null, ownerLeaving: !!(a[13][4] & 1), ownerGone: !!(a[13][4] & 2) } : null; b.buffs = a[14] || {}; b.mode = a[15] || null; b.modeT = a[16] / 10; b.punchAnim = a[17] / 100;
    b.braceHeld = !!a[18]; b.fakeSleep = !!a[19]; b.stagger = a[20] / 10; b.hitFlash = a[21] / 10;
    P.prompt = a[22] ? { label: a[22], act: a[23] } : null; P.aim = a[24]; P.tricks = a[26];
    if (a[25]) P.result = { cause: a[25], text: a[28] || '' }; b.drinkCount = a[29] || 0; b.confessCD = (a[30] || 0) / 10; b.mind = a[31] == null ? 100 : a[31];
  }
  function mpApply(snap) {
    if (!G || snap.k <= MP.lastK) return;
    MP.lastK = snap.k;
    const g = G;
    applyWorld(g, snap, MP.looks, MP.spect);
    (snap.pl || []).forEach((a, i) => {
      const P = g.players[i]; if (!P) return;
      const b = P.pl, mine = i === MP.me && !MP.spect;
      const prevSeat = b.seat;
      if (!mine || a[4] >= 0 || prevSeat >= 0 || a[11]) {
        if (mine && (a[4] >= 0 || prevSeat >= 0)) {
          if (a[4] >= 0 || prevSeat !== a[4]) { b.x = a[0] / 100; b.z = a[1] / 100; }
          if (prevSeat !== a[4]) { inp.yaw = a[2] / 100; inp.pitch = 0; }
        } else if (!mine) { b._tx = a[0] / 100; b._tz = a[1] / 100; b._tyaw = a[2] / 100; if (b._init == null || a[4] !== prevSeat) { b.x = b._tx; b.z = b._tz; b.yaw = b._tyaw; b._init = 1; } b.pitch = a[3] / 100; }
      }
      const wasOut = P.out;
      applyPl(g, P, a);
      if (mine) { g.prompt = P.prompt; g.aim = P.aim; MP.myObs = a[27] || null; if (!wasOut && P.out) mpOnOut(); }
      else if (MP.spect && i === MP.me) { g.prompt = P.prompt; g.aim = P.aim; MP.myObs = null; }
    });
    for (const [seq, i, e] of (snap.ev || [])) { if (seq > MP.seen) { MP.seen = seq; if (i === MP.me) G.events.push(e); } }
    MP.scores = snap.sc || MP.scores;
    if (snap.co && g.coop) { g.coopRev = snap.co[0]; g.coopPen = snap.co[1]; g.players.forEach((P, i) => { P.down = !!(snap.co[2] & (1 << i)); }); }
  }
  // ---- 1 コマ
  function mpFrame(dt, t, li) {
    const g = G, paused = state === 'pause';
    if (paused) li = { yaw: li.yaw, pitch: li.pitch };
    const meP = g.players[MP.me];
    if (MP.isHost) {
      const inputs = MP.players.map((p, i) => p.cpu ? null : i === MP.me ? li : mpRemoteInput(i));
      if (!g.over) SW.updateMulti(g, dt, inputs);
      g.players.forEach((P, i) => { if (i !== MP.me && P.events.length) { for (const e of P.events) MP.evRing.push([++MP.seq, i, e]); P.events.length = 0; } });
      if (MP.evRing.length > 120) MP.evRing.splice(0, MP.evRing.length - 120);
      SW.setCtx(g, MP.me);
      MP.scoreT -= dt;
      if (MP.scoreT <= 0) { MP.scoreT = 0.5; MP.scores = g.players.map((P, i) => SW.finalScoreOf(g, i).total); SW.setCtx(g, MP.me); }
      MP.snapT -= dt;
      if (MP.snapT <= 0) { MP.snapT = 0.2; mpSendSnap(); }
      if (meP.out && !MP.outShown) mpOnOut();
      if (!meP.out && MP.outShown) mpRevived();
      if (g.over && !MP.resSent) {
        MP.resSent = true; mpSendSnap();
        const res = SW.standings(g).map((r) => Object.assign(r, { uid: MP.players[r.i].uid }));
        net().then((N) => N.update(roomP(MP.code) + '/state', Object.assign({ s: 'done', res }, g.coop ? { coop: 1, team: SW.teamScore(g), rv: g.coopRev, pen: g.coopPen } : {})));
      }
    } else {
      g.t += dt; g.phaseT += dt;
      const b = g.player;
      if (MP.spect) li = {};
      else { b.yaw = inp.yaw; b.pitch = inp.pitch; }
      // 自分の体は手元で動かす（場所だけ送る）
      let mv = false;
      if (MP.spect) { /* 観戦：動かさない */ }
      else if (meP.out) { if (MP.ghost || MP.watching) SW.ghostMove(b, li, dt); }
      else if (b.seat < 0) { b.braceHeld = !!li.brace; mv = SW.movePlayer(g, b, li, dt); }
      if (li.action) MP.cnt.a++; if (li.punch) MP.cnt.p++; if (li.bracePressed) MP.cnt.bp++; if (li.fakeSleep) MP.cnt.fs++;
      if (li.skill != null && li.skill >= 0) { MP.cnt.sk++; MP.skIdx = li.skill; }
      const edge = li.action || li.punch || li.bracePressed || li.fakeSleep || (li.skill != null && li.skill >= 0);
      MP.sendT -= dt;
      if (!MP.spect && (MP.sendT <= 0 || edge)) {
        MP.sendT = 0.1;
        const v = { pos: [r2(b.x) / 100, r2(b.z) / 100], mv: mv ? 1 : 0, yaw: r2(b.yaw) / 100, pitch: r2(b.pitch) / 100, b: li.brace ? 1 : 0, a: MP.cnt.a, p: MP.cnt.p, bp: MP.cnt.bp, fs: MP.cnt.fs, sk: [MP.cnt.sk, MP.skIdx], gh: MP.ghost ? 1 : 0 };
        net().then((N) => N.set(roomP(MP.code) + '/inputs/' + MP.uid, v)).catch(() => { });
      }
      // ほかの人・乗客をなめらかに動かす
      const k = Math.min(1, dt * 9);
      for (const p of g.people) {
        if (p._tx == null) continue;
        const dx = p._tx - p.x, dz = p._tz - p.z;
        const d = Math.hypot(dx, dz);
        p.x += dx * k; p.z += dz * k;
        if (d > 0.02 && p.state !== 'seated') p.walkPhase += d * k * 6 * 3;
        let dr = p._try - p.ry; while (dr > Math.PI) dr -= TAU; while (dr < -Math.PI) dr += TAU; p.ry += dr * k;
        if (p.bubble) p.bubbleT = 1;
      }
      g.players.forEach((P, i) => {
        if ((i === MP.me && !MP.spect) || P.pl._tx == null) return;
        P.pl.x += (P.pl._tx - P.pl.x) * k; P.pl.z += (P.pl._tz - P.pl.z) * k;
        if (P.pl._tyaw != null) { let dr = P.pl._tyaw - P.pl.yaw; while (dr > Math.PI) dr -= TAU; while (dr < -Math.PI) dr += TAU; P.pl.yaw += dr * k; }
      });
      for (const P of g.players) P.pl.punchAnim = Math.max(0, P.pl.punchAnim - dt);
      if (meP.out && !MP.outShown && !MP.spect) mpOnOut();
      if (!meP.out && MP.outShown && !MP.spect) mpRevived();
    }
  }
  function mpRevived() { MP.outShown = false; const d = $('downTag'); if (d) d.remove(); $('mpOut').classList.add('hidden'); sfx('clear'); }
  function mpOnOut() {
    MP.outShown = true;
    const P = G.players[MP.me], r = P.result || {};
    if (r.cause === 'clear') return;
    if (G.coop && r.cause !== 'leave') { // 共闘：倒れて、仲間の復活を待つ
      if (!$('downTag')) { const d = document.createElement('div'); d.id = 'downTag'; d.innerHTML = '🆘 倒れた…<br><small>仲間がそばで「復活させる」を押すのを待とう</small>'; document.body.appendChild(d); }
      return;
    }
    const T = { collapse: '🦵 膝が笑った…', ko: '💥 KO負け', arrest: '🚨 駅員に連行', pko: '👊 トドメを刺された', leave: '途中で降りた', broken: '🧠 心が折れた' }[r.cause] || '脱落…';
    $('mpOutT').textContent = T;
    $('mpOutS').textContent = (r.text || '') + ' ここまでの徳は記録に残ります。';
    $('mpOut').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function mpShowResult(res, v) {
    v = v || {}; { const d = $('downTag'); if (d) d.remove(); }
    MP.active = false; $('spBar').classList.add('hidden'); document.body.classList.remove('replay');
    $('mpOut').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('mpBoard').classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    state = 'result'; backTo = 'mpres';
    const causeJa = { clear: '終点到着', collapse: '膝が笑った', ko: 'KO負け', arrest: '連行', pko: 'トドメ', leave: '途中で降りた', broken: '心が折れた' };
    let myRank = 0;
    $('mpResList').innerHTML = res.map((r, k) => {
      const me = r.uid === MP.uid; if (me) myRank = k + 1;
      const extra = [causeJa[r.cause] || '', r.pko ? 'トドメ×' + r.pko : '', r.tricks ? 'いたずら×' + r.tricks : ''].filter(Boolean).join('・');
      return `<div class="mpr ${me ? 'me' : ''}"><span class="n">${k + 1}</span><i style="background:${MPCOL[r.i]}"></i><span class="nm">${nameHtml(r.name)}${r.cpu ? ' 🤖' : ''}${me ? ' <span class="pill">あなた</span>' : ''}<small>${esc(extra)}</small></span><span class="sc">${r.score}</span></div>`;
    }).join('');
    $('mpResNote').textContent = myRank === 1 ? '🎉 あなたの勝ち！' : myRank ? 'あなたは ' + myRank + ' 位' : '';
    $('mpResT').textContent = v.coop ? '🤝 共闘の結果' : '🏁 オンライン対戦の結果';
    if (v.coop) { // 共闘：チームのスコア。人間だけ（CPU なし）なら人数ごとのランキングに載せる（ホストが送る）
      const humans = MP.players.filter((p) => !p.cpu), ok = humans.length === MP.players.length && humans.length >= 2;
      $('mpResNote').innerHTML = `<b style="font-size:20px;color:#ffd447">🤝 チームのスコア ${v.team} 点</b><br>復活 ${v.rv || 0} 回${v.pen ? '（スコアから −' + v.pen + '）' : ''}` + (ok ? '' : '<br>※ CPU がいるので、共闘ランキングには載りません');
      if (ok && MP.isHost && !NET_LOCAL) submitCoop(humans, v.team, v.rv || 0).then((t) => { if (t && state === 'result') $('mpResNote').innerHTML += '<br>' + t; });
      track('オンライン：共闘の結果（' + MP.players.length + '人・' + (v.team >= 2000 ? '2000〜' : v.team >= 1000 ? '1000〜' : '〜999') + '）');
    }
    $('mpAgain').classList.toggle('hidden', !MP.isHost);
    if (!MP.isHost) $('mpResNote').insertAdjacentHTML('beforeend', '<br>（ホストが「もう一回」を押すと、同じ部屋で始まります）');
    if (v.rated) mmRateUpdate(res).then((t) => { if (t && state === 'result') $('mpResNote').insertAdjacentHTML('beforeend', '<br>' + t); });
    show('mpres');
    sfx(myRank === 1 || v.coop ? 'clear' : 'over');
    if (!v.coop) track('オンライン：結果 ' + myRank + '位');
  }
  // 共闘ランキング：suwaritai/coop/{人数}/{メンバーの uid を並べて _ でつなぐ}。前より高いときだけ書く
  async function submitCoop(humans, score, rv) {
    try {
      const F = await firebaseReady(); if (!F) return '';
      const n = humans.length, key = humans.map((p) => p.uid).sort().join('_');
      const ref = F.db.ref('suwaritai/coop/' + n + '/' + key);
      const old = (await withTimeout(ref.get(), 10000)).val();
      if (old && old.s >= score) return '🏆 共闘ランキング（' + n + '人）：前の記録 ' + old.s + ' 点のほうが上';
      await withTimeout(ref.set({ n: humans.map((p) => p.name).join('・').slice(0, 60), s: score, rv, t: F.TS, v: SCORE_VER }), 10000);
      const above = (await withTimeout(F.db.ref('suwaritai/coop/' + n).orderByChild('s').startAt(score + 0.5).limitToFirst(TOP_N).get(), 10000)).numChildren();
      return '🏆 共闘ランキング（' + n + '人）：' + (above < TOP_N ? (above + 1) + '位' : '100位より下') + (old ? '（チームの記録更新！）' : '');
    } catch (e) { return ''; }
  }
  async function mpAgain() {
    if (!MP.isHost) return;
    const N = await net();
    await N.update(roomP(MP.code), { state: { s: 'lobby', cpu: $('olCpu').checked, mode: MP.modeSel || 'vs' } }); // 操作の記録は残っていても、次の試合で最初の値を基準にするので問題ない
  }
  async function mpLeave(toMenu) {
    const code = MP.code, host = MP.isHost;
    try {
      const N = await net();
      if (code) {
        if (host) await N.remove(roomP(code));
        else if (!MP.spect) { await N.remove(roomP(code) + '/members/' + MP.uid); await N.remove(roomP(code) + '/inputs/' + MP.uid); }
      }
    } catch (e) { }
    for (const k in MP.avatars) { scene.remove(MP.avatars[k].H.root); if (MP.avatars[k].tag) scene.remove(MP.avatars[k].tag); }
    mpReset(); { const d = $('downTag'); if (d) d.remove(); }
    $('mpOut').classList.add('hidden'); $('mpBoard').classList.add('hidden'); $('spBar').classList.add('hidden'); document.body.classList.remove('replay');
    if (toMenu) openOnline(); else titleScreen();
  }
  function mpAbort(msg) {
    const wasActive = MP.active;
    for (const k in MP.avatars) { scene.remove(MP.avatars[k].H.root); if (MP.avatars[k].tag) scene.remove(MP.avatars[k].tag); }
    mpReset(); { const d = $('downTag'); if (d) d.remove(); }
    $('mpOut').classList.add('hidden'); $('mpBoard').classList.add('hidden'); $('spBar').classList.add('hidden'); document.body.classList.remove('replay');
    titleScreen();
    titleToast(msg);
    if (wasActive) track('オンライン：試合が中断した');
  }
  // ---- 3 人称視点（リプレイと観戦だけ）：見ている人の体を出して、カメラをうしろ上に置く
  let TPV = !!profile.tpv, selfH = null, camYaw = null;
  const tpvOn = () => (TPV && (RP.active || (MP.active && MP.spect))) || !!window.__tpvForce; // __tpvForce：見た目を確かめる用
  function setTpv(on) {
    TPV = on; profile.tpv = on ? 1 : 0; saveProfile(); camYaw = null;
    document.body.classList.toggle('tpv', tpvOn());
    for (const id of ['rpTpv', 'spTpv']) if ($(id)) $(id).textContent = on ? '👁 1人称' : '🎥 3人称';
    track(on ? '3人称で見た' : '1人称にもどした');
  }
  function updateSelfFig(g, dt, now) {
    const on = tpvOn(); document.body.classList.toggle('tpv', on);
    if (!on) { if (selfH) selfH.root.visible = false; return; }
    if (!selfH) selfH = buildHuman(fakePerson(-99, { h: 1.72, look: { top: '#e0703a', bottom: '#22252c', skin: '#f1c9a5', hair: '#1d1612', hairStyle: 'short', topName: 'オレンジ' } }));
    const b = g.player, fp = selfH.p;
    selfH.root.visible = !g.over || (g.result && g.result.cause === 'clear');
    const moved = Math.hypot(b.x - fp.x, b.z - fp.z);
    if (b.seat >= 0) { const s = g.seats[b.seat]; fp.state = 'seated'; fp.x = s.x; fp.z = s.z; fp.ry = s.side > 0 ? Math.PI : 0; fp.sleep = b.fakeSleep ? 2 : 0; }
    else { fp.state = moved > 0.004 ? 'walk' : 'stand'; fp.x = b.x; fp.z = b.z; fp.ry = b.yaw + Math.PI; fp.sleep = 0; if (moved > 0.004) fp.walkPhase += moved * 18; fp.speed = 1.6; }
    fp.expr = b.stamina <= 20 ? 'sick' : b.stamina < 45 ? 'worried' : b.punchAnim > 0 ? 'angry' : 'neutral'; fp.exprT = 1;
    poseHuman(selfH, g, dt, now);
    if (b.punchAnim > 0 && b.seat < 0) { selfH.armR.sh.rotation.set(-1.55, 0, 0); selfH.armR.el.rotation.x = -0.1; }
    if (b.braceHeld && b.seat < 0) { selfH.armR.sh.rotation.set(-2.85, 0, 0.12); selfH.armL.sh.rotation.set(-2.85, 0, -0.12); }
    faceState(selfH, g, now);
  }
  // 3 人称のカメラ：立っているときはうしろ上、座っているときは通路から。車両の外や天井に出ないようにする
  function tpvCamera(g, dt) {
    const pl = g.player;
    if (camYaw == null) camYaw = pl.yaw;
    camYaw += angDiff(camYaw, pl.yaw) * Math.min(1, dt * 3);
    let cx, cz, cy, ty;
    if (pl.seat >= 0) { const s = g.seats[pl.seat]; cx = s.x + 0.9; cz = -Math.sign(s.z) * 0.35; cy = 1.75; ty = 1.05; }
    else { cx = pl.x + Math.sin(camYaw) * 1.55; cz = pl.z + Math.cos(camYaw) * 1.55; cy = 1.85; ty = 1.4; } // 手すり（高さ 1.98）より下
    cz = Math.max(-1.2, Math.min(1.2, cz)); cx = Math.max(CAR_X0 + 0.4, Math.min(CAR_X1 - 0.4, cx));
    camera.position.set(cx, cy, cz);
    camera.lookAt(pl.seat >= 0 ? g.seats[pl.seat].x : pl.x, ty, pl.seat >= 0 ? g.seats[pl.seat].z : pl.z);
  }
  // ---- ほかのプレイヤーの体（色つきの名札）
  function updateAvatars(g, dt, now) {
    if (!g.multi || !MP.active) return;
    g.players.forEach((P, i) => {
      let A = MP.avatars[i];
      const show = i !== MP.me && (!P.out || P.down); // 共闘で倒れている仲間も見せる（床に倒れた姿）
      if (!show) { if (A) { A.H.root.visible = false; if (A.tag) A.tag.visible = false; } return; }
      if (!A) {
        const fp = fakePerson(-10 - i, { female: i % 2, h: i % 2 ? 1.62 : 1.74, look: { top: MPCOL[i], bottom: '#22252c', skin: ['#f1c9a5', '#e8b88f', '#d9a27a', '#f5d6bc'][i], hair: ['#1d1612', '#3a2a1e', '#5a3d25', '#2b2018'][i], hairStyle: ['short', 'bob', 'side', 'pony'][i], glasses: i === 2, mask: false, bag: true, tie: null, topName: '' } });
        A = MP.avatars[i] = { H: buildHuman(fp), tag: makeSpriteText(P.name, { bg: MPCOL[i], fg: '#fff', noTail: true }) };
        A.tag.scale.set(0.62, 0.155, 1); scene.add(A.tag);
      }
      const b = P.pl, fp = A.H.p;
      A.H.root.visible = true; A.tag.visible = true;
      const moved = Math.hypot(b.x - fp.x, b.z - fp.z);
      if (P.down) { fp.state = 'ko'; fp.x = b.x; fp.z = b.z; }
      else if (b.seat >= 0) { const s = g.seats[b.seat]; fp.state = 'seated'; fp.x = s.x; fp.z = s.z; fp.ry = s.side > 0 ? Math.PI : 0; fp.sleep = b.fakeSleep ? 2 : 0; }
      else { fp.state = moved > 0.004 ? 'walk' : 'stand'; fp.x = b.x; fp.z = b.z; fp.ry = b.yaw + Math.PI; fp.sleep = 0; if (moved > 0.004) fp.walkPhase += moved * 18; fp.speed = 1.6; }
      fp.expr = P.down ? 'dazed' : b.stamina <= 20 ? 'sick' : b.stamina < 45 ? 'worried' : b.punchAnim > 0 ? 'angry' : 'neutral'; fp.exprT = 1;
      poseHuman(A.H, g, dt, now);
      if (b.punchAnim > 0 && b.seat < 0) { A.H.armR.sh.rotation.set(-1.55, 0, 0); A.H.armR.el.rotation.x = -0.1; }
      if (Math.hypot(b.x - g.player.x, b.z - g.player.z) < 11) faceState(A.H, g, now);
      A.tag.position.set(fp.x, P.down ? 0.75 : (b.seat >= 0 ? 1.0 : fp.h * 0.93) + 0.38, fp.z);
    });
  }
  // HUD：みんなのいまの徳
  function updateMpBoard(g) {
    if (!g.multi || !MP.active) return;
    const rows = g.players.map((P, i) => ({ i, P, sc: MP.scores[i] != null ? MP.scores[i] : P.pl.earned })).sort((a, b) => b.sc - a.sc);
    let html = rows.map((r) => `<div class="${r.P.out ? 'out' : ''} ${r.i === MP.me ? 'me' : ''}"><i style="background:${MPCOL[r.i]}"></i>${r.P.down ? '🆘' : ''}${esc(r.P.name.slice(0, 7))}<b>${r.sc}</b></div>`).join('');
    if (g.coop) html = `<div class="me">🤝 チーム<b>${Math.max(0, rows.reduce((t, r) => t + r.sc, 0) - (g.coopPen || 0))}</b></div>` + html;
    if (html !== MP.boardHtml) { MP.boardHtml = html; $('mpBoard').innerHTML = html; }
  }

  // ================================================================ メインループ
  let lastT = performance.now(), ledT = 0, demoCam = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    try { lobbyTick(dt); } catch (e) { }
    mmTick(dt).catch(() => { });
    const t = now / 1000;
    if (RP.active && G && (state === 'play' || state === 'pause')) {
      rpTick(dt);
      handleEvents(G);
      updateHUD(G, dt);
      updateWorld(G, dt, t);
      updateCamera(G, dt, t);
      updateAudio(G, dt);
    } else if (MP.active && G && (state === 'play' || state === 'pause')) {
      const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.joyX;
      const mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - inp.joyY;
      const li = { mx, mz, yaw: inp.yaw, pitch: inp.pitch, action: inp.action, punch: inp.punch, brace: !!keys.Space || inp.braceTouch, bracePressed: inp.bracePressed, fakeSleep: inp.fakeSleep, skill: inp.skill };
      inp.action = inp.punch = inp.bracePressed = inp.fakeSleep = false; inp.skill = -1;
      mpFrame(dt, t, li);
      if (MP.active && G) {
        handleEvents(G);
        if (MP.isHost) inp.pitch = G.player.pitch;
        if (state === 'play') updateHUD(G, dt);
        updateMpBoard(G);
        updateWorld(G, dt, t);
        updateCamera(G, dt, t);
        updateAudio(G, dt);
      }
    } else if (state === 'play' && G) {
      const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.joyX;
      const mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - inp.joyY;
      const li = { mx, mz, yaw: inp.yaw, pitch: inp.pitch, action: inp.action, punch: inp.punch, brace: !!keys.Space || inp.braceTouch, bracePressed: inp.bracePressed, fakeSleep: inp.fakeSleep, skill: inp.skill };
      inp.action = inp.punch = inp.bracePressed = inp.fakeSleep = false; inp.skill = -1;
      if (!G.over) SW.update(G, dt, li);
      if (REC) recTick(G, dt);
      if (G.tutorial) tutTick(G, dt);
      handleEvents(G);
      inp.pitch = G.player.pitch;
      updateHUD(G, dt);
      updateWorld(G, dt, t);
      updateCamera(G, dt, t);
      updateAudio(G, dt);
      if (G.over && !pendingResult) { pendingResult = true; setTimeout(finishGame, 2200); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); }
    } else if (state === 'pause' || state === 'result') {
      if (G) { updateWorld(G, 0, t); if (state === 'result') updateCamera(G, dt, t); }
      updateAudio(null, dt);
    } else if (demo) {
      // タイトル：デモ運転
      SW.update(demo, dt, {}); demo.player.stamina = 100; demo.player.karma = 0; demo.events.length = 0;
      if (demo.over) demo = SW.create({ seed: (Math.random() * 1e9) | 0 });
      updateWorld(demo, dt, t);
      demoCam += dt;
      camera.position.set(Math.sin(demoCam * 0.07) * 5.5 + 0.5, 1.62, Math.sin(demoCam * 0.11) * 0.25);
      camera.rotation.set(-0.05, Math.PI / 2 + Math.sin(demoCam * 0.13) * 0.9, 0);
      fpR.visible = fpL.visible = false;
      updateAudio(demo, dt);
    }
    const lg = G || demo;
    if (lg) {
      ledT -= dt;
      if (ledT <= 0) {
        ledT = 1 / 15;
        const txt = lg.phase === 'travel' ? (Math.floor(t / 5) % 2 ? '次は ' + SW.stationName(lg, lg.station + 1) + ' です' : 'Next ' + (lg.station + 1 < SW.LINE.length ? SW.LINE[lg.station + 1].kana : SW.stationName(lg, lg.station + 1))) : SW.stationName(lg, lg.station) + '　ドアが開きます';
        drawLED(txt, t);
      }
    }
    renderer.render(scene, camera);
    if (SHOT.pending) takeShot();
  }
  // 起動
  function boot() {
    $('loading').remove();
    titleScreen();
    requestAnimationFrame(frame);
  }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(boot); else boot();
  // テスト用
  window.__SW = { avatarUrl, makeName, mpTick: (dt) => { if (MP.active && G) { mpFrame(dt, performance.now() / 1000, { yaw: inp.yaw, pitch: inp.pitch }); handleEvents(G); } }, get MP() { return MP; }, playLandscape, toggleFullscreen, inp, AU, sfx, trainSpeed, VMAX, get G() { return G; }, get state() { return state; }, startGame, titleScreen, humans, profile, finishGame: () => finishGame(), get TUT() { return TUT; }, shareImg: () => drawShareImage(lastResult).toDataURL(), shareText: () => shareText(lastResult) };
})();
