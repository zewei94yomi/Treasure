// ============ 实体：玩家(双武器/护甲/潜行/负重) / 八种怪物(攻击硬直) / 子弹(追踪/爆炸) ============
'use strict';

const PLAYER_SPEED = 152;
const PLAYER_R = 15;
const BAG_CAP_BASE = 8;

class Player {
  constructor(idx, x, y, weaponInsts, skinId, armorInst, hasPouch, accId) {
    this.idx = idx;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;              // 冰面滑行用速度向量
    this.hp = 100; this.maxHp = 100;
    this.facing = idx === 0 ? 0 : Math.PI;
    this.weapons = weaponInsts;            // [instA|null, instB|null] 军械库实例引用
    this.activeSlot = weaponInsts[0] ? 0 : 1;
    this.armor = armorInst || null;        // { uid, id, dur } dur=剩余甲片池
    this.pouch = !!hasPouch;
    this.skin = SKINS.find(s => s.id === skinId) || SKINS[idx] || SKINS[0];
    this.bag = [];
    this.bagUsed = 0;
    this.shootCd = 0;
    this.hurtCd = 0;
    this.downed = false; this.bleed = 0; this.reviveProgress = 0;
    this.dead = false; this.extracted = false;
    this.extractProgress = 0;
    this.sneak = false;
    this.sodaTime = 0; this.sodaMul = 1;
    this.invisT = 0; this.rageT = 0;
    this.consumSel = 0;                    // CONSUM_ORDER 下标
    this.anim = Math.random() * 10;
    this.swing = 0;
    this.arrows = [];
    this.kills = 0;
    this.footT = 0;                        // 脚步声计时
    this.acc = ACCESSORIES[accId] || null; // 装饰（帽子/光环）
    this.stamina = STAMINA.max;            // 体力（翻滚消耗，自动恢复）
    this.staminaDelay = 0;                 // 消耗后恢复延迟
    this.rollT = 0;                        // 翻滚剩余时间（>0 时无敌且不能攻击）
    this.rollCd = 0;
    this.rollDir = 0;
    this.staminaFreeT = 0;                 // 金色沙漏：无限体力
    this.tempShield = 0;                   // 临时护盾（圣盾/泡泡道具）
    this.mags = [null, null];              // 每把武器的当前弹夹
    this.reloadT = 0;                      // 换弹剩余时间
    this.wasSpotted = false;               // 本局是否被怪物盯上过（奖杯用）
    this.tookDamage = false;
    this.backstabKills = 0;
    this.otherKills = 0;
  }
  get alive() { return !this.dead && !this.extracted; }
  get active() { return this.alive && !this.downed; }
  get bagCap() { return BAG_CAP_BASE + (this.pouch ? GEAR.pouch.extraSlots : 0); }
  weaponInst() { return this.weapons[this.activeSlot]; }
  weaponDef() {
    const inst = this.weaponInst();
    return inst && inst.dur > 0 ? WEAPONS[inst.id] : WEAPONS.fists;
  }
  switchWeapon() {
    const other = 1 - this.activeSlot;
    if (this.weapons[other] || this.weapons[this.activeSlot]) { this.activeSlot = other; this.reloadT = 0; }
  }
  // 当前弹夹余弹（近战返回 -1）
  magLeft() {
    const def = this.weaponDef();
    if (def.melee || !def.mag) return -1;
    if (this.mags[this.activeSlot] === null) this.mags[this.activeSlot] = def.mag;
    return this.mags[this.activeSlot];
  }
  startReload() {
    const def = this.weaponDef();
    if (def.melee || this.reloadT > 0) return;
    this.reloadT = def.reload || 1.2;
  }
  get carriedValue() { return this.bag.reduce((s, t) => s + t.value, 0); }

  // —— 负重 ——
  totalWeight() {
    let w = this.bagUsed;
    for (const inst of this.weapons) if (inst) w += WEAPONS[inst.id].weight || 0;
    if (this.armor) w += ARMORS[this.armor.id].weight;
    if (this.pouch) w += GEAR.pouch.weight;
    return w;
  }
  loadFactor() { return this.totalWeight() / WEIGHT_CAP; }

