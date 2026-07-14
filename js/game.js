// ============ 游戏主循环：输入/更新/分屏渲染/小地图/商人/HUD/结算 ============
'use strict';

const VIEW_W = 1280, VIEW_H = 720;

let KEYMAP = [];
function buildKeymaps() {
  const saved = (typeof SAVE !== 'undefined' && SAVE && SAVE.settings && SAVE.settings.keys) || {};
  KEYMAP = DEFAULT_KEYS.map((def, i) => {
    const km = Object.assign({}, def, saved[i] || {});
    km.shoot2 = null;
    km.labels = {};
    for (const [a] of KEY_ACTIONS) km.labels[a] = keyLabel(km[a]);
    return km;
  });
}
buildKeymaps();

const Input = { keys: {}, sneakToggle: [false, false], lastCode: '', imeWarned: false,
                mouse: { x: 0, y: 0 }, mouseL: false, mouseR: false };

// 中文输入法防御：IME 接管标点键时 e.code 可能缺失/异常，用 e.key 的全角字符回退映射
function normalizeCode(e) {
  if (e.code && e.code !== 'Unidentified' && e.code !== '') return e.code;
  const map = { '、': 'Slash', '/': 'Slash', '？': 'Slash',
                '。': 'Period', '.': 'Period', '·': 'Backquote',
                '，': 'Comma', ',': 'Comma', '；': 'Semicolon', '：': 'Semicolon' };
  return map[e.key] || e.code;
}
window.addEventListener('keydown', e => {
  const code = normalizeCode(e);
  Input.keys[code] = true;
  Input.lastCode = code;
  // 输入法拦截检测：给玩家一个明确提示（只提示一次）
  if ((e.isComposing || e.keyCode === 229) && !Input.imeWarned) {
    Input.imeWarned = true;
    if (Game.current) Game.current.toast('⚠️ 检测到中文输入法——标点键位可能失灵，请切换为英文输入', '#ff8f8f');
  }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(code)) e.preventDefault();
  if (e.repeat) return;   // 系统按键自动重复不触发动作（否则按住会反复切换潜行/武器等）
  if (Game.current) Game.current.onKeyDown(code);
}, true);   // capture 阶段：最先收到，避免被页面内其它监听干扰
window.addEventListener('keyup', e => { Input.keys[normalizeCode(e)] = false; }, true);

class Game {
  static current = null;

  // loadouts: [{ w1, w2, armor, pouch }] 均为 uid / boolean
  constructor(mode, diffId, loadouts, mapId, skinIds, opts = {}) {
    Game.current = this;
    this.mode = mode;
    this.escape = !!opts.escape;             // 大逃亡模式（复用割草的升级/无限弹药体系）
    this.arena = !!opts.arena;               // 🎯 调试练习场：无敌+木桩+工具条
    this.horde = !!opts.horde || this.escape || this.arena;
    this.cfg = this.escape ? ESCAPE_CFG : this.horde ? HORDE_CFG : DIFFICULTIES[diffId];
    this.diffId = this.horde ? 'normal' : diffId;
    loadMap(mapId);
    this.mapId = mapId;
    this.mapName = MapData.def.name;

    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.viewW = mode === 2 ? VIEW_W / 2 : VIEW_W;
    this.overlays = [];
    for (let i = 0; i < mode; i++) {
      const c = document.createElement('canvas');
      c.width = this.viewW; c.height = VIEW_H;
      this.overlays.push(c);
    }

    this.players = [];
    this.mercs = [];
    this.mouseAimRun = this.mode === 1 && SAVE.settings.mouseAim !== false;
    for (let i = 0; i < mode; i++) {
      const sp = MapData.spawns[i];
      const lo = loadouts[i] || {};
      // 割草/大逃亡：取消带入武器护甲——默认一把手枪起家，成长全靠升级与拾取
      const w1 = this.horde ? { uid: -100 - i, id: 'pistol', dur: 99999, temp: true }
               : (SAVE.weapons.find(w => w.uid === lo.w1) || null);
      const w2 = this.horde ? null : (SAVE.weapons.find(w => w.uid === lo.w2) || null);
      const armor = this.horde ? null : (SAVE.armors.find(a => a.uid === lo.armor) || null);
      const p = new Player(i, sp.x, sp.y, [w1, w2], skinIds && skinIds[i], armor, this.horde ? false : lo.pouch, lo.acc);
      if (i === 0 && this.mouseAimRun) p.mouseAimed = true;
      p.maxHp = Math.round(p.maxHp * tune('pHp')); p.hp = p.maxHp;
      this.players.push(p);
      if (lo.merc2 && MERCS[lo.merc2]) {
        const mc2 = new Mercenary(sp.x + 34, sp.y - 26, MERCS[lo.merc2], p);
        unstick(mc2);
        this.mercs.push(mc2);
      }
      if (lo.merc && MERCS[lo.merc]) {
        const mc = new Mercenary(sp.x - 30, sp.y + 30, MERCS[lo.merc], p);
        unstick(mc);
        this.mercs.push(mc);
      }
    }

    this.chests = (this.horde && !this.escape) ? [] : placeChests(this.cfg).map(c => new Chest(c.x, c.y, c.tier));
    this.monsters = [];
    const sp0 = MapData.spawns[0];
    const nodes = MapData.monsterNodes
      .filter(n => Math.hypot(n.x - sp0.x, n.y - sp0.y) > 10 * TILE)
      .sort(() => Math.random() - 0.5);
    let ni = 0;
    // 大逃亡：房间制怪潮（踏入才刷，肃清有奖）+ 死亡之潮初始化——前期不再满地怪
    if (this.escape) {
      this.tideX = -120;
      this.escapePursuitT = ESCAPE.pursuitEvery;
      this.escRooms = (MapData.escapeRooms || []).map((r, i) => ({
        idx: i, x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE,
        state: i === 0 ? 'clear' : 'idle',      // 出生房免战
      }));
    }
    for (const [typeId, count] of Object.entries(this.cfg.spawn)) {
      for (let k = 0; k < count; k++) {
        const n = nodes[ni++ % nodes.length];
        const m = new Monster(n.x + (Math.random()-0.5)*20, n.y + (Math.random()-0.5)*20, this.cfg, typeId);
        unstick(m);
        this.monsters.push(m);
      }
    }
    if (this.cfg.lurkerGuard) {
      for (const c of this.chests) {
        if (c.tier !== 'gold' && c.tier !== 'mystery') continue;
        const m = new Monster(c.x + 46, c.y - 30, this.cfg, 'lurker');
        const r = resolveCircle(m.x, m.y, m.r); m.x = r.x; m.y = r.y; unstick(m);
        m.home = { x: m.x, y: m.y };
        this.monsters.push(m);
      }
    }
    // 神秘商人（困难/地狱）
    this.merchant = null;
    const mcP = this.cfg.merchant === true ? 1 : (this.cfg.merchant || 0);
    if (mcP > 0 && Math.random() < Math.min(1, mcP * tune('merchantF')) && MapData.merchantSpot) {
      this.merchant = new Merchant(MapData.merchantSpot.x, MapData.merchantSpot.y, false);
      const r = resolveCircle(this.merchant.x, this.merchant.y, 16);
      this.merchant.x = r.x; this.merchant.y = r.y; unstick(this.merchant);
    }

    this.bullets = [];
    this.monsterOrbs = [];
    this.bossZones = [];      // Boss 落点预警区（巨石/落雷）
    this.breathFx = null;     // 龙息特效
    this.dmgNums = [];        // 伤害数字
    this.hitPauseT = 0;       // 打击停顿
    this.groundLoot = [];
    this.goldDrops = [];
    this.floaters = [];
    this.sparks = [];
    this.cams = this.players.map(p => ({ x: p.x - this.viewW / 2, y: p.y - VIEW_H / 2 }));
    this.shake = 0;
    this.time = 0;
    this.paused = false;
    this.merchantOpen = false;
    this.over = false;
    this.revealT = 0;
    this.monsterSlowT = 0;
    this.mythicSpawned = { v: false };
    this.runKills = 0; this.runChests = 0; this.runCash = 0;
    this.lostWeaponUids = []; this.lostArmorUids = [];
    this.bagSig = ['', ''];

    // —— 无双割草初始化 ——
    if (this.horde) {
      this.merchant = null;
      if (!this.escape) this.monsters = [];   // 大逃亡保留沿途预置怪
      this.hordeState = {
        level: 1, xp: 0, xpNeed: Math.round(8 * (mode === 2 ? 1.35 : 1)),
        mods: { dmg: 1, rate: 1, multi: 0, pierce: 0, range: 1, knock: 1, speed: 1, magnet: 1, lifesteal: 0, regen: 0 },
        skills: { orbit: 0, missile: 0, nova: 0, trail: 0, lightning: 0, whirlwind: 0, barrier: 0, mines: 0, meteor: 0, boomerang: 0, chrono: 0, garlic: 0, spears: 0, drone: 0, thorns: 0, fireball: 0, summon: 0, revenge: 0, arty: 0 },
        spawnT: 1.2, missileT: 2, novaT: 4, boltT: 3, trailT: 0, fireTickT: 0,
        gems: [], firePatches: [], novaRings: [], bolts: [],
        bossIdx: 0, boss: null, victory: false, freeChoices: 0,
      };
      this.levelupOpen = false;
      for (const p of this.players) { p.maxHp = Math.round(500 * tune('pHp')); p.hp = p.maxHp; }
      if (!this.escape) for (let i = 0; i < 8; i++) this.spawnHordeMonster();
      if (SAVE.settings.devMode) setTimeout(() => this.toast(`🧪 开发者模式：经验 ×${tune('devXp')}（设置中心可关）`, '#7ef7ff'), 600);
    }

    this.mapCanvas = this.prerenderMap();
    document.getElementById('hud-bot-p2').style.display = mode === 2 ? '' : 'none';
    this.toastEl = document.getElementById('hud-toasts');
    this.toastEl.innerHTML = '';
    this.initWeather();
    this.initPowerups();
    if (this.horde) this.toast('🌾 无双割草！撑过 10 分钟——杀出一条路来！弹药无限！', '#ffd93d');
    else this.toast(`【${this.mapName}】难度【${this.cfg.name}】— 搜刮宝箱，活着撤离！`, '#ffd93d');
    if (this.merchant) this.toast('听说这片区域有个神秘商人出没……', '#b48aff');
    Music.play(this.horde ? 'battle' : 'game');

    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  // ---------- 输入 ----------
  onKeyDown(code) {
    if (this.levelupOpen) {
      const k = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2 }[code];
      if (k !== undefined) UI.chooseLevelup(k);
      return;
    }
    if (code === 'Escape') {
      if (this.merchantOpen) { this.closeMerchant(); return; }
      this.togglePause(); return;
    }
    if (this.paused || this.over) return;
    for (const p of this.players) {
      const km = KEYMAP[p.idx];
      if (!p.active) continue;
      if (code === km.roll) this.tryRoll(p);
      else if (code === km.sneak && !this.horde && p.active) {
        p.sneak = !p.sneak;
        this.floater(p.x, p.y - 34, p.sneak ? '🤫 潜行' : '解除潜行', '#9fd8ff');
      }
      else if (code === km.reload) {
        const def = p.weaponDef();
        if (!def.melee && def.mag && p.magLeft() < p.magCap() && p.reloadT <= 0 &&
            (this.horde || SAVE.ammo[def.ammo] > 0)) { p.startReload(); Sfx.tick(); }
      }
      else if (code === km.use) this.useConsumable(p);
      else if (code === km.cycle) this.cycleConsumable(p);
      else if (code === km.swap) { p.switchWeapon(); Sfx.tick(); }
      else if (code === km.interact && this.merchant && !this.merchantOpen &&
               Math.hypot(this.merchant.x - p.x, this.merchant.y - p.y) < 60) {
        this.openMerchant(p);
      }
    }
  }

  togglePause() {
    if (this.over || this.merchantOpen || this.levelupOpen) return;
    this.paused = !this.paused;
    document.getElementById('pause-overlay').style.display = this.paused ? 'flex' : 'none';
  }

  abandonRun() {
    for (const p of this.players) if (p.alive) { p.dead = true; p.abandoned = true; p.lostItems = p.bag.slice(); }
    this.paused = false;
    document.getElementById('pause-overlay').style.display = 'none';
    this.settle();
  }

  // ---------- 商人 ----------
  openMerchant(p) {
    this.merchantOpen = true;
    this.paused = true;
    this.trader = p;
    Sfx.trade();
    UI.renderMerchant(this, p);
    document.getElementById('merchant-overlay').style.display = 'flex';
  }
  closeMerchant() {
    this.merchantOpen = false;
    this.paused = false;
    document.getElementById('merchant-overlay').style.display = 'none';
    // 强化券：出店即三选一
    if (this.horde && this.hordeState.freeChoices > 0 && !this.levelupOpen) this.openLevelup();
  }

  // ---------- 主循环 ----------
  frame(t) {
    if (this.over) return;
    let dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.hitPauseT > 0) { this.hitPauseT -= dt; dt *= 0.12; }   // 打击停顿：时间放缓
    if (!this.paused) this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  update(dt) {
    this.time += dt;
    this.revealT = Math.max(0, this.revealT - dt);
    this.gemComboT = Math.max(0, (this.gemComboT || 0) - dt);
    this.monsterSlowT = Math.max(0, this.monsterSlowT - dt);
    this.shake = Math.max(0, this.shake - dt * 18);

    for (const p of this.players) this.updatePlayer(p, dt);

    if (!this.players.some(p => p.active) && this.players.some(p => p.downed)) {
      for (const p of this.players) if (p.downed) this.killPlayer(p);
    }

    for (const c of this.chests) {
      if (!c.opened && !c.beingOpened && c.progress > 0) c.progress = Math.max(0, c.progress - dt * 2);
      c.beingOpened = false;
    }

    for (const m of this.monsters) m.update(dt, this);
    for (let i = 0; i < this.monsters.length; i++) for (let j = i + 1; j < this.monsters.length; j++) {
      const a = this.monsters[i], b = this.monsters[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const rr = a.r + b.r;
      if (d > 0 && d < rr) {
        const push = (rr - d) / 2;
        const ra = resolveCircle(a.x - dx/d*push, a.y - dy/d*push, a.r); a.x = ra.x; a.y = ra.y;
        const rb = resolveCircle(b.x + dx/d*push, b.y + dy/d*push, b.r); b.x = rb.x; b.y = rb.y;
      }
    }

    for (const mc of this.mercs) mc.update(dt, this);
    this.mercs = this.mercs.filter(mc => mc.hp > 0);

    // 毒云：范围伤害滴答
    if (this.poisonClouds && this.poisonClouds.length) {
      for (const pc of this.poisonClouds) {
        pc.t -= dt; pc.tick -= dt;
        if (pc.tick <= 0) {
          pc.tick = 0.55;
          for (const p of this.players) {
            if (p.active && Math.hypot(p.x - pc.x, p.y - pc.y) < pc.r) this.damagePlayer(p, 6, null);
          }
        }
      }
      this.poisonClouds = this.poisonClouds.filter(pc => pc.t > 0);
    }

    // Boss 落点区（预警 → 爆发）
    for (const z of this.bossZones) {
      z.t -= dt;
      if (z.t <= 0) {
        Sfx.boom();
        this.shake = Math.max(this.shake, 7);
        this.fxExplosion(z.x, z.y, z.r, { quiet: true });
        for (let i = 0; i < 10; i++) this.spark(z.x, z.y, z.kind === 'bolt' ? '#ffe95c' : '#c9a06a');
        for (const p of this.players) {
          if (p.active && p.rollT <= 0 && Math.hypot(p.x - z.x, p.y - z.y) < z.r) this.damagePlayer(p, z.dmg, null);
        }
      }
    }
    this.bossZones = this.bossZones.filter(z => z.t > 0);
    if (this.breathFx) { this.breathFx.t -= dt; if (this.breathFx.t <= 0) this.breathFx = null; }
    for (const n of this.dmgNums) { n.t -= dt; n.y -= 40 * dt; }
    this.dmgNums = this.dmgNums.filter(n => n.t > 0);

    this.bullets = this.bullets.filter(b => b.update(dt, this));
    this.monsterOrbs = this.monsterOrbs.filter(o => o.update(dt, this));
    for (const f of this.floaters) { f.t -= dt; f.y -= 28 * dt; }
    this.floaters = this.floaters.filter(f => f.t > 0);
    for (const s of this.sparks) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.sparks = this.sparks.filter(s => s.t > 0);
    this.updateFx(dt);
    this.updateAllyFx(dt);
    // —— 掉落武器：走近自动与当前手持互换（1.4s 冷却防止来回横跳） ——
    if (this.weaponDrops && this.weaponDrops.length) {
      for (const wd of this.weaponDrops) {
        wd.cd = Math.max(0, wd.cd - dt);
        if (wd.cd > 0) continue;
        for (const p of this.players) {
          if (!p.active || Math.hypot(p.x - wd.x, p.y - wd.y) > 30) continue;
          const old = p.weapons[p.activeSlot];
          p.weapons[p.activeSlot] = wd.inst;
          p.mags[p.activeSlot] = (WEAPONS[wd.inst.id].mag || 0);
          wd.inst = old;
          wd.cd = 1.4;
          this.toast(`已换上 ${WEAPONS[p.weapons[p.activeSlot].id].icon}【${WEAPONS[p.weapons[p.activeSlot].id].name}】（旧枪落地可换回）`, '#ffd93d');
          Sfx.pickup('rare');
          break;
        }
      }
    }

    this.updateWeather(dt);
    this.updatePowerups(dt);
    if (this.horde) this.hordeUpdate(dt);

    this.updateCameras(dt);
    this.updateHud();
    Music.setDanger(this.horde ? true : this.monsters.some(m => m.state === 'chase'));

    if (this.players.every(p => p.dead || p.extracted)) this.settle();
  }

  // ================= 无双割草核心 =================
  hordeUpdate(dt) {
    const H = this.hordeState;
    const t = this.time;

    if (this.arena) { this.arenaUpdate(dt); } else if (this.escape) { this.escapeUpdate(dt); } else {
    // —— 胜利判定：撑满时长，全场怪物化作金币雨 ——
    if (!H.victory && t >= hordeDuration()) {
      H.victory = true;
      Sfx.extract();
      this.shake = 12;
      for (const m of this.monsters) {
        for (let i = 0; i < 6; i++) this.spark(m.x, m.y, '#ffd93d');
        this.goldDrops.push(new GoldDrop(m.x, m.y, 10 + Math.round(Math.random() * 10)));
      }
      this.monsters = [];
      this.toast(`🎉 撑过了 ${Math.round(hordeDuration() / 60)} 分钟！怪物尽数溃散成金币！`, '#7dff9a');
      setTimeout(() => { if (Game.current === this) this.settle(); }, 2200);
      return;
    }
    if (H.victory) { this.hordeGems(dt); return; }

    // —— 刷怪泵：随时间加速加量 ——
    // —— 自适应难度（DDA）：按玩家血线动态调节压力，详见 docs/自适应难度与调参.md ——
    if (tune('dda') >= 1) {
      H.ddaT = (H.ddaT || 0) - dt;
      if (H.ddaT <= 0) {
        H.ddaT = 4;
        const act = this.players.filter(p => p.active);
        const hpFrac = act.length ? act.reduce((s, p) => s + p.hp / p.maxHp, 0) / act.length : 0.5;
        const str = tune('ddaStr');
        const target = Math.max(1 - str, Math.min(1 + str, 1 + (hpFrac - 0.55) * 2 * str));
        H.dda = (H.dda || 1) + (target - (H.dda || 1)) * 0.5;
      }
    } else H.dda = 1;

    H.spawnT -= dt;
    const soloTight = this.mode === 1 ? 0.93 : 1;   // 单人割草略微收紧
    const interval = Math.max(0.26, (2.2 - t * 0.004) * soloTight) / (tune('spawnRate') * (H.dda || 1));
    if (H.spawnT <= 0) {
      H.spawnT = interval;
      let batch = 1 + Math.floor(t / 60);
      if (this.mode === 2) batch = Math.ceil(batch * 1.6);   // 双人：更多怪
      for (let i = 0; i < batch; i++) {
        if (this.monsters.length >= HORDE_CAP) break;
        this.spawnHordeMonster();
      }
    }
    // —— 涌潮：周期性一圈怪从四面八方合围 ——
    if (H.surgeT === undefined) H.surgeT = 90;
    H.surgeT -= dt;
    if (H.surgeT <= 0) {
      H.surgeT = 75;
      const tgt = this.players.filter(p => p.active)[0];
      if (tgt) {
        this.toast('🌊 怪潮涌动！它们从四面八方围过来了！', '#ff8f5c');
        Sfx.banshee();
        const pool = hordeSpawnPool(t);
        for (let i = 0; i < 8; i++) {
          if (this.monsters.length >= HORDE_CAP + 10) break;
          const a = i * Math.PI / 4;
          const m = new Monster(tgt.x + Math.cos(a) * 460, tgt.y + Math.sin(a) * 460,
                                this.cfg, pool[Math.floor(Math.random() * pool.length)]);
          const hpScale = (1 + t / 50 * 0.25 + Math.max(0, t - 300) / 60 * 0.35) * (this.mode === 2 ? 1.3 : 1);
          m.hp *= hpScale; m.maxHp = m.hp;
          m.hordeDmgMul = 1 + t / 120 * 0.32;
          m.enraged = true;   // 涌潮怪全员狂暴
          unstick(m);
          this.monsters.push(m);
        }
      }
    }
    // —— Boss 波 ——
    if (H.bossIdx < HORDE_BOSS_AT.length && t >= HORDE_BOSS_AT[H.bossIdx]) {
      H.bossIdx++;
      this.spawnHordeBoss();
    }

    // 商人提前出摊（75 秒）
    if (!this.merchant && t > 75 * (2 - Math.min(1.5, tune('merchantF'))) && MapData.merchantSpot) {
      this.merchant = new Merchant(MapData.merchantSpot.x, MapData.merchantSpot.y, true);
      unstick(this.merchant);
      this.toast('🏮 神秘商人出摊了（小地图紫点）', '#b48aff');
    }

    }
    this.hordeGems(dt);
    this.updateHordeExtraSkills(dt);

    // —— 玩家再生 ——
    for (const p of this.players) {
      if (p.active && H.mods.regen > 0) p.hp = Math.min(p.maxHp, p.hp + H.mods.regen * dt);
    }

    // —— 技能：环绕飞锅（撞击伤害，独立冷却） ——
    if (H.skills.orbit > 0) {
      for (const p of this.players) {
        if (!p.active) continue;
        const n = H.skills.orbit;
        for (let i = 0; i < n; i++) {
          const a = this.time * 3.6 + i * Math.PI * 2 / n + p.idx * 0.5;
          const ox = p.x + Math.cos(a) * 84, oy = p.y + Math.sin(a) * 84;
          for (const m of this.monsters) {
            if ((m.orbitCd || 0) > this.time) continue;
            if (Math.hypot(m.x - ox, m.y - oy) < m.r + 16) {
              m.orbitCd = this.time + 0.38;
              m.knock(a + Math.PI / 2, 560);
              if (m.hurt(24, this)) this.killMonster(m, p);
              this.spark(ox, oy, '#ffd93d');
            }
          }
        }
      }
    }
    // —— 技能：追踪鸭雷 ——
    if (H.skills.missile > 0) {
      H.missileT -= dt;
      if (H.missileT <= 0) {
        H.missileT = Math.max(0.5, 1.6 - H.skills.missile * 0.2);
        const shooters = this.players.filter(p => p.active);
        for (const p of shooters) {
          const targets = this.monsters.filter(m => Math.hypot(m.x - p.x, m.y - p.y) < 700);
          if (!targets.length) continue;
          const count = 1 + Math.floor(H.skills.missile / 2);
          for (let i = 0; i < count; i++) {
            const tgt = targets[Math.floor(Math.random() * targets.length)];
            const a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + (Math.random() - 0.5) * 0.6;
            this.bullets.push(new Bullet(p.x, p.y, a,
              { id: 'duckmissile', dmg: 18 + H.skills.missile * 7, speed: 430, range: 1000,
                knock: 160, turn: 7.5, duck: true }, p, 1));
          }
          Sfx.crossbow();
        }
      }
    }
    // —— 技能：寒冰新星 ——
    if (H.skills.nova > 0) {
      H.novaT -= dt;
      if (H.novaT <= 0) {
        H.novaT = Math.max(2.6, 6.5 - H.skills.nova * 0.7);
        for (const p of this.players) {
          if (!p.active) continue;
          const R = 170 + H.skills.nova * 22;
          H.novaRings.push({ x: p.x, y: p.y, r: 10, max: R, t: 0.5 });
          for (const m of this.monsters.slice()) {
            if (Math.hypot(m.x - p.x, m.y - p.y) > R + m.r) continue;
            m.stunT = Math.max(m.stunT, 1 + H.skills.nova * 0.2);
            m.slowT = Math.max(m.slowT, 2.5);
            if (m.hurt(13 + H.skills.nova * 6, this)) this.killMonster(m, p);
          }
          Sfx.laser();
        }
      }
    }
    // —— 技能：火焰足迹 ——
    if (H.skills.trail > 0) {
      H.trailT -= dt;
      if (H.trailT <= 0) {
        H.trailT = 0.16;
        for (const p of this.players) {
          if (p.active && p.moving) H.firePatches.push({ x: p.x, y: p.y + 8, t: 2.2 });
        }
      }
      H.fireTickT -= dt;
      const tick = H.fireTickT <= 0;
      if (tick) H.fireTickT = 0.4;
      for (const fp of H.firePatches) {
        fp.t -= dt;
        if (!tick) continue;
        for (const m of this.monsters.slice()) {
          if (Math.hypot(m.x - fp.x, m.y - fp.y) < 36) {
            m.burnT = Math.max(m.burnT, 1);
            if (m.hurt(5 + H.skills.trail * 3, this)) this.killMonster(m, this.players[0]);
          }
        }
      }
      H.firePatches = H.firePatches.filter(fp => fp.t > 0);
    }
    // —— 技能：雷霆链爪 ——
    if (H.skills.lightning > 0) {
      H.boltT -= dt;
      if (H.boltT <= 0) {
        H.boltT = Math.max(0.9, 2.6 - H.skills.lightning * 0.3);
        for (const p of this.players) {
          if (!p.active) continue;
          let cur = null, curD = 520;
          for (const m of this.monsters) {
            const d = Math.hypot(m.x - p.x, m.y - p.y);
            if (d < curD) { cur = m; curD = d; }
          }
          if (!cur) continue;
          // 逐跳传导：闪电一段一段跳向下一个目标（每跳 0.09s），不再瞬间全连
          H.chainJobs = H.chainJobs || [];
          H.chainJobs.push({ p, node: cur, from: { x: p.x, y: p.y }, left: 2 + H.skills.lightning, hopT: 0, hit: new Set() });
          Sfx.laser();
        }
      }
      if (H.chainJobs && H.chainJobs.length) {
        for (const job of H.chainJobs) {
          job.hopT -= dt;
          if (job.hopT > 0) continue;
          job.hopT = tune('zapHop');
          const node = job.node;
          if (!node || job.left <= 0 || node.hp <= 0 || !this.monsters.includes(node)) { job.done = true; continue; }
          job.left--;
          job.hit.add(node);
          H.bolts.push({ pts: [{ x: job.from.x, y: job.from.y }, { x: node.x, y: node.y }], t: 0.16 });
          this.spark(node.x, node.y, '#ffe95c');
          Sfx.zap();
          job.from = { x: node.x, y: node.y };
          if (node.hurt(17 + H.skills.lightning * 6, this)) this.killMonster(node, job.p);
          let next = null, nd = 240;
          for (const m of this.monsters) {
            if (job.hit.has(m)) continue;
            const d = Math.hypot(m.x - job.from.x, m.y - job.from.y);
            if (d < nd) { next = m; nd = d; }
          }
          job.node = next;
          if (!next) job.done = true;
          this.shake = Math.max(this.shake, 2);
        }
        H.chainJobs = H.chainJobs.filter(j => !j.done);
      }
    }
    for (const nr of H.novaRings) { nr.t -= dt; nr.r += (nr.max - nr.r) * Math.min(1, dt * 10); }
    H.novaRings = H.novaRings.filter(nr => nr.t > 0);
    for (const b of H.bolts) b.t -= dt;
    H.bolts = H.bolts.filter(b => b.t > 0);
  }

  // 经验宝石：磁吸 + 拾取
  hordeGems(dt) {
    const H = this.hordeState;
    for (const g of H.gems) {
      g.anim += dt;
      let best = null, bd = Infinity;
      for (const p of this.players) {
        if (!p.active) continue;
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      const magnetR = 95 * H.mods.magnet * tune('magnet');
      if (bd < magnetR) {
        const a = Math.atan2(best.y - g.y, best.x - g.x);
        const sp = 260 + (magnetR - bd) * 4;
        g.x += Math.cos(a) * sp * dt;
        g.y += Math.sin(a) * sp * dt;
      }
      if (bd < 22) {
        g.taken = true;
        this.gemCombo = (this.gemComboT > 0 ? this.gemCombo : 0) + 1;
        this.gemComboT = 1.0;
        Sfx.gem(this.gemCombo);
        // 经验随游戏时长上涨（后期每颗宝石更值钱，升级不断档）；开发者模式 ×10 快速验证技能
        this.hordeAddXp(Math.round(g.v * (H.mods.gemMul || 1) * tune('xpRate') * (1 + this.time / 300) * (SAVE.settings.devMode ? tune('devXp') : 1)));
      }
    }
    H.gems = H.gems.filter(g => !g.taken);
    if (H.gems.length > 220) H.gems.splice(0, H.gems.length - 220);
  }

  hordeAddXp(v) {
    const H = this.hordeState;
    H.xp += v;
    while (H.xp >= H.xpNeed) {
      H.xp -= H.xpNeed;
      H.level++;
      H.xpNeed = Math.round((8 + H.level * 4 + H.level * H.level * 0.15) * (this.mode === 2 ? 1.25 : 1));
      // 升级回血：每级回复 6% 最大生命
      for (const p of this.players) if (p.active) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.06);
      H.freeChoices++;
      Sfx.extract();
      this.floater(this.players[0].x, this.players[0].y - 40, `⬆ 升级 Lv.${H.level}！`, '#ffd93d');
    }
    if (H.freeChoices > 0 && !this.levelupOpen) this.openLevelup();
  }

  openLevelup() {
    const H = this.hordeState;
    const pool = HORDE_UPGRADES.filter(u => {
      const cur = u.skill ? H.skills[u.skill] : (H.picked && H.picked[u.id]) || 0;
      return cur < u.max;
    });
    const choices = [];
    const bag = pool.slice();
    while (choices.length < 3 && bag.length) {
      choices.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }
    if (!choices.length) { H.freeChoices = 0; return; }
    this.levelupChoices = choices;
    this.levelupOpen = true;
    this.paused = true;
    UI.renderLevelup(this, choices);
  }

  applyUpgrade(u) {
    const H = this.hordeState;
    H.picked = H.picked || {};
    H.picked[u.id] = (H.picked[u.id] || 0) + 1;
    if (u.skill) H.skills[u.skill] = (H.skills[u.skill] || 0) + 1;
    else if (u.special === 'maxhp') {
      for (const p of this.players) { p.maxHp = Math.round(p.maxHp * 1.3); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); }
    } else if (u.special === 'recruit') {
      const p0 = this.players.find(pl => pl.active) || this.players[0];
      const mc = new Mercenary(p0.x + 34, p0.y + 26, MERCS[u.mercId], p0);
      unstick(mc);
      this.mercs.push(mc);
      this.toast(`${MERCS[u.mercId].icon} ${MERCS[u.mercId].name} 应招而来！（看左侧面板）`, '#7dff9a');
      Sfx.revive();
    } else if (u.special === 'merchp') {
      H.mods.mercHp = (H.mods.mercHp || 1) * 1.3;
      for (const mc of this.mercs) if (mc.hp > 0) { mc.maxHp = Math.round(mc.maxHp * 1.3); mc.hp = mc.maxHp; }
    } else u.mod(H.mods);
    this.toast(`${u.icon} ${u.name}！`, '#7dff9a');
    Sfx.buy();
    H.freeChoices = Math.max(0, H.freeChoices - 1);
    if (H.freeChoices > 0) { this.openLevelup(); return; }
    this.levelupOpen = false;
    this.paused = false;
    document.getElementById('levelup-overlay').style.display = 'none';
  }

