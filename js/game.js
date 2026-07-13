// ============ 游戏主循环：输入/更新/分屏渲染/小地图/商人/HUD/结算 ============
'use strict';

const VIEW_W = 1280, VIEW_H = 720;

const KEYMAP = [
  { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', interact:'KeyE', shoot:'KeyF', shoot2:null, roll:'Space',
    use:'KeyQ', cycle:'Tab', swap:'KeyR', sneak:'ShiftLeft',
    labels:{ interact:'E', shoot:'F', use:'Q', cycle:'Tab', swap:'R', sneak:'左Shift', roll:'空格' } },
  { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', interact:'Comma', shoot:'Period', shoot2:null, roll:'Slash',
    use:'KeyM', cycle:'KeyK', swap:'KeyL', sneak:'ShiftRight',
    labels:{ interact:',', shoot:'.', use:'M', cycle:'K', swap:'L', sneak:'右Shift', roll:'/' } },
];

const Input = { keys: {} };
window.addEventListener('keydown', e => {
  Input.keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)) e.preventDefault();
  if (Game.current) Game.current.onKeyDown(e.code);
});
window.addEventListener('keyup', e => { Input.keys[e.code] = false; });

class Game {
  static current = null;

  // loadouts: [{ w1, w2, armor, pouch }] 均为 uid / boolean
  constructor(mode, diffId, loadouts, mapId, skinIds, opts = {}) {
    Game.current = this;
    this.mode = mode;
    this.horde = !!opts.horde;               // 无双割草模式
    this.cfg = this.horde ? HORDE_CFG : DIFFICULTIES[diffId];
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
    for (let i = 0; i < mode; i++) {
      const sp = MapData.spawns[i];
      const lo = loadouts[i] || {};
      const w1 = SAVE.weapons.find(w => w.uid === lo.w1) || null;
      const w2 = SAVE.weapons.find(w => w.uid === lo.w2) || null;
      const armor = SAVE.armors.find(a => a.uid === lo.armor) || null;
      const p = new Player(i, sp.x, sp.y, [w1, w2], skinIds && skinIds[i], armor, lo.pouch, lo.acc);
      this.players.push(p);
      if (lo.merc && MERCS[lo.merc]) {
        const mc = new Mercenary(sp.x - 30, sp.y + 30, MERCS[lo.merc], p);
        unstick(mc);
        this.mercs.push(mc);
      }
    }

    this.chests = this.horde ? [] : placeChests(this.cfg).map(c => new Chest(c.x, c.y, c.tier));
    this.monsters = [];
    const sp0 = MapData.spawns[0];
    const nodes = MapData.monsterNodes
      .filter(n => Math.hypot(n.x - sp0.x, n.y - sp0.y) > 10 * TILE)
      .sort(() => Math.random() - 0.5);
    let ni = 0;
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
    if (this.cfg.merchant && MapData.merchantSpot) {
      this.merchant = new Merchant(MapData.merchantSpot.x, MapData.merchantSpot.y);
      const r = resolveCircle(this.merchant.x, this.merchant.y, 16);
      this.merchant.x = r.x; this.merchant.y = r.y; unstick(this.merchant);
    }

    this.bullets = [];
    this.monsterOrbs = [];
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
      this.monsters = [];
      this.hordeState = {
        level: 1, xp: 0, xpNeed: 8,
        mods: { dmg: 1, rate: 1, multi: 0, pierce: 0, range: 1, knock: 1, speed: 1, magnet: 1, lifesteal: 0, regen: 0 },
        skills: { orbit: 0, missile: 0, nova: 0, trail: 0, lightning: 0 },
        spawnT: 1.2, missileT: 2, novaT: 4, boltT: 3, trailT: 0, fireTickT: 0,
        gems: [], firePatches: [], novaRings: [], bolts: [],
        bossIdx: 0, boss: null, victory: false, freeChoices: 0,
      };
      this.levelupOpen = false;
      for (const p of this.players) { p.maxHp = 500; p.hp = 500; }
      for (let i = 0; i < 8; i++) this.spawnHordeMonster();
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
  }