  visionMul() {
    let m = 1;
    for (const t of this.bag) if (t.effect && t.effect.kind === 'carry' && t.effect.vision) m += t.effect.vision;
    return m * (MapData.mods.playerVision || 1);
  }
  // 被怪物看见的距离倍率：负重越大越显眼；潜行/隐身大幅降低；潜行静止≈隐匿
  detectMul() {
    let m = weightDetectMul(this.loadFactor());
    for (const t of this.bag) if (t.effect && t.effect.kind === 'carry' && t.effect.detect) m += t.effect.detect;
    if (this.sneak) m *= this.moving ? 0.30 : 0.18;   // 潜行大幅隐蔽，静止近乎隐形
    return m;
  }
  speedMul() {
    let m = weightSpeedMul(this.loadFactor());
    if (this.sodaTime > 0) m *= this.sodaMul;
    if (this.sneak) m *= 0.55;
    return m;
  }
  dmgMul() { return this.rageT > 0 ? 1.5 : 1; }
  noiseMul() { return this.sneak ? 0 : weightNoiseMul(this.loadFactor()); }
  hasExitArrow() {
    return this.bag.some(t => t.effect && t.effect.kind === 'carry' && t.effect.exitArrow);
  }
  addToBag(t) {
    if (this.bagUsed + t.size > this.bagCap) return false;
    this.bag.push(t); this.bagUsed += t.size;
    return true;
  }
}

class Monster {
  constructor(x, y, cfg, typeId = 'shade', isMini = false) {
    this.x = x; this.y = y;
    this.cfg = cfg;
    this.type = MONSTER_TYPES[typeId] || MONSTER_TYPES.shade;
    this.isMini = isMini;
    this.r = isMini ? 10 : this.type.r;
    this.hp = cfg.mHp * this.type.hpMul * (isMini ? 0.35 : 1);
    this.maxHp = this.hp;
    this.state = this.type.ambush ? 'ambush' : 'patrol';
    this.target = null;
    this.lastKnown = null;
    this.memoryT = 0;
    this.stunT = 0;
    this.slowT = 0;              // 寒霜减速
    this.attackCd = 0;
    this.windupT = 0;            // 攻击前摇（硬直，不能移动）
    this.recoverT = 0;           // 攻击后摇（硬直，不能移动）
    this.shootCd = 0;            // 幽火远程
    this.screamCd = 0;           // 尖啸者
    this.fleeT = 0;
    this.wanderDir = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    this.path = []; this.pathT = 0;
    this.anim = Math.random() * 10;
    this.hpShowT = 0;
    this.huntT = cfg.huntInterval ? cfg.huntInterval * (0.5 + Math.random()) : 0;
    this.kvx = 0; this.kvy = 0;
    this.zigPhase = Math.random() * 10;
    this.home = { x, y };
    this.faceDir = Math.random() * Math.PI * 2;   // 朝向（背后有视野盲区）
    this.burnT = 0;                               // 灼烧 DoT
    this.gazeT = 0;                               // 咒眼凝视累积
  }
  get isMimic() { return this.type.id === 'mimic'; }

  knock(angle, power) {
    const k = power * this.type.kbMul;
    this.kvx += Math.cos(angle) * k;
    this.kvy += Math.sin(angle) * k;
  }