  spawnHordeMonster() {
    const t = this.time;
    const pool = hordeSpawnPool(t);
    const typeId = pool[Math.floor(Math.random() * pool.length)];
    // 出生点：离所有玩家 520px 以上的怪物节点
    const nodes = MapData.monsterNodes.filter(n =>
      this.players.every(p => !p.active || Math.hypot(n.x - p.x, n.y - p.y) > 520));
    const n = (nodes.length ? nodes : MapData.monsterNodes)[Math.floor(Math.random() * (nodes.length ? nodes.length : MapData.monsterNodes.length))];
    const m = new Monster(n.x + (Math.random() - 0.5) * 60, n.y + (Math.random() - 0.5) * 60, this.cfg, typeId);
    // 成长曲线：中期抬升、300 秒后二段加速；双人整体 +30% 血
    let hpScale = (1 + t / 50 * 0.25 + Math.max(0, t - 300) / 60 * 0.35) * (this.mode === 2 ? 1.3 : 1);
    m.hordeDmgMul = 1 + t / 120 * 0.32;
    // 狂暴：中期起概率狂暴出生（红焰+快+攻频高）
    if (t > HORDE_ENRAGE.start && Math.random() < Math.min(HORDE_ENRAGE.maxChance, (t - HORDE_ENRAGE.start) / 700) * (this.hordeState.dda || 1)) {
      m.enraged = true;
    }
    // 精英怪：4 分钟后 12% 概率，金光描边、更大更狠、掉 4 倍经验
    if (t > 240 && Math.random() < 0.12) {
      m.isElite = true;
      hpScale *= 2.5;
      m.hordeDmgMul *= 1.5;
      m.r += 4;
    }
    m.hp *= hpScale * tune('mHp'); m.maxHp = m.hp;
    unstick(m);
    this.monsters.push(m);
  }

  spawnHordeBoss() {
    const t = this.time;
    const p0 = this.players.find(p => p.active) || this.players[0];
    const nodes = MapData.monsterNodes.filter(n => Math.hypot(n.x - p0.x, n.y - p0.y) > 420);
    const n = (nodes.length ? nodes : MapData.monsterNodes)[0];
    const bossId = HORDE_BOSS_IDS[(this.hordeState.bossIdx - 1) % HORDE_BOSS_IDS.length];
    const boss = new Monster(n.x, n.y, this.cfg, bossId);
    boss.isBoss = true;
    boss.hp = this.cfg.mHp * 34 * (1 + t / 260) * tune('bossHp') * (this.mode === 2 ? 1.4 : 1);
    boss.maxHp = boss.hp;
    boss.hordeDmgMul = 2.0;
    unstick(boss);
    this.monsters.push(boss);
    this.hordeState.boss = boss;
    Sfx.brute();
    this.shake = 10;
    this.toast(`⚠️ ${boss.type.name}降临战场！击杀它获得免费升级！`, '#ff5c5c');
  }

  // 鼠标操控开关：单人模式 1P + 设置未关闭
  mouseAimOn(p) {
    return this.mode === 1 && p.idx === 0 && SAVE.settings.mouseAim !== false;
  }

  tryRoll(p) {
    if (!p.active || p.rollT > 0 || p.rollCd > 0) return;
    const free = p.staminaFreeT > 0;
    if (!free && p.stamina < STAMINA.rollCost) { Sfx.error(); this.floater(p.x, p.y - 34, '体力不足！', '#ff8f8f'); return; }
    if (!free) { p.stamina -= STAMINA.rollCost; p.staminaDelay = STAMINA.regenDelay; }
    if (p.sneak) { p.sneak = false; this.floater(p.x, p.y - 46, '翻滚破隐', '#9fd8ff'); }
    p.rollT = STAMINA.rollDur;
    p.rollCd = STAMINA.rollCd * tune('rollCd');
    p.rollCut = false;
    // 有方向键按方向翻，否则朝面向翻
    const km = KEYMAP[p.idx];
    let dx = 0, dy = 0;
    if (Input.keys[km.up]) dy--;
    if (Input.keys[km.down]) dy++;
    if (Input.keys[km.left]) dx--;
    if (Input.keys[km.right]) dx++;
    p.rollDir = (dx || dy) ? Math.atan2(dy, dx) : p.facing;
    Sfx.crossbow();
  }

  updatePlayer(p, dt) {
    p.anim += dt;
    p.shootCd = Math.max(0, p.shootCd - dt);
    // 体力恢复 / 翻滚冷却 / 换弹
    p.rollCd = Math.max(0, p.rollCd - dt);
    p.staminaFreeT = Math.max(0, p.staminaFreeT - dt);
    p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    if (p.staminaDelay <= 0) p.stamina = Math.min(STAMINA.max, p.stamina + STAMINA.regen * tune('staminaRegen') * dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.reloadT = 0;
        const def = p.weaponDef();
        if (!def.melee && def.mag) { p.mags[p.activeSlot] = p.magCap(); Sfx.tick(); }
      }
    }
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.sodaTime = Math.max(0, p.sodaTime - dt);
    p.invisT = Math.max(0, p.invisT - dt);
    p.suspectedT = Math.max(0, (p.suspectedT || 0) - dt);
    // Debuff：中毒 / 定身 / 麻痹 / 灼烧
    p.rootT = Math.max(0, p.rootT - dt);
    p.paraT = Math.max(0, p.paraT - dt);
    if (p.poisonT > 0) {
      p.poisonT -= dt;
      if (p.active) { p.hp -= 5 * dt; p.tookDamage = true; if (Math.random() < dt * 6) this.spark(p.x, p.y - 8, '#7ac74f'); if (p.hp <= 0) { p.hp = 1; p.poisonT = 0; } }
    }
    if (p.burnT2 > 0) {
      p.burnT2 -= dt;
      if (p.active) { p.hp -= 4 * dt; if (Math.random() < dt * 6) this.spark(p.x, p.y - 8, '#ff8f5c'); if (p.hp <= 0) { p.hp = 1; p.burnT2 = 0; } }
    }
    p.rageT = Math.max(0, p.rageT - dt);
    for (const a of p.arrows) a.t -= dt;
    p.arrows = p.arrows.filter(a => a.t > 0);

    if (p.downed) {
      p.bleed -= dt;
      if (p.bleed <= 0) this.killPlayer(p);
      return;
    }
    if (!p.active) return;

    // —— 翻滚中：高速冲刺 + 无敌帧 + 不可攻击 ——
    if (p.rollT > 0) {
      p.rollT -= dt;
      const r = resolveCircle(p.x + Math.cos(p.rollDir) * STAMINA.rollSpeed * dt,
                              p.y + Math.sin(p.rollDir) * STAMINA.rollSpeed * dt, PLAYER_R);
      p.x = r.x; p.y = r.y;
      unstick(p);
      // 翻进怪物堆：滚不动了——剩余翻滚距离骤减（无敌帧照常保留到结束）
      if (!p.rollCut) {
        for (const m of this.monsters) {
          if (m.state === 'ambush') continue;
          if (Math.hypot(m.x - p.x, m.y - p.y) < m.r + PLAYER_R - 2) {
            p.rollCut = true;
            p.rollT = Math.min(p.rollT, 0.09);
            break;
          }
        }
      }
      p.moving = true;
      return;   // 翻滚期间跳过攻击/互动/拾取判定（下一帧恢复）
    }

    const km = KEYMAP[p.idx];
    if (this.horde) p.sneak = false;   // 潜行为切换状态：翻滚/开枪/受伤会自动破隐

