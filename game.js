/* スワリタイ！ 描画・操作・画面 */
(function () {
  'use strict';
  const SW = window.SW;
  const $ = id => document.getElementById(id);
  if (!window.THREE) { $('loading').textContent = '3D の読み込みに失敗しました。通信を確認して再読み込みしてください。'; return; }
  const T3 = THREE;
  const TAU = Math.PI * 2;
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');
  const SHARE_URL = window.SUWARITAI_URL || (location.href.split('?')[0].split('#')[0] + '?ref=share');

  // ================================================================ 数える（GoatCounter）
  // 遊ばれ方の回数だけを数える（個人は分からない）。公開サイトで count.js が読めたときだけ動く
  function track(name) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'スワリタイ：' + name, title: 'スワリタイ：' + name, event: true }); } catch (e) { /* 無視 */ }
  }
  const MODE_JA = { normal: 'たちっぱ線', daily: '今日のダイヤ', endless: '終点なし', hard: '満員地獄', jiji: '敬老の日' };

  // ================================================================ 保存
  const STORE_KEY = 'suwaritai.v1';
  let profile = { name: '', best: 0, bestTitle: '', daily: { date: '', score: 0 }, ach: {}, chikanTotal: 0, plays: 0, unlock: {}, sound: true, bests: {} };
  try { const s = localStorage.getItem(STORE_KEY); if (s) profile = Object.assign(profile, JSON.parse(s)); } catch (e) { }
  function saveProfile() { try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch (e) { } }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
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
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
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
  const seatGlow = [];
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
      ['痴漢は犯罪です', '構えた瞬間を', 'ねらえ！（自己責任）', '#e7ffe7', '#166534'],
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
      ang: { pelvisY: h * 0.47, lean: 0, hy: 0, hp: 0, hr: 0, shLx: 0, shLz: 0.08, elL: 0, shRx: 0, shRz: -0.08, elR: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, rootTilt: 0, yOff: 0 },
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
    root.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
    scene.add(root);
    return H;
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
    if (expr === 'worried' || expr === 'distressed' || expr === 'sad' || expr === 'panic') { bIn = -5; bOut = 2; }
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
      let oh = expr === 'surprised' || expr === 'panic' ? 7.5 : expr === 'sleepy' || expr === 'dazed' ? 3 : expr === 'glare' || expr === 'angry' ? 4.5 : 5.5;
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
    if (L.glasses && !alien) { c.strokeStyle = '#222'; c.lineWidth = 2.6; for (const sx of [-1, 1]) { roundRect(c, 64 + sx * ex - 15, ey - 10, 30, 20, 6); c.stroke(); } c.beginPath(); c.moveTo(56, ey - 3); c.lineTo(72, ey - 3); c.stroke(); }
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
        case 'dazed': c.moveTo(54, my); c.bezierCurveTo(58, my + 5, 62, my - 5, 66, my); c.bezierCurveTo(70, my + 5, 72, my - 2, 75, my); c.stroke(); break;
        default: c.moveTo(55, my); c.quadraticCurveTo(64, my + 2, 73, my); c.stroke();
      }
      if (!p.female && (p.id % 4 === 1) && !elder) { c.fillStyle = 'rgba(40,30,30,.18)'; for (let i = 0; i < 40; i++) c.fillRect(46 + Math.random() * 36, 100 + Math.random() * 16, 1.5, 1.5); }
    }
    // 汗・涙
    if (expr === 'shifty' || expr === 'panic' || expr === 'worried') { c.fillStyle = '#7cc8ff'; c.beginPath(); c.moveTo(98, 34); c.quadraticCurveTo(106, 48, 98, 52); c.quadraticCurveTo(90, 48, 98, 34); c.fill(); }
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
    const tgt = { pelvisY: H.legLen, lean: 0, hy: 0, hp: 0, hr: 0, shLx: 0.04, shLz: -0.08, elL: -0.12, shRx: 0.04, shRz: 0.08, elR: -0.12, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, rootTilt: 0, yOff: 0 };
    let faceRy = p.ry;
    const st = p.state;
    const ch = g.chikan;
    const pl = g.player;
    const seated = st === 'seated';
    let anim = p.anim, idle = p.idle;
    if (seated) {
      tgt.pelvisY = 0.47; tgt.hipL = tgt.hipR = -1.42; tgt.kneeL = tgt.kneeR = 1.42; tgt.lean = -0.06;
      tgt.shLx = tgt.shRx = -0.45; tgt.elL = tgt.elR = -0.95;
      if (p.sleep) { tgt.hp = 0.6; tgt.hr = (p.id % 2 ? 0.32 : -0.32) + Math.sin(now * 0.6 + p.id) * 0.04; tgt.lean = 0.12; }
      else if (p.packing) { tgt.shLx = tgt.shRx = -0.8; tgt.elL = tgt.elR = -1.05; tgt.hp = 0.15; }
      else if (anim === 'none' && idle !== 'none' && p.type !== 'drunk') applyIdle(tgt, idle);
    } else if (st === 'walk' || st === 'exit') {
      const ph = p.walkPhase;
      tgt.hipL = Math.sin(ph) * 0.45; tgt.hipR = -Math.sin(ph) * 0.45;
      tgt.kneeL = Math.max(0, Math.sin(ph + 1.6)) * 0.7; tgt.kneeR = Math.max(0, -Math.sin(ph + 1.6)) * 0.7;
      tgt.shLx = -Math.sin(ph) * 0.35; tgt.shRx = Math.sin(ph) * 0.35; tgt.elL = tgt.elR = -0.35;
      tgt.lean = p.speed > 2 ? 0.2 : 0.06; tgt.yOff = Math.abs(Math.sin(ph)) * 0.02;
    } else if (st === 'ko') {
      tgt.rootTilt = -Math.PI / 2; tgt.yOff = 0.13; tgt.shLz = -1.3; tgt.shRz = 1.3; tgt.hr = 0.4;
    } else if (st === 'fight' && ch) {
      tgt.shLx = tgt.shRx = -1.1; tgt.elL = tgt.elR = -2.05; tgt.lean = 0.08; tgt.hipL = -0.25; tgt.kneeL = 0.35; tgt.hipR = 0.15;
      if (ch.fstate === 'windup') { tgt.shRx = -0.15; tgt.shRz = 0.55; tgt.elR = -2.3; tgt.lean = -0.12; }
      if (ch.fstate === 'recover' && ch.ft > 0.4) { tgt.shRx = -1.55; tgt.shRz = 0; tgt.elR = -0.1; tgt.lean = 0.22; }
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
      else if (p.role === 'chikan' && ch && ch.stage !== 'fight') { tgt.hy = Math.sin(now * 3 + p.id) * 0.5; tgt.shRx = -0.3; tgt.elR = -0.4; faceRy = p.ry; }
      else if (H.strap && anim === 'none' && idle !== 'map' && idle !== 'game') { tgt.shRx = -2.85; tgt.shRz = 0.12; tgt.elR = -0.25; if (idle === 'phone' || idle === 'book') { tgt.shLx = -0.45; tgt.elL = -1.65; tgt.hp = 0.4; } }
      else if (anim === 'none') applyIdle(tgt, idle);
      if (p.priority && p.targetPlayer) { tgt.lean = 0.12; tgt.hp = 0.15; }
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
    if ((p.expr === 'angry' || p.expr === 'glare' || p.bubble) && st !== 'ko' && !p.sleep && anim !== 'board') {
      const yaw = angDiff(H.ry, Math.atan2(pl.x - p.x, pl.z - p.z));
      if (Math.abs(yaw) < 1.6) { tgt.hy = yaw * 0.8; tgt.hp = 0; }
    }
    // 補間
    const k = Math.min(1, dt * (st === 'fight' ? 14 : 7));
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
    H.legL.hp.rotation.x = A.hipL; H.legL.kn.rotation.x = A.kneeL;
    H.legR.hp.rotation.x = A.hipR; H.legR.kn.rotation.x = A.kneeR;
    // 持ち物
    if (H.bag) {
      if (seated) H.bag.position.set(0, 0.6, 0.22), H.bag.rotation.set(0, 0, 0);
      else H.bag.position.set(-h * 0.13, h * 0.47, 0.02), H.bag.rotation.set(0, Math.PI / 2, 0);
    }
    if (H.crutch) H.crutch.position.set(h * 0.17, 0.6, 0.12);
    if (H.suitcase) { if (seated) H.suitcase.position.set(0, 0.28, 0.75); else H.suitcase.position.set(h * 0.2, 0.28, 0.1); }
  }
  function applyIdle(t, idle) {
    if (idle === 'phone' || idle === 'book' || idle === 'game') { t.shLx = -0.45; t.elL = -1.7; t.shRx = -0.45; t.elR = -1.7; t.shLz = 0.15; t.shRz = -0.15; t.hp = idle === 'game' ? 0.55 : 0.42; }
    else if (idle === 'map') { t.shLx = t.shRx = -0.65; t.elL = t.elR = -1.3; t.shLz = -0.15; t.shRz = 0.15; t.hp = 0.3; }
    else if (idle === 'makeup') { t.shRx = -0.95; t.shRz = 0.15; t.elR = -2.35; t.shLx = -0.6; t.elL = -1.55; t.hp = 0.08; }
  }

  // 表情
  function faceState(H, g, now) {
    const p = H.p, pl = g.player;
    let expr = p.expr;
    if (expr === 'neutral') {
      if (p.sleep && p.state === 'seated') expr = 'sleep';
      else if (p.type === 'yankee') expr = 'glare';
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
    g.seats.forEach((s, i) => { seatGlow[i].visible = s.occ < 0 && s.res < 0 && g.player.seat !== s.id; });
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
    const t = e.changedTouches[0]; joyId = t.identifier; joyO = { x: t.clientX, y: t.clientY };
    joyBase.style.display = 'block'; joyBase.style.left = t.clientX + 'px'; joyBase.style.top = (t.clientY - (window.innerHeight - joyEl.offsetHeight)) + 'px';
    joyKnob.style.transform = ''; $('joyHint').style.display = 'none'; e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - joyO.x, dy = t.clientY - joyO.y; const l = Math.hypot(dx, dy), m = 48;
        if (l > m) { dx *= m / l; dy *= m / l; }
        inp.joyX = dx / m; inp.joyY = dy / m; joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === lookId) {
        const dx = t.clientX - lookP.x, dy = t.clientY - lookP.y; lookP = { x: t.clientX, y: t.clientY };
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
    if (lookId == null) { lookId = t.identifier; lookP = { x: t.clientX, y: t.clientY }; }
    e.preventDefault();
  }, { passive: false });
  function holdBtn(el, down, up) {
    el.addEventListener('touchstart', e => { initAudio(); el.classList.add('down'); down(); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    el.addEventListener('touchend', e => { el.classList.remove('down'); up && up(); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchcancel', () => { el.classList.remove('down'); up && up(); });
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
  const skillsEl = $('skills');
  SW.SKILLS.forEach((s, i) => {
    const b = document.createElement('button'); b.className = 'sk'; b.title = s.name + '：' + s.desc;
    b.innerHTML = `<kbd>${i + 1}</kbd>${s.icon}<small id="skc${i}">${s.cost}</small><div class="cd" id="skd${i}" style="height:0"></div>`;
    const fire = e => { e.preventDefault(); e.stopPropagation(); initAudio(); if (state === 'play') inp.skill = i; };
    b.addEventListener('touchstart', fire, { passive: false }); b.addEventListener('mousedown', fire);
    skillsEl.appendChild(b);
  });
  $('skillHelp').innerHTML = SW.SKILLS.map(s => `<div style="font-size:13px;margin:3px 0">${s.icon} <b>${s.name}</b>（${s.cost}徳）… ${s.desc}</div>`).join('');
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
  function updateHUD(g, dt) {
    const pl = g.player;
    const st = Math.ceil(pl.stamina);
    if (st !== hud.stam) { hud.stam = st; $('stamF').style.width = st + '%'; $('stamV').textContent = st; $('stamBar').classList.toggle('danger', st <= 25); $('stamF').style.background = st <= 25 ? 'linear-gradient(90deg,#b8261d,#ff5a4f)' : ''; }
    const ka = Math.floor(pl.karma);
    if (ka !== hud.karma) { hud.karma = ka; $('karmaF').style.width = ka + '%'; $('karmaV').textContent = ka; $('karmaBar').classList.toggle('danger', ka >= 75); }
    if (pl.toku !== hud.toku) { hud.toku = pl.toku; $('toku').textContent = pl.toku; }
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
    if (pl.carrying) bl.push('👜 ' + pl.carrying.name + 'を持っている');
    const bs = bl.join('|');
    if (bs !== hud.buffs) { hud.buffs = bs; $('buffs').innerHTML = bl.map(b => `<span class="buff">${b}</span>`).join(''); }
    // スキル
    SW.SKILLS.forEach((s, i) => {
      const cost = SW.skillCost(g, i);
      const el = skillsEl.children[i];
      const on = !!pl.buffs[s.key] || pl.mode === s.key;
      const off = pl.toku < cost || (s.key === 'confess' && pl.confessCD > 0);
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
    $('bSleep').innerHTML = pl.fakeSleep ? '<span style="font-size:18px">👀</span>起きる' : '<span style="font-size:18px">😪</span>狸寝入り';
    $('bGuard').innerHTML = g.chikan && g.chikan.stage === 'fight' ? '<span>🛡</span>ガード' : '<span>🛡</span>踏ん張る';
    // 照準
    targetT -= dt;
    const cross = $('cross');
    cross.classList.toggle('aim', g.aim >= 0); cross.classList.toggle('mode', !!pl.mode);
    if (targetT <= 0) {
      targetT = 0.15;
      const p = g.aim >= 0 ? SW.person(g, g.aim) : null;
      let html = '';
      if (p && !pl.fakeSleep) { const o = SW.observe(g, p); html = `<h4>${o.name}</h4>` + o.notes.slice(0, 3).map(n => `<div>${n}</div>`).join(''); }
      if (html !== hud.target) { hud.target = html; $('target').innerHTML = html; $('target').classList.toggle('hidden', !html); }
    }
    // 揺れ警告
    if (warnT > 0) { warnT -= dt; if (warnT <= 0) $('warn').classList.add('hidden'); }
    if (annT > 0) { annT -= dt; if (annT <= 0) $('ann').classList.add('hidden'); }
    // 画面効果
    $('hitFlash').style.opacity = Math.min(1, pl.hitFlash * 2.5);
    $('sleepFx').style.opacity = pl.fakeSleep ? 1 : 0;
    $('lowFx').style.boxShadow = pl.stamina < 25 ? `inset 0 0 ${80 + 40 * Math.sin(performance.now() / 200)}px rgba(255,30,30,.55)` : 'inset 0 0 0 rgba(0,0,0,0)';
  }
  function showAnn(text) { $('ann').textContent = '📢 ' + text; $('ann').classList.remove('hidden'); annT = 5; }

  // ================================================================ 出来事
  const tipsDone = {};
  function tip(key, text) {
    if (tipsDone[key] || (profile.plays || 0) >= 3) return;
    tipsDone[key] = true;
    const box = $('toasts'); const el = document.createElement('div'); el.className = 'toast warn'; el.textContent = '💡 ' + text; box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 6000);
  }
  function tipsTick(g) {
    const pl = g.player;
    if (g.t > 3) tip('observe', '座っている人に照準を合わせると「様子」が見える。掲示板をチラ見する人は、降りるのが近い');
    if (g.t > 14 && pl.seat < 0) tip('stand', '立っていると体力が減る。降りそうな人の前で待ち、空いたらすぐアクションで座ろう');
    if (pl.toku >= 40) tip('shop', '徳がたまった！ 画面の' + (isTouch ? '上' : '下') + 'のスキルが使える（👓メガネで降りる駅が見える）');
    if (pl.seat >= 0 && SW._internal.priorityNear(g)) tip('give', '目の前に座りたそうな人が。譲ると徳が入る…けど、また立つことに。無視するとカルマ');
    if (pl.karma >= 40) tip('karma', 'カルマが100になると駅員に連行される。🙏懺悔か善行で減らそう');
  }
  function handleEvents(g) {
    tipsTick(g);
    for (const e of g.events) {
      if (e.type === 'seatFree') { const s = g.seats[e.id]; if (s && Math.hypot(s.x - g.player.x, s.fz - g.player.z) < 3.5 && g.player.seat < 0) tip('seat', '🟩 光っている席は空席！ 近づいてアクションで座れ'); }
      if (e.type === 'thiefSteal') tip('thief', '落とし物泥棒がいる！ キョロキョロしている人を探してパンチ。逃げたら追いかけてもう一発');
      if (e.type === 'chikan') tip('chikan', '困っている人のそばに痴漢が。照準を合わせて見極めてからパンチ！ 間違えるとカルマ。非常通報ボタンでも助けられる');
      if (e.type === 'drop') tip('drop', '落とし物！ 拾って持ち主に届けよう。持ち主は「あれ？」と探しはじめる');
      switch (e.type) {
        case 'toast': addToast(e.text, e.kind); break;
        case 'points': addPop(`+${e.amount} 徳<small>${e.text}</small>`); if (e.combo > 1) { addToast('善行コンボ ×' + e.combo + '！', 'good'); sfx('combo'); } break;
        case 'karma': if (e.amount > 0) addPop(`+${e.amount} カルマ<small>${e.text}</small>`, 'k'); else addPop(`${e.amount} カルマ<small>${e.text}</small>`, 'k'); break;
        case 'sfx': sfx(e.name); break;
        case 'shake': shakeAmt = Math.max(shakeAmt, e.amount); break;
        case 'lurchWarn': if (g.player.seat < 0) { $('warn').classList.remove('hidden'); $('warn').firstChild.textContent = '⚠ 揺れるぞ！'; $('warnSub').textContent = isTouch ? '🛡「踏ん張る」を押せ！' : '[Space] で踏ん張れ！'; warnT = 1.15; sfx('warn'); } break;
        case 'lurch': lurchKick = 1; sfx('lurch'); break;
        case 'brace': if (e.ok) addPop('踏ん張った！'); else addToast('よろけた！ 体力-7', 'bad'); $('warn').classList.add('hidden'); break;
        case 'chikan': addToast('…どこかで困っている人がいる？（痴漢かも）', 'warn'); break;
        case 'thiefSteal': if (!G.__thiefTold) { G.__thiefTold = true; addToast('…だれかが落とし物をこっそり持っていった？（泥棒かも）', 'warn'); } break;
        case 'rare': { const p = SW.person(g, e.id); if (p) addToast(p.type === 'ceo' ? '金のネクタイの紳士が乗ってきた…' : '…なにか様子のおかしい乗客が乗ってきた', 'warn'); break; }
        case 'arrive': sfx('arrive'); showAnn(g.ann); speak(SW.stationName(g, g.station) + '、' + SW.stationName(g, g.station)); break;
        case 'announce': showAnn(e.text); if (/^次は/.test(e.text)) speak(e.text); break;
        case 'seatFree': { const s = g.seats[e.id]; if (s && Math.hypot(s.x - g.player.x, s.fz - g.player.z) < 3.5) sfx('free'); break; }
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
    if (g.over) {
      endT += dt;
      const c = g.result.cause;
      if (c === 'collapse' || c === 'ko') { y = lerp(eyeH, 0.32, Math.min(1, endT * 1.5)); roll = Math.min(1.3, endT * 1.6); pitch = c === 'ko' ? Math.min(1.1, endT) : pitch; }
      if (c === 'arrest') { pitch = lerp(pitch, -0.2, Math.min(1, endT)); }
    }
    camera.position.set(pl.x + ox, y + oy, pl.z);
    camera.rotation.set(pitch, yaw, roll);
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
  const screens = ['title', 'modes', 'howto', 'rank', 'ach', 'pause', 'result'];
  let backTo = 'title';
  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  }
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { show(backTo); }));
  $('nameIn').value = profile.name || '';
  // 名前は入力のたびに保存し、少し待ってからランキングの名前も直す
  let nameTimer = 0;
  $('nameIn').addEventListener('input', () => {
    profile.name = $('nameIn').value.trim().slice(0, 12); saveProfile();
    clearTimeout(nameTimer); nameTimer = setTimeout(() => syncName(), 1200);
  });
  $('nameIn').addEventListener('change', () => { clearTimeout(nameTimer); syncName(); });
  $('bSnd').textContent = AU.on ? '🔊' : '🔇';
  $('bSnd').addEventListener('click', () => { AU.on = !AU.on; profile.sound = AU.on; saveProfile(); $('bSnd').textContent = AU.on ? '🔊' : '🔇'; initAudio(); if (AU.master) AU.master.gain.value = AU.on ? 0.6 : 0; if (!AU.on && speechOK) try { speechSynthesis.cancel(); } catch (e) { } });
  function titleScreen() {
    state = 'title'; backTo = 'title';
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    $('sleepFx').style.opacity = 0; $('hitFlash').style.opacity = 0; $('lowFx').style.boxShadow = 'none';
    if (document.pointerLockElement) document.exitPointerLock();
    if (!demo || demo.over) demo = SW.create({ seed: (Math.random() * 1e9) | 0 });
    G = null; clearWorld();
    show('title');
    const dk = todayKey();
    $('dailyBest').textContent = profile.daily && profile.daily.date === dk ? '今日のベスト ' + profile.daily.score : '未挑戦';
    $('bestLine').textContent = profile.best ? `自己ベスト ${profile.best}点「${profile.bestTitle}」・乗車 ${profile.plays} 回` : '降りる人を見極めて、座って、徳を積め。';
    renderModes();
  }
  function renderModes() {
    const n = (profile.unlock.endless ? 1 : 0) + (profile.unlock.hard ? 1 : 0) + (profile.unlock.jiji ? 1 : 0);
    $('bModes').textContent = (n ? '🚇 ' : '🔒 ') + 'そのほかの路線（' + n + '/3）';
    const list = [
      ['endless', '♾ 終点なしモード', '終点がない。どこまで立っていられるか。だんだん疲れやすくなる', '開放条件：一度、終点まで行く'],
      ['hard', '🔥 満員地獄モード', '超満員・席取りおばちゃん倍増・痴漢多め', '開放条件：タイトル画面で伝説のコマンド（スマホはスワイプで）'],
      ['jiji', '👴 敬老の日モード', '乗客がほぼ全員お年寄り。譲り放題…体力がもつか？', '開放条件：タイトルのロゴを何度もタップ'],
    ];
    $('modeList').innerHTML = list.map(([k, name, desc, cond]) => profile.unlock[k]
      ? `<button class="btn" data-mode="${k}">${name}</button><p class="modeinfo">${desc}${profile.bests[k] ? '・ベスト ' + profile.bests[k] : ''}</p>`
      : `<button class="btn" disabled style="opacity:.45">🔒 ？？？</button><p class="modeinfo">${cond}</p>`).join('');
    $('modeList').querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode)));
  }
  function clearWorld() {
    for (const [, H] of humans) disposeHuman(H); humans.clear();
    for (const [, m] of itemMeshes) scene.remove(m); itemMeshes.clear();
  }
  function startGame(mode) {
    track((profile.plays ? '出発した：' : '初めて出発した：') + (MODE_JA[mode] || mode));
    initAudio();
    clearWorld();
    const seed = mode === 'daily' ? dailySeed() : (Math.random() * 1e9) | 0;
    G = SW.create({ seed, mode });
    G.modeName = mode;
    inp.yaw = G.player.yaw; inp.pitch = 0; endT = 0; pendingResult = false; eyeH = 1.6;
    state = 'play'; show(null);
    $('hud').classList.remove('hidden');
    if (isTouch) $('touch').classList.remove('hidden');
    hud.st = hud.sub = hud.prompt = hud.target = hud.buffs = ''; hud.stam = hud.karma = hud.toku = -1;
    $('toasts').innerHTML = ''; $('pops').innerHTML = '';
    if (!isTouch) {
      $('pcHint').innerHTML = '<b>画面をクリック</b>でマウス操作開始<br>WASD 移動 ／ E・クリック アクション ／ F・右クリック パンチ<br>Space 踏ん張る・ガード ／ Q 狸寝入り ／ 1〜7 スキル ／ Esc 一時停止';
      $('pcHint').classList.remove('hidden');
      setTimeout(() => $('pcHint').classList.add('hidden'), 9000);
      if (!noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
    }
    addToast(mode === 'daily' ? '📅 今日のダイヤ：今日はみんな同じ乗客・同じ揺れ' : 'たちっぱ線へようこそ。降りそうな人の前に立て！', 'good');
    showAnn(G.ann);
  }
  function pause() {
    if (state !== 'play') return;
    state = 'pause'; backTo = 'pause'; show('pause');
  }
  $('bStart').addEventListener('click', () => startGame('normal'));
  $('bDaily').addEventListener('click', () => startGame('daily'));
  $('bModes').addEventListener('click', () => { backTo = 'title'; renderModes(); show('modes'); });
  $('bHow').addEventListener('click', () => { backTo = 'title'; show('howto'); track('遊び方を開いた'); });
  $('bHow2').addEventListener('click', () => { backTo = 'pause'; show('howto'); });
  $('bAch').addEventListener('click', () => { backTo = 'title'; renderAch(); show('ach'); });
  $('bRank').addEventListener('click', () => { backTo = 'title'; show('rank'); setRankTab(rankTab); track('ランキングを開いた'); });
  $('pauseBtn').addEventListener('click', () => pause());
  $('pauseBtn').addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
  $('bResume').addEventListener('click', () => { state = 'play'; show(null); if (!isTouch && !noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } });
  $('bQuit').addEventListener('click', () => titleScreen());
  $('bRetry').addEventListener('click', () => startGame(G && G.modeName || 'normal'));
  $('bToTitle').addEventListener('click', () => titleScreen());

  function renderAch() {
    const got = profile.ach || {};
    const n = SW.ACHIEVEMENTS.filter(a => got[a.id]).length;
    $('achCount').textContent = n + ' / ' + SW.ACHIEVEMENTS.length;
    $('achList').innerHTML = SW.ACHIEVEMENTS.map(a => got[a.id]
      ? `<div class="ach"><b>🎖 ${a.name}</b>${a.desc}</div>`
      : `<div class="ach lock"><b>🔒 ${a.hidden ? '？？？' : a.name}</b>${a.hidden ? 'ひみつ' : a.desc}</div>`).join('');
  }

  // ================================================================ 結果
  let lastResult = null;
  function finishGame() {
    const g = G; state = 'result'; backTo = 'result';
    $('lowFx').style.boxShadow = 'none'; $('hitFlash').style.opacity = 0; $('sleepFx').style.opacity = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    $('touch').classList.add('hidden');
    const sc = SW.finalScore(g), r = g.result, s = g.stats;
    const newAch = SW.checkAchievements(g, profile);
    profile.plays = (profile.plays || 0) + 1;
    profile.chikanTotal = (profile.chikanTotal || 0) + s.chikanKO;
    for (const a of newAch) profile.ach[a] = Date.now();
    const mode = g.modeName;
    let newBest = false;
    if (mode === 'normal' || mode === 'daily') {
      if (sc.total > (profile.best || 0)) { profile.best = sc.total; profile.bestTitle = sc.title; newBest = true; }
      if (mode === 'daily') { const dk = todayKey(); if (!profile.daily || profile.daily.date !== dk || sc.total > profile.daily.score) profile.daily = { date: dk, score: sc.total, title: sc.title }; }
    } else { if (sc.total > (profile.bests[mode] || 0)) { profile.bests[mode] = sc.total; newBest = true; } }
    let unlockMsg = '';
    if (r.cause === 'clear' && !profile.unlock.endless) { profile.unlock.endless = true; unlockMsg = '♾ 終点なしモードが開放された！'; }
    profile.history = (profile.history || []).concat([{ s: sc.total, t: sc.title, m: mode, d: Date.now() }]).sort((a, b) => b.s - a.s).slice(0, 20);
    saveProfile();
    const causeTxt = { clear: '🎉 終点到着！', collapse: '🦵 膝が笑った…', ko: '💥 KO負け', arrest: '🚨 駅員に連行' }[r.cause];
    const stName = SW.stationName(g, Math.min(g.station + (g.phase === 'travel' ? 1 : 0), SW.lastStation(g)));
    const flavor = {
      clear: g.endless ? '' : 'やっと座れ橋に着いた。' + (s.sits === 0 ? 'ずっと立っていた。鉄人だ。' : 'おつかれさまでした。'),
      collapse: stName + 'の手前で、床に座りこんでしまった。',
      ko: stName + 'の手前で、床に沈んだ。',
      arrest: '「ちょっと事務室まで来てもらえますか」（' + stName + '）',
    }[r.cause];
    $('rCause').textContent = causeTxt; $('rCause').className = 'res-cause ' + (r.cause === 'clear' ? 'good' : 'bad');
    $('rText').textContent = flavor + (g.endless ? '（' + s.stations + '駅）' : '');
    $('rScore').textContent = sc.total;
    $('rTitle').textContent = '称号「' + sc.title + '」' + (newBest ? ' 🆕自己ベスト！' : '');
    $('rBrk').innerHTML = `<span>集めた徳</span><span>${sc.earned}</span><span>駅ボーナス（${s.stations}駅）</span><span>+${sc.stationBonus}</span><span>完走ボーナス</span><span>+${sc.clearBonus}</span><span>カルマ</span><span>−${sc.karmaPen}</span>`;
    const statsArr = [['🪑', '譲った席', s.gives], ['👊', '撃退した痴漢', s.chikanKO], ['👛', '届けた落とし物', s.delivered], ['💺', '座れた回数', s.sits], ['💥', 'カウンター', s.counters], ['😈', '洗脳・どかし', s.brainwash + s.force]];
    $('rStats').innerHTML = statsArr.map(([i, n, v]) => `<div><b>${i} ${v}</b>${n}</div>`).join('');
    const achNames = newAch.map(id => (SW.ACHIEVEMENTS.find(a => a.id === id) || {}).name).filter(Boolean);
    $('rAch').innerHTML = (achNames.length ? '🎖 実績：' + achNames.join('、') : '') + (unlockMsg ? '<br>' + unlockMsg : '') + (s.bestDeed ? `<br><span style="color:var(--sub)">最大の善行：${s.bestDeed.label}（+${s.bestDeed.pts}）</span>` : '');
    $('rRank').textContent = ''; $('rMiniBox').classList.add('hidden'); $('rMini').innerHTML = '';
    lastResult = { sc, cause: r.cause, causeTxt, stats: s, mode, stName, endless: g.endless };
    {
      const causeJa = { clear: '終点到着', collapse: '膝が笑った', ko: 'KO負け', arrest: '連行' }[r.cause] || r.cause;
      const band = sc.total >= 2000 ? '2000〜' : sc.total >= 1000 ? '1000〜1999' : sc.total >= 500 ? '500〜999' : sc.total >= 200 ? '200〜499' : '0〜199';
      track('結果：' + (MODE_JA[mode] || mode) + '：' + causeJa);
      track('スコア：' + band);
      if (!g.endless) track('終わった駅：' + Math.min(g.stats.stations, SW.lastStation(g)) + '駅目');
      for (const a of newAch) { const ach = SW.ACHIEVEMENTS.find(x => x.id === a); if (ach) track('実績：' + ach.name); }
    }
    $('bShareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(lastResult));
    show('result');
    submitScore(lastResult);
  }
  function shareText(R) {
    const s = R.stats;
    const modeTxt = R.mode === 'daily' ? '【今日のダイヤ】' : R.mode === 'normal' ? '' : '【' + ({ endless: '終点なし', hard: '満員地獄', jiji: '敬老の日' }[R.mode] || '') + '】';
    const how = R.cause === 'clear' ? '終点に到着！' : R.cause === 'collapse' ? R.stName + 'の手前で膝が笑った…' : R.cause === 'ko' ? '痴漢に返り討ちにされた…' : '駅員に連行された…';
    return `${modeTxt}スワリタイ！で ${R.sc.total}点\n称号「${R.sc.title}」\n${how}\n譲った席${s.gives}・撃退した痴漢${s.chikanKO}・落とし物${s.delivered}${s.brainwash + s.force ? '・悪事' + (s.brainwash + s.force) : ''}\n\n▶ ブラウザですぐ遊べます（無料）\n${SHARE_URL}\n\n#スワリタイ #降りる人を見極めろ #バカゲー`;
  }
  $('bShareX').addEventListener('click', () => {
    track('X でシェアを押した');
    if (!lastResult) return;
    try { const p = navigator.clipboard && navigator.clipboard.writeText(shareText(lastResult)); if (p && p.catch) p.catch(() => { }); } catch (e) { }
  });
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
    c.fillStyle = '#fff'; c.font = 'bold 64px ' + FONT; c.fillText('スワリタイ！', 600, 190);
    c.fillStyle = '#ffd447'; c.font = 'bold 30px ' + FONT; c.fillText('〜 降りる人を見極めろ 〜', 600, 235);
    c.fillStyle = R.cause === 'clear' ? '#5fe08a' : '#ff6b5e'; c.font = 'bold 40px ' + FONT; c.fillText(R.causeTxt, 600, 300);
    c.fillStyle = '#ffd447'; c.font = 'bold 110px ' + FONT; c.fillText(R.sc.total + '点', 600, 410);
    c.fillStyle = '#fff'; c.font = 'bold 36px ' + FONT; c.fillText('称号「' + R.sc.title + '」', 600, 465);
    const s = R.stats;
    c.fillStyle = '#b8bdc8'; c.font = 'bold 26px ' + FONT;
    c.fillText(`🪑譲った席 ${s.gives}　👊撃退 ${s.chikanKO}　👛落とし物 ${s.delivered}　💺着席 ${s.sits}`, 600, 515);
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
  let DB = null, myId = null, rankTab = 'normal', fbWait = null;
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
  function firebaseReady() {
    if (!fbAllowed) return Promise.resolve(null);
    if (!fbWait) fbWait = withTimeout((async () => {
      if (!window.firebase) for (const m of ['app', 'auth', 'database']) await loadScript(`https://cdn.jsdelivr.net/npm/firebase@${FB_VER}/firebase-${m}-compat.js`);
      const fb = window.firebase;
      const app = fb.apps.length ? fb.app() : fb.initializeApp(FB_CONFIG);
      const auth = app.auth();
      const prev = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
      const user = prev || (await auth.signInAnonymously()).user;
      return { db: app.database(), uid: user.uid, TS: fb.database.ServerValue.TIMESTAMP };
    })(), 12000).catch(e => { fbWait = null; throw e; });
    return fbWait;
  }
  function rankName() {
    return (profile.name || '').trim().slice(0, 12) || '名無しの乗客';
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
        for (const path of ['suwaritai/best/' + F.uid, 'suwaritai/daily/' + todayKey() + '/' + F.uid]) {
          const ref = F.db.ref(path);
          const old = (await withTimeout(ref.get(), 10000)).val();
          if (old && old.n !== name) { used = await fbSet(ref, { n: name, s: old.s, ti: old.ti || '', t: F.TS }); changed = true; }
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
    if (R.mode !== 'normal' && R.mode !== 'daily') return;
    if (!DB && !fbAllowed) return;
    if (DB && !myId) return;
    $('rRank').textContent = 'ランキングに記録中…';
    submitting = submitting.then(async () => {
      try {
        const res = DB ? await submitClaude(R) : await submitFirebase(R);
        if (state === 'result' && res) $('rRank').textContent = `🏆 ${R.mode === 'daily' ? '今日のダイヤ' : 'みんなのランキング'}で ${res.rank}位 / ${res.total}人${res.improved ? '（記録更新！）' : ''}` + (nameRefused ? '　※「ROBIT」「開発」が入った名前は使えないため、名無しの乗客で載せました' : profile.name ? '' : '　※タイトルの「乗客名」を入れると名前が載ります');
        else if (state === 'result') $('rRank').textContent = '';
        if (state === 'result' && res) showMiniBoard(R.mode === 'daily' ? 'daily' : 'normal');
      } catch (e) {
        if (state === 'result') $('rRank').textContent = 'ランキングに記録できませんでした（記録はこの端末に残っています）';
      }
    });
  }
  async function submitFirebase(R) {
    const F = await firebaseReady(); if (!F) return null;
    const dk = todayKey(), name = rankName();
    const put = async (path) => {
      const ref = F.db.ref(path);
      const old = (await withTimeout(ref.get(), 10000)).val();
      const better = !old || R.sc.total > old.s;
      if (better || old.n !== name) await fbSet(ref, { n: name, s: better ? R.sc.total : old.s, ti: better ? R.sc.title : old.ti, t: F.TS });
      const myS = better ? R.sc.total : old.s;
      const parent = path.slice(0, path.lastIndexOf('/'));
      const above = (await withTimeout(F.db.ref(parent).orderByChild('s').startAt(myS + 0.5).limitToFirst(1000).get(), 10000)).numChildren();
      const total = (await withTimeout(F.db.ref(parent).orderByChild('s').startAt(0).limitToFirst(5000).get(), 10000)).numChildren();
      return { rank: above + 1, total, improved: better && !!old };
    };
    const best = await put('suwaritai/best/' + F.uid);
    if (R.mode === 'daily') return put('suwaritai/daily/' + dk + '/' + F.uid);
    return best;
  }
  async function submitClaude(R) {
    const ref = DB.doc('scores/' + myId);
    const snap = await withTimeout(ref.get(), 10000);
    const od = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : null;
    const cur = Object.assign({ name: '', best: 0, title: '', dailyDate: '', dailyScore: 0, dailyTitle: '', plays: 0 }, od || {});
    const dk = todayKey();
    const name = rankName();
    let improved = false;
    cur.name = name;
    if (R.sc.total > cur.best) { cur.best = R.sc.total; cur.title = R.sc.title; improved = true; }
    if (R.mode === 'daily' && (cur.dailyDate !== dk || R.sc.total > cur.dailyScore)) { cur.dailyDate = dk; cur.dailyScore = R.sc.total; cur.dailyTitle = R.sc.title; }
    cur.plays = (cur.plays || 0) + 1; cur.updated = Date.now();
    await withTimeout(ref.set(cur), 10000);
    const list = await fetchClaude();
    const arr = R.mode === 'daily' ? list.filter(x => x.dailyDate === dk).sort((a, b) => b.dailyScore - a.dailyScore) : list.sort((a, b) => b.best - a.best);
    const idx = arr.findIndex(x => x.id === myId);
    return idx >= 0 ? { rank: idx + 1, total: arr.length, improved } : null;
  }
  async function fetchClaude() {
    const snap = await withTimeout(DB.collection('scores').limit(1000).get(), 10000);
    return snap.docs.map(d => { const v = typeof d.data === 'function' ? d.data() : d.data; return Object.assign({ id: d.id }, v || {}); });
  }
  // 表に出す形 [{id, name, score, title}]
  // 表に出す形 { list:[{id, name, score, title}]（上位）, me:自分の id, mine:{rank, score, name, title} | null, total }
  const TOP_N = 100;
  async function fetchBoard(tab) {
    const dk = todayKey();
    if (DB) {
      const all = await fetchClaude();
      const arr = (tab === 'daily' ? all.filter(x => x.dailyDate === dk && x.dailyScore > 0).map(x => ({ id: x.id, name: x.name, score: x.dailyScore, title: x.dailyTitle }))
        : all.filter(x => x.best > 0).map(x => ({ id: x.id, name: x.name, score: x.best, title: x.title }))).sort((a, b) => b.score - a.score);
      const i = arr.findIndex(x => x.id === myId);
      return { list: arr.slice(0, TOP_N), me: myId, mine: i >= 0 ? Object.assign({ rank: i + 1 }, arr[i]) : null, total: arr.length };
    }
    const F = await firebaseReady(); if (!F) return null;
    const path = tab === 'daily' ? 'suwaritai/daily/' + dk : 'suwaritai/best';
    const snap = await withTimeout(F.db.ref(path).orderByChild('s').limitToLast(TOP_N).get(), 10000);
    const arr = [];
    snap.forEach(c => { const v = c.val() || {}; arr.push({ id: c.key, name: v.n, score: v.s || 0, title: v.ti }); });
    arr.sort((a, b) => b.score - a.score);
    let mine = null, total = arr.length;
    const own = (await withTimeout(F.db.ref(path + '/' + F.uid).get(), 10000)).val();
    if (own) {
      const above = (await withTimeout(F.db.ref(path).orderByChild('s').startAt(own.s + 0.5).limitToFirst(5000).get(), 10000)).numChildren();
      mine = { id: F.uid, rank: above + 1, score: own.s, name: own.n, title: own.ti };
    }
    if (arr.length >= TOP_N) total = (await withTimeout(F.db.ref(path).orderByChild('s').startAt(0).limitToFirst(10000).get(), 10000)).numChildren();
    return { list: arr, me: F.uid, mine, total };
  }
  document.querySelectorAll('[data-rt]').forEach(b => b.addEventListener('click', () => setRankTab(b.dataset.rt)));
  function setRankTab(tab) {
    rankTab = tab;
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
      html += `<div class="rk ${me ? 'me' : ''}"><span class="n">${rank}</span><span class="nm">${esc(x.name || '名無しの乗客')}${me ? ' <span class="pill">あなた</span>' : ''}<div class="ttl">${esc(x.title)}</div></span><span class="sc">${x.score}</span></div>`;
    });
    if (b.mine && !meShown) html += `<div class="rk" style="justify-content:center;color:var(--sub)">⋮</div><div class="rk me"><span class="n">${b.mine.rank}</span><span class="nm">${esc(b.mine.name || '名無しの乗客')} <span class="pill">あなた</span><div class="ttl">${esc(b.mine.title)}</div></span><span class="sc">${b.mine.score}</span></div>`;
    return html;
  }
  async function loadRanking(tab) {
    const dk = todayKey();
    const listEl = $('rankList');
    const local = () => {
      const h = (profile.history || []).filter(x => tab === 'daily' ? x.m === 'daily' && new Date(x.d).toDateString() === new Date().toDateString() : (x.m === 'normal' || x.m === 'daily')).slice(0, 10);
      listEl.innerHTML = h.length ? h.map((x, i) => `<div class="rk"><span class="n">${i + 1}</span><span class="nm">${esc(profile.name || 'あなた')}<div class="ttl">${esc(x.t)}・${new Date(x.d).toLocaleDateString()}</div></span><span class="sc">${x.s}</span></div>`).join('') : '<p class="small">まだ記録がありません</p>';
    };
    if (!DB && !fbAllowed) { $('rankNote').textContent = 'この端末の記録'; local(); return; }
    $('rankNote').textContent = '読み込み中…'; listEl.innerHTML = '';
    try {
      const b = await fetchBoard(tab);
      if (!b) throw new Error('none');
      if (rankTab !== tab) return;
      $('rankNote').textContent = (tab === 'daily' ? '今日のダイヤ（' + dk + '）・全員同じ電車' : 'みんなの自己ベスト') + '・' + b.total + '人' + (b.total > TOP_N ? '（上位' + TOP_N + '人）' : '');
      listEl.innerHTML = b.list.length ? rankRows(b, TOP_N) : '<p class="small">まだだれもいません。一番乗りしよう！</p>';
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
  $('bRankR').addEventListener('click', () => { backTo = 'result'; show('rank'); setRankTab(lastResult && lastResult.mode === 'daily' ? 'daily' : 'normal'); track('結果からランキングを開いた'); });

  // ================================================================ メインループ
  let lastT = performance.now(), ledT = 0, demoCam = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const t = now / 1000;
    if (state === 'play' && G) {
      const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.joyX;
      const mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - inp.joyY;
      const li = { mx, mz, yaw: inp.yaw, pitch: inp.pitch, action: inp.action, punch: inp.punch, brace: !!keys.Space || inp.braceTouch, bracePressed: inp.bracePressed, fakeSleep: inp.fakeSleep, skill: inp.skill };
      inp.action = inp.punch = inp.bracePressed = inp.fakeSleep = false; inp.skill = -1;
      if (!G.over) SW.update(G, dt, li);
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
  }
  // 起動
  function boot() {
    $('loading').remove();
    titleScreen();
    requestAnimationFrame(frame);
  }
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(boot); else boot();
  // テスト用
  window.__SW = { inp, AU, sfx, trainSpeed, VMAX, get G() { return G; }, get state() { return state; }, startGame, titleScreen, humans, profile, finishGame: () => finishGame() };
})();