  // 感知玩家：潜行/隐身/负重影响被发现距离；怪物背后有视野盲区（潜行时可绕背偷袭）
  canSee(p, range) {
    if (!p.active || p.invisT > 0) return false;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    let r = range * p.detectMul();
    let da = Math.atan2(p.y - this.y, p.x - this.x) - this.faceDir;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 1.95) r *= (p.sneak ? 0.22 : 0.65);   // 玩家在怪物背后
    return d < r && losClear(this.x, this.y, p.x, p.y);
  }

  update(dt, game) {
    this.anim += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hpShowT = Math.max(0, this.hpShowT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.screamCd = Math.max(0, this.screamCd - dt);
    // 灼烧：持续掉血
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= 5 * dt;
      this.hpShowT = 1;
      if (Math.random() < dt * 8) game.spark(this.x, this.y - 6, '#ff8f3d');
      if (this.hp <= 0) { game.killMonster(this, null); return; }
    }

    // 击退位移
    if (Math.abs(this.kvx) > 1 || Math.abs(this.kvy) > 1) {
      const r = resolveCircle(this.x + this.kvx * dt, this.y + this.kvy * dt, this.r);
      this.x = r.x; this.y = r.y;
      const decay = Math.exp(-9 * dt);
      this.kvx *= decay; this.kvy *= decay;
    }
    if (this.stunT > 0) { this.stunT -= dt; return; }

    // —— 冲撞蛮牛：冲锋进行中 ——
    if (this.charging) {
      const c = this.charging;
      c.t -= dt;
      const ox = this.x, oy = this.y;
      const nx = this.x + Math.cos(c.dir) * c.speed * dt;
      const ny = this.y + Math.sin(c.dir) * c.speed * dt;
      const r = resolveCircle(nx, ny, this.r);
      this.x = r.x; this.y = r.y;
      // 只有"前向几乎无位移"才算撞墙（允许贴墙滑行冲锋）
      const fwd = (this.x - ox) * Math.cos(c.dir) + (this.y - oy) * Math.sin(c.dir);
      const hitWall = fwd < c.speed * dt * 0.25;
      this.faceDir = c.dir;
      // 撞到玩家/佣兵
      for (const v of game.players.concat(game.mercs)) {
        if (c.hit.has(v)) continue;
        const alive = v.isMerc ? v.hp > 0 : v.active;
        if (!alive) continue;
        if (Math.hypot(v.x - this.x, v.y - this.y) < this.r + PLAYER_R + 2) {
          c.hit.add(v);
          const dmg = Math.round(this.cfg.mDmg * this.type.dmgMul * (this.hordeDmgMul || 1));
          if (v.isMerc) v.hurt(dmg, game); else game.damagePlayer(v, dmg, this);
        }
      }
      if (hitWall) { this.charging = null; this.stunT = 0.9; game.shake = Math.max(game.shake, 5); game.spark(this.x, this.y, '#c9ced8'); }
      else if (c.t <= 0) this.charging = null;
      return;
    }

    // —— 混乱蘑菇：怪物互相攻击 ——
    if (game.confusionT > 0 && !this.isBoss && this.windupT <= 0 && this.recoverT <= 0) {
      let foe = null, fd = 340;
      for (const m of game.monsters) {
        if (m === this) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d < fd) { foe = m; fd = d; }
      }
      if (foe) {
        if (fd > this.r + foe.r + 6) {
          this.moveToward({ x: foe.x, y: foe.y }, this.cfg.chaseSpeed * this.type.spdMul, dt, 0);
          unstick(this);
        } else if (this.attackCd <= 0) {
          this.attackCd = 0.8;
          this.confusedTarget = foe;
          this.windupT = 0.25;
          this.pendingRanged = false;
        }
        if (Math.random() < dt * 2) game.floater(this.x, this.y - this.r - 6, '❓', '#ff8fd0');
        return;
      }
    }

    // —— 攻击硬直：前摇/后摇期间站桩，不移动 ——
    if (this.windupT > 0) {
      this.windupT -= dt;
      if (this.windupT <= 0) this.resolveAttack(game);
      return;
    }
    if (this.recoverT > 0) { this.recoverT -= dt; return; }

    let slowMul = game.monsterSlowT > 0 ? 0.5 : 1;
    if (this.slowT > 0) slowMul *= 0.5;
    slowMul *= game.weatherMSpd ? game.weatherMSpd() : 1;   // 天气：血月加速/雨雪减速
    const cfg = this.cfg;
    const visRange = cfg.vision * this.type.visMul * (MapData.mods.monsterVision || 1);

    // —— 无双割草：无脑集群冲锋（跳过蹲守/凝视/尖啸/巡逻感知） ——
    if (game.horde) {
      const prey = game.nearestActivePlayer(this.x, this.y);
      if (prey) { this.state = 'chase'; this.target = prey; this.lastKnown = { x: prey.x, y: prey.y }; this.memoryT = 99; }
      else { this.state = 'patrol'; this.target = null; }
    } else {
    // —— 潜伏者蹲守 ——
    if (this.state === 'ambush') {
      for (const p of game.players) {
        if (!p.active || p.invisT > 0) continue;
        if (Math.hypot(p.x - this.x, p.y - this.y) < 130 * p.detectMul()) {
          this.state = 'chase'; this.target = p;
          this.lastKnown = { x: p.x, y: p.y }; this.memoryT = cfg.memory + 3;
          Sfx.lurker();
          game.floater(this.x, this.y - 24, '潜伏者！', '#ff5c5c');
          break;
        }
      }
      if (this.state === 'ambush') return;
    }

    // —— 感知 ——
    let seen = null, seenDist = Infinity;
    for (const p of game.players) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < seenDist && this.canSee(p, visRange)) { seen = p; seenDist = d; }
    }
    // 咒眼：不近战，凝视累积后向全场怪物揭示你的位置
    if (this.type.watcher) {
      if (seen) {
        this.gazeT += dt;
        this.faceDir = Math.atan2(seen.y - this.y, seen.x - this.x);
        if (this.gazeT >= 1.8) {
          this.gazeT = 0;
          Sfx.banshee();
          game.floater(this.x, this.y - 24, '👁 咒视！', '#ff5c5c');
          game.toast('咒眼揭示了你的位置！', '#ff5c5c');
          for (const m of game.monsters) {
            if (m === this || m.state === 'ambush') continue;
            if (Math.hypot(m.x - this.x, m.y - this.y) < 680) {
              m.lastKnown = { x: seen.x, y: seen.y };
              if (m.state !== 'chase') m.state = 'investigate';
            }
          }
        }
        // 缓慢飘向玩家保持凝视距离
        const d = Math.hypot(seen.x - this.x, seen.y - this.y);
        if (d > 240) this.moveToward({ x: seen.x, y: seen.y }, cfg.patrolSpeed * this.type.spdMul * slowMul, dt, 0);
        unstick(this);
        return;
      } else this.gazeT = Math.max(0, this.gazeT - dt * 2);
    }
    // 察觉蓄力：潜行中的目标要被连续注视 0.7 秒才暴露（头顶出现 👁 警告）
    if (seen && seen.sneak && this.state !== 'chase') {
      this.suspectT = (this.suspectT || 0) + dt;
      seen.suspectedT = 0.25;
      this.faceDir = Math.atan2(seen.y - this.y, seen.x - this.x);   // 疑心转头
      if (this.suspectT < 0.7) seen = null;                          // 尚未暴露
    } else if (!seen) {
      this.suspectT = Math.max(0, (this.suspectT || 0) - dt * 1.5);
    } else this.suspectT = 0;
    if (seen) {
      if (this.state !== 'chase') { this.type.id === 'brute' ? Sfx.brute() : Sfx.aggro(); }
      this.state = 'chase'; this.target = seen;
      seen.wasSpotted = true;
      this.lastKnown = { x: seen.x, y: seen.y };
      this.memoryT = cfg.memory * (this.type.memMul || 1);
      // 尖啸者：看到玩家先尖叫召集，然后逃跑
      if (this.type.screamer && this.screamCd <= 0) {
        this.screamCd = 8;
        this.fleeT = 4;
        Sfx.banshee();
        game.floater(this.x, this.y - 26, '❗尖啸！', '#ff5c5c');
        game.toast('尖啸者发出了刺耳的召集！', '#ff5c5c');
        for (const m of game.monsters) {
          if (m === this || m.state === 'ambush') continue;
          if (Math.hypot(m.x - this.x, m.y - this.y) < 620) {
            m.lastKnown = { x: seen.x, y: seen.y };
            if (m.state !== 'chase') m.state = 'investigate';
          }
        }
      }
    } else if (this.state === 'chase') {
      this.memoryT -= dt;
      if (this.memoryT <= 0) { this.state = this.lastKnown ? 'investigate' : 'patrol'; this.target = null; }
    }

    if (cfg.smart >= 2 && this.state === 'patrol' && cfg.huntInterval && !this.type.ambush) {
      this.huntT -= dt;
      if (this.huntT <= 0) {
        this.huntT = cfg.huntInterval * (0.8 + Math.random() * 0.6);
        const alive = game.players.filter(p => p.active);
        if (alive.length) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          const fuzz = t.sneak ? 220 : 0;   // 潜行者不会被算法精确点名
          this.lastKnown = { x: t.x + (Math.random() - 0.5) * fuzz * 2, y: t.y + (Math.random() - 0.5) * fuzz * 2 };
          this.state = 'investigate';
        }
      }
    }
    }  // 结束 非割草模式感知分支

    // —— 行动 ——
    const baseSpd = this.type.spdMul;
    let spd = cfg.patrolSpeed * baseSpd, goal = null;
    if (this.state === 'chase' && this.target) {
      spd = cfg.chaseSpeed * baseSpd;
      goal = this.lastKnown;
      // 尖啸者逃离玩家；幽火保持距离放风筝
      if (this.type.screamer && this.fleeT > 0) {
        this.fleeT -= dt;
        const a = Math.atan2(this.y - this.target.y, this.x - this.target.x);
        goal = { x: this.x + Math.cos(a) * 120, y: this.y + Math.sin(a) * 120 };
      } else if (this.type.ranged && this.target.active) {
        const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        this.shootCd = Math.max(0, this.shootCd - dt);
        if (d < 300 && losClear(this.x, this.y, this.target.x, this.target.y)) {
          if (d < 170) { // 太近了后撤
            const a = Math.atan2(this.y - this.target.y, this.x - this.target.x);
            goal = { x: this.x + Math.cos(a) * 90, y: this.y + Math.sin(a) * 90 };
          } else goal = null;  // 停下射击
          if (this.shootCd <= 0) {
            this.shootCd = 2.2;
            this.windupT = 0.5;          // 蓄力硬直后 resolveAttack 发射
            this.pendingRanged = true;
            return;
          }
        }
      }
    } else if (this.state === 'investigate' && this.lastKnown) {
      spd = cfg.chaseSpeed * baseSpd * 0.8;
      goal = this.lastKnown;
      if (Math.hypot(this.lastKnown.x - this.x, this.lastKnown.y - this.y) < 30) {
        this.lastKnown = null;
        if (this.type.ambush) {
          this.state = 'investigate'; this.lastKnown = { ...this.home };
          if (Math.hypot(this.home.x - this.x, this.home.y - this.y) < 34) this.state = 'ambush';
        } else this.state = 'patrol';
        goal = null;
      }
    }
    spd *= slowMul;

    if (goal) {
      this.moveToward(goal, spd, dt, cfg.smart);
    } else if (!this.type.ambush && this.state === 'patrol') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 1.5 + Math.random() * 2.5; this.wanderDir = Math.random() * Math.PI * 2; }
      this.faceDir = this.wanderDir;
      const nx = this.x + Math.cos(this.wanderDir) * spd * dt;
      const ny = this.y + Math.sin(this.wanderDir) * spd * dt;
      const r = resolveCircle(nx, ny, this.r);
      if (Math.hypot(r.x - nx, r.y - ny) > 0.5) this.wanderT = 0;
      this.x = r.x; this.y = r.y;
    }
    unstick(this);

    // —— 冲撞蛮牛：中距离蓄力冲锋 ——
    if (this.type.charger && this.state === 'chase' && this.target && this.target.active) {
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      this.chargeCd = Math.max(0, (this.chargeCd || 0) - dt);
      if (d > 110 && d < 380 && this.chargeCd <= 0 && losClear(this.x, this.y, this.target.x, this.target.y)) {
        this.chargeCd = 4.5;
        this.windupT = this.type.windup;
        this.pendingCharge = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        Sfx.brute();
        return;
      }
    }
    // —— 毒爆菇：贴近后自爆 ——
    if (this.type.shroom && this.state === 'chase' && this.target && this.target.active) {
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (d < 78 && this.windupT <= 0) {
        this.windupT = 0.7;
        this.pendingBoom = true;
        Sfx.windup();
        return;
      }
    }

    // —— 近战攻击进入前摇（硬直站桩，给玩家脱身窗口）——
    if (this.state === 'chase' && this.target && this.target.active && !this.type.ranged) {
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (d < PLAYER_R + this.r + 8 && this.attackCd <= 0) {
        this.attackCd = this.type.id === 'brute' ? 1.5 : 1.1;
        this.windupT = this.type.windup || 0.32;
        this.pendingRanged = false;
        Sfx.windup();
      }
    }
  }

  // 前摇结束：判定攻击（玩家若已拉开距离则挥空）
  resolveAttack(game) {
    this.recoverT = this.type.recover || 0.45;
    // 冲撞蛮牛：前摇结束 → 起冲
    if (this.pendingCharge !== undefined && this.pendingCharge !== null) {
      this.charging = { dir: this.pendingCharge, t: 0.6, speed: 560, hit: new Set() };
      this.pendingCharge = null;
      this.recoverT = 0;
      return;
    }
    // 毒爆菇：自爆成毒云
    if (this.pendingBoom) {
      this.pendingBoom = false;
      game.shroomExplode(this, 84);
      return;
    }
    // 混乱状态：打的是别的怪
    if (this.confusedTarget) {
      const foe = this.confusedTarget;
      this.confusedTarget = null;
      if (game.monsters.includes(foe) && Math.hypot(foe.x - this.x, foe.y - this.y) < this.r + foe.r + 20) {
        const dmg = Math.round(this.cfg.mDmg * this.type.dmgMul * 1.2);
        if (foe.hurt(dmg, game)) game.killMonster(foe, null);
        game.spark(foe.x, foe.y, '#ff8fd0');
      }
      return;
    }
    if (this.pendingRanged) {
      // 幽火吐弹
      if (this.target && this.target.active) {
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        game.monsterOrbs.push(new MonsterOrb(this.x, this.y, a, Math.round(this.cfg.mDmg * this.type.dmgMul * (this.hordeDmgMul || 1))));
        Sfx.wisp();
      }
      return;
    }
    // 雇佣兵会替雇主挡刀：范围内谁近打谁
    let victim = this.target && this.target.active ? this.target : null;
    let vd = victim ? Math.hypot(victim.x - this.x, victim.y - this.y) : Infinity;
    for (const mc of game.mercs) {
      if (mc.hp <= 0) continue;
      const d = Math.hypot(mc.x - this.x, mc.y - this.y);
      if (d < vd) { victim = mc; vd = d; }
    }
    if (!victim) return;
    if (vd < PLAYER_R + this.r + 16) {
      const hitDmg = Math.round(this.cfg.mDmg * this.type.dmgMul * (this.hordeDmgMul || 1) * (game.weatherMDmg ? game.weatherMDmg() : 1));
      if (victim.isMerc) victim.hurt(hitDmg, game);
      else game.damagePlayer(victim, hitDmg, this);
      // 石巨魁震地：命中时溅射周围其他目标
      if (this.type.id === 'brute') {
        game.shake = Math.max(game.shake, 6);
        for (const v of game.players.concat(game.mercs)) {
          if (v === victim) continue;
          const alive = v.isMerc ? v.hp > 0 : v.active;
          if (!alive) continue;
          if (Math.hypot(v.x - this.x, v.y - this.y) < 95) {
            const splash = Math.round(hitDmg * 0.5);
            if (v.isMerc) v.hurt(splash, game); else game.damagePlayer(v, splash, this);
          }
        }
      }
    } else {
      game.floater(this.x, this.y - 20, '挥空！', '#9fd8ff');
    }
  }

  moveToward(goal, spd, dt, smart) {
    let tx = goal.x, ty = goal.y;
    this.forcePathT = Math.max(0, (this.forcePathT || 0) - dt);
    // 聪明怪常态寻路；笨怪卡墙 0.35 秒后也临时开启寻路（解决"知道位置但被地形卡住"）
    if (smart >= 2 || this.forcePathT > 0) {
      this.pathT -= dt;
      if (this.pathT <= 0) { this.pathT = 0.5; this.path = bfsPath(this.x, this.y, goal.x, goal.y); }
      while (this.path.length && Math.hypot(this.path[0].x - this.x, this.path[0].y - this.y) < TILE * 0.55) this.path.shift();
      // 路径平滑：能直视的路点直接跳过
      while (this.path.length > 1 && losClear(this.x, this.y, this.path[1].x, this.path[1].y)) this.path.shift();
      if (this.path.length) { tx = this.path[0].x; ty = this.path[0].y; }
    }
    const _bx = this.x, _by = this.y;
    let a = Math.atan2(ty - this.y, tx - this.x);
    if (this.type.zigzag) a += Math.sin(this.anim * 7 + this.zigPhase) * 0.7;
    this.faceDir = a;
    let nx = this.x + Math.cos(a) * spd * dt;
    let ny = this.y + Math.sin(a) * spd * dt;
    let r = resolveCircle(nx, ny, this.r);
    if (smart >= 1 && Math.hypot(r.x - nx, r.y - ny) > 0.5) {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
      const r2 = resolveCircle(this.x + (dx / d) * spd * dt, this.y, this.r);
      const r3 = resolveCircle(this.x, this.y + (dy / d) * spd * dt, this.r);
      r = (Math.hypot(r2.x - this.x, r2.y - this.y) > Math.hypot(r3.x - this.x, r3.y - this.y)) ? r2 : r3;
    }
    this.x = r.x; this.y = r.y;
    // 卡墙侦测：实际位移远小于期望 → 累计后强制寻路
    const moved = Math.hypot(this.x - _bx, this.y - _by);
    if (moved < spd * dt * 0.3) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.35) { this.stuckT = 0; this.forcePathT = 2.5; this.pathT = 0; }
    } else this.stuckT = 0;
  }

  hurt(dmg, game) {
    this.hp -= dmg;
    this.hpShowT = 2;
    Sfx.hit();
    if (this.hp <= 0) return true;
    const near = game.nearestActivePlayer(this.x, this.y);
    if (near && near.invisT <= 0) {
      this.state = 'chase'; this.target = near;
      near.wasSpotted = true;
      this.lastKnown = { x: near.x, y: near.y };
      this.memoryT = this.cfg.memory * (this.type.memMul || 1) + 2;
    }
    return false;
  }
}