    let dx = 0, dy = 0;
    if (Input.keys[km.up]) dy--;
    if (Input.keys[km.down]) dy++;
    if (Input.keys[km.left]) dx--;
    if (Input.keys[km.right]) dx++;
    const spd = (this.horde
      ? PLAYER_SPEED * 1.06 * this.hordeState.mods.speed * (p.sodaTime > 0 ? p.sodaMul : 1)
      : PLAYER_SPEED * p.speedMul()) * this.weatherPSpd();
    const mAim = this.mouseAimOn(p);
    let wishX = 0, wishY = 0;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const cand = Math.atan2(dy, dx);
      if (!mAim) {
        if (dx !== 0 && dy !== 0) {          // 斜向输入立即采用并"粘住"
          p.facing = cand;
          p.faceStick = 0.12;
        } else {                              // 单轴输入需持续片刻才覆盖斜角（消除松键抖动）
          p.faceStick = Math.max(0, (p.faceStick || 0) - dt);
          if (p.faceStick <= 0) p.facing = cand;
        }
      }
      wishX = (dx / len) * spd; wishY = (dy / len) * spd;
    }
    // —— 鼠标操控（单人）：朝向 360° 跟随准星，移动与瞄准解耦（双摇杆手感） ——
    if (mAim) {
      const cam = this.cams[0];
      p.facing = Math.atan2(Input.mouse.y + cam.y - p.y, Input.mouse.x + cam.x - p.x);
      // 右键：向准星方向翻滚
      if (Input.mouseR) {
        Input.mouseR = false;
        this.tryRoll(p);
        if (p.rollT > 0) p.rollDir = p.facing;
      }
    }
    // 冰面滑行：速度缓慢逼近目标方向；普通地面直接响应
    if (MapData.mods.slippery && isDecorAt(p.x, p.y)) {
      const k = Math.min(1, 2.0 * dt);
      p.vx += (wishX - p.vx) * k;
      p.vy += (wishY - p.vy) * k;
    } else { p.vx = wishX; p.vy = wishY; }
    if (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1) {
      const r = resolveCircle(p.x + p.vx * dt, p.y + p.vy * dt, PLAYER_R);
      p.x = r.x; p.y = r.y;
      p.moving = true;
    } else p.moving = false;

    // 脚步声：负重越大越吵，潜行无声
    if (p.moving && !p.sneak && !this.horde) {
      p.footT += dt;
      if (p.footT > 0.42) { p.footT = 0; this.emitNoise(p.x, p.y, 85 * p.noiseMul()); }
    }

    for (const m of this.monsters) {
      const ddx = p.x - m.x, ddy = p.y - m.y, d = Math.hypot(ddx, ddy);
      const rr = PLAYER_R + m.r;
      if (d > 0 && d < rr) {
        const push = rr - d;
        const r = resolveCircle(p.x + ddx/d*push*0.6, p.y + ddy/d*push*0.6, PLAYER_R);
        p.x = r.x; p.y = r.y;
      }
    }
    unstick(p);
    p.x = Math.max(TILE, Math.min(MapData.pxW - TILE, p.x));
    p.y = Math.max(TILE, Math.min(MapData.pxH - TILE, p.y));

    if (Input.keys[km.shoot] || (km.shoot2 && Input.keys[km.shoot2]) || (mAim && Input.mouseL)) this.tryAttack(p);
    this.interactHold(p, dt, Input.keys[km.interact]);

    for (const g of this.groundLoot) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 42) continue;
      const rest = [];
      for (const t of g.items) {
        if (p.addToBag(t)) {
          codexMarkSeen(t.id);
          this.floater(p.x, p.y - 30, `${t.icon} ${t.name}`, RARITIES[t.rarity].color);
          Sfx.pickup(t.rarity);
        } else rest.push(t);
      }
      g.items = rest;
    }
    this.groundLoot = this.groundLoot.filter(g => g.items.length);

    // 碎金磁吸拾取（与经验宝石同款磁场）
    {
      const magR = (this.horde ? 95 * this.hordeState.mods.magnet : 80) * tune('magnet');
      for (const gd of this.goldDrops) {
        const d = Math.hypot(gd.x - p.x, gd.y - p.y);
        if (d < magR && d > 20) {
          const a = Math.atan2(p.y - gd.y, p.x - gd.x);
          const sp = 240 + (magR - d) * 3.5;
          gd.x += Math.cos(a) * sp * dt;
          gd.y += Math.sin(a) * sp * dt;
        }
        if (d <= 24) {
          SAVE.gold += gd.value;
          this.runCash += gd.value;
          gd.taken = true;
          Sfx.coin();
          this.floater(gd.x, gd.y - 14, `+${gd.value}💰`, '#ffd93d');
        }
      }
      this.goldDrops = this.goldDrops.filter(g => !g.taken);
    }

    if (this.horde && !this.escape) return;   // 割草没有撤离；大逃亡的胜利就是撤离
    const er = MapData.exitRect;
    const inExit = p.x > er.x && p.x < er.x + er.w && p.y > er.y && p.y < er.y + er.h;
    if (inExit) {
      p.extractProgress += dt;
      if (p.extractProgress >= 2) {
        p.extracted = true;
        Sfx.extract();
        this.toast(this.escape ? `🌅 ${this.pname(p)} 冲出了长夜！` :
          `${this.pname(p)} 撤离成功！带出 ${p.bag.length} 件宝物（${p.carriedValue} 金币）`, '#7dff9a');
      }
    } else p.extractProgress = Math.max(0, p.extractProgress - dt * 2);
  }

  interactHold(p, dt, held) {
    const mate = this.players.find(o => o !== p && o.downed && Math.hypot(o.x - p.x, o.y - p.y) < 58);
    if (mate) {
      if (held) {
        mate.reviveProgress += dt;
        if (mate.reviveProgress >= 2.5) {
          mate.downed = false; mate.hp = 40; mate.reviveProgress = 0;
          Sfx.revive();
          this.toast(`${this.pname(mate)} 被扶起来了！`, '#7dff9a');
        }
      } else mate.reviveProgress = 0;
      return;
    }
    const chest = this.chests.find(c => !c.opened && Math.hypot(c.x - p.x, c.y - p.y) < 56);
    if (chest && held) {
      chest.progress += dt;
      chest.beingOpened = true;
      if (chest.progress >= chest.def.openTime) this.openChest(chest, p);
    }
  }

  // ---------- 战斗 ----------
  tryAttack(p) {
    if (p.shootCd > 0 || p.rollT > 0 || p.reloadT > 0) return;
    const def = p.weaponDef();
    const inst = p.weaponInst();
    if (def.melee) {
      p.shootCd = 1 / (def.rate * (this.horde ? this.hordeState.mods.rate : 1) * tune('wRate'));
      p.swing = 0.22;
      Sfx.melee();
      if (!def.silent) this.emitNoise(p.x, p.y, 140);
      let hitAny = false;
      for (const m of this.monsters) {
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d > def.range + m.r) continue;
        let da = Math.atan2(m.y - p.y, m.x - p.x) - p.facing;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > 1.15) continue;
        hitAny = true;
        m.knock(p.facing, (def.knock || 100) * 3);
        let dmg = def.dmg * p.dmgMul() * (this.horde ? this.hordeState.mods.dmg : 1) * tune('pDmg');
        // 背刺：未察觉的怪物吃 N 倍伤害
        let backstab = false;
        if (def.backstab && m.state !== 'chase') {
          dmg *= def.backstab;
          backstab = true;
          this.floater(m.x, m.y - 26, '背刺！', '#ff5c5c');
        }
        // 潜行处决：潜行状态从背后近战未察觉的普通怪 → 一击毙命
        if (!this.horde && p.sneak && m.state !== 'chase' && !m.isBoss &&
            m.type.id !== 'brute' && m.type.id !== 'mimic') {
          let bda = Math.atan2(p.y - m.y, p.x - m.x) - m.faceDir;
          bda = Math.atan2(Math.sin(bda), Math.cos(bda));
          if (Math.abs(bda) > 1.9) {
            dmg = m.hp + 999;
            backstab = true;
            this.floater(m.x, m.y - 30, '💀 处决！', '#ff5c5c');
            this.shake = Math.max(this.shake, 4);
          }
        }
        if (this.horde && this.hordeState.mods.vamp) p.hp = Math.min(p.maxHp, p.hp + dmg * this.hordeState.mods.vamp);
        if (m.hurt(Math.round(dmg), this)) { this.killMonster(m, p, { backstab }); this.hitPause(0.045); }
      }
      if (hitAny && inst && def.id !== 'fists' && isFinite(def.dur) && !this.horde) {
        inst.dur -= 1;
        if (inst.dur <= 0) this.breakWeapon(p);
      }
      return;
    }
    if (!inst || inst.dur <= 0) return;
    const H = this.horde ? this.hordeState.mods : null;
    if (!this.horde) {
      const ammoType = def.ammo;
      if (SAVE.ammo[ammoType] <= 0) {
        p.shootCd = 0.35;
        Sfx.error();
        this.floater(p.x, p.y - 34, '没弹药了！', '#ff8f8f');
        return;
      }
      SAVE.ammo[ammoType]--;
      inst.dur -= def.durPerShot || 1;
    }
    // —— 弹夹：打空自动换弹 ——
    if (def.mag) {
      if (p.magLeft() <= 0) { p.startReload(); Sfx.tick(); return; }
    }
    p.shootCd = 1 / (def.rate * (H ? H.rate : 1) * tune('wRate'));
    if (def.mag) {
      p.mags[p.activeSlot]--;
      if (p.mags[p.activeSlot] <= 0) p.startReload();
    }

    // 辅助瞄准：朝向 ±31° 内 520px 最近可见怪
    let angle = p.facing;
    let best = null, bestD = 520;
    for (const m of this.monsters) {
      if (m.state === 'ambush') continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d > bestD) continue;
      let da = Math.atan2(m.y - p.y, m.x - p.x) - p.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.55 && losClear(p.x, p.y, m.x, m.y)) { best = m; bestD = d; }
    }
    if (best) angle = Math.atan2(best.y - p.y, best.x - p.x);

    let n = def.pellets || 1;
    let bdef = def;
    if (H) {
      n += H.multi;                               // 分裂弹道
      bdef = Object.assign({}, def, {
        pierce: (def.pierce || 1) + H.pierce,
        range: (def.range || 500) * H.range,
        knock: (def.knock || 80) * H.knock * 1.15 * tune('wKnock'),
        speed: (def.speed || 500) * (H.bSpeed || 1) * tune('wSpeed'),
      });
    }
    if (!H) bdef = Object.assign({}, def, { knock: (def.knock || 80) * tune('wKnock'), speed: (def.speed || 500) * tune('wSpeed') });
    const critC = H ? (H.crit || 0) : 0;
    for (let i = 0; i < n; i++) {
      const fan = def.pellets ? 0 : (i - (n - 1) / 2) * 0.13;   // 非霰弹的分裂弹道呈扇形
      const a = angle + fan + (Math.random() - 0.5) * 2 * def.spread;
      const crit = Math.random() < critC;
      this.bullets.push(new Bullet(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, bdef, p,
        p.dmgMul() * (H ? H.dmg : 1) * (crit ? 2 : 1) * tune('pDmg')));
    }
    // 散射枪管：额外散射弹（60% 伤害）
    if (H && H.scatter && !def.melee) {
      for (let i = 0; i < H.scatter; i++) {
        const sa = angle + (i % 2 ? 1 : -1) * (0.22 + Math.floor(i / 2) * 0.16) + (Math.random() - 0.5) * 0.1;
        this.bullets.push(new Bullet(p.x + Math.cos(sa) * 20, p.y + Math.sin(sa) * 20, sa, bdef, p,
          p.dmgMul() * (H ? H.dmg : 1) * 0.6 * tune('pDmg')));
      }
    }
    this.spark(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#ffe28a');
    this.fxMuzzle(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, angle);
    if (def.sfx && Sfx[def.sfx]) Sfx[def.sfx]();
    else if (def.id === 'laser') Sfx.laser();
    else if (def.id === 'crossbow') Sfx.crossbow();
    else if (def.id === 'rpg') Sfx.rpg();
    else if (def.id === 'sniper') Sfx.sniper();
    else if (def.id === 'cannon' || def.pellets) Sfx.shotgun();
    else if (def.id === 'smg') Sfx.smg();
    else Sfx.shoot();
    // 弹壳抛出（爽感小料）
    if (!def.melee && tune('juice') >= 1) {
      const ca = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      this.sparks.push({ x: p.x + Math.cos(angle) * 14, y: p.y + Math.sin(angle) * 14,
        vx: Math.cos(ca) * 90, vy: Math.sin(ca) * 90 - 40, t: 0.3, color: '#d9b44a' });
    }
    if (!def.silent && !this.horde) this.emitNoise(p.x, p.y, this.cfg.hear * (def.explosive ? 1.3 : 1));
    if (!def.silent && p.sneak) { p.sneak = false; this.floater(p.x, p.y - 46, '枪声破隐！', '#ff8f8f'); }
    if (inst.dur <= 0 && !this.horde) this.breakWeapon(p);
  }

  // 轰天雷爆炸
  explode(x, y, bullet) {
    Sfx.boom();
    this.shake = 10;
    const R = bullet.explosive;
    this.fxExplosion(x, y, R);
    for (const m of this.monsters.slice()) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d > R + m.r) continue;
      const falloff = 1 - Math.max(0, d - 30) / R * 0.6;
      m.knock(Math.atan2(m.y - y, m.x - x), 900);
      if (m.hurt(Math.round(bullet.dmg * falloff), this)) this.killMonster(m, bullet.owner);
    }
    this.emitNoise(x, y, this.cfg.hear * 1.4);
  }

  breakWeapon(p) {
    const inst = p.weaponInst();
    if (inst) inst.dur = 0;
    Sfx.broke();
    this.toast(`${this.pname(p)} 的武器损坏了！（可在商店维修）`, '#ff8f8f');
    // 自动切到另一把（若有）
    const other = 1 - p.activeSlot;
    if (p.weapons[other] && p.weapons[other].dur > 0) p.activeSlot = other;
  }

  // 毒爆菇自爆/被击杀 → 毒云（区域持续伤害）
  shroomExplode(m, radius) {
    m._boomed = true;
    if (!this.poisonClouds) this.poisonClouds = [];
    this.poisonClouds.push({ x: m.x, y: m.y, r: radius, t: 5, tick: 0 });
    Sfx.boom();
    for (let i = 0; i < 10; i++) this.spark(m.x, m.y, '#7ac74f');
    this.killMonster(m, null);
  }

  emitNoise(x, y, radius) {
    if (radius <= 0) return;
    for (const m of this.monsters) {
      if (m.state === 'chase' || m.state === 'ambush' || m.stunT > 0) continue;
      if (Math.hypot(m.x - x, m.y - y) < radius) {
        m.lastKnown = { x, y };
        m.state = 'investigate';
      }
    }
  }

  killMonster(m, owner, opts = {}) {
    this.monsters = this.monsters.filter(x => x !== m);
    this.runKills++;
    SAVE.stats.kills++;
    // 怪物图鉴：击杀计数 + 解锁
    if (!SAVE.stats.mKills) SAVE.stats.mKills = {};
    SAVE.stats.mKills[m.type.id] = (SAVE.stats.mKills[m.type.id] || 0) + 1;
    if (!SAVE.monsterSeen) SAVE.monsterSeen = {};
    SAVE.monsterSeen[m.type.id] = true;
    if (owner) {
      owner.kills++;
      if (owner.backstabKills !== undefined) {
        if (opts.backstab) owner.backstabKills++; else owner.otherKills++;
      }
    }
    for (let i = 0; i < 8; i++) this.spark(m.x, m.y, '#b48aff');
    this.fxDeath(m.x, m.y, !!(m.isBoss || m.isElite));
    this.floater(m.x, m.y - 20, `${m.type.name}被击败！`, '#b48aff');
    if (m.type.shroom && !m._boomed) {
      m._boomed = true;
      if (!this.poisonClouds) this.poisonClouds = [];
      this.poisonClouds.push({ x: m.x, y: m.y, r: 60, t: 4, tick: 0 });
      for (let i = 0; i < 8; i++) this.spark(m.x, m.y, '#7ac74f');
    }
    if (m.type.splits && !m.isMini) {
      for (let i = 0; i < 2; i++) {
        const mini = new Monster(m.x + (i ? 18 : -18), m.y + 6, this.cfg, 'slime', true);
        mini.state = 'chase';
        mini.target = owner || this.nearestActivePlayer(m.x, m.y);
        if (mini.target) { mini.lastKnown = { x: mini.target.x, y: mini.target.y }; mini.memoryT = 5; }
        unstick(mini);
        this.monsters.push(mini);
      }
      this.floater(m.x, m.y - 34, '分裂了！', '#7ac74f');
    }
    // 掉碎金（难度越高越丰厚）
    const diffMul = 1 + DIFF_RANK[this.diffId] * 0.25;
    const base = m.isMimic ? 35 + Math.random() * 15
               : m.type.id === 'brute' ? 25 + Math.random() * 10
               : 8 + Math.random() * 12;
    // 割草模式碎金缩水（数量管够），主要奖励走经验宝石
    const goldV = Math.round(base * diffMul * (m.isMini ? 0.4 : 1) * (this.horde ? 0.35 : 1) * tune('goldRate') * (this.horde ? (this.hordeState.mods.goldMul || 1) : 1));
    if (!this.horde || Math.random() < 0.5 || m.isBoss) this.goldDrops.push(new GoldDrop(m.x, m.y, goldV));

    if (this.horde) {
      const H = this.hordeState;
      // 经验宝石
      const xv = m.isBoss ? 12 : m.isElite ? 4 : (m.type.id === 'brute' || m.type.id === 'skeleton') ? 3 : m.isMini ? 1 : (Math.random() < 0.3 ? 2 : 1);
      H.gems.push(new XPGem(m.x + (Math.random() - 0.5) * 14, m.y + (Math.random() - 0.5) * 14, xv));
      // 吸血
      if (owner && owner.maxHp && H.mods.lifesteal > 0) owner.hp = Math.min(owner.maxHp, owner.hp + H.mods.lifesteal);
      // Boss 击杀：金币雨 + 免费升级 + 群体回复
      if (m.isBoss) {
        H.boss = null;
        for (let i = 0; i < 14; i++) this.goldDrops.push(new GoldDrop(m.x + (Math.random()-0.5)*90, m.y + (Math.random()-0.5)*90, 15 + Math.round(Math.random()*15)));
        for (const p of this.players) if (p.active) p.hp = Math.min(p.maxHp, p.hp + 120);
        H.freeChoices++;
        if (!this.levelupOpen) this.openLevelup();
        this.shake = 12;
        this.toast('👑 巨魁王倒下了！金币雨 + 免费强化！', '#ffd93d');
        Sfx.boom();
        this.spawnHordeMerchant();
      }
    }
  }

  damagePlayer(p, dmg, src) {
    if (!p.active) return;
    if (this.arena) { this.dmgNum(p.x, p.y - 26, dmg, false, '#9aa2b4'); return; }   // 练习场：无敌（只显示本应受到的伤害）
    if (src && src.type) dmg = Math.round(dmg * tune('mDmg'));   // 怪物伤害调参
    // 怪物图鉴：被它打过也算见过
    if (src && src.type && src.type.id) { if (!SAVE.monsterSeen) SAVE.monsterSeen = {}; SAVE.monsterSeen[src.type.id] = true; }
    // 荆棘羽甲的被动护甲：每级减免 1.5 点受击伤害（至少剩 1）
    if (this.horde && this.hordeState.skills.thorns > 0 && dmg > 0) {
      dmg = Math.max(1, dmg - this.hordeState.skills.thorns * 1.5 * tune('thorns'));
    }
    // 灵敏反射：闪避判定
    if (this.horde && this.hordeState.mods.dodge && Math.random() < this.hordeState.mods.dodge) {
      this.floater(p.x, p.y - 40, '💨 闪避！', '#9fd8ff');
      return;
    }
    // 复仇之焰：仅怪物直接攻击触发（中毒/毒雾/死亡之潮/落石等环境伤害与 DoT 不触发）
    if (this.horde && this.hordeState.skills.revenge > 0 && dmg > 0 && src && src.hurt) {
      const lv = this.hordeState.skills.revenge;
      const R = 150;
      for (const m of this.monsters.slice()) {
        if (Math.hypot(m.x - p.x, m.y - p.y) > R) continue;
        m.burnT = Math.max(m.burnT, 1.5);
        m.knock(Math.atan2(m.y - p.y, m.x - p.x), 620);
        if (m.hurt(16 + lv * 10, this)) this.killMonster(m, p);
      }
      this.fxRevenge(p.x, p.y, R);
      Sfx.boom();
    }
    // 翻滚无敌帧
    if (p.rollT > 0) {
      this.floater(p.x, p.y - 30, '✨ 完美闪避！', '#9fd8ff');
      return;
    }
    // 临时护盾（圣盾/泡泡）先扛
    if (p.tempShield > 0) {
      const absorbed = Math.min(p.tempShield, dmg);
      p.tempShield -= absorbed;
      dmg -= absorbed;
      if (p.tempShield <= 0) this.floater(p.x, p.y - 30, '护盾碎裂！', '#9fd8ff');
      if (dmg <= 0) { p.hurtCd = 0.35; Sfx.hit(); return; }
    }
    // 护甲吸收
    if (p.armor && p.armor.dur > 0) {
      const adef = ARMORS[p.armor.id];
      const absorbed = Math.min(p.armor.dur, dmg * adef.absorb);
      p.armor.dur -= absorbed;
      dmg -= absorbed;
      if (p.armor.dur <= 0) { p.armor.dur = 0; this.toast(`${this.pname(p)} 的${adef.name}碎了！`, '#ff8f8f'); Sfx.broke(); }
    }
    dmg = Math.round(dmg);
    if (dmg > 0) {
      p.hp -= dmg;
      p.tookDamage = true;
      this.dmgNum(p.x, p.y - 26, dmg, dmg >= 30, '#ff6b6b');   // 玩家受伤红色数字
      const flash = document.getElementById('hurt-flash');
      if (flash) { flash.style.opacity = '0.45'; setTimeout(() => flash.style.opacity = '0', 120); }
    }
    p.hurtCd = 0.35;
    if (p.sneak && dmg > 0) { p.sneak = false; this.floater(p.x, p.y - 46, '受击破隐', '#ff8f8f'); }
    this.shake = src && src.type && src.type.id === 'brute' ? 9 : 5;
    // 荆棘羽甲：反弹伤害给近身攻击者
    if (this.horde && src && src.hurt && this.hordeState.skills.thorns > 0) {
      const th = Math.round((8 + this.hordeState.skills.thorns * 6) * tune('thorns'));
      if (src.hurt(th, this)) this.killMonster(src, p);
      else this.floater(src.x, src.y - 20, `🌵${th}`, '#7ac74f');
    }
    Sfx.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      const othersActive = this.players.some(o => o !== p && o.active);
      if (othersActive) {
        p.downed = true; p.bleed = 25; p.reviveProgress = 0;
        this.toast(`${this.pname(p)} 倒地了！队友按住互动键救援！`, '#ffb84d');
      } else this.killPlayer(p);
    }
  }

  killPlayer(p) {
    p.downed = false;
    p.dead = true;
    p.lostItems = p.bag.slice();
    if (p.bag.length) this.groundLoot.push(new GroundLoot(p.x, p.y, p.bag.slice()));
    p.bag = []; p.bagUsed = 0;
    const lostGear = [];
    if (!this.horde) {   // 割草是爽模式：阵亡不没收装备
      for (const inst of p.weapons) if (inst) { this.lostWeaponUids.push(inst.uid); lostGear.push(WEAPONS[inst.id].name); }
      p.weapons = [null, null];
      if (p.armor) { this.lostArmorUids.push(p.armor.uid); lostGear.push(ARMORS[p.armor.id].name); p.armor = null; }
      if (p.pouch) { p.pouch = false; p.pouchLost = true; lostGear.push(GEAR.pouch.name); }
    }
    p.gearLost = lostGear;
    SAVE.stats.deaths++;
    Sfx.death();
    this.toast(this.horde ? `${this.pname(p)} 被怪潮淹没了……` : `${this.pname(p)} 被怪物抓住了……装备与宝物散落一地`, '#ff8f8f');
  }

  // ---------- 开箱 ----------
  openChest(chest, opener) {
    chest.opened = true;
    this.runChests++;
    SAVE.stats.chestsOpened++;
    Sfx.open();

    if (chest.tier === 'mystery' && Math.random() < tune('mimic')) {
      const mimic = new Monster(chest.x, chest.y, this.cfg, 'mimic');
      mimic.state = 'chase'; mimic.target = opener; mimic.lastKnown = { x: opener.x, y: opener.y }; mimic.memoryT = 6;
      this.monsters.push(mimic);
      Sfx.mimic();
      this.shake = 8;
      this.toast('是宝箱怪！！快跑！', '#ff5c5c');
      return;
    }

    if (this.escape) return this.escapeLoot(chest, opener);
    const t = rollTreasure(chest.tier, { difficulty: this.diffId, mapId: this.mapId, mythicSpawned: this.mythicSpawned, save: SAVE });
    codexMarkSeen(t.id);
    if (opener.addToBag(t)) {
      Sfx.pickup(t.rarity);
      this.floater(chest.x, chest.y - 26, `${t.icon} ${t.name}`, RARITIES[t.rarity].color);
      if (t.rarity === 'legendary' || t.rarity === 'mythic')
        this.toast(`${this.pname(opener)} 开出了【${RARITIES[t.rarity].name}】${t.icon} ${t.name}！`, RARITIES[t.rarity].color);
      this.applyPickupEffect(t, opener);
      // 神话警报：附近的怪被宝物的低语惊醒
      if (t.rarity === 'mythic') {
        Sfx.banshee();
        this.toast('神话宝物的低语惊动了黑暗中的东西……快撤！', '#ff5c5c');
        for (const m of this.monsters) {
          if (m.state === 'ambush') continue;
          if (Math.hypot(m.x - opener.x, m.y - opener.y) < 520) {
            // 潜行中的玩家只暴露大致方位（±200px）
            const fuzz = opener.sneak ? 200 : 0;
            m.lastKnown = { x: opener.x + (Math.random() - 0.5) * fuzz * 2, y: opener.y + (Math.random() - 0.5) * fuzz * 2 };
            if (m.state !== 'chase') m.state = 'investigate';
          }
        }
      }
    } else {
      this.groundLoot.push(new GroundLoot(chest.x, chest.y + 20, [t]));
      this.toast('背包已满！宝物掉在了地上', '#ffb84d');
    }

    if (Math.random() < chest.def.ammoChance) {
      const type = ['light','light','shell','heavy','cell'][Math.floor(Math.random()*5)];
      const amount = { light: 12, shell: 4, heavy: 3, cell: 6 }[type];
      SAVE.ammo[type] += amount;
      this.floater(chest.x, chest.y - 6, `${AMMO_TYPES[type].icon} ${AMMO_TYPES[type].name} ×${amount}`, '#9fd8ff');
    }
    if (Math.random() < chest.def.bandageChance) {
      SAVE.consumables.bandage++;
      this.floater(chest.x, chest.y + 12, '🩹 医疗绷带 ×1', '#7dff9a');
    }
  }

  applyPickupEffect(t, p) {
    const e = t.effect;
    if (!e || e.kind !== 'pickup') return;
    if (e.type === 'chest_arrow' || e.type === 'gold_arrow') {
      const pool = this.chests.filter(c => !c.opened && (e.type === 'chest_arrow' || c.tier === 'gold' || c.tier === 'mystery'));
      if (pool.length) {
        pool.sort((a, b) => Math.hypot(a.x-p.x, a.y-p.y) - Math.hypot(b.x-p.x, b.y-p.y));
        p.arrows.push({ type: 'chest', target: pool[0], t: e.dur, color: '#ffd93d' });
        this.toast(`${t.name} 指出了宝箱的方向！`, '#ffd93d');
      }
    } else if (e.type === 'stun') {
      for (const m of this.monsters) if (Math.hypot(m.x-p.x, m.y-p.y) < e.radius) { m.stunT = e.dur; this.floater(m.x, m.y - 24, '♪', '#9fd8ff'); }
      this.toast('清脆的声响让怪物驻足聆听……', '#9fd8ff');
    } else if (e.type === 'reveal') {
      this.revealT = Math.max(this.revealT, e.dur);
      this.toast('所有怪物的位置显形了！', '#b48aff');
    } else if (e.type === 'slow_all') {
      this.monsterSlowT = e.dur;
      this.toast('时之沙漏！全场怪物变慢了！', '#ffd93d');
    } else if (e.type === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + e.amount);
      Sfx.heal();
      this.floater(p.x, p.y - 34, `✚${e.amount}`, '#7dff9a');
    }
  }

  // ---------- 药品 ----------
  cycleConsumable(p) {
    for (let i = 1; i <= CONSUM_ORDER.length; i++) {
      const idx = (p.consumSel + i) % CONSUM_ORDER.length;
      if (SAVE.consumables[CONSUM_ORDER[idx]] > 0 || i === CONSUM_ORDER.length) { p.consumSel = idx; break; }
    }
    Sfx.tick();
  }

  useConsumable(p) {
    const key = CONSUM_ORDER[p.consumSel];
    const c = CONSUMABLES[key];
    if (SAVE.consumables[key] <= 0) {
      Sfx.error();
      this.floater(p.x, p.y - 34, `没有${c.name}了`, '#ff8f8f');
      return;
    }
    if (c.heal && p.hp >= p.maxHp && !c.speedMul) { Sfx.error(); this.floater(p.x, p.y - 34, '生命值已满', '#9fd8ff'); return; }
    SAVE.consumables[key]--;
    if (c.heal) { p.hp = Math.min(p.maxHp, p.hp + c.heal); this.floater(p.x, p.y - 34, `${c.icon} +${c.heal}`, '#7dff9a'); }
    if (c.speedMul) { p.sodaTime = c.dur; p.sodaMul = c.speedMul; this.floater(p.x, p.y - 46, `${c.icon} 加速！`, '#9fd8ff'); }
    if (c.invis) { p.invisT = c.invis; this.floater(p.x, p.y - 34, `${c.icon} 隐身！`, '#b48aff'); }
    if (c.dmgMul) { p.rageT = c.dur; this.floater(p.x, p.y - 34, `${c.icon} 狂暴！`, '#ff8f5c'); }
    if (c.reveal) { this.revealT = Math.max(this.revealT, c.reveal); this.floater(p.x, p.y - 34, `${c.icon} 显形！`, '#b48aff'); }
    Sfx.heal();
  }

  nearestActivePlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.players) if (p.active) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pname(p) { return this.mode === 2 ? `${p.idx + 1}P` : '你'; }

  // ---------- 结算 ----------
  settle() {
    if (this.over) return;
    this.over = true;
    cancelAnimationFrame(this.raf);
    Game.current = null;
    Music.play('menu');
    if (this.escape) return this.settleEscape();
    if (this.horde) return this.settleHorde();

    SAVE.stats.runs++;
    let goldGained = 0;
    const results = [];
    for (const p of this.players) {
      const r = { idx: p.idx, status: p.extracted ? 'extracted' : (p.abandoned ? 'abandoned' : 'dead'),
                  items: [], lostItems: p.lostItems || [], gearLost: p.gearLost || [], kills: p.kills };
      if (p.extracted) {
        SAVE.stats.extractions++;
        for (const t of p.bag) {
          const isNew = codexMarkCollected(t.id, t.value);
          goldGained += t.value;
          r.items.push({ t, isNew });
        }
      }
      if (p.pouchLost) SAVE.pouches = Math.max(0, SAVE.pouches - 1);
      results.push(r);
    }
    SAVE.gold += goldGained;
    SAVE.stats.goldEarned += goldGained + this.runCash;
    for (const uid of this.lostWeaponUids) removeWeapon(uid);
    for (const uid of this.lostArmorUids) removeArmor(uid);
    const rewards = checkSeriesRewards();

    // —— 奖杯判定 ——
    const newTrophies = [];
    const grant = id => { const t = awardTrophy(id); if (t) newTrophies.push(t); };
    const anyExtract = results.some(r => r.status === 'extracted');
    const allExtract = results.every(r => r.status === 'extracted');
    const hardPlus = DIFF_RANK[this.diffId] >= DIFF_RANK.hard;
    if (anyExtract) grant('first_extract');
    for (const p of this.players) {
      if (!p.extracted) continue;
      if (p.carriedValue >= 2000) grant('rich_run');
      if (p.backstabKills >= 3 && p.otherKills === 0 && p.kills === p.backstabKills) grant('silent_blade');
    }
    if (anyExtract && hardPlus && this.runKills === 0) grant('pacifist_hard');
    if (anyExtract && hardPlus && this.players.every(p => !p.wasSpotted)) grant('shadow_walker');
    if (this.runKills >= 15) grant('slayer');
    if (anyExtract && this.diffId === 'hell') grant('hell_return');
    if (this.mode === 2 && allExtract) grant('duo_extract');
    if (this.mapId === 'icecave' && this.players.some(p => p.extracted && !p.tookDamage)) grant('ice_dancer');
    const collected = collectedCount();
    if (collected >= 36) grant('collector_36');
    if (collected >= TREASURES.length) grant('collector_all');
    if (SAVE.gold >= 10000) grant('tycoon');
    persistSave();

    UI.showResult({
      success: anyExtract,
      diffName: this.cfg.name, mapName: this.mapName, mode: this.mode,
      time: this.time, kills: this.runKills, chests: this.runChests,
      goldGained, cash: this.runCash, players: results, rewards, newTrophies,
    });
  }

  // ================= 调试练习场 =================
  arenaUpdate(dt) {
    // 木桩：不动、打空自动重生
    this.arenaRespawnT = (this.arenaRespawnT || 0) - dt;
    const dummies = this.monsters.filter(m => m.isDummy);
    if (dummies.length < 6 && this.arenaRespawnT <= 0) {
      this.arenaRespawnT = 0.8;
      const p = this.players[0];
      const i = dummies.length;
      const m = new Monster(p.x + 180 + (i % 3) * 90, p.y - 90 + Math.floor(i / 3) * 180, this.cfg, ['stoneling', 'brute', 'shade'][i % 3]);
      m.isDummy = true;
      m.hp = m.maxHp = 3000;
      m.stunT = 1e9;                     // 永远站桩
      unstick(m);
      this.monsters.push(m);
    }
  }
  arenaNextWeapon() {
    const p = this.players[0];
    const ids = Object.keys(WEAPONS).filter(k => k !== 'fists');
    this._arenaW = ((this._arenaW === undefined ? -1 : this._arenaW) + 1) % ids.length;
    const id = ids[this._arenaW];
    p.weapons[0] = { uid: -200, id, dur: 99999, temp: true };
    p.activeSlot = 0;
    p.mags[0] = null;
    p.reloadT = 0;
    this.toast(`🔫 试用：${WEAPONS[id].icon}【${WEAPONS[id].name}】`, '#ffd93d');
  }
  arenaFreeLevel() {
    this.hordeState.freeChoices++;
    if (!this.levelupOpen) this.openLevelup();
  }
  arenaRecruit() {
    const pool = ['sniper', 'priest', 'archer', 'mage', 'mech', 'marine', 'flamerguy'];
    const id = pool[Math.floor(Math.random() * pool.length)];
    const p = this.players[0];
    const mc = new Mercenary(p.x + 40, p.y + 30, MERCS[id], p);
    unstick(mc);
    this.mercs.push(mc);
    this.toast(`${MERCS[id].icon} ${MERCS[id].name} 入队试用！`, '#7dff9a');
  }
  arenaReset() {
    this.monsters = [];
    this.arenaRespawnT = 0;
    this.toast('🎯 木桩已重置', '#9fd8ff');
  }

  // ================= 大逃亡核心 =================
  escapeUpdate(dt) {
    const t = this.time;
    // —— 死亡之潮推进（越拖越快） ——
    if (t > ESCAPE.tideDelay) {
      this.tideX += ESCAPE.tideSpeed * (1 + (t - ESCAPE.tideDelay) * ESCAPE.tideAccel) * tune('mSpeed') * dt;
    }
    for (const p of this.players) {
      if (!p.active) continue;
      if (p.x < this.tideX) {
        p.tideT = (p.tideT || 0) + dt;
        if (p.tideT > 0.5) {
          p.tideT = 0;
          this.damagePlayer(p, 8, null);
          this.floater(p.x, p.y - 40, '☠️ 死亡之潮！', '#ff5c5c');
        }
      } else p.tideT = 0;
    }
    // —— 预警落地：红圈到时，怪物破土而出 ——
    if (this.escPend && this.escPend.length) {
      const tgt0 = this.players.find(p => p.active);
      for (const pd of this.escPend) {
        pd.t -= dt;
        if (pd.t > 0) continue;
        const m = new Monster(pd.x, pd.y, this.cfg, pd.typeId);
        m.escRoom = pd.room;
        m.state = 'chase'; m.target = tgt0;
        if (tgt0) { m.lastKnown = { x: tgt0.x, y: tgt0.y }; m.memoryT = 99; }
        m.hp *= (1 + pd.prog * 1.7) * (this.mode === 2 ? 1.25 : 1); m.maxHp = m.hp;
        m.hordeDmgMul = 1 + pd.prog * 0.8;
        unstick(m);
        this.monsters.push(m);
        this.fxDeath(pd.x, pd.y);
      }
      this.escPend = this.escPend.filter(pd => pd.t > 0);
    }
    // —— 潮汐暴涨：周期性猛冲一段（提前 2 秒预警） ——
    if (t > ESCAPE.tideDelay) {
      this.tideSurgeT = (this.tideSurgeT === undefined ? 50 : this.tideSurgeT) - dt;
      if (this.tideSurgeT <= 2 && !this.tideSurgeWarned) {
        this.tideSurgeWarned = true;
        this.toast('⚠️ 死亡之潮即将暴涨！！', '#ff5c5c');
        Sfx.banshee();
      }
      if (this.tideSurgeT <= 0) {
        this.tideSurgeT = 45 + Math.random() * 15;
        this.tideSurgeWarned = false;
        this.tideSurgeLeft = 180;                          // 1 秒内多冲 180px
        this.shake = Math.max(this.shake, 8);
      }
      if (this.tideSurgeLeft > 0) {
        const step = Math.min(this.tideSurgeLeft, 180 * dt / 1.0);
        this.tideX += step;
        this.tideSurgeLeft -= step;
      }
    }
    // —— 终点冲刺播报 ——
    if (!this.escSprintDone && this.escRooms && this.escRooms.length) {
      const last = this.escRooms[this.escRooms.length - 1];
      if (this.players.some(p => p.active && p.x > last.x - 300)) {
        this.escSprintDone = true;
        this.toast('🚁 撤离点就在前方——最后冲刺！！', '#7dff9a');
        Sfx.extract();
      }
    }
    // —— 房间怪潮：踏入未肃清的房间即触发；清空房间怪 → 肃清奖励 ——
    const leadP = this.players.filter(p => p.active).sort((a, b) => b.x - a.x)[0];
    if (leadP && this.escRooms) {
      for (const r of this.escRooms) {
        if (r.state === 'idle' &&
            leadP.x > r.x && leadP.x < r.x + r.w && leadP.y > r.y && leadP.y < r.y + r.h) {
          r.state = 'wave';
          this.escSpawnWave(r);
        } else if (r.state === 'wave' && !this.monsters.some(m => m.escRoom === r.idx) &&
                   !(this.escPend && this.escPend.some(pd => pd.room === r.idx))) {
          r.state = 'clear';
          this.escRoomReward(r, this.time - (r.waveT || this.time));
        }
      }
    }
    // —— 追兵：死亡之潮启动后才从队伍后方刷狂暴怪（前期安心搜刮） ——
    this.escapePursuitT -= dt;
    if (t > ESCAPE.tideDelay && this.escapePursuitT <= 0 && this.monsters.length < HORDE_CAP) {
      this.escapePursuitT = Math.max(3.2, ESCAPE.pursuitEvery - t * 0.01) / tune('spawnRate');
      const act = this.players.filter(p => p.active);
      if (act.length) {
        const rear = act.reduce((a, b) => a.x < b.x ? a : b);
        const n = 1 + Math.floor(t / 120) + (this.mode === 2 ? 1 : 0);
        const prog = rear.x / MapData.pxW;
        const pool = escapePool(prog);
        for (let i = 0; i < n; i++) {
          const m = new Monster(Math.max(this.tideX + 60, rear.x - 560), rear.y + (Math.random() - 0.5) * 320, this.cfg,
                                pool[Math.floor(Math.random() * pool.length)]);
          m.enraged = true;
          m.state = 'chase'; m.target = rear;
          m.lastKnown = { x: rear.x, y: rear.y }; m.memoryT = 99;
          m.hp *= (1 + prog * 1.7) * (this.mode === 2 ? 1.25 : 1); m.maxHp = m.hp;
          m.hordeDmgMul = 1 + prog * 0.8;
          unstick(m);
          this.monsters.push(m);
        }
      }
    }
    // —— 中段商人（唯一补给站，靠近才出摊） ——
    if (!this.merchant && !this.escMerchantDone && MapData.merchantSpot) {
      const near = this.players.some(p => p.active && Math.abs(p.x - MapData.merchantSpot.x) < 900);
      if (near) {
        this.escMerchantDone = true;
        this.merchant = new Merchant(MapData.merchantSpot.x, MapData.merchantSpot.y, true);
        unstick(this.merchant);
        this.toast('🏮 神秘商人在前方废墟出摊了——最后的补给机会！', '#b48aff');
      }
    }
  }

  // 大逃亡：房间怪潮——从房间边缘涌出，锁定玩家
  escSpawnWave(r) {
    const prog = (r.x + r.w / 2) / MapData.pxW;
    const mid = Math.floor((this.escRooms.length - 1) / 2);
    const n = Math.min(14, Math.round((3 + r.idx * 1.1) * (this.mode === 2 ? 1.5 : 1)));
    const pool = escapePool(prog);
    const tgt0 = this.players.find(p => p.active);
    let spawned = 0;
    for (let tries = 0; tries < n * 8 && spawned < n; tries++) {
      const x = r.x + 30 + Math.random() * Math.max(40, r.w - 60);
      const y = r.y + 30 + Math.random() * Math.max(40, r.h - 60);
      if (isSolidAt(x, y)) continue;
      if (this.players.some(p => p.active && Math.hypot(p.x - x, p.y - y) < 170)) continue;
      // 预警落点：红圈 0.55 秒后怪物破土而出（可提前跑位/架枪）
      this.escPend = this.escPend || [];
      this.escPend.push({ x, y, t: 0.55, typeId: pool[Math.floor(Math.random() * pool.length)], room: r.idx, prog });
      this.bossZones.push({ x, y, r: 26, t: 0.55, dmg: 0, kind: 'spawn' });
      spawned++;
    }
    r.waveT = this.time;                                   // 记录开战时刻（速清奖励用）
    r.waveN = spawned;
    // 中段房间：Boss 扼守要道（击杀=免费升级+金币雨+商人出摊）
    if (r.idx === mid) {
      const bid = HORDE_BOSS_IDS[Math.floor(Math.random() * HORDE_BOSS_IDS.length)];
      const b = new Monster(r.x + r.w / 2, r.y + r.h / 2, this.cfg, bid);
      b.isBoss = true;
      b.hp = this.cfg.mHp * 26 * (this.mode === 2 ? 1.4 : 1) * tune('bossHp');
      b.maxHp = b.hp;
      b.hordeDmgMul = 1.8;
      b.escRoom = r.idx;
      unstick(b);
      this.monsters.push(b);
      this.hordeState.boss = b;
      Sfx.brute();
      this.toast(`👑 ${b.type.name}扼守要道！击杀它拿免费升级！`, '#ff5c5c');
    }
    this.shake = Math.max(this.shake, 5);
    Sfx.aggro();
    if (spawned) this.toast(`⚔️ 怪潮来袭 ×${spawned + (r.idx === mid ? 1 : 0)}！肃清房间领奖励！`, '#ff8f5c');
  }

  // 大逃亡：肃清奖励——经验喷泉 + 金币 + 概率道具 + 3 秒疾行；18 秒内速清加倍
  escRoomReward(r, clearSec = 99) {
    const H = this.hordeState;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (clearSec < 18 && r.waveN > 0) {
      const bonus2 = 40 + r.idx * 10;
      SAVE.gold += bonus2; this.runCash += bonus2;
      for (let i = 0; i < 6; i++) H.gems.push(new XPGem(cx + (Math.random() - 0.5) * 130, cy + (Math.random() - 0.5) * 100, 2));
      this.toast(`⚡ 速清奖励 +${bonus2}💰 +经验加倍！（${Math.round(clearSec)}s 肃清）`, '#ffd93d');
      Sfx.coin();
    }
    for (let i = 0; i < 8; i++) H.gems.push(new XPGem(cx + (Math.random() - 0.5) * 150, cy + (Math.random() - 0.5) * 110, 2));
    for (let i = 0; i < 4; i++) this.goldDrops.push(new GoldDrop(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 90, 12 + Math.round(Math.random() * 14)));
    if (this.powerups && Math.random() < 0.6) {
      const pu = POWERUPS[POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)]];
      this.powerups.push(new Powerup(cx, cy, pu));
    }
    for (const p of this.players) if (p.active) { p.sodaTime = Math.max(p.sodaTime, 3); p.sodaMul = Math.max(p.sodaMul || 1, 1.25); }
    this.fxP({ tex: FxTex.ring, x: cx, y: cy, s0: 60, s1: 420, a0: 0.7, a1: 0, life: 0.5 });
    Sfx.extract();
    this.toast('✨ 房间肃清！经验喷泉 + 3 秒疾行！', '#7dff9a');
  }

  // 大逃亡开箱：不出宝物，出枪/金币/道具/急救
  escapeLoot(chest, p) {
    const roll = Math.random();
    if (roll < 0.38) {
      const pool = Object.values(WEAPONS).filter(w => w.price && !w.requires);
      const range = { wood: [0, 1300], silver: [420, 3100], gold: [1800, 99999], mystery: [1000, 99999] }[chest.tier] || [0, 99999];
      const cands = pool.filter(w => w.price >= range[0] && w.price <= range[1]);
      const def = cands[Math.floor(Math.random() * cands.length)] || WEAPONS.pistol;
      const inst = { uid: -Math.floor(Math.random() * 1e9), id: def.id, dur: def.dur, temp: true };
      let slot = p.weapons[0] ? (p.weapons[1] ? -1 : 1) : 0;
      if (slot === -1) {
        // 双槽已满：替换当前手持的那把（想留哪把就先切到另一把），旧枪掉在原地可捡回
        slot = p.activeSlot;
        const old = p.weapons[slot];
        if (!this.weaponDrops) this.weaponDrops = [];
        this.weaponDrops.push({ x: chest.x + 24, y: chest.y + 18, inst: old, cd: 1.4 });
        this.toast(`${WEAPONS[old.id].icon}【${WEAPONS[old.id].name}】掉在原地，可走近换回`, '#9fd8ff');
      }
      p.weapons[slot] = inst;
      p.activeSlot = slot;
      p.mags[slot] = def.mag || 0;
      this.toast(`${this.pname(p)} 拾获 ${def.icon}【${def.name}】！`, '#ffd93d');
      Sfx.pickup('epic');
    } else if (roll < 0.6) {
      const v = 50 + Math.round(Math.random() * 90);
      SAVE.gold += v; this.runCash += v;
      Sfx.coin();
      this.floater(chest.x, chest.y - 26, `+${v}💰`, '#ffd93d');
    } else if (roll < 0.82) {
      const pu = POWERUPS[POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)]];
      this.applyPowerup({ type: pu, x: chest.x, y: chest.y }, p);
    } else {
      p.hp = Math.min(p.maxHp, p.hp + 50);
      Sfx.heal();
      this.floater(chest.x, chest.y - 26, '💖 +50', '#7dff9a');
    }
  }

  settleEscape() {
    const H = this.hordeState;
    SAVE.stats.runs++;
    const victory = this.players.some(p => p.extracted);
    const lead = Math.max(...this.players.map(p => p.x), 0);
    const progress = Math.min(1, lead / (MapData.exitRect.x + MapData.exitRect.w));
    let bonus = 0;
    if (victory) { bonus = 500 + this.runKills * 2 + H.level * 15; SAVE.gold += bonus; }
    SAVE.stats.goldEarned += this.runCash + bonus;
    const best = SAVE.escapeBest || { prog: 0, kills: 0, level: 0 };
    SAVE.escapeBest = {
      prog: Math.max(best.prog, Math.round(progress * 100)),
      kills: Math.max(best.kills, this.runKills),
      level: Math.max(best.level, H.level),
    };
    const newTrophies = [];
    const grant = id => { const tp = awardTrophy(id); if (tp) newTrophies.push(tp); };
    if (victory) grant('escape_dawn');
    if (this.runKills >= 15) grant('slayer');
    if (SAVE.gold >= 10000) grant('tycoon');
    persistSave();
    document.getElementById('levelup-overlay').style.display = 'none';
    UI.showResult({
      horde: true, escape: true, victory,
      progress: Math.round(progress * 100),
      mapName: this.mapName, mode: this.mode,
      time: this.time, kills: this.runKills, level: H.level,
      cash: this.runCash, bonus, best: SAVE.escapeBest,
      players: this.players.map(p => ({ idx: p.idx, kills: p.kills, status: p.extracted ? 'extracted' : 'dead' })),
      newTrophies,
    });
  }

  settleHorde() {
    const H = this.hordeState;
    SAVE.stats.runs++;
    // 胜利奖金：基础 400 + 每杀 2 金
    let bonus = 0;
    if (H.victory) { bonus = 400 + this.runKills * 2; SAVE.gold += bonus; }
    SAVE.stats.goldEarned += this.runCash + bonus;
    // 最佳战绩
    const shownT = H.victory ? hordeDuration() : Math.round(this.time);   // 胜利时按整时长记，避免 15:00/15:01 不一致
    const best = SAVE.hordeBest || { time: 0, kills: 0, level: 0 };
    SAVE.hordeBest = {
      time: Math.max(best.time, shownT),
      kills: Math.max(best.kills, this.runKills),
      level: Math.max(best.level, H.level),
    };
    // 奖杯
    const newTrophies = [];
    const grant = id => { const t = awardTrophy(id); if (t) newTrophies.push(t); };
    if (H.victory) grant('horde_win');
    if (this.runKills >= 150) grant('horde_slayer');
    if (this.runKills >= 15) grant('slayer');
    if (SAVE.gold >= 10000) grant('tycoon');
    persistSave();
    document.getElementById('levelup-overlay').style.display = 'none';

    UI.showResult({
      horde: true, victory: H.victory,
      mapName: this.mapName, mode: this.mode,
      time: shownT, duration: Math.round(hordeDuration() / 60), kills: this.runKills, level: H.level,
      cash: this.runCash, bonus, best: SAVE.hordeBest,
      players: this.players.map(p => ({ idx: p.idx, kills: p.kills, status: H.victory ? 'extracted' : 'dead' })),
      newTrophies,
    });
  }

  // ---------- 相机 ----------
  updateCameras(dt) {
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < this.players.length; i++) {
      let focus = this.players[i];
      if (!focus.alive) focus = this.players.find(p => p.alive) || focus;
      const gx = Math.max(0, Math.min(MapData.pxW - this.viewW, focus.x - this.viewW / 2));
      const gy = Math.max(0, Math.min(MapData.pxH - VIEW_H, focus.y - VIEW_H / 2));
      this.cams[i].x += (gx - this.cams[i].x) * k;
      this.cams[i].y += (gy - this.cams[i].y) * k;
    }
  }

  // ---------- 盟友技能特效层（法师黑龙波/激光/火环 + 机兵火炮） ----------
  allyFx() {
    if (!this._allyFx) this._allyFx = { waves: [], beams: [], fires: [], strikes: [] };
    return this._allyFx;
  }
  updateAllyFx(dt) {
    if (!this._allyFx) return;
    const A = this._allyFx;
    // 🐉 黑龙波：直线扫过，命中打硬直
    for (const w of A.waves) {
      w.t -= dt;
      w.x += Math.cos(w.a) * 320 * dt;
      w.y += Math.sin(w.a) * 320 * dt;
      for (const m of this.monsters.slice()) {
        if (w.hit.has(m)) continue;
        if (Math.hypot(m.x - w.x, m.y - w.y) < m.r + 26) {
          w.hit.add(m);
          m.stunT = Math.max(m.stunT, 0.9);
          m.knock(w.a, 320);
          if (m.hurt(32, this)) this.killMonster(m, this.players[0]);
        }
      }
    }
    A.waves = A.waves.filter(w => w.t > 0 && !isSolidAt(w.x, w.y));
    for (const b of A.beams) b.t -= dt;
    A.beams = A.beams.filter(b => b.t > 0);
    // 🔥 烈焰之环：持续灼烧圈
    for (const f of A.fires) {
      f.t -= dt; f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.5;
        for (const m of this.monsters.slice()) {
          if (Math.hypot(m.x - f.x, m.y - f.y) > f.r + m.r) continue;
          m.burnT = Math.max(m.burnT, 1);
          if (m.hurt(9, this)) this.killMonster(m, this.players[0]);
        }
      }
    }
    A.fires = A.fires.filter(f => f.t > 0);
    // 📡 火炮：预警后落地爆炸（只伤怪）
    for (const s of A.strikes) {
      s.t -= dt;
      if (s.t <= 0) {
        this.fxExplosion(s.x, s.y, 58);
        Sfx.boom();
        for (const m of this.monsters.slice()) {
          if (Math.hypot(m.x - s.x, m.y - s.y) > 66 + m.r) continue;
          m.knock(Math.atan2(m.y - s.y, m.x - s.x), 500);
          if (m.hurt(30, this)) this.killMonster(m, this.players[0]);
        }
      }
    }
    A.strikes = A.strikes.filter(s => s.t > 0);
  }

  // ---------- 特效 ----------
  floater(x, y, text, color) { this.floaters.push({ x, y, text, color, t: 1.6 }); }
  // 伤害数字（打击感），暴击更大更黄
  dmgNum(x, y, v, crit, color) {
    if (tune('juice') < 1) return;
    if (this.dmgNums.length > 60) this.dmgNums.shift();
    this.dmgNums.push({ x: x + (Math.random() - 0.5) * 14, y: y - 8, v: Math.round(v), crit, color, t: 0.7 });
  }
  hitPause(sec) { if (tune('juice') >= 1) this.hitPauseT = Math.max(this.hitPauseT, sec); }
  spark(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 120;
      this.sparks.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, t: 0.25 + Math.random()*0.2, color });
    }
  }
  toast(text, color) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderColor = color || '#ffd93d';
    el.textContent = text;
    this.toastEl.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
  }

  // ---------- 地图预渲染 ----------
  prerenderMap() {
    const T = MapData.theme;
    const c = document.createElement('canvas');
    c.width = MapData.pxW; c.height = MapData.pxH;
    const g = c.getContext('2d');
    // —— 地面：Dungeon Crawl 贴图铺地（CC0，主题 4 变体随机）+ 明暗斑驳；素材未就绪回退程序棋盘 ——
    const fhash = (x, y, s) => { let v = Math.imul(x, 374761) + Math.imul(y, 668265) + s * 987; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v >>> 0) % 1000) / 1000; };
    const tileSet = (typeof FloorTiles !== 'undefined' && FloorTiles[MapData.themeKey]) || null;
    const tilesOk = tileSet && tileSet.length && tileSet.every(im => im.complete && im.naturalWidth);
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < MapData.h; y++) for (let x = 0; x < MapData.w; x++) {
      if (MapData.solid[y][x]) continue;
      if (tilesOk) {
        g.drawImage(tileSet[Math.floor(fhash(x, y, 41) * tileSet.length)], x*TILE, y*TILE, TILE, TILE);
        // 主题色罩一层：贴图融入地图配色
        g.fillStyle = (x + y) % 2 ? T.floorA : T.floorB;
        g.globalAlpha = 0.42;
        g.fillRect(x*TILE, y*TILE, TILE, TILE);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = (x + y) % 2 ? T.floorA : T.floorB;
        g.fillRect(x*TILE, y*TILE, TILE, TILE);
      }
      const h1 = fhash(x, y, 1);
      g.fillStyle = h1 < 0.5 ? `rgba(0,0,0,${(0.02 + h1 * 0.09).toFixed(3)})` : `rgba(255,255,255,${((h1 - 0.5) * 0.06).toFixed(3)})`;
      g.fillRect(x*TILE, y*TILE, TILE, TILE);
      const n = Math.floor(fhash(x, y, 2) * 4);
      for (let i = 0; i < n; i++) {
        g.fillStyle = fhash(x, y, 11 + i) > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.11)';
        g.fillRect(x*TILE + 3 + fhash(x, y, 3 + i) * (TILE - 9), y*TILE + 3 + fhash(x, y, 7 + i) * (TILE - 9),
                   1.5 + fhash(x, y, 15 + i) * 3, 1.5 + fhash(x, y, 19 + i) * 2.5);
      }
      if (fhash(x, y, 23) > 0.93) {          // 偶发裂纹
        g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1.2;
        g.beginPath();
        let cxp = x*TILE + fhash(x, y, 24) * TILE, cyp = y*TILE + 2;
        g.moveTo(cxp, cyp);
        for (let s2 = 0; s2 < 3; s2++) { cxp += (fhash(x, y, 25 + s2) - 0.5) * 20; cyp += 9 + fhash(x, y, 28 + s2) * 9; g.lineTo(cxp, cyp); }
        g.stroke();
      }
      if (T.obstacle === 'crate' && (y % 3) === 0) {   // 木板缝
        g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x*TILE, y*TILE + 0.5); g.lineTo(x*TILE + TILE, y*TILE + 0.5); g.stroke();
      }
      if (T.obstacle === 'rock' && fhash(x, y, 31) > 0.86) {   // 石纹弧
        g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 1;
        g.beginPath(); g.arc(x*TILE + TILE/2, y*TILE + TILE/2, 6 + fhash(x, y, 32) * 9, fhash(x, y, 33) * 6, fhash(x, y, 33) * 6 + 2.2); g.stroke();
      }
      if (T.obstacle === 'barrel' && fhash(x, y, 35) > 0.9) {  // 湿渍
        g.fillStyle = 'rgba(40,90,110,.10)';
        g.beginPath(); g.ellipse(x*TILE + TILE/2, y*TILE + TILE/2, 8 + fhash(x, y, 36) * 8, 5 + fhash(x, y, 37) * 5, fhash(x, y, 38) * 3, 0, Math.PI*2); g.fill();
      }
    }
    g.imageSmoothingEnabled = true;
    for (const d of MapData.decorTiles) {
      g.fillStyle = T.decor;
      g.globalAlpha = 0.55;
      g.fillRect(d.tx*TILE, d.ty*TILE, TILE, TILE);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.beginPath(); g.arc(d.tx*TILE + 12 + (d.tx*7)%14, d.ty*TILE + 12 + (d.ty*11)%14, 3, 0, Math.PI*2); g.fill();
    }
    const er = MapData.exitRect;
    g.fillStyle = '#245c46';
    g.fillRect(er.x, er.y, er.w, er.h);
    g.strokeStyle = '#7dff9a'; g.lineWidth = 3; g.setLineDash([10, 8]);
    g.strokeRect(er.x + 4, er.y + 4, er.w - 8, er.h - 8);
    g.setLineDash([]);
    g.fillStyle = '#7dff9a';
    g.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center';
    g.fillText('🚁 撤离点', er.x + er.w/2, er.y + er.h/2 + 8);
    const sp = MapData.spawns[0];
    g.fillStyle = 'rgba(255,217,61,.12)';
    g.beginPath(); g.ellipse(sp.x + TILE, sp.y, TILE*2.2, TILE*1.4, 0, 0, Math.PI*2); g.fill();
    for (let y = 0; y < MapData.h; y++) for (let x = 0; x < MapData.w; x++) {
      if (!MapData.solid[y][x]) continue;
      if (MapData.ascii[y][x] === '*') continue;
      g.fillStyle = T.wallBody;
      g.fillRect(x*TILE, y*TILE, TILE, TILE);
      if (!isSolidTile(x, y+1)) { g.fillStyle = T.wallFace; g.fillRect(x*TILE, y*TILE, TILE, TILE - 6); g.fillStyle = T.wallEdge; g.fillRect(x*TILE, y*TILE + TILE - 10, TILE, 4); }
    }
    for (const o of MapData.obstacles) {
      const ox = o.tx*TILE, oy = o.ty*TILE;
      g.fillStyle = (o.tx + o.ty) % 2 ? T.floorA : T.floorB;
      g.fillRect(ox, oy, TILE, TILE);
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2.5;
      if (T.obstacle === 'rock') {
        g.fillStyle = '#6e6258';
        g.beginPath(); g.ellipse(ox+20, oy+22, 17, 14, 0, 0, Math.PI*2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath(); g.ellipse(ox+15, oy+16, 6, 4, 0.5, 0, Math.PI*2); g.fill();
      } else if (T.obstacle === 'barrel') {
        g.fillStyle = '#7a5c33';
        g.beginPath(); g.ellipse(ox+20, oy+20, 14, 16, 0, 0, Math.PI*2); g.fill(); g.stroke();
        g.strokeStyle = '#4a3820'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox+7, oy+14); g.lineTo(ox+33, oy+14); g.moveTo(ox+7, oy+26); g.lineTo(ox+33, oy+26); g.stroke();
      } else if (T.obstacle === 'ice') {
        g.fillStyle = '#9fd4ec';
        g.beginPath(); g.moveTo(ox+20, oy+4); g.lineTo(ox+32, oy+34); g.lineTo(ox+8, oy+34); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.beginPath(); g.moveTo(ox+18, oy+10); g.lineTo(ox+22, oy+22); g.lineTo(ox+15, oy+24); g.closePath(); g.fill();
      } else {
        g.fillStyle = '#6b5a3a';
        g.fillRect(ox+4, oy+4, 32, 32); g.strokeRect(ox+4, oy+4, 32, 32);
        g.strokeStyle = '#4a3d24'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox+4, oy+4); g.lineTo(ox+36, oy+36); g.moveTo(ox+36, oy+4); g.lineTo(ox+4, oy+36); g.stroke();
      }
    }
    g.textAlign = 'center';
    for (const t of MapData.torches) {
      g.fillStyle = '#4a3820';
      g.fillRect(t.x - 2, t.y - 8, 4, 14);
    }
    return c;
  }

  // ---------- 渲染 ----------
  render() {
    const ctx = this.ctx;
    ctx.fillStyle = MapData.theme.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const views = this.players.map((p, i) => ({ idx: i, cam: this.cams[i], x0: i * this.viewW }));
    for (const v of views.slice(0, this.mode)) this.renderView(v);

    if (this.mode === 2) {
      ctx.fillStyle = '#0d0a1c';
      ctx.fillRect(this.viewW - 2, 0, 4, VIEW_H);
    }
    this.drawMinimap(ctx);

    ctx.textAlign = 'center';
    ctx.font = 'bold 14px "PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    if (this.weather && this.weather.id !== 'clear') {
      ctx.font = 'bold 15px "PingFang SC",sans-serif';
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(`${this.weather.icon}${this.weather.name}`, VIEW_W/2 + 210, MapData.minimap.height + 26);
      if (this.time < 3.5) {
        ctx.globalAlpha = Math.min(1, 3.5 - this.time);
        ctx.font = 'bold 30px "PingFang SC",sans-serif';
        ctx.fillStyle = '#ffd93d';
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 5;
        const txt = `${this.weather.icon} ${this.weather.name} — ${this.weather.desc}`;
        ctx.strokeText(txt, VIEW_W/2, 220);
        ctx.fillText(txt, VIEW_W/2, 220);
        ctx.globalAlpha = 1;
      }
    }
    if (this.horde) {
      const H = this.hordeState;
      const left = Math.max(0, hordeDuration() - this.time);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      const y0 = MapData.minimap.height + 22;
      ctx.font = 'bold 20px "PingFang SC",sans-serif';
      if (this.escape) {
        const lead = Math.max(0, ...this.players.filter(p => p.active || p.extracted).map(p => p.x));
        const pct = Math.min(100, Math.round(lead / (MapData.exitRect.x + MapData.exitRect.w * 0.5) * 100));
        ctx.fillStyle = '#ffd93d';
        ctx.fillText(`🏁 ${pct}%`, VIEW_W/2, y0 + 4);
        const act = this.players.filter(p => p.active);
        if (act.length) {
          const gap = Math.round((Math.min(...act.map(p => p.x)) - this.tideX) / TILE);
          ctx.font = 'bold 12px "PingFang SC",sans-serif';
          ctx.fillStyle = gap < 8 ? '#ff5c5c' : 'rgba(255,255,255,.55)';
          ctx.fillText(gap <= 0 ? '☠️ 已陷入死亡之潮！' : `☠️ 死亡之潮 ${gap} 格`, VIEW_W/2, y0 + 40);
        }
      } else {
        ctx.fillStyle = left < 60 ? '#ffd93d' : 'rgba(255,255,255,.9)';
        ctx.fillText(`⏳ ${mm}:${String(ss).padStart(2,'0')}`, VIEW_W/2, y0 + 4);
      }
      ctx.font = 'bold 13px "PingFang SC",sans-serif';
      ctx.fillStyle = '#b48aff';
      ctx.fillText(`Lv.${H.level}`, VIEW_W/2 - 130, y0 + 2);
      ctx.fillStyle = '#ff8f5c';
      ctx.fillText(`⚔️ ${this.runKills}`, VIEW_W/2 + 130, y0 + 2);
      // 经验条
      const bw = 300, bx = VIEW_W/2 - bw/2, by = y0 + 12;
      ctx.fillStyle = 'rgba(10,8,24,.8)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
      ctx.fillStyle = '#5af0c8';
      ctx.fillRect(bx, by, bw * Math.min(1, H.xp / H.xpNeed), 6);
      // Boss 血条
      if (H.boss && H.boss.hp > 0) {
        const bbw = 420, bbx = VIEW_W/2 - bbw/2, bby = by + 18;
        ctx.fillStyle = 'rgba(10,8,24,.8)';
        ctx.fillRect(bbx - 2, bby - 2, bbw + 4, 14);
        ctx.fillStyle = '#ff5c5c';
        ctx.fillRect(bbx, bby, bbw * Math.max(0, H.boss.hp / H.boss.maxHp), 10);
        ctx.font = 'bold 11px "PingFang SC",sans-serif';
        ctx.fillStyle = '#ffb3b3';
        ctx.fillText('👑 ' + (H.boss.type.name || 'Boss'), VIEW_W/2, bby + 24);
      }
    } else {
      const mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
      ctx.fillText(`⏱ ${mm}:${String(ss).padStart(2,'0')}`, VIEW_W/2, MapData.minimap.height + 26);
    }
  }

  renderView(v) {
    const ctx = this.ctx;
    const w = this.viewW;
    const shx = this.shake ? (Math.random()-0.5) * this.shake : 0;
    const shy = this.shake ? (Math.random()-0.5) * this.shake : 0;
    const cam = { x: v.cam.x + shx, y: v.cam.y + shy };

    ctx.save();
    ctx.beginPath(); ctx.rect(v.x0, 0, w, VIEW_H); ctx.clip();
    ctx.translate(v.x0, 0);

    ctx.drawImage(this.mapCanvas, cam.x, cam.y, w, VIEW_H, 0, 0, w, VIEW_H);
    const W2S = (x, y) => [x - cam.x, y - cam.y];
    const onScreen = (sx, sy, pad = 60) => sx > -pad && sy > -pad && sx < w + pad && sy < VIEW_H + pad;

    for (const t of MapData.torches) {
      const [sx, sy] = W2S(t.x, t.y);
      if (!onScreen(sx, sy)) continue;
      const fl = Math.sin(this.time * 9 + t.x) * 1.5;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.ellipse(sx, sy - 12 + fl * 0.4, 4, 7 + fl, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath(); ctx.ellipse(sx, sy - 10 + fl * 0.4, 2, 3.5, 0, 0, Math.PI*2); ctx.fill();
    }
    for (const c of this.chests) {
      if (c.opened) continue;
      const [sx, sy] = W2S(c.x, c.y);
      if (onScreen(sx, sy)) this.drawChest(ctx, c, sx, sy);
    }
    for (const gd of this.goldDrops) {
      gd.anim += 0.01;
      const [sx, sy] = W2S(gd.x, gd.y);
      if (!onScreen(sx, sy)) continue;
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🪙', sx, sy + Math.sin(gd.anim * 6) * 2 + 4);
    }
    this.drawPowerups(ctx, cam, w);
    for (const gl of this.groundLoot) {
      gl.anim += 0.015;
      const [sx, sy] = W2S(gl.x, gl.y);
      if (!onScreen(sx, sy)) continue;
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('💼', sx, sy + Math.sin(gl.anim*2)*3 + 6);
      ctx.font = 'bold 11px "PingFang SC",sans-serif';
      ctx.fillStyle = '#ffd93d';
      ctx.fillText(`×${gl.items.length}`, sx + 14, sy - 8);
    }
    if (this.merchant) {
      const [sx, sy] = W2S(this.merchant.x, this.merchant.y);
      if (onScreen(sx, sy)) this.drawMerchant(ctx, sx, sy);
    }
    // —— 潜行辅助：显示怪物面朝方向的警戒锥 ——
    if (!this.horde && this.players.some(pl => pl.active && pl.sneak)) {
      for (const m of this.monsters) {
        if (m.state === 'ambush') continue;
        const [sx, sy] = W2S(m.x, m.y);
        if (!onScreen(sx, sy, 100)) continue;
        ctx.fillStyle = m.state === 'chase' ? 'rgba(255,92,92,.10)' : 'rgba(255,217,61,.09)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, 74, m.faceDir - 0.55, m.faceDir + 0.55);
        ctx.closePath(); ctx.fill();
      }
    }

    // —— Boss 落点预警圈 ——
    for (const z of this.bossZones) {
      const [sx, sy] = W2S(z.x, z.y);
      if (!onScreen(sx, sy, 120)) continue;
      const urgency = 1 - Math.min(1, z.t);
      ctx.strokeStyle = z.kind === 'bolt' ? `rgba(255,233,92,${0.5 + urgency * 0.4})` : `rgba(255,120,80,${0.5 + urgency * 0.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, z.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = z.kind === 'bolt' ? 'rgba(255,233,92,.12)' : 'rgba(255,120,80,.12)';
      ctx.beginPath(); ctx.arc(sx, sy, z.r * urgency, 0, Math.PI * 2); ctx.fill();
    }
    // —— 龙息扇形 ——
    if (this.breathFx) {
      const f = this.breathFx;
      const [sx, sy] = W2S(f.x, f.y);
      ctx.fillStyle = `rgba(255,140,60,${Math.min(0.5, f.t)})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, 250, f.dir - 0.55, f.dir + 0.55);
      ctx.closePath(); ctx.fill();
    }
    // —— 毒云 ——
    if (this.poisonClouds) {
      for (const pc of this.poisonClouds) {
        const [sx, sy] = W2S(pc.x, pc.y);
        if (!onScreen(sx, sy, 120)) continue;
        ctx.fillStyle = `rgba(110,200,80,${Math.min(0.3, pc.t * 0.12)})`;
        ctx.beginPath(); ctx.arc(sx, sy, pc.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(70,140,50,.35)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(sx + Math.cos(this.time * 2 + i * 1.6) * pc.r * 0.5,
                  sy + Math.sin(this.time * 1.6 + i * 2.1) * pc.r * 0.5, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        // 文字说明：这团绿雾是什么、离开它
        ctx.font = 'bold 12px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(0.9, pc.t * 0.5);
        ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        ctx.strokeText('☠️ 剧毒毒雾 · 快离开', sx, sy - 6);
        ctx.fillStyle = '#a5e88a';
        ctx.fillText('☠️ 剧毒毒雾 · 快离开', sx, sy - 6);
        ctx.globalAlpha = 1;
      }
    }
    // —— 割草模式地面层：火焰足迹 / 经验宝石 ——
    if (this.horde) {
      const H = this.hordeState;
      for (const fp of H.firePatches) {
        const [sx, sy] = W2S(fp.x, fp.y);
        if (!onScreen(sx, sy)) continue;
        // 火焰云贴图（三帧轮播）+ 底部加色辉光
        const fimg = typeof MonsterImages !== 'undefined' && MonsterImages['fx_flame' + (Math.floor(this.time * 9 + fp.x) % 3)];
        ctx.globalAlpha = Math.min(0.95, fp.t * 0.8);
        if (fimg && fimg.naturalWidth) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(FxTex.fire, sx - 16, sy - 12, 32, 26);
          ctx.restore();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fimg, sx - 14, sy - 20 - Math.sin(this.time * 10 + fp.x) * 2, 28, 28);
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.fillStyle = '#ff7b2d';
          ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      for (const g of H.gems) {
        const [sx, sy] = W2S(g.x, g.y);
        if (!onScreen(sx, sy)) continue;
        const bob = Math.sin(g.anim * 4) * 2.5;
        ctx.save();
        ctx.translate(sx, sy + bob);
        ctx.rotate(Math.PI / 4);
        const s = g.v >= 12 ? 9 : g.v >= 3 ? 7 : 5;
        ctx.fillStyle = g.v >= 12 ? '#ffd93d' : g.v >= 3 ? '#b366ff' : '#5af0c8';
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
        ctx.fillRect(-s/2, -s/2, s, s); ctx.strokeRect(-s/2, -s/2, s, s);
        ctx.restore();
      }
    }
    for (const m of this.monsters) {
      const [sx, sy] = W2S(m.x, m.y);
      if (!onScreen(sx, sy)) continue;
      this.drawMonster(ctx, m, sx, sy);
      // 程序绘制怪的受击闪白：柔光脉冲（贴图怪在 drawMonster 里用白剪影）
      if (m.flashT > 0 && !m.type.sprite) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, m.flashT / 0.13) * 0.7;
        ctx.drawImage(FxTex.glow, sx - m.r * 1.6, sy - m.r * 1.6, m.r * 3.2, m.r * 3.2);
        ctx.restore();
      }
    }
    for (const mc of this.mercs) {
      const [sx, sy] = W2S(mc.x, mc.y);
      if (onScreen(sx, sy)) this.drawMerc(ctx, mc, sx, sy);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const [sx, sy] = W2S(p.x, p.y);
      this.drawPlayer(ctx, p, sx, sy);
      // 头顶异常状态标识（🤢中毒 等）
      const ail = p.poisonT > 0 ? ['🤢 中毒', '#a5e88a'] : p.rootT > 0 ? ['⛓️ 定身', '#b48aff']
                : p.paraT > 0 ? ['⚡ 麻痹', '#ffd93d'] : p.burnT2 > 0 ? ['🔥 灼烧', '#ff9a4d'] : null;
      if (ail) {
        ctx.font = 'bold 11px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3;
        ctx.strokeText(ail[0], sx, sy - 30);
        ctx.fillStyle = ail[1];
        ctx.fillText(ail[0], sx, sy - 30);
      }
    }
    // —— 环绕飞锅 ——
    if (this.horde && this.hordeState.skills.orbit > 0) {
      const n = this.hordeState.skills.orbit;
      for (const p of this.players) {
        if (!p.active) continue;
        for (let i = 0; i < n; i++) {
          const a = this.time * 3.2 + i * Math.PI * 2 / n + p.idx * 0.5;
          const [sx, sy] = W2S(p.x + Math.cos(a) * 78, p.y + Math.sin(a) * 78);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(a + Math.PI / 2);
          ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('🍳', 0, 7);
          ctx.restore();
        }
      }
    }
    for (const o of this.monsterOrbs) {
      const [sx, sy] = W2S(o.x, o.y);
      ctx.fillStyle = 'rgba(126,247,255,.9)';
      ctx.beginPath(); ctx.arc(sx, sy, 6 + Math.sin(o.anim * 12) * 1.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI*2); ctx.fill();
    }
    for (const b of this.bullets) {
      const [sx, sy] = W2S(b.x, b.y);
      if (b.duck) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(b.angle + (Math.cos(b.angle) < 0 ? Math.PI : 0));
        if (Math.cos(b.angle) < 0) ctx.scale(-1, 1);
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🦆', 0, 6);
        ctx.restore();
      } else if (b.laser) {
        ctx.strokeStyle = '#7ef7ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx - Math.cos(b.angle) * 22, sy - Math.sin(b.angle) * 22); ctx.stroke();
      } else if (b.frost) {
        ctx.fillStyle = 'rgba(190,233,255,.8)';
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI*2); ctx.fill();
      } else if (b.arrowC) {
        // 弓箭手的箭：彩色箭杆 + 箭头
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(b.angle);
        ctx.strokeStyle = b.arrowC; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.fillStyle = b.arrowC;
        ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(5, -3.5); ctx.lineTo(5, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (b.bone) {
        // 骨刺：白骨碎片贴图，随弹道旋转
        const bimg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_bone;
        if (bimg && bimg.naturalWidth) {
          ctx.save();
          ctx.translate(sx, sy); ctx.rotate(b.angle);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bimg, -11, -11, 22, 22);
          ctx.imageSmoothingEnabled = true;
          ctx.restore();
        } else { ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI*2); ctx.fill(); }
      } else if (b.rocket) {
        // RPG 火箭弹：弹体 + 尾焰
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(b.angle);
        ctx.fillStyle = '#4a5264'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff5c5c';
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8;
        ctx.drawImage(FxTex.fire, sx - Math.cos(b.angle) * 12 - 8, sy - Math.sin(b.angle) * 12 - 8, 16, 16);
        ctx.restore();
      } else if (b.fire) {
        // 火球术：像素火球贴图 + 加色辉光（拖尾粒子在 Bullet.update 里喷）
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 22) * 0.15;
        ctx.drawImage(FxTex.fire, sx - 22, sy - 22, 44, 44);
        ctx.restore();
        const fimg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_fireball;
        if (fimg && fimg.naturalWidth) {
          ctx.save();
          ctx.translate(sx, sy); ctx.rotate(b.angle + Math.PI / 2);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fimg, -14, -14, 28, 28);
          ctx.imageSmoothingEnabled = true;
          ctx.restore();
        } else {
          ctx.fillStyle = '#ffb347';
          ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI*2); ctx.fill();
        }
      } else {
        // 曳光弹：辉光 + 拖尾渐变胶囊 + 白炽弹头
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(b.angle);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(FxTex.glow, -9, -9, 18, 18);
        ctx.globalAlpha = 1;
        const tg2 = ctx.createLinearGradient(-16, 0, 5, 0);
        tg2.addColorStop(0, 'rgba(255,170,60,0)');
        tg2.addColorStop(0.7, 'rgba(255,210,110,.85)');
        tg2.addColorStop(1, '#fff6d8');
        ctx.fillStyle = tg2;
        ctx.beginPath();
        ctx.moveTo(-16, -1.1); ctx.lineTo(3, -1.6); ctx.arc(3, 0, 1.8, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-16, 1.1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(3.5, 0, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    for (const s of this.sparks) {
      const [sx, sy] = W2S(s.x, s.y);
      ctx.fillStyle = s.color; ctx.globalAlpha = Math.max(0, s.t * 3);
      ctx.fillRect(sx-2, sy-2, 4, 4);
    }
    ctx.globalAlpha = 1;
    // —— 掉落在地的武器 ——
    if (this.weaponDrops) {
      for (const wd of this.weaponDrops) {
        const [sx, sy] = W2S(wd.x, wd.y);
        if (!onScreen(sx, sy)) continue;
        ctx.fillStyle = 'rgba(255,217,61,.12)';
        ctx.beginPath(); ctx.arc(sx, sy + 4, 14 + Math.sin(this.time * 4) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(WEAPONS[wd.inst.id].icon, sx, sy + Math.sin(this.time * 3) * 2 + 4);
      }
    }
    this.drawFx(ctx, cam, w);   // 高级粒子层（爆炸/枪口焰/烟尘）
    // —— 盟友技能特效层 ——
    if (this._allyFx) {
      const A = this._allyFx;
      const dimg = typeof MonsterImages !== 'undefined' && MonsterImages.m_dragon;
      for (const wv of A.waves) {
        const [sx, sy] = W2S(wv.x, wv.y);
        if (!onScreen(sx, sy, 80)) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        ctx.drawImage(FxTex.glow, sx - 30, sy - 30, 60, 60);
        ctx.restore();
        if (dimg && dimg.naturalWidth) {
          ctx.save();
          ctx.translate(sx, sy + Math.sin(this.time * 8 + wv.y) * 3);
          if (Math.cos(wv.a) > 0) ctx.scale(-1, 1);   // 素材原生朝左
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(dimg, -26, -26, 52, 52);
          ctx.imageSmoothingEnabled = true;
          ctx.restore();
        }
      }
      for (const bm of A.beams) {
        const [x0, y0] = W2S(bm.x0, bm.y0), [x1, y1] = W2S(bm.x1, bm.y1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(126,247,255,${bm.t * 3})`;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${bm.t * 3})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.restore();
      }
      for (const f of A.fires) {
        const [sx, sy] = W2S(f.x, f.y);
        if (!onScreen(sx, sy, 140)) continue;
        ctx.strokeStyle = `rgba(255,140,60,${Math.min(0.8, f.t * 0.5)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, f.r, 0, Math.PI * 2); ctx.stroke();
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n + this.time * 0.8;
          const fimg = typeof MonsterImages !== 'undefined' && MonsterImages['fx_flame' + ((i + Math.floor(this.time * 8)) % 3)];
          if (fimg && fimg.naturalWidth) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(fimg, sx + Math.cos(a) * f.r - 12, sy + Math.sin(a) * f.r - 18, 24, 24);
            ctx.imageSmoothingEnabled = true;
          }
        }
      }
      for (const s of A.strikes) {
        const [sx, sy] = W2S(s.x, s.y);
        ctx.strokeStyle = `rgba(255,120,40,${0.4 + Math.sin(this.time * 12) * 0.25})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, 44, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 44 * Math.max(0, 1 - s.t / 0.9), 0, Math.PI * 2); ctx.stroke();
      }
    }

    const lights = this.players.filter(p => p.active).map(p => ({ x: p.x, y: p.y, radius: VISION.baseRadius * p.visionMul() * (this.horde ? 2.1 : 1) * this.weatherVision() }));
    for (const p of this.players) if (p.downed) lights.push({ x: p.x, y: p.y, radius: 90 });
    const glows = this.chests.filter(c => !c.opened && (c.tier === 'gold' || c.tier === 'mystery')).map(c => ({ x: c.x, y: c.y, r: 26 }));
    for (const t of MapData.torches) glows.push({ x: t.x, y: t.y - 8, r: 56 + Math.sin(this.time * 6 + t.y) * 7 });
    if (this.merchant) glows.push({ x: this.merchant.x, y: this.merchant.y, r: 60 });
    const overlay = this.overlays[v.idx];
    drawDarkness(overlay.getContext('2d'), cam, lights, glows);
    ctx.drawImage(overlay, 0, 0);
    this.drawWeather(ctx, w);
    if (this.horde) this.drawHordeExtras(ctx, cam, w);
    // —— 大逃亡：死亡之潮红雾墙 ——
    if (this.escape) {
      const tx = this.tideX - cam.x;
      if (tx > -420 && tx < w + 80) {
        const tg = ctx.createLinearGradient(tx - 340, 0, tx, 0);
        tg.addColorStop(0, 'rgba(120,10,30,0)');
        tg.addColorStop(0.7, 'rgba(120,10,30,.35)');
        tg.addColorStop(1, 'rgba(150,15,40,.6)');
        ctx.fillStyle = tg;
        ctx.fillRect(tx - 340, 0, 340, VIEW_H);
        ctx.fillStyle = `rgba(200,30,50,${0.6 + Math.sin(this.time * 6) * 0.2})`;
        ctx.fillRect(tx, 0, 3, VIEW_H);
        if (Math.random() < 0.35) this.fxP({ tex: FxTex.smoke, x: this.tideX - Math.random() * 120, y: cam.y + Math.random() * VIEW_H,
          vx: 46, vy: -24, s0: 44, s1: 100, a0: 0.4, a1: 0, life: 1.1, add: false });
        if (tx > 20) {
          ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('💀', tx - 16, 60 + Math.sin(this.time * 2.6) * 14);
        }
      }
    }

    // —— 割草特效层（穿透黑暗，保证爽感可见） ——
    if (this.horde) {
      const H = this.hordeState;
      for (const nr of H.novaRings) {
        const [sx, sy] = W2S(nr.x, nr.y);
        ctx.strokeStyle = `rgba(160,225,255,${Math.min(1, nr.t * 2.4)})`;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy, nr.r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.7, nr.t * 1.6)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, nr.r * 0.86, 0, Math.PI * 2); ctx.stroke();
      }
      for (const bolt of H.bolts) {
        // 三层闪电：外辉光 → 黄电弧 → 白炽核心，末端炸开小分叉
        const a1 = Math.min(1, bolt.t * 6);
        const jag = [];
        for (let i = 0; i < bolt.pts.length; i++) {
          const [sx, sy] = W2S(bolt.pts[i].x, bolt.pts[i].y);
          if (i > 0) {
            const [px, py] = W2S(bolt.pts[i-1].x, bolt.pts[i-1].y);
            jag.push([(sx + px) / 2 + (Math.random() - 0.5) * 20, (sy + py) / 2 + (Math.random() - 0.5) * 20]);
          }
          jag.push([sx, sy]);
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [w2, col] of [[9, `rgba(140,190,255,${a1 * 0.35})`], [4, `rgba(255,240,120,${a1 * 0.9})`], [1.6, `rgba(255,255,255,${a1})`]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w2; ctx.lineJoin = 'round';
          ctx.beginPath();
          jag.forEach(([jx, jy], k) => k === 0 ? ctx.moveTo(jx, jy) : ctx.lineTo(jx, jy));
          ctx.stroke();
        }
        // 末端分叉
        const [ex2, ey2] = jag[jag.length - 1];
        ctx.strokeStyle = `rgba(255,240,120,${a1 * 0.8})`; ctx.lineWidth = 1.4;
        for (let f = 0; f < 3; f++) {
          const fa = Math.random() * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(ex2, ey2);
          ctx.lineTo(ex2 + Math.cos(fa) * 10, ey2 + Math.sin(fa) * 10);
          ctx.lineTo(ex2 + Math.cos(fa + 0.5) * 17, ey2 + Math.sin(fa + 0.5) * 17);
          ctx.stroke();
        }
        ctx.globalAlpha = a1;
        ctx.drawImage(FxTex.glow, ex2 - 14, ey2 - 14, 28, 28);
        ctx.globalAlpha = 1;
        ctx.restore();
        ctx.beginPath();
        ctx.stroke();
      }
    }

    if (this.revealT > 0) {
      for (const m of this.monsters) {
        const [sx, sy] = W2S(m.x, m.y);
        ctx.strokeStyle = 'rgba(255,92,92,.9)'; ctx.lineWidth = 2;
        const r = 14 + Math.sin(this.time * 8) * 3;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.stroke();
      }
    }
    for (const p of this.players) {
      if (!p.active) continue;
      for (const a of p.arrows) {
        if (a.target.opened) continue;
        this.drawArrow(ctx, p, a.target.x, a.target.y, a.color, cam);
      }
      if (p.hasExitArrow()) {
        const er = MapData.exitRect;
        this.drawArrow(ctx, p, er.x + er.w/2, er.y + er.h/2, '#7dff9a', cam);
      }
    }
    this.drawInteractionUI(ctx, cam);

    ctx.textAlign = 'center';
    // —— 鼠标准星（单人鼠标操控）——
    if (v.idx === 0 && this.mode === 1 && SAVE.settings.mouseAim !== false && !this.paused) {
      const mx = Input.mouse.x, my = Input.mouse.y;
      ctx.strokeStyle = 'rgba(255,217,61,.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
      for (const [ox, oy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
        ctx.beginPath(); ctx.moveTo(mx + ox * 0.55, my + oy * 0.55); ctx.lineTo(mx + ox, my + oy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,217,61,.9)';
      ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // 伤害数字（普通白、重击金色大号、玩家受伤红色）
    for (const n of this.dmgNums) {
      const [sx, sy] = W2S(n.x, n.y);
      ctx.globalAlpha = Math.min(1, n.t * 2.2);
      ctx.font = n.crit ? 'bold 20px sans-serif' : 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3;
      const txt = (n.color === '#ff6b6b' ? '-' : '') + n.v;
      ctx.strokeText(txt, sx, sy);
      ctx.fillStyle = n.color || (n.crit ? '#ffd93d' : '#fff');
      ctx.fillText(txt, sx, sy);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const [sx, sy] = W2S(f.x, f.y);
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawMinimap(ctx) {
    const mm = MapData.minimap, S = MapData.minimapScale;
    const x0 = Math.round((VIEW_W - mm.width) / 2), y0 = 8;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(mm, x0, y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(120,110,160,.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 1, y0 - 1, mm.width + 2, mm.height + 2);
    const dot = (wx, wy, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x0 + wx / TILE * S, y0 + wy / TILE * S, r, 0, Math.PI*2); ctx.fill();
    };
    for (const c of this.chests) {
      if (c.opened) continue;
      if (c.tier === 'gold') dot(c.x, c.y, '#ffd93d', 2.4);
      else if (c.tier === 'mystery') dot(c.x, c.y, '#b366ff', 2.4);
    }
    for (const gl of this.groundLoot) dot(gl.x, gl.y, '#ffffff', 2);
    if (this.merchant) dot(this.merchant.x, this.merchant.y, '#b48aff', 2.6);
    for (const mc of this.mercs) dot(mc.x, mc.y, mc.def.color, 2.2);
    // 全部怪物红点 + Boss 金色大点（带脉冲圈）
    for (const m of this.monsters) {
      if (m.state === 'ambush') continue;   // 伏击者仍然隐身
      if (m.isBoss || m.type.boss) {
        dot(m.x, m.y, '#ffd93d', 4);
        ctx.strokeStyle = `rgba(255,92,92,${0.5 + Math.sin(this.time * 5) * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x0 + m.x / TILE * S, y0 + m.y / TILE * S, 6 + Math.sin(this.time * 5) * 2, 0, Math.PI*2); ctx.stroke();
      } else dot(m.x, m.y, m.enraged ? '#ff3b3b' : '#e05c6a', 1.8);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5;
      const px = x0 + p.x / TILE * S, py = y0 + p.y / TILE * S;
      ctx.fillStyle = p.skin.body;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }

  // ---------- 实体绘制 ----------
  drawChest(ctx, c, sx, sy) {
    const colors = { wood: ['#8a6a3b','#6b512c'], silver: ['#b9c4d6','#8e99ab'], gold: ['#ffd93d','#d4a017'], mystery: ['#9a5aff','#6b2fd6'] };
    const [body, lid] = colors[c.tier];
    const wob = c.tier === 'mystery' ? Math.sin(c.anim + this.time * 10) * 2 : 0;
    ctx.save();
    ctx.translate(sx + wob, sy);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 18, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = body;
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2.5;
    this.rrect(ctx, -16, -8, 32, 22, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lid;
    this.rrect(ctx, -18, -16, 36, 12, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.tier === 'mystery' ? '#ff5c5c' : '#241f38';
    ctx.fillRect(-3, -8, 6, 8);
    ctx.restore();
    if (c.progress > 0) {
      const t = c.progress / c.def.openTime;
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx, sy, 26, -Math.PI/2, -Math.PI/2 + t * Math.PI*2); ctx.stroke();
    }
  }

  drawMerchant(ctx, sx, sy) {
    const bob = Math.sin(this.time * 2) * 2;
    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 18 - bob, 16, 5, 0, 0, Math.PI*2); ctx.fill();
    // 斗篷
    ctx.fillStyle = '#3d2f5e'; ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-15, 16); ctx.quadraticCurveTo(-17, -14, 0, -18); ctx.quadraticCurveTo(17, -14, 15, 16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 兜帽里的鸭嘴与眼睛
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath(); ctx.ellipse(0, -2, 6, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath(); ctx.arc(-5, -8, 2.5, 0, Math.PI*2); ctx.arc(5, -8, 2.5, 0, Math.PI*2); ctx.fill();
    // 提灯
    ctx.fillStyle = '#ffd93d';
    ctx.fillRect(16, -4 + Math.sin(this.time * 3) * 2, 6, 8);
    ctx.restore();
    ctx.font = 'bold 11px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#b48aff';
    ctx.fillText('神秘商人', sx, sy - 30);
  }

  drawMonster(ctx, m, sx, sy) {
    const t = m.type.id;
    const bob = Math.sin(m.anim * 5) * 2;
    // —— 像素贴图怪（Dungeon Crawl CC0）：6 新怪与 3 Boss ——
    if (m.type.sprite && typeof MonsterImages !== 'undefined' && MonsterImages[m.type.sprite] && MonsterImages[m.type.sprite].naturalWidth) {
      const img = MonsterImages[m.type.sprite];
      const size = m.type.boss ? m.r * 2.5 : m.r * 2 + 12;
      // —— 程序骨骼感动画：走路小跳+挤压、待机呼吸、前摇鼓胀颤抖、追击前倾 ——
      const moving = m.state === 'chase' || m.state === 'investigate' || m.state === 'patrol';
      const trot = moving ? Math.sin(m.anim * 11) : 0;
      const hop = Math.abs(trot) * 3.5;                                          // 小碎步跳动
      const squash = 1 + (moving ? trot * 0.07 : Math.sin(m.anim * 2.6) * 0.035); // 走路挤压/待机呼吸
      const lean = m.state === 'chase' ? trot * 0.055 : 0;                        // 追击左右晃身
      const jx = m.windupT > 0 ? (Math.random() - 0.5) * 3 : 0;                   // 前摇颤抖
      const swell = m.windupT > 0 ? 1.1 + (0.6 - Math.min(0.6, m.windupT)) * 0.12 : 1;  // 前摇鼓胀
      ctx.save();
      ctx.translate(sx + jx, sy + bob - hop);
      if (m.enraged) {
        ctx.fillStyle = `rgba(255,80,50,${0.2 + Math.sin(this.time * 9 + m.zigPhase) * 0.08})`;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 8, 0, Math.PI * 2); ctx.fill();
      }
      if (m.windupT > 0) {
        ctx.strokeStyle = 'rgba(255,92,92,.85)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 8 + m.windupT * 26, 0, Math.PI * 2); ctx.stroke();
      }
      if (m.type.boss) {
        ctx.strokeStyle = `rgba(255,92,92,${0.35 + Math.sin(this.time * 4) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 2, m.r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(0, m.r - 2 + hop, Math.max(4, (m.r - 2) * (1 - hop * 0.03)), 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(lean);
      ctx.scale(squash * swell, (2 - squash) * swell);
      ctx.imageSmoothingEnabled = false;
      // 镜像翻转按贴图原生朝向判定：face:'left' 的素材向右走时翻转，默认(朝右)素材向左走时翻转
      const flip = m.type.face === 'left' ? Math.cos(m.faceDir) > 0.2 : Math.cos(m.faceDir) < -0.2;
      if (flip) { ctx.scale(-1, 1); }
      ctx.drawImage(img, -size / 2, -size / 2 - 4, size, size);
      if (m.flashT > 0 && typeof MonsterImagesWhite !== 'undefined' && MonsterImagesWhite[m.type.sprite]) {
        ctx.globalAlpha = Math.min(1, m.flashT / 0.13) * 0.85;   // 受击闪白剪影
        ctx.drawImage(MonsterImagesWhite[m.type.sprite], -size / 2, -size / 2 - 4, size, size);
        ctx.globalAlpha = 1;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px sans-serif';
      if (m.stunT > 0) { ctx.fillStyle = '#9fd8ff'; ctx.fillText('♪', sx, sy - m.r - 14); }
      else if (m.slowT > 0) { ctx.fillStyle = '#bfe9ff'; ctx.fillText('❄', sx, sy - m.r - 14); }
      else if (m.state === 'chase') { ctx.fillStyle = '#ff5c5c'; ctx.fillText('!', sx, sy - m.r - 14); }
      if (m.type.boss) {
        // Boss 头顶：名字 + 大血条
        const w = 96, by = sy - m.r - 30;
        ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        ctx.strokeText('👑 ' + m.type.name, sx, by - 6);
        ctx.fillStyle = '#ffd93d';
        ctx.fillText('👑 ' + m.type.name, sx, by - 6);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(sx - w/2 - 1, by - 1, w + 2, 9);
        const bgrad = ctx.createLinearGradient(sx - w/2, 0, sx + w/2, 0);
        bgrad.addColorStop(0, '#ff5c5c'); bgrad.addColorStop(1, '#ff9a3d');
        ctx.fillStyle = bgrad;
        ctx.fillRect(sx - w/2, by, w * Math.max(0, m.hp / m.maxHp), 7);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
        ctx.strokeRect(sx - w/2 - 1, by - 1, w + 2, 9);
      } else if (m.hpShowT > 0) {
        const w = m.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w/2, sy - m.r - 24, w, 5);
        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(sx - w/2, sy - m.r - 24, w * Math.max(0, m.hp / m.maxHp), 5);
      }
      return;
    }
    if (m.state === 'ambush') {
      ctx.globalAlpha = 0.16 + Math.sin(this.time * 2 + m.zigPhase) * 0.06;
      ctx.fillStyle = '#1a1430';
      ctx.beginPath(); ctx.ellipse(sx, sy, m.r + 4, m.r, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff5c5c';
      if (Math.sin(this.time * 1.3 + m.zigPhase) > 0.92) {
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(sx - 5, sy - 2, 2, 0, Math.PI*2); ctx.arc(sx + 5, sy - 2, 2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const chase = m.state === 'chase';
    ctx.save();
    if (m.enraged) {
      ctx.fillStyle = `rgba(255,80,50,${0.2 + Math.sin(this.time * 9 + m.zigPhase) * 0.08})`;
      ctx.beginPath(); ctx.arc(sx, sy + bob, m.r + 8, 0, Math.PI * 2); ctx.fill();
      if (Math.random() < 0.12) this.spark(m.x + (Math.random()-0.5)*m.r, m.y - m.r, '#ff5c3c');
    }
    ctx.translate(sx, sy + bob);
    if (m.windupT > 0) {
      ctx.strokeStyle = 'rgba(255,92,92,.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, m.r + 8 + m.windupT * 26, 0, Math.PI*2); ctx.stroke();
      ctx.scale(1.12, 1.12);
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, m.r - 2 - bob, m.r, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
    // 灼烧中的火苗
    if (m.burnT > 0) {
      ctx.fillStyle = 'rgba(255,140,60,.5)';
      ctx.beginPath(); ctx.ellipse(0, -m.r - 4, 5, 8 + Math.sin(m.anim*15)*3, 0, 0, Math.PI*2); ctx.fill();
    }
    const grad = (c1, c2, r) => { const g = ctx.createRadialGradient(-r*0.3, -r*0.4, r*0.2, 0, 0, r*1.2); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; };

    if (t === 'mimic') {
      // 宝箱怪：木箱开口 + 舌头 + 獠牙
      ctx.fillStyle = grad('#a8743c', '#6b4a22', 18);
      this.rrect(ctx, -17, -4, 34, 18, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = grad('#b8824a', '#7a5228', 18);
      ctx.save(); ctx.translate(0, -6); ctx.rotate(-0.14 + Math.sin(m.anim*8)*0.1);
      this.rrect(ctx, -18, -12, 36, 12, 5); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#5c0f1e';
      ctx.beginPath(); ctx.ellipse(0, -3, 14, 6, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e84a5f';
      ctx.beginPath(); ctx.ellipse(2, -1, 7, 3.5, 0.2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fffbe8';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-13 + i*6, -7); ctx.lineTo(-10 + i*6, -1); ctx.lineTo(-7 + i*6, -7); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath(); ctx.arc(-8, -13, 3.5, 0, Math.PI*2); ctx.arc(8, -13, 3.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath(); ctx.arc(-8, -13, 1.6, 0, Math.PI*2); ctx.arc(8, -13, 1.6, 0, Math.PI*2); ctx.fill();
    } else if (t === 'skitter') {
      // 疾爪蝠：膜翼 + 大耳 + 獠牙
      const flap = Math.sin(m.anim * 22) * 0.8;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s, 1); ctx.rotate(-flap * 0.4);
        ctx.fillStyle = grad('#7a68a8', '#4a3a70', 14);
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.quadraticCurveTo(20, -14 - flap*6, 26, -4);
        ctx.quadraticCurveTo(21, -1, 24, 6);
        ctx.quadraticCurveTo(17, 3, 18, 10);
        ctx.quadraticCurveTo(10, 4, 6, 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = grad(chase ? '#9a5a80' : '#8a74b8', chase ? '#5c2a48' : '#4e3c7a', m.r);
      ctx.beginPath(); ctx.arc(0, 0, m.r - 1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2a58';
      ctx.beginPath(); ctx.moveTo(-7, -8); ctx.quadraticCurveTo(-8, -18, -2, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -8); ctx.quadraticCurveTo(8, -18, 2, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = chase ? '#ff5c5c' : '#ffe28a';
      ctx.beginPath(); ctx.arc(-4, -2, 2.8, 0, Math.PI*2); ctx.arc(4, -2, 2.8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.arc(-4, -2, 1.2, 0, Math.PI*2); ctx.arc(4, -2, 1.2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-2, 8); ctx.lineTo(-1, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, 4); ctx.lineTo(2, 8); ctx.lineTo(1, 4); ctx.fill();
    } else if (t === 'brute') {
      // 石巨魁：层叠岩块 + 熔核 + 巨拳
      const R = m.r;
      ctx.fillStyle = '#3f3833';
      ctx.beginPath(); ctx.ellipse(-R - 4, 6, 8, 11, 0.25 + Math.sin(m.anim*3)*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(R + 4, 6, 8, 11, -0.25 - Math.sin(m.anim*3)*0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = grad(chase ? '#7a6252' : '#6e6258', '#3a322c', R);
      this.rrect(ctx, -R, -R - 3, R*2, R*2 + 2, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = grad('#8a7a68', '#544a40', R*0.7);
      this.rrect(ctx, -R + 4, -R + 1, R*2 - 8, R - 2, 6); ctx.fill();
      // 熔核裂纹
      ctx.strokeStyle = chase ? 'rgba(255,120,50,.9)' : 'rgba(255,160,60,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-R + 6, 2); ctx.lineTo(-4, 7); ctx.lineTo(3, 3); ctx.lineTo(10, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -R + 5); ctx.lineTo(6, -4); ctx.stroke();
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
      // 苔藓
      ctx.fillStyle = 'rgba(110,140,80,.5)';
      ctx.beginPath(); ctx.ellipse(-R + 6, -R + 3, 6, 3, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = chase ? '#ff6a3d' : '#ffb347';
      ctx.beginPath(); ctx.arc(-7, -9, 3.4, 0, Math.PI*2); ctx.arc(7, -9, 3.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff2d0';
      ctx.beginPath(); ctx.arc(-7, -10, 1.2, 0, Math.PI*2); ctx.arc(7, -10, 1.2, 0, Math.PI*2); ctx.fill();
    } else if (t === 'lurker') {
      // 潜伏者：墨团 + 中央竖瞳 + 触手
      ctx.fillStyle = grad('#3c2c60', '#180f30', m.r);
      ctx.beginPath(); ctx.ellipse(0, -2, m.r, m.r + 3, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const wig = Math.sin(m.anim * 9 + i * 1.7) * 5;
        ctx.strokeStyle = '#241a3e'; ctx.lineWidth = 4 - i*0.3;
        ctx.beginPath(); ctx.moveTo(-11 + i*5.5, m.r - 3);
        ctx.quadraticCurveTo(-11 + i*5.5 + wig, m.r + 9, -11 + i*5.5 + wig*1.6, m.r + 14); ctx.stroke();
      }
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
      ctx.fillStyle = '#e8e2f5';
      ctx.beginPath(); ctx.ellipse(0, -4, 8, 9, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = chase ? '#ff2a2a' : '#8a2a3e';
      ctx.beginPath(); ctx.ellipse(0, -4, 3, 7.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.ellipse(0, -4, 1.4, 6, 0, 0, Math.PI*2); ctx.fill();
    } else if (t === 'wisp') {
      // 幽火：三层焰体 + 余烬
      const fl = Math.sin(m.anim * 10) * 3;
      ctx.fillStyle = 'rgba(90,208,232,.16)';
      ctx.beginPath(); ctx.arc(0, 0, m.r + 8, 0, Math.PI*2); ctx.fill();
      const flame = (rr, top, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -top - fl);
        ctx.quadraticCurveTo(rr, -top*0.2, rr*0.62, m.r*0.6);
        ctx.quadraticCurveTo(0, m.r + 3, -rr*0.62, m.r*0.6);
        ctx.quadraticCurveTo(-rr, -top*0.2, 0, -top - fl);
        ctx.fill();
      };
      flame(m.r + 2, m.r + 8, 'rgba(60,150,190,.75)');
      flame(m.r - 2, m.r + 3, '#5ad0e8');
      flame(m.r - 6, m.r - 3, '#b8f0fa');
      ctx.strokeStyle = 'rgba(28,23,48,.6)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const ex = Math.sin(m.anim * 4 + i * 2.1) * 12;
        const ey = -m.r - 6 - ((m.anim * 30 + i * 17) % 22);
        ctx.fillStyle = 'rgba(140,230,250,.7)';
        ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = chase ? '#ff5c5c' : '#16506a';
      ctx.beginPath(); ctx.arc(-3.5, -3, 2, 0, Math.PI*2); ctx.arc(3.5, -3, 2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
    } else if (t === 'slime') {
      // 裂形泥怪：果冻高光 + 气泡 + 滴落
      const squish = 1 + Math.sin(m.anim * 6) * 0.08;
      ctx.fillStyle = grad(chase ? '#8ab84e' : '#7aa848', '#3a5c20', m.r);
      ctx.beginPath();
      ctx.ellipse(0, 2, m.r * squish, m.r / squish, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.beginPath(); ctx.ellipse(-m.r*0.35, -m.r*0.32, m.r*0.34, m.r*0.2, 0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 0; i < 3; i++) {
        const bx = Math.sin(m.anim*2 + i*2.2) * m.r*0.4;
        const by = 2 + Math.cos(m.anim*1.6 + i*1.8) * m.r*0.3;
        ctx.beginPath(); ctx.arc(bx, by, 2 + i*0.7, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = chase ? '#8ab84e' : '#7aa848';
      ctx.beginPath(); ctx.ellipse(m.r*0.75, m.r*0.85 + Math.sin(m.anim*6)*2, 3, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#243a10';
      ctx.beginPath(); ctx.arc(-5, -2, 3, 0, Math.PI*2); ctx.arc(5, -2, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath(); ctx.arc(-4.2, -3, 1, 0, Math.PI*2); ctx.arc(5.8, -3, 1, 0, Math.PI*2); ctx.fill();
    } else if (t === 'banshee') {
      // 尖啸者：飘发 + 空洞裂口
      ctx.fillStyle = grad('#ded6f0', '#9a90b8', m.r);
      ctx.beginPath();
      ctx.arc(0, -2, m.r, Math.PI, 0);
      for (let i = 0; i <= 3; i++) {
        const wx = m.r - (i * m.r * 2 / 3);
        const wy = m.r + Math.sin(m.anim * 8 + i * 2) * 4;
        ctx.quadraticCurveTo(wx + m.r/3, wy + 7, wx, wy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,110,160,.8)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const hx = -8 + i * 5.3;
        ctx.beginPath(); ctx.moveTo(hx, -m.r + 2);
        ctx.quadraticCurveTo(hx - 4 + Math.sin(m.anim*6 + i)*4, -m.r - 8, hx - 7 + Math.sin(m.anim*5 + i)*5, -m.r - 13); ctx.stroke();
      }
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
      const mouth = m.windupT > 0 || m.fleeT > 3 ? 8 : 4 + Math.sin(m.anim * 3) * 1.5;
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.ellipse(0, 1, 4.5, mouth, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0d0a1c';
      ctx.beginPath(); ctx.ellipse(-5, -7, 3, 4, 0.2, 0, Math.PI*2); ctx.ellipse(5, -7, 3, 4, -0.2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b8e0ff';
      ctx.beginPath(); ctx.arc(-5, -7, 1.1, 0, Math.PI*2); ctx.arc(5, -7, 1.1, 0, Math.PI*2); ctx.fill();
    } else if (t === 'skeleton') {
      // 骨戟卫兵：颅骨 + 骨盾 + 戟
      ctx.save();
      ctx.rotate(Math.atan2(Math.sin(m.faceDir), Math.cos(m.faceDir)) * 0); // 保持正面
      // 戟
      ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(12, -20); ctx.stroke();
      ctx.fillStyle = '#c9ced8'; ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(12, -20); ctx.quadraticCurveTo(20, -16, 12, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      // 躯干骨架
      ctx.fillStyle = grad('#e8e4d8', '#a8a294', m.r);
      ctx.beginPath(); ctx.ellipse(0, 2, m.r - 3, m.r - 1, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#8a8474'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-8, -2 + i*5); ctx.lineTo(8, -2 + i*5); ctx.stroke(); }
      // 颅骨
      ctx.fillStyle = grad('#f5f2e8', '#c9c2b0', 10);
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, -9, 9, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = chase ? '#ff5c5c' : '#3c3428';
      ctx.beginPath(); ctx.arc(-3.5, -10, 2.4, 0, Math.PI*2); ctx.arc(3.5, -10, 2.4, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#8a8474'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.stroke();
      // 骨盾（面朝方向）
      ctx.save();
      ctx.rotate(m.faceDir);
      ctx.fillStyle = grad('#d8d2c0', '#948e7c', 12);
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(13, 0, 5, 13, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6b6552'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(13, -8); ctx.lineTo(13, 8); ctx.stroke();
      ctx.restore();
      ctx.restore();
    } else if (t === 'watcher') {
      // 咒眼：漂浮巨眼，虹膜追踪玩家
      const target = this.nearestActivePlayer(m.x, m.y);
      let ia = 0;
      if (target) ia = Math.atan2(target.y - m.y, target.x - m.x);
      ctx.fillStyle = 'rgba(180,138,255,.15)';
      ctx.beginPath(); ctx.arc(0, 0, m.r + 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = grad('#f5f0ff', '#c0b4d8', m.r);
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // 血丝
      ctx.strokeStyle = 'rgba(200,80,100,.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const aa = i * 1.7 + 0.4;
        ctx.beginPath(); ctx.moveTo(Math.cos(aa)*m.r*0.9, Math.sin(aa)*m.r*0.9);
        ctx.lineTo(Math.cos(aa+0.3)*m.r*0.55, Math.sin(aa+0.3)*m.r*0.55); ctx.stroke();
      }
      ctx.strokeStyle = '#1c1730'; ctx.lineWidth = 2.5;
      const gaze = Math.min(1, m.gazeT / 1.8);
      ctx.fillStyle = gaze > 0.5 ? '#ff3a3a' : '#7a4ab8';
      ctx.beginPath(); ctx.arc(Math.cos(ia)*4.5, Math.sin(ia)*4.5, 6.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.arc(Math.cos(ia)*5.5, Math.sin(ia)*5.5, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(Math.cos(ia)*4 - 2, Math.sin(ia)*4 - 3, 1.4, 0, Math.PI*2); ctx.fill();
      // 凝视进度环
      if (m.gazeT > 0.2) {
        ctx.strokeStyle = 'rgba(255,58,58,.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 5, -Math.PI/2, -Math.PI/2 + gaze * Math.PI*2); ctx.stroke();
      }
    } else {
      // 幽影：多层雾体 + 内芯冷光 + 飘尾
      ctx.fillStyle = 'rgba(90,70,140,.16)';
      ctx.beginPath(); ctx.arc(0, -2, m.r + 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = grad(chase ? '#8a4a74' : '#6a5a9c', chase ? '#4a1c38' : '#352a58', m.r);
      ctx.beginPath();
      ctx.arc(0, -2, m.r, Math.PI, 0);
      for (let i = 0; i <= 4; i++) {
        const wx = m.r - (i * m.r / 2);
        const wy = m.r - 4 + Math.sin(m.anim * 6 + i) * 3;
        ctx.quadraticCurveTo(wx + m.r/4, wy + 6, wx, wy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 内芯冷光
      ctx.fillStyle = chase ? 'rgba(255,110,110,.25)' : 'rgba(160,190,255,.18)';
      ctx.beginPath(); ctx.arc(0, -1, m.r*0.55, 0, Math.PI*2); ctx.fill();
      // 飘尾
      ctx.strokeStyle = chase ? 'rgba(160,80,120,.5)' : 'rgba(110,95,170,.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-m.r*0.5, m.r - 2);
      ctx.quadraticCurveTo(-m.r*0.8 + Math.sin(m.anim*5)*4, m.r + 8, -m.r*0.4, m.r + 12); ctx.stroke();
      const eye = chase ? '#ff5c5c' : (m.stunT > 0 ? '#9fd8ff' : '#ffe28a');
      ctx.fillStyle = eye;
      ctx.beginPath(); ctx.ellipse(-6, -6, 3.2, chase ? 4 : 3.2, chase ? 0.3 : 0, 0, Math.PI*2);
      ctx.ellipse(6, -6, 3.2, chase ? 4 : 3.2, chase ? -0.3 : 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.arc(-6, -6, 1.3, 0, Math.PI*2); ctx.arc(6, -6, 1.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    if (m.stunT > 0) { ctx.fillStyle = '#9fd8ff'; ctx.fillText(m.slowT > 0 || m.stunT > 1 ? '❄' : '♪', sx, sy - m.r - 10); }
    else if (m.slowT > 0) { ctx.fillStyle = '#bfe9ff'; ctx.fillText('❄', sx, sy - m.r - 10); }
    else if (m.state === 'chase') { ctx.fillStyle = '#ff5c5c'; ctx.fillText('!', sx, sy - m.r - 10); }
    else if (m.state === 'investigate') { ctx.fillStyle = '#ffd93d'; ctx.fillText('?', sx, sy - m.r - 10); }
    if (m.hpShowT > 0) {
      const w = m.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w/2, sy - m.r - 18, w, 5);
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(sx - w/2, sy - m.r - 18, w * Math.max(0, m.hp / m.maxHp), 5);
    }
  }

  // 雇佣兵：戴贝雷帽的战斗鸭
  // —— 卡通枪械手持造型（原点=持枪手，朝 +x）——
  drawGun(ctx, def) {
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5;
    const id = def.id;
    if (id === 'ak') {
      ctx.fillStyle = '#7a4a26';                                    // 木托
      ctx.fillRect(4, -3, 7, 6); ctx.strokeRect(4, -3, 7, 6);
      ctx.fillStyle = '#3a3a44';                                    // 机匣+枪管
      ctx.fillRect(10, -3, 16, 5); ctx.strokeRect(10, -3, 16, 5);
      ctx.fillRect(26, -1.5, 6, 2.5);
      ctx.fillStyle = '#7a4a26';                                    // 弯弹匣
      ctx.beginPath(); ctx.moveTo(15, 2); ctx.quadraticCurveTo(15, 9, 20, 10); ctx.lineTo(21, 6); ctx.quadraticCurveTo(18, 5, 18, 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (id === 'mg3') {
      ctx.fillStyle = '#33333e';                                    // 长机匣
      ctx.fillRect(6, -4, 24, 7); ctx.strokeRect(6, -4, 24, 7);
      ctx.fillRect(30, -2, 8, 3);                                    // 粗枪管
      ctx.fillStyle = '#4a4a58';                                     // 弹箱
      ctx.fillRect(12, 3, 8, 6); ctx.strokeRect(12, 3, 8, 6);
      ctx.strokeStyle = '#555';                                      // 两脚架
      ctx.beginPath(); ctx.moveTo(28, 3); ctx.lineTo(24, 9); ctx.moveTo(28, 3); ctx.lineTo(32, 9); ctx.stroke();
    } else if (id === 'rpg') {
      ctx.fillStyle = '#4a5a3a';                                     // 发射筒
      ctx.fillRect(2, -4, 26, 8); ctx.strokeRect(2, -4, 26, 8);
      ctx.fillStyle = '#5c1420';                                     // 弹头
      ctx.beginPath(); ctx.moveTo(28, -5); ctx.lineTo(36, 0); ctx.lineTo(28, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (id === 'sniper' || id === 'rifle') {
      ctx.fillStyle = id === 'sniper' ? '#2c3444' : '#5a4a30';
      ctx.fillRect(6, -2.5, 26, 5); ctx.strokeRect(6, -2.5, 26, 5);
      ctx.fillRect(32, -1.2, 6, 2.4);
      ctx.fillStyle = '#222';                                         // 瞄具
      ctx.fillRect(14, -6, 9, 3); ctx.strokeRect(14, -6, 9, 3);
    } else if (id === 'shotgun') {
      ctx.fillStyle = '#6a4426';
      ctx.fillRect(4, -3, 8, 6); ctx.strokeRect(4, -3, 8, 6);
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(12, -3.5, 18, 3); ctx.fillRect(12, 0.5, 18, 3);
      ctx.strokeRect(12, -3.5, 18, 3); ctx.strokeRect(12, 0.5, 18, 3);
    } else if (id === 'smg') {
      ctx.fillStyle = '#444452';
      ctx.fillRect(7, -3, 14, 6); ctx.strokeRect(7, -3, 14, 6);
      ctx.fillRect(21, -1.5, 5, 3);
      ctx.fillStyle = '#33333e';
      ctx.fillRect(12, 3, 4, 7); ctx.strokeRect(12, 3, 4, 7);
    } else if (id === 'flamer' || id === 'frost' || id === 'freezer') {
      const col = id === 'flamer' ? '#a04a20' : '#3a6a8a';
      ctx.fillStyle = col;
      ctx.fillRect(6, -4, 12, 8); ctx.strokeRect(6, -4, 12, 8);     // 罐体
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(18, -2, 12, 4); ctx.strokeRect(18, -2, 12, 4);   // 喷管
      ctx.fillStyle = id === 'flamer' ? '#ff9a4d' : '#9fd8ff';
      ctx.beginPath(); ctx.arc(31, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'crossbow') {
      ctx.fillStyle = '#5a4a30';
      ctx.fillRect(6, -2, 20, 4); ctx.strokeRect(6, -2, 20, 4);
      ctx.strokeStyle = '#8a6a3b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(22, -9); ctx.quadraticCurveTo(30, 0, 22, 9); ctx.stroke();
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22, -9); ctx.lineTo(10, 0); ctx.lineTo(22, 9); ctx.stroke();
    } else if (id === 'revolver') {
      ctx.fillStyle = '#6a6a78';
      ctx.fillRect(8, -2.5, 15, 5); ctx.strokeRect(8, -2.5, 15, 5);
      ctx.beginPath(); ctx.arc(13, 1, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();  // 转轮
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(5, 1, 5, 6); ctx.strokeRect(5, 1, 5, 6);
    } else {
      ctx.fillStyle = '#3a3a48';
      ctx.fillRect(8, -3, 16, 6); ctx.strokeRect(8, -3, 16, 6);
      ctx.fillStyle = '#55555f';
      ctx.fillRect(10, 3, 4, 5);
    }
  }

  drawMerc(ctx, mc, sx, sy) {
    const walk = mc.moving ? Math.sin(mc.anim * 11) : 0;
    const fx = Math.cos(mc.facing), fy = Math.sin(mc.facing);
    // 贴图佣兵（金币嗅探犬）：像素狗 + 描边 + 名牌血条
    if (mc.def.sprite && typeof MonsterImages !== 'undefined' && MonsterImages[mc.def.sprite] && MonsterImages[mc.def.sprite].naturalWidth) {
      ctx.save();
      ctx.translate(sx, sy + Math.abs(walk) * -3);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(0, 13 + Math.abs(walk) * 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.imageSmoothingEnabled = false;
      if (fx > 0.2) ctx.scale(-1, 1);    // 素材原生朝左
      ctx.drawImage(MonsterImages[mc.def.sprite], -16, -16, 32, 32);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
      ctx.font = 'bold 10px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = mc.def.color;
      ctx.fillText(mc.def.name.split('·')[1] || mc.def.name, sx, sy - 22);
      const w2 = 26;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w2/2, sy - 18, w2, 3.5);
      ctx.fillStyle = '#7dff9a'; ctx.fillRect(sx - w2/2, sy - 18, w2 * Math.max(0, mc.hp / mc.maxHp), 3.5);
      return;
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (mc.hurtCd > 0 && Math.floor(mc.anim * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 11, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath(); ctx.ellipse(-5, 13 + walk * 2, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, 13 - walk * 2, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e8ddc8';
    ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 14, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#c76f00'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(fx * 10, fy * 10 - 3, 6, 4, mc.facing, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#241f38';
    ctx.beginPath(); ctx.arc(fx * 5 - 3.5, fy * 5 - 6, 2, 0, Math.PI*2); ctx.arc(fx * 5 + 3.5, fy * 5 - 6, 2, 0, Math.PI*2); ctx.fill();
    // 贝雷帽（按雇佣兵等级配色）
    ctx.fillStyle = mc.def.color;
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-2, -11, 10, 5, -0.15, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -13, 2, 0, Math.PI*2); ctx.fill();
    // 武器
    ctx.save();
    ctx.rotate(mc.facing);
    if (mc.def.sword && typeof MonsterImages !== 'undefined' && MonsterImages.fx_sword && MonsterImages.fx_sword.naturalWidth) {
      // 鸭灵：圣剑（攻击时挥舞）
      mc.swingT = Math.max(0, (mc.swingT || 0) - 0.016);
      ctx.save();
      ctx.translate(10, 0);
      ctx.rotate(mc.swingT > 0 ? (0.25 - mc.swingT) * 10 - 0.9 : Math.sin(mc.anim * 3) * 0.15 + 0.45);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(MonsterImages.fx_sword, -4, -22, 26, 26);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
    }
    else if (mc.def.melee) { ctx.fillStyle = '#555'; ctx.fillRect(8, -2, 10, 4); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(21, 0, 6, 0, Math.PI*2); ctx.fill(); }
    else { ctx.fillStyle = '#3a3a48'; ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5; ctx.fillRect(7, -3, 15, 5); ctx.strokeRect(7, -3, 15, 5); }
    ctx.restore();
    ctx.restore();
    // 名牌 + 血条
    ctx.font = 'bold 10px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = mc.def.color;
    ctx.fillText(mc.def.name, sx, sy - 26);
    const w = 26;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w/2, sy - 22, w, 3.5);
    ctx.fillStyle = '#7dff9a'; ctx.fillRect(sx - w/2, sy - 22, w * Math.max(0, mc.hp / mc.maxHp), 3.5);
  }

  drawPlayer(ctx, p, sx, sy) {
    const skin = p.skin;
    const walk = p.moving ? Math.sin(p.anim * 12) : 0;
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    // 光环（身体之下）
    const aura = p.acc && p.acc.kind === 'aura' ? p.acc : (skin.golden ? { color: '255,215,90' } : null);
    if (aura && !p.downed) {
      const rr = 26 + Math.sin(this.time * 3 + p.idx) * 3;
      let color = aura.color;
      if (color === 'rainbow') {
        const hue = (this.time * 60) % 360;
        ctx.fillStyle = `hsla(${hue}, 85%, 65%, 0.28)`;
      } else ctx.fillStyle = `rgba(${color}, 0.26)`;
      ctx.beginPath(); ctx.arc(sx, sy + 2, rr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = color === 'rainbow' ? `hsla(${(this.time * 60 + 40) % 360}, 85%, 70%, .5)` : `rgba(${color}, .5)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy + 2, rr, 0, Math.PI*2); ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, sy);
    if (p.rollT > 0) ctx.rotate((1 - p.rollT / STAMINA.rollDur) * Math.PI * 2 * (Math.cos(p.rollDir) < 0 ? -1 : 1));
    if (p.downed) { ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.8; }
    if (p.hurtCd > 0 && Math.floor(p.anim * 20) % 2) ctx.globalAlpha = 0.4;
    if (p.invisT > 0) ctx.globalAlpha = 0.35;           // 隐身半透明
    else if (p.sneak) ctx.globalAlpha = 0.7;            // 潜行微透明
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, PLAYER_R + 2, PLAYER_R - 2, 5, 0, 0, Math.PI*2); ctx.fill();

    const img = skin.kind === 'img' && SkinImages[skin.id];
    if (img && img.complete && img.naturalWidth) {
      const squash = 1 + Math.abs(walk) * 0.06;
      const size = 40 * (img.drawScale || 1);
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath(); ctx.ellipse(-6, PLAYER_R + walk * 2, 5, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, PLAYER_R - walk * 2, 5, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.save();
      ctx.scale(Math.cos(p.facing) < -0.3 ? -1 : 1, 1);
      ctx.drawImage(img, -size/2, -size/2 - 4 - Math.abs(walk) * 2, size / squash, size * squash);
      ctx.restore();
    } else if (skin.kind === 'ghost') {
      ctx.fillStyle = skin.body;
      ctx.strokeStyle = '#241f38'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -2, PLAYER_R, Math.PI, 0);
      for (let i = 0; i <= 4; i++) {
        const wx = PLAYER_R - (i * PLAYER_R / 2);
        const wy = PLAYER_R - 3 + Math.sin(p.anim * 6 + i) * 2;
        ctx.quadraticCurveTo(wx + PLAYER_R/4, wy + 5, wx, wy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#c76f00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(fx * 10, fy * 10 - 3, 6, 4, p.facing, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath(); ctx.arc(fx * 4 - 4, fy * 4 - 7, 3, 0, Math.PI*2); ctx.arc(fx * 4 + 4, fy * 4 - 7, 3, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath(); ctx.ellipse(-6, PLAYER_R - 1 + walk * 2, 5, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, PLAYER_R - 1 - walk * 2, 5, 3, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = skin.body;
      ctx.strokeStyle = '#241f38'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, PLAYER_R, PLAYER_R + 1 + Math.abs(walk), 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = skin.wing;
      ctx.beginPath(); ctx.ellipse(-PLAYER_R + 4, 3, 5, 8, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#c76f00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(fx * 12, fy * 12 - 4, 7, 4.5, p.facing, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(fx * 5 - 4, fy * 5 - 8, 4, 0, Math.PI*2); ctx.arc(fx * 5 + 4, fy * 5 - 8, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#241f38';
      ctx.beginPath(); ctx.arc(fx * 7 - 4, fy * 7 - 8, 2, 0, Math.PI*2); ctx.arc(fx * 7 + 4, fy * 7 - 8, 2, 0, Math.PI*2); ctx.fill();
    }

    // 帽子装饰
    if (p.acc && p.acc.kind === 'hat' && !p.downed) {
      ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2;
      if (p.acc.style === 'pirate') {
        ctx.fillStyle = '#26202e';
        ctx.beginPath(); ctx.moveTo(-15, -12); ctx.quadraticCurveTo(0, -26, 15, -12);
        ctx.quadraticCurveTo(0, -17, -15, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f5f2ea';
        ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('☠', 0, -15);
      } else {
        ctx.fillStyle = '#f5f5f0';
        ctx.beginPath(); ctx.ellipse(0, -13, 12, 4.5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3a5a78';
        ctx.fillRect(-8, -21, 16, 8); ctx.strokeRect(-8, -21, 16, 8);
        ctx.fillStyle = '#ffd93d'; ctx.fillRect(-8, -15, 16, 2);
      }
    }
    const def = p.weaponDef();
    if (!p.downed && def.id !== 'fists') {
      ctx.save();
      ctx.rotate(p.facing + (p.swing > 0 ? Math.sin(p.swing * 30) * 0.8 : 0));
      if (def.id === 'dagger') {
        ctx.fillStyle = '#c9ced8'; ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(24, -3); ctx.lineTo(26, 0); ctx.lineTo(24, 3); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (def.melee) {
        ctx.fillStyle = '#555'; ctx.fillRect(10, -2, 12, 4);
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(26, 0, 8, 0, Math.PI*2); ctx.fill();
      } else if (def.id === 'laser') {
        ctx.fillStyle = '#3a5a68'; ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5;
        ctx.fillRect(8, -4, 20, 8); ctx.strokeRect(8, -4, 20, 8);
        ctx.fillStyle = '#7ef7ff'; ctx.fillRect(24, -2, 5, 4);
      } else {
        this.drawGun(ctx, def);   // 按武器族的卡通枪械造型
      }
      ctx.restore();
    }
    ctx.restore();

    // —— 临时护盾泡泡 ——
    if (p.tempShield > 0 && !p.downed) {
      ctx.strokeStyle = `rgba(140,210,255,${0.35 + Math.sin(p.anim * 5) * 0.12})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx, sy - 2, PLAYER_R + 8, 0, Math.PI * 2); ctx.stroke();
    }
    // —— 头顶状态条：生命 / 体力 / 护甲 ——
    if (p.active) {
      const bw = 40, bx = sx - bw / 2;
      let by = sy - 34;
      ctx.fillStyle = 'rgba(8,6,20,.72)';
      ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, (p.armor ? 13 : 9.5));
      const hpPct = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = hpPct > 0.5 ? '#7dff9a' : hpPct > 0.25 ? '#ffd93d' : '#ff5c5c';
      ctx.fillRect(bx, by, bw * hpPct, 4);
      by += 5.5;
      ctx.fillStyle = p.staminaFreeT > 0 ? '#ffd93d' : '#5ad0e8';
      ctx.fillRect(bx, by, bw * Math.max(0, p.stamina / STAMINA.max), 2.6);
      if (p.armor) {
        by += 4;
        const adef = ARMORS[p.armor.id];
        ctx.fillStyle = '#c9d6e4';
        ctx.fillRect(bx, by, bw * Math.max(0, p.armor.dur / adef.pool), 2.6);
      }
      // 换弹进度环
      if (p.reloadT > 0) {
        const def = p.weaponDef();
        const t = 1 - p.reloadT / (def.reload || 1.2);
        ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 22, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
        ctx.font = 'bold 10px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd93d';
        ctx.fillText('装填…', sx, sy + 34);
      }
    }
    if (p.bag.length && !p.downed) {
      const top = p.bag.reduce((a, b) => RARITY_ORDER.indexOf(b.rarity) > RARITY_ORDER.indexOf(a.rarity) ? b : a);
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(top.icon, sx, sy - 44 + Math.sin(p.anim * 3) * 2);
    }
    if (this.mode === 2) {
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = p.skin.body;
      ctx.fillText(`${p.idx+1}P`, sx, sy - 40);
    }
    if (p.suspectedT > 0 && p.active) {
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 10) * 0.4;
      ctx.fillText('👁', sx, sy - 52);
      ctx.globalAlpha = 1;
    }
    if (p.sneak && p.active) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(159,216,255,.8)';
      ctx.fillText('🤫', sx + 16, sy - 24);
    }
    // 隐身药效倒计时（环 + 秒数）
    if (p.invisT > 0 && p.active) {
      const frac = p.invisT / CONSUMABLES.stealth.invis;
      ctx.strokeStyle = 'rgba(180,138,255,.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 22, -Math.PI/2, -Math.PI/2 + frac * Math.PI*2); ctx.stroke();
      ctx.font = 'bold 12px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#b48aff';
      ctx.fillText(`🌫️${Math.ceil(p.invisT)}s`, sx, sy - 48);
    }
    if (p.downed) {
      ctx.strokeStyle = 'rgba(255,92,92,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 24, -Math.PI/2, -Math.PI/2 + (p.bleed / 25) * Math.PI*2); ctx.stroke();
      if (p.reviveProgress > 0) {
        ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(sx, sy, 30, -Math.PI/2, -Math.PI/2 + (p.reviveProgress / 2.5) * Math.PI*2); ctx.stroke();
      }
    }
    if (p.extractProgress > 0) {
      ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sx, sy, 26, -Math.PI/2, -Math.PI/2 + (p.extractProgress / 2) * Math.PI*2); ctx.stroke();
      ctx.font = 'bold 12px "PingFang SC",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7dff9a';
      ctx.fillText('撤离中…', sx, sy - 44);
    }
  }

  drawInteractionUI(ctx, cam) {
    for (const p of this.players) {
      if (!p.active) continue;
      const km = KEYMAP[p.idx];
      const mate = this.players.find(o => o !== p && o.downed && Math.hypot(o.x-p.x, o.y-p.y) < 58);
      const chest = !mate && this.chests.find(c => !c.opened && Math.hypot(c.x-p.x, c.y-p.y) < 56);
      const merch = !mate && !chest && this.merchant && Math.hypot(this.merchant.x-p.x, this.merchant.y-p.y) < 60 ? this.merchant : null;
      const target = mate || chest || merch;
      if (!target) continue;
      const sx = target.x - cam.x, sy = target.y - cam.y - 40;
      ctx.font = 'bold 12px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      const label = mate ? `按住 ${km.labels.interact} 救援` : chest ? `按住 ${km.labels.interact} 开箱` : `按 ${km.labels.interact} 交易`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(20,16,40,.85)';
      this.rrect(ctx, sx - w/2, sy - 12, w, 20, 6); ctx.fill();
      ctx.fillStyle = p.skin.body;
      ctx.fillText(label, sx, sy + 2);
    }
  }

  drawArrow(ctx, p, tx, ty, color, cam) {
    const a = Math.atan2(ty - p.y, tx - p.x);
    const sx = p.x - cam.x + Math.cos(a) * 46;
    const sy = p.y - cam.y + Math.sin(a) * 46;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- HUD ----------
  // —— 左侧盟友面板：所有佣兵/召唤物统一显示（头像/血条/攻击力/复活倒计时，阵亡变灰） ——
  allyAvatar(def) {
    Game._avCache = Game._avCache || {};
    if (Game._avCache[def.id]) return Game._avCache[def.id];
    const c = document.createElement('canvas');
    c.width = c.height = 36;
    const x = c.getContext('2d');
    if (def.sprite && typeof MonsterImages !== 'undefined' && MonsterImages[def.sprite] && MonsterImages[def.sprite].naturalWidth) {
      x.imageSmoothingEnabled = false;
      x.drawImage(MonsterImages[def.sprite], 2, 2, 32, 32);
    } else {
      // 程序鸭头像：底色鸭 + 贝雷帽
      x.fillStyle = '#e8ddc8'; x.strokeStyle = '#100e1d'; x.lineWidth = 2;
      x.beginPath(); x.ellipse(18, 20, 11, 12, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#ff9f1c';
      x.beginPath(); x.ellipse(26, 20, 5, 3.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#100e1d';
      x.beginPath(); x.arc(21, 15, 1.8, 0, Math.PI * 2); x.fill();
      x.fillStyle = def.color || '#888';
      x.beginPath(); x.ellipse(16, 9, 9, 4.5, -0.15, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    Game._avCache[def.id] = c.toDataURL();
    return Game._avCache[def.id];
  }
  renderAllyPanel() {
    const el = document.getElementById('ally-panel');
    if (!el) return;
    const rows = [];
    for (const mc of this.mercs) {
      if (mc.hp <= 0) continue;
      const frac = Math.max(0, mc.hp / mc.maxHp);
      const stat = mc.def.heal ? `💚${mc.def.heal}/次` : mc.def.fetch ? '🐾拾取' : mc.def.mage ? '🔮法术' : `⚔️${mc.def.dmg}`;
      rows.push(`<div class="ally-row">
        <img src="${this.allyAvatar(mc.def)}" class="ally-av">
        <div class="ally-info">
          <div class="ally-name">${mc.def.name.split('·')[0]}</div>
          <div class="ally-hpbar"><i style="width:${Math.round(frac * 100)}%"></i></div>
          <div class="ally-meta">${stat}${mc.despawnT !== undefined ? ` · ⏳${Math.ceil(mc.despawnT)}s` : ''}</div>
        </div>
      </div>`);
    }
    // 鸭灵复活倒计时
    if (this.horde && this.hordeState.ex && this.hordeState.ex.petQueue) {
      for (const q of this.hordeState.ex.petQueue) {
        rows.push(`<div class="ally-row dead">
          <img src="${this.allyAvatar({ id: 'petduck_gray', color: '#ffd93d' })}" class="ally-av">
          <div class="ally-info"><div class="ally-name">鸭灵</div><div class="ally-meta">💤 复活 ${Math.max(0, q).toFixed(1)}s</div></div>
        </div>`);
      }
    }
    // 阵亡名单（灰头像）
    for (const f of (this.allyFallen || []).slice(-4)) {
      rows.push(`<div class="ally-row dead">
        <img src="${this.allyAvatar(MERCS[f.id] || { id: f.id })}" class="ally-av">
        <div class="ally-info"><div class="ally-name">${f.name.split('·')[0]}</div><div class="ally-meta">☠️ 阵亡</div></div>
      </div>`);
    }
    const html = rows.length ? rows.join('') : '';
    if (this._allyHtml !== html) {
      this._allyHtml = html;
      el.innerHTML = html;
      el.style.display = html ? '' : 'none';
    }
  }

  updateHud() {
    this._allyT = (this._allyT || 0) - 1;
    if (this._allyT <= 0) { this._allyT = 12; this.renderAllyPanel(); }
    let anyLow = false;
    for (const p of this.players) {
      const el = document.getElementById(`hud-bot-p${p.idx + 1}`);
      if (!el) continue;
      const hpPct = Math.max(0, p.hp / p.maxHp * 100);
      if (p.active && hpPct < 30) anyLow = true;
      el.querySelector('.hp-fill').style.width = hpPct + '%';
      el.querySelector('.hp-fill').style.background = hpPct > 50 ? '#7dff9a' : hpPct > 25 ? '#ffd93d' : '#ff5c5c';
      // 护甲条
      const armorFill = el.querySelector('.armor-fill');
      if (p.armor) {
        const adef = ARMORS[p.armor.id];
        armorFill.parentElement.style.display = '';
        armorFill.style.width = Math.max(0, p.armor.dur / adef.pool * 100) + '%';
      } else armorFill.parentElement.style.display = 'none';
      el.querySelector('.hud-status').textContent =
        p.extracted ? '✅ 已撤离' : p.dead ? '💀 阵亡' : p.downed ? '🆘 倒地！' : '';
      // 双武器槽
      const slots = el.querySelectorAll('.wslot');
      for (let s = 0; s < 2; s++) {
        const inst = p.weapons[s];
        const d = inst && inst.dur > 0 ? WEAPONS[inst.id] : (inst ? WEAPONS[inst.id] : null);
        let text;
        if (!inst) text = '—';
        else {
          const wd = WEAPONS[inst.id];
          if (wd.melee) {
            text = this.horde ? `${wd.icon} ∞` : `${wd.icon}${inst.dur <= 0 ? '✖' : Math.ceil(inst.dur)}`;
          } else {
            const cap = p.magCap(s) || wd.mag;
            const magNow = s === p.activeSlot && p.reloadT > 0 ? '…' : (p.mags[s] === null ? cap : p.mags[s]);
            const reserve = this.horde ? '∞' : `${AMMO_TYPES[wd.ammo].icon}${SAVE.ammo[wd.ammo]}`;
            text = `${wd.icon}${magNow}/${cap}·${reserve}`;
          }
        }
        slots[s].textContent = text;
        slots[s].classList.toggle('on', s === p.activeSlot);
      }
      // 药品 / 负重 / 背包可视化
      const ck = CONSUM_ORDER[p.consumSel];
      el.querySelector('.hud-consum').textContent = `${CONSUMABLES[ck].icon}${CONSUMABLES[ck].name} ×${SAVE.consumables[ck]}`;
      const lf = p.loadFactor();
      const wEl = el.querySelector('.hud-weight');
      wEl.textContent = `⚖️${Math.round(lf * 100)}%`;
      wEl.style.color = lf >= 0.8 ? '#ff5c5c' : lf <= 0.35 ? '#7dff9a' : '#a99fc7';
      el.querySelector('.hud-bag-info').textContent = this.horde
        ? `Lv.${this.hordeState.level} · ⚔️${p.kills}`
        : `🎒${p.bagUsed}/${p.bagCap} · 💰${p.carriedValue}`;
      const sig = p.bag.map(t => t.id).join(',') + '|' + p.bagCap;
      if (this.bagSig[p.idx] !== sig) {
        this.bagSig[p.idx] = sig;
        let html = '';
        let used = 0;
        for (const t of p.bag) {
          html += `<span class="bag-cell filled r-${t.rarity}" title="${t.name}">${t.icon}${t.size > 1 ? `<i>${t.size}</i>` : ''}</span>`;
          used += t.size;
        }
        for (let i = used; i < p.bagCap; i++) html += '<span class="bag-cell"></span>';
        if (!p.pouch) html += '<span class="bag-cell locked">👝</span>';
        el.querySelector('.bag-strip').innerHTML = html;
      }
      const fx = [];
      if (p.sneak) fx.push('🤫潜行');
      if (p.invisT > 0) fx.push(`🌫️隐身${Math.ceil(p.invisT)}s`);
      if (p.rageT > 0) fx.push('😡狂暴');
      if (p.sodaTime > 0) fx.push('🥤加速');
      if (p.visionMul() > (MapData.mods.playerVision || 1)) fx.push('🏮视野+');
      const myMerc = this.mercs.find(mc => mc.owner === p);
      if (myMerc) fx.push(`${myMerc.def.icon}佣兵${Math.ceil(myMerc.hp)}`);
      el.querySelector('.hud-fx').textContent = fx.join(' ');
    }
    const vg = document.getElementById('vignette');
    if (vg) vg.classList.toggle('lowhp', anyLow);
    document.getElementById('hud-supplies').textContent =
      `💰${SAVE.gold}${this.runCash ? ` (+${this.runCash})` : ''}`;
  }
}