  // ---------- 主循环 ----------
  frame(t) {
    if (this.over) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.paused) this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  update(dt) {
    this.time += dt;
    this.revealT = Math.max(0, this.revealT - dt);
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

    this.bullets = this.bullets.filter(b => b.update(dt, this));
    this.monsterOrbs = this.monsterOrbs.filter(o => o.update(dt, this));
    for (const f of this.floaters) { f.t -= dt; f.y -= 28 * dt; }
    this.floaters = this.floaters.filter(f => f.t > 0);
    for (const s of this.sparks) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    this.sparks = this.sparks.filter(s => s.t > 0);

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

    // —— 胜利判定：撑满时长，全场怪物化作金币雨 ——
    if (!H.victory && t >= HORDE_DURATION) {
      H.victory = true;
      Sfx.extract();
      this.shake = 12;
      for (const m of this.monsters) {
        for (let i = 0; i < 6; i++) this.spark(m.x, m.y, '#ffd93d');
        this.goldDrops.push(new GoldDrop(m.x, m.y, 10 + Math.round(Math.random() * 10)));
      }
      this.monsters = [];
      this.toast('🎉 撑过了十分钟！怪物尽数溃散成金币！', '#7dff9a');
      setTimeout(() => { if (Game.current === this) this.settle(); }, 2200);
      return;
    }
    if (H.victory) { this.hordeGems(dt); return; }

    // —— 刷怪泵：随时间加速加量 ——
    H.spawnT -= dt;
    const interval = Math.max(0.35, 2.3 - t * 0.0033);
    if (H.spawnT <= 0) {
      H.spawnT = interval;
      const batch = 1 + Math.floor(t / 70);
      for (let i = 0; i < batch; i++) {
        if (this.monsters.length >= HORDE_CAP) break;
        this.spawnHordeMonster();
      }
    }
    // —— Boss 波 ——
    if (H.bossIdx < HORDE_BOSS_AT.length && t >= HORDE_BOSS_AT[H.bossIdx]) {
      H.bossIdx++;
      this.spawnHordeBoss();
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
          const a = this.time * 3.2 + i * Math.PI * 2 / n + p.idx * 0.5;
          const ox = p.x + Math.cos(a) * 78, oy = p.y + Math.sin(a) * 78;
          for (const m of this.monsters) {
            if ((m.orbitCd || 0) > this.time) continue;
            if (Math.hypot(m.x - ox, m.y - oy) < m.r + 15) {
              m.orbitCd = this.time + 0.45;
              m.knock(a + Math.PI / 2, 460);
              if (m.hurt(Math.round(16 * H.mods.dmg), this)) this.killMonster(m, p);
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
        H.missileT = Math.max(0.55, 1.9 - H.skills.missile * 0.22);
        const shooters = this.players.filter(p => p.active);
        for (const p of shooters) {
          const targets = this.monsters.filter(m => Math.hypot(m.x - p.x, m.y - p.y) < 700);
          if (!targets.length) continue;
          const count = 1 + Math.floor(H.skills.missile / 3);
          for (let i = 0; i < count; i++) {
            const tgt = targets[Math.floor(Math.random() * targets.length)];
            const a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + (Math.random() - 0.5) * 0.6;
            this.bullets.push(new Bullet(p.x, p.y, a,
              { id: 'duckmissile', dmg: 15 + H.skills.missile * 5, speed: 400, range: 950,
                knock: 140, turn: 7, duck: true }, p, H.mods.dmg));
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
            if (m.hurt(Math.round((13 + H.skills.nova * 6) * H.mods.dmg), this)) this.killMonster(m, p);
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
            if (m.hurt(Math.round((5 + H.skills.trail * 3) * H.mods.dmg), this)) this.killMonster(m, this.players[0]);
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
          const pts = [{ x: p.x, y: p.y }];
          const hitSet = new Set();
          const chains = 2 + H.skills.lightning;
          let node = cur;
          for (let c = 0; c < chains && node; c++) {
            pts.push({ x: node.x, y: node.y });
            hitSet.add(node);
            if (node.hurt(Math.round((17 + H.skills.lightning * 6) * H.mods.dmg), this)) this.killMonster(node, p);
            let next = null, nd = 240;
            for (const m of this.monsters) {
              if (hitSet.has(m)) continue;
              const d = Math.hypot(m.x - node.x, m.y - node.y);
              if (d < nd) { next = m; nd = d; }
            }
            node = next;
          }
          H.bolts.push({ pts, t: 0.18 });
          Sfx.laser();
          this.shake = Math.max(this.shake, 3);
        }
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
      const magnetR = 95 * H.mods.magnet;
      if (bd < magnetR) {
        const a = Math.atan2(best.y - g.y, best.x - g.x);
        const sp = 260 + (magnetR - bd) * 4;
        g.x += Math.cos(a) * sp * dt;
        g.y += Math.sin(a) * sp * dt;
      }
      if (bd < 22) { g.taken = true; this.hordeAddXp(g.v); }
    }
    H.gems = H.gems.filter(g => !g.taken);
    if (H.gems.length > 220) H.gems.splice(0, H.gems.length - 220);
  }

  hordeAddXp(v) {
    const H = this.hordeState;
    H.xp += v;
    Sfx.tick();
    while (H.xp >= H.xpNeed) {
      H.xp -= H.xpNeed;
      H.level++;
      H.xpNeed = Math.round(8 + H.level * 4.5);
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
    if (u.skill) H.skills[u.skill]++;
    else if (u.special === 'maxhp') {
      for (const p of this.players) { p.maxHp = Math.round(p.maxHp * 1.3); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); }
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
    // 成长曲线：血量/伤害随时间膨胀
    const hpScale = 1 + t / 45 * 0.28;
    m.hp *= hpScale; m.maxHp = m.hp;
    m.hordeDmgMul = 1 + t / 130 * 0.3;
    unstick(m);
    this.monsters.push(m);
  }

  spawnHordeBoss() {
    const t = this.time;
    const p0 = this.players.find(p => p.active) || this.players[0];
    const nodes = MapData.monsterNodes.filter(n => Math.hypot(n.x - p0.x, n.y - p0.y) > 420);
    const n = (nodes.length ? nodes : MapData.monsterNodes)[0];
    const boss = new Monster(n.x, n.y, this.cfg, 'brute');
    boss.isBoss = true;
    boss.r = 34;
    boss.hp = this.cfg.mHp * 32 * (1 + t / 260);
    boss.maxHp = boss.hp;
    boss.hordeDmgMul = 2.2;
    unstick(boss);
    this.monsters.push(boss);
    this.hordeState.boss = boss;
    Sfx.brute();
    this.shake = 10;
    this.toast('⚠️ 巨魁王踏碎地面而来！击杀它获得免费升级！', '#ff5c5c');
  }

  tryRoll(p) {
    if (!p.active || p.rollT > 0 || p.rollCd > 0) return;
    const free = p.staminaFreeT > 0;
    if (!free && p.stamina < STAMINA.rollCost) { Sfx.error(); this.floater(p.x, p.y - 34, '体力不足！', '#ff8f8f'); return; }
    if (!free) { p.stamina -= STAMINA.rollCost; p.staminaDelay = STAMINA.regenDelay; }
    p.rollT = STAMINA.rollDur;
    p.rollCd = STAMINA.rollCd;
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
    if (p.staminaDelay <= 0) p.stamina = Math.min(STAMINA.max, p.stamina + STAMINA.regen * dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        p.reloadT = 0;
        const def = p.weaponDef();
        if (!def.melee && def.mag) { p.mags[p.activeSlot] = def.mag; Sfx.tick(); }
      }
    }
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.sodaTime = Math.max(0, p.sodaTime - dt);
    p.invisT = Math.max(0, p.invisT - dt);
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
      p.moving = true;
      return;   // 翻滚期间跳过攻击/互动/拾取判定（下一帧恢复）
    }

    const km = KEYMAP[p.idx];
    p.sneak = this.horde ? false : !!Input.keys[km.sneak];

    let dx = 0, dy = 0;
    if (Input.keys[km.up]) dy--;
    if (Input.keys[km.down]) dy++;
    if (Input.keys[km.left]) dx--;
    if (Input.keys[km.right]) dx++;
    const spd = (this.horde
      ? PLAYER_SPEED * 1.06 * this.hordeState.mods.speed * (p.sodaTime > 0 ? p.sodaMul : 1)
      : PLAYER_SPEED * p.speedMul()) * this.weatherPSpd();
    let wishX = 0, wishY = 0;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      p.facing = Math.atan2(dy, dx);
      wishX = (dx / len) * spd; wishY = (dy / len) * spd;
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

    if (Input.keys[km.shoot] || (km.shoot2 && Input.keys[km.shoot2])) this.tryAttack(p);
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

    // 碎金自动拾取
    for (const gd of this.goldDrops) {
      if (Math.hypot(gd.x - p.x, gd.y - p.y) > 34) continue;
      SAVE.gold += gd.value;
      this.runCash += gd.value;
      gd.taken = true;
      Sfx.coin();
      this.floater(gd.x, gd.y - 14, `+${gd.value}💰`, '#ffd93d');
    }
    this.goldDrops = this.goldDrops.filter(g => !g.taken);

    if (this.horde) return;   // 割草模式没有撤离，只有生存
    const er = MapData.exitRect;
    const inExit = p.x > er.x && p.x < er.x + er.w && p.y > er.y && p.y < er.y + er.h;
    if (inExit) {
      p.extractProgress += dt;
      if (p.extractProgress >= 2) {
        p.extracted = true;
        Sfx.extract();
        this.toast(`${this.pname(p)} 撤离成功！带出 ${p.bag.length} 件宝物（${p.carriedValue} 金币）`, '#7dff9a');
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
      p.shootCd = 1 / (def.rate * (this.horde ? this.hordeState.mods.rate : 1));
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
        let dmg = def.dmg * p.dmgMul() * (this.horde ? this.hordeState.mods.dmg : 1);
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
        if (m.hurt(Math.round(dmg), this)) this.killMonster(m, p, { backstab });
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
    p.shootCd = 1 / (def.rate * (H ? H.rate : 1));
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
        knock: (def.knock || 80) * H.knock,
      });
    }
    for (let i = 0; i < n; i++) {
      const fan = def.pellets ? 0 : (i - (n - 1) / 2) * 0.13;   // 非霰弹的分裂弹道呈扇形
      const a = angle + fan + (Math.random() - 0.5) * 2 * def.spread;
      this.bullets.push(new Bullet(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, a, bdef, p, p.dmgMul() * (H ? H.dmg : 1)));
    }
    this.spark(p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, '#ffe28a');
    if (def.id === 'laser') Sfx.laser();
    else if (def.id === 'crossbow') Sfx.crossbow();
    else if (def.id === 'cannon') Sfx.shotgun();
    else (def.pellets ? Sfx.shotgun : Sfx.shoot)();
    if (!def.silent && !this.horde) this.emitNoise(p.x, p.y, this.cfg.hear * (def.explosive ? 1.3 : 1));
    if (inst.dur <= 0 && !this.horde) this.breakWeapon(p);
  }

  // 轰天雷爆炸
  explode(x, y, bullet) {
    Sfx.boom();
    this.shake = 10;
    for (let i = 0; i < 16; i++) this.spark(x, y, i % 2 ? '#ffb347' : '#ff5c5c');
    const R = bullet.explosive;
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
    if (owner) {
      owner.kills++;
      if (owner.backstabKills !== undefined) {
        if (opts.backstab) owner.backstabKills++; else owner.otherKills++;
      }
    }
    for (let i = 0; i < 8; i++) this.spark(m.x, m.y, '#b48aff');
    this.floater(m.x, m.y - 20, `${m.type.name}被击败！`, '#b48aff');
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
    const goldV = Math.round(base * diffMul * (m.isMini ? 0.4 : 1) * (this.horde ? 0.35 : 1));
    if (!this.horde || Math.random() < 0.5 || m.isBoss) this.goldDrops.push(new GoldDrop(m.x, m.y, goldV));

    if (this.horde) {
      const H = this.hordeState;
      // 经验宝石
      const xv = m.isBoss ? 12 : (m.type.id === 'brute' || m.type.id === 'skeleton') ? 3 : m.isMini ? 1 : (Math.random() < 0.3 ? 2 : 1);
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
      const flash = document.getElementById('hurt-flash');
      if (flash) { flash.style.opacity = '0.45'; setTimeout(() => flash.style.opacity = '0', 120); }
    }
    p.hurtCd = 0.35;
    this.shake = src && src.type && src.type.id === 'brute' ? 9 : 5;
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

    if (chest.tier === 'mystery' && Math.random() < chest.def.mimicChance) {
      const mimic = new Monster(chest.x, chest.y, this.cfg, 'mimic');
      mimic.state = 'chase'; mimic.target = opener; mimic.lastKnown = { x: opener.x, y: opener.y }; mimic.memoryT = 6;
      this.monsters.push(mimic);
      Sfx.mimic();
      this.shake = 8;
      this.toast('是宝箱怪！！快跑！', '#ff5c5c');
      return;
    }

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
            m.lastKnown = { x: opener.x, y: opener.y };
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

  settleHorde() {
    const H = this.hordeState;
    SAVE.stats.runs++;
    // 胜利奖金：基础 400 + 每杀 2 金
    let bonus = 0;
    if (H.victory) { bonus = 400 + this.runKills * 2; SAVE.gold += bonus; }
    SAVE.stats.goldEarned += this.runCash + bonus;
    // 最佳战绩
    const best = SAVE.hordeBest || { time: 0, kills: 0, level: 0 };
    SAVE.hordeBest = {
      time: Math.max(best.time, Math.round(this.time)),
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
      time: this.time, kills: this.runKills, level: H.level,
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

  // ---------- 特效 ----------
  floater(x, y, text, color) { this.floaters.push({ x, y, text, color, t: 1.6 }); }
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
    for (let y = 0; y < MapData.h; y++) for (let x = 0; x < MapData.w; x++) {
      if (MapData.solid[y][x]) continue;
      g.fillStyle = (x + y) % 2 ? T.floorA : T.floorB;
      g.fillRect(x*TILE, y*TILE, TILE, TILE);
      if ((x*7 + y*13) % 11 === 0) { g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x*TILE+8, y*TILE+8, 6, 6); }
    }
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
      if (MapData.def.ascii[y][x] === '*') continue;
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
    if (this.horde) {
      const H = this.hordeState;
      const left = Math.max(0, HORDE_DURATION - this.time);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      const y0 = MapData.minimap.height + 22;
      ctx.font = 'bold 20px "PingFang SC",sans-serif';
      ctx.fillStyle = left < 60 ? '#ffd93d' : 'rgba(255,255,255,.9)';
      ctx.fillText(`⏳ ${mm}:${String(ss).padStart(2,'0')}`, VIEW_W/2, y0 + 4);
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
        ctx.fillText('👑 巨魁王', VIEW_W/2, bby + 24);
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

    // —— 割草模式地面层：火焰足迹 / 经验宝石 ——
    if (this.horde) {
      const H = this.hordeState;
      for (const fp of H.firePatches) {
        const [sx, sy] = W2S(fp.x, fp.y);
        if (!onScreen(sx, sy)) continue;
        ctx.globalAlpha = Math.min(0.75, fp.t * 0.6);
        ctx.fillStyle = '#ff7b2d';
        ctx.beginPath(); ctx.arc(sx, sy, 15 + Math.sin(this.time * 12 + fp.x) * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath(); ctx.arc(sx, sy - 3, 7, 0, Math.PI * 2); ctx.fill();
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
      if (onScreen(sx, sy)) this.drawMonster(ctx, m, sx, sy);
    }
    for (const mc of this.mercs) {
      const [sx, sy] = W2S(mc.x, mc.y);
      if (onScreen(sx, sy)) this.drawMerc(ctx, mc, sx, sy);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const [sx, sy] = W2S(p.x, p.y);
      this.drawPlayer(ctx, p, sx, sy);
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
      } else {
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI*2); ctx.fill();
      }
    }
    for (const s of this.sparks) {
      const [sx, sy] = W2S(s.x, s.y);
      ctx.fillStyle = s.color; ctx.globalAlpha = Math.max(0, s.t * 3);
      ctx.fillRect(sx-2, sy-2, 4, 4);
    }
    ctx.globalAlpha = 1;

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
        ctx.strokeStyle = `rgba(255,240,120,${Math.min(1, bolt.t * 6)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < bolt.pts.length; i++) {
          const [sx, sy] = W2S(bolt.pts[i].x, bolt.pts[i].y);
          if (i === 0) ctx.moveTo(sx, sy);
          else {
            const [px, py] = W2S(bolt.pts[i-1].x, bolt.pts[i-1].y);
            ctx.lineTo((sx + px) / 2 + (Math.random() - 0.5) * 16, (sy + py) / 2 + (Math.random() - 0.5) * 16);
            ctx.lineTo(sx, sy);
          }
        }
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
    if (this.revealT > 0) for (const m of this.monsters) dot(m.x, m.y, '#ff5c5c', 2);
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
  drawMerc(ctx, mc, sx, sy) {
    const walk = mc.moving ? Math.sin(mc.anim * 11) : 0;
    const fx = Math.cos(mc.facing), fy = Math.sin(mc.facing);
    ctx.save();
    ctx.translate(sx, sy);
    if (mc.hurtCd > 0 && Math.floor(mc.anim * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 11, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath(); ctx.ellipse(-5, 13 + walk * 2, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, 13 - walk * 2, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#e8ddc8';
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2.5;
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
    if (mc.def.melee) { ctx.fillStyle = '#555'; ctx.fillRect(8, -2, 10, 4); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(21, 0, 6, 0, Math.PI*2); ctx.fill(); }
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
      const size = 40;
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
        ctx.fillStyle = '#3a3a48'; ctx.strokeStyle = '#241f38'; ctx.lineWidth = 1.5;
        ctx.fillRect(8, -3, 18, 6); ctx.strokeRect(8, -3, 18, 6);
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
  updateHud() {
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
            const magNow = s === p.activeSlot && p.reloadT > 0 ? '…' : (p.mags[s] === null ? wd.mag : p.mags[s]);
            const reserve = this.horde ? '∞' : `${AMMO_TYPES[wd.ammo].icon}${SAVE.ammo[wd.ammo]}`;
            text = `${wd.icon}${magNow}/${wd.mag}·${reserve}`;
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