// 幽火的吐息弹
class MonsterOrb {
  constructor(x, y, angle, dmg) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 190;
    this.vy = Math.sin(angle) * 190;
    this.dmg = dmg;
    this.life = 2.6;
    this.anim = 0;
  }
  update(dt, game) {
    this.life -= dt; this.anim += dt;
    if (this.life <= 0) return false;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (isSolidAt(this.x, this.y)) { game.spark(this.x, this.y, '#7ef7ff'); return false; }
    for (const p of game.players) {
      if (!p.active) continue;
      if (Math.hypot(p.x - this.x, p.y - this.y) < PLAYER_R + 7) {
        game.damagePlayer(p, this.dmg, null);
        game.spark(this.x, this.y, '#7ef7ff');
        return false;
      }
    }
    return true;
  }
}

class Bullet {
  constructor(x, y, angle, def, owner, dmgMul = 1) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.speed = def.speed;
    this.dmg = Math.round(def.dmg * dmgMul);
    this.pierce = def.pierce || 1;
    this.knock = def.knock || 80;
    this.range = def.range || 500;
    this.slow = def.slow || 0;
    this.burn = def.burn || 0;
    this.freeze = def.freeze || 0;
    this.explosive = def.explosive || 0;
    this.traveled = 0;
    this.owner = owner;
    this.laser = def.id === 'laser';
    this.frost = def.id === 'frost';
    this.homing = !def.pellets;   // 散射类武器不追踪
    this.turn = def.turn || HOMING.turn;  // 追踪转向速率（弧度/秒）
    this.duck = !!def.duck;       // 追踪鸭雷外观
    this.hitSet = new Set();
  }
  update(dt, game) {
    // 轻微弹道追踪：锁定前方小锥形内最近的怪
    if (this.homing) {
      let best = null, bd = HOMING.dist;
      for (const m of game.monsters) {
        if (m.state === 'ambush' || this.hitSet.has(m)) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d > bd) continue;
        let da = Math.atan2(m.y - this.y, m.x - this.x) - this.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < HOMING.cone) { best = m; bd = d; }
      }
      if (best) {
        let da = Math.atan2(best.y - this.y, best.x - this.x) - this.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const turn = this.turn * dt;
        this.angle += Math.max(-turn, Math.min(turn, da));
      }
    }
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;

    const stepLen = this.speed * dt;
    this.traveled += stepLen;
    if (this.traveled > this.range) { if (this.explosive) game.explode(this.x, this.y, this); return false; }
    const steps = Math.ceil(stepLen / 8);
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * dt / steps;
      this.y += this.vy * dt / steps;
      if (isSolidAt(this.x, this.y)) {
        if (this.explosive) game.explode(this.x, this.y, this);
        else game.spark(this.x, this.y, '#ccc');
        return false;
      }
      for (const m of game.monsters) {
        if (this.hitSet.has(m)) continue;
        if (Math.hypot(m.x - this.x, m.y - this.y) < m.r + 4) {
          if (this.explosive) { game.explode(this.x, this.y, this); return false; }
          this.hitSet.add(m);
          game.spark(this.x, this.y, this.frost || this.freeze ? '#bfe9ff' : '#ff8f5c');
          m.knock(this.angle, this.knock * 4);
          if (this.slow) m.slowT = Math.max(m.slowT, this.slow);
          if (this.burn) m.burnT = Math.max(m.burnT, this.burn);
          if (this.freeze) { m.stunT = Math.max(m.stunT, this.freeze); game.floater(m.x, m.y - 22, '❄冻结!', '#bfe9ff'); }
          // 骨戟卫兵：正面来弹被盾牌格挡（伤害 ×0.35）
          let dmg = this.dmg;
          if (m.type.shieldFront) {
            let da = this.angle - m.faceDir;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > 2.1) { dmg = Math.max(1, Math.round(dmg * 0.35)); game.floater(m.x, m.y - 22, '格挡!', '#c9ced8'); }
          }
          if (m.hurt(dmg, game)) game.killMonster(m, this.owner);
          this.pierce--;
          if (this.pierce <= 0) return false;
        }
      }
    }
    return true;
  }
}

class Chest {
  constructor(x, y, tier) {
    this.x = x; this.y = y; this.tier = tier;
    this.opened = false;
    this.progress = 0;
    this.anim = Math.random() * 10;
  }
  get def() { return CHEST_TIERS[this.tier]; }
}

class GroundLoot {
  constructor(x, y, items) {
    this.x = x; this.y = y;
    this.items = items;
    this.anim = 0;
  }
}

// 怪物掉落的碎金
class GoldDrop {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.anim = Math.random() * 10;
  }
}

// 雇佣兵：跟随雇主、自动攻击可见怪物、替雇主挡刀
class Mercenary {
  constructor(x, y, def, owner) {
    this.x = x; this.y = y;
    this.def = def;
    this.owner = owner;
    this.hp = def.hp; this.maxHp = def.hp;
    this.isMerc = true;
    this.facing = 0;
    this.attackCd = 0;
    this.anim = Math.random() * 10;
    this.hurtCd = 0;
  }
  hurt(dmg, game) {
    this.hp -= dmg;
    this.hurtCd = 0.3;
    Sfx.hit();
    if (this.hp <= 0) {
      game.floater(this.x, this.y - 24, `${this.def.name} 倒下了…`, '#ff8f8f');
      game.toast(`${this.def.name} 阵亡了`, '#ff8f8f');
      Sfx.death();
    }
  }
  update(dt, game) {
    if (this.hp <= 0) return;
    this.anim += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    const o = this.owner;
    // 找射程内最近的可见怪（潜伏中的不打，免得帮倒忙）
    let target = null, td = (this.def.range || 58) + 200;
    for (const m of game.monsters) {
      if (m.state === 'ambush') continue;
      const d = Math.hypot(m.x - this.x, m.y - this.y);
      if (d < td && losClear(this.x, this.y, m.x, m.y)) { target = m; td = d; }
    }
    let goal = null, spd = this.def.speed;
    if (target) {
      this.facing = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.def.melee) {
        if (td > this.def.range + target.r - 6) goal = target;
        else if (this.attackCd <= 0) {
          this.attackCd = 1 / this.def.rate;
          Sfx.melee();
          target.knock(this.facing, 500);
          if (target.hurt(this.def.dmg, game)) game.killMonster(target, o);
        }
      } else {
        if (td > this.def.range) goal = target;
        else if (td < 110) goal = { x: this.x - Math.cos(this.facing) * 80, y: this.y - Math.sin(this.facing) * 80 };
        if (this.attackCd <= 0 && td <= this.def.range) {
          this.attackCd = 1 / this.def.rate;
          Sfx.shoot();
          game.bullets.push(new Bullet(this.x + Math.cos(this.facing) * 18, this.y + Math.sin(this.facing) * 18,
            this.facing + (Math.random() - 0.5) * 0.06,
            { id:'mercgun', dmg:this.def.dmg, speed:this.def.bulletSpeed, range:this.def.range + 80, knock:70, spread:0 }, o));
        }
      }
    } else if (o && o.alive) {
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d > 70) { goal = o; this.facing = Math.atan2(o.y - this.y, o.x - this.x); }
    }
    if (goal) {
      const a = Math.atan2(goal.y - this.y, goal.x - this.x);
      const r = resolveCircle(this.x + Math.cos(a) * spd * dt, this.y + Math.sin(a) * spd * dt, 13);
      this.x = r.x; this.y = r.y;
      this.moving = true;
    } else this.moving = false;
    unstick(this);
  }
}

// 神秘商人（不可攻击的 NPC）
class Merchant {
  constructor(x, y, isHorde) {
    this.x = x; this.y = y;
    this.anim = 0;
    this.stock = merchantStock(!!isHorde);
    this.sold = new Set();      // 已售出的货位下标
  }
}

// 无双割草：经验宝石（磁吸拾取）
class XPGem {
  constructor(x, y, v) {
    this.x = x; this.y = y;
    this.v = v;                    // 经验值
    this.anim = Math.random() * 10;
    this.vx = 0; this.vy = 0;
  }
}
