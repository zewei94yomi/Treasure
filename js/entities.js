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
    this.poisonT = 0;                      // 中毒（毒蛇）持续掉血
    this.rootT = 0;                        // 定身（缚魂术士）
    this.paraT = 0;                        // 麻痹（巨蝎）移速骤降
    this.burnT2 = 0;                       // 灼烧（巨龙吐息）
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
    this.flashT = 0;             // 受击闪白
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
    this.flashT = Math.max(0, this.flashT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.screamCd = Math.max(0, this.screamCd - dt);
    // 灼烧：持续掉血；燃烧弹芯点的火会向贴近的怪缓慢蔓延
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.hp -= 5 * dt;
      this.hpShowT = 1;
      if (Math.random() < dt * 8) game.spark(this.x, this.y - 6, '#ff8f3d');
      if (this.fireSpread && Math.random() < dt * 1.1) {
        for (const mm of game.monsters) {
          if (mm !== this && mm.burnT <= 0 && Math.hypot(mm.x - this.x, mm.y - this.y) < 56) {
            mm.burnT = 1.8; mm.fireSpread = true;
            game.spark(mm.x, mm.y - 6, '#ff8f3d');
            break;
          }
        }
      }
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
      spd = cfg.chaseSpeed * baseSpd * (this.enraged ? HORDE_ENRAGE.speedMul : 1) * (typeof tune === 'function' ? tune('mSpeed') : 1);
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

    // —— Boss 专属招式 ——
    if (this.type.boss && this.state === 'chase' && this.target && this.target.active) {
      this.bossT = Math.max(0, (this.bossT || 2) - dt);
      this.bossT2 = Math.max(0, (this.bossT2 || 4) - dt);
      const bd = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (this.type.id === 'boss_cyclops' && this.bossT <= 0 && bd > 100) {
        // 独眼巨人：掷巨石（落点预警圈 → 爆炸）
        this.bossT = 3.4;
        this.windupT = 0.6;
        this.pendingBoulder = { x: this.target.x, y: this.target.y };
        Sfx.brute();
        return;
      }
      if (this.type.id === 'boss_stormdragon') {
        if (this.bossT <= 0 && bd < 240) {
          // 吐息：正面扇形灼烧
          this.bossT = 4.2;
          this.windupT = 0.5;
          this.pendingBreath = true;
          Sfx.wisp();
          return;
        }
        if (this.bossT2 <= 0) {
          // 召雷：玩家脚下落雷预警
          this.bossT2 = 7.5;
          for (const p of game.players) if (p.active) game.bossZones.push({ x: p.x, y: p.y, r: 62, t: 0.85, dmg: Math.round(this.cfg.mDmg * 1.6 * (this.hordeDmgMul || 1)), kind: 'bolt' });
          Sfx.banshee();
        }
      }
      if (this.type.id === 'boss_lich') {
        if (this.bossT <= 0) {
          // 暗影三连弹
          this.bossT = 3.2;
          this.windupT = 0.5;
          this.pendingVolley = true;
          return;
        }
        if (this.bossT2 <= 0 && game.monsters.length < HORDE_CAP + 8) {
          // 召唤幽影仆从
          this.bossT2 = 6.5;
          for (let i = 0; i < 2; i++) {
            const mn = new Monster(this.x + (i ? 40 : -40), this.y + 20, this.cfg, 'shade');
            mn.hp *= 1.2; mn.maxHp = mn.hp;
            mn.state = 'chase'; mn.target = this.target; mn.lastKnown = { x: this.target.x, y: this.target.y }; mn.memoryT = 99;
            unstick(mn);
            game.monsters.push(mn);
          }
          game.floater(this.x, this.y - 34, '☠️ 起来吧，仆从！', '#b48aff');
          Sfx.lurker();
        }
      }
    }

    // —— 冲撞蛮牛：中距离蓄力冲锋 ——
    if (this.type.charger && this.state === 'chase' && this.target && this.target.active) {
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      this.chargeCd = Math.max(0, (this.chargeCd || 0) - dt);
      const minD = this.type.leap ? 80 : 110, maxD = this.type.leap ? 260 : 380;
      if (d > minD && d < maxD && this.chargeCd <= 0 && losClear(this.x, this.y, this.target.x, this.target.y)) {
        this.chargeCd = 4.5;
        this.windupT = this.type.windup;
        this.pendingCharge = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        Sfx.brute();
        return;
      }
    }
    // —— 缚魂术士：中距离吟唱定身术 ——
    if (this.type.caster && this.state === 'chase' && this.target && this.target.active) {
      const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      this.castCd = Math.max(0, (this.castCd || 0) - dt);
      if (d < 340 && d > 120 && this.castCd <= 0 && losClear(this.x, this.y, this.target.x, this.target.y)) {
        this.castCd = 5.5;
        this.windupT = this.type.windup;
        this.pendingRoot = this.target;
        Sfx.banshee();
        game.floater(this.x, this.y - 26, '🔮 吟唱缚魂…', '#b48aff');
        return;
      }
      if (d < 160) {   // 保持距离
        const a = Math.atan2(this.y - this.target.y, this.x - this.target.x);
        this.moveToward({ x: this.x + Math.cos(a) * 90, y: this.y + Math.sin(a) * 90 }, cfg.chaseSpeed * this.type.spdMul * slowMul * 0.9, dt, 1);
        unstick(this);
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
        this.attackCd = (this.type.id === 'brute' ? 1.5 : 1.1) * (this.enraged ? HORDE_ENRAGE.atkMul : 1);
        this.windupT = this.type.windup || 0.32;
        this.pendingRanged = false;
        Sfx.windup();
      }
    }
  }

  // 前摇结束：判定攻击（玩家若已拉开距离则挥空）
  resolveAttack(game) {
    this.recoverT = this.type.recover || 0.45;
    // 缚魂术士：定身命中（有 LOS 即中，翻滚无敌帧可躲）
    if (this.pendingRoot) {
      const t = this.pendingRoot;
      this.pendingRoot = null;
      if (t.active && t.rollT <= 0 && losClear(this.x, this.y, t.x, t.y) &&
          Math.hypot(t.x - this.x, t.y - this.y) < 400) {
        t.rootT = Math.max(t.rootT, 1.2);
        game.floater(t.x, t.y - 40, '⛓️ 被缚魂定身！', '#b48aff');
        Sfx.lurker();
      } else game.floater(this.x, this.y - 20, '施法落空', '#9fd8ff');
      return;
    }
    // Boss：巨石落点 / 吐息 / 暗影弹
    if (this.pendingBoulder) {
      game.bossZones.push({ x: this.pendingBoulder.x, y: this.pendingBoulder.y, r: 88, t: 0.9,
                            dmg: Math.round(this.cfg.mDmg * 2.2 * (this.hordeDmgMul || 1)), kind: 'boulder' });
      this.pendingBoulder = null;
      return;
    }
    if (this.pendingBreath) {
      this.pendingBreath = false;
      const fd = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.faceDir = fd;
      for (const p of game.players.concat(game.mercs)) {
        const alive = p.isMerc ? p.hp > 0 : p.active;
        if (!alive) continue;
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        let da = Math.atan2(p.y - this.y, p.x - this.x) - fd;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (d < 250 && Math.abs(da) < 0.55) {
          const dmg = Math.round(this.cfg.mDmg * 1.4 * (this.hordeDmgMul || 1));
          if (p.isMerc) p.hurt(dmg, game);
          else { game.damagePlayer(p, dmg, this); if (p.active) { p.burnT2 = Math.max(p.burnT2, 3); game.floater(p.x, p.y - 40, '🔥 灼烧！', '#ff8f5c'); } }
        }
      }
      game.breathFx = { x: this.x, y: this.y, dir: fd, t: 0.5 };
      Sfx.boom();
      return;
    }
    if (this.pendingVolley) {
      this.pendingVolley = false;
      if (this.target && this.target.active) {
        const base = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        for (const off of [-0.35, 0, 0.35]) {
          game.monsterOrbs.push(new MonsterOrb(this.x, this.y, base + off, Math.round(this.cfg.mDmg * 1.2 * (this.hordeDmgMul || 1))));
        }
        Sfx.wisp();
      }
      return;
    }
    // 冲撞蛮牛：前摇结束 → 起冲
    if (this.pendingCharge !== undefined && this.pendingCharge !== null) {
      this.charging = { dir: this.pendingCharge, t: this.type.leap ? 0.42 : 0.6, speed: this.type.leap ? 500 : 560, hit: new Set() };
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
      else {
        game.damagePlayer(victim, hitDmg, this);
        // 附加效果：毒蛇→中毒 / 巨蝎→麻痹
        if (!victim.isMerc && victim.active) {
          if (this.type.poison) { victim.poisonT = Math.max(victim.poisonT, this.type.poison); game.floater(victim.x, victim.y - 40, '🟢 中毒！', '#7ac74f'); }
          if (this.type.paralyze) { victim.paraT = Math.max(victim.paraT, this.type.paralyze); game.floater(victim.x, victim.y - 40, '🦂 麻痹！', '#ffd93d'); }
        }
      }
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
    this.flashT = 0.13;
    // 所有伤害来源统一在此冒数字（子弹/近战/技能/地雷/陨石/反伤/佣兵…）
    if (game && game.dmgNum) game.dmgNum(this.x, this.y - this.r * 0.7, dmg, dmg >= 45);
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
    this.homing = !def.pellets && !def.noHoming;   // 散射/骨刺类不追踪
    const hb = def.homing || {};  // 武器专属追踪强化（静音鹅弩）
    this.turn = hb.turn || def.turn || HOMING.turn;
    this.hCone = hb.cone || HOMING.cone;
    this.hDist = hb.dist || HOMING.dist;
    // 鼠标操控：你自己瞄，弹道追踪大幅削弱（技能弹不受影响）
    if (owner && owner.mouseAimed && !def.duck) { this.turn *= 0.25; this.hCone *= 0.4; this.hDist *= 0.55; }
    this.duck = !!def.duck;       // 追踪鸭雷外观
    this.fire = def.id === 'fireball';   // 火球术：贴图弹体 + 火焰拖尾
    this.bone = def.id === 'spear';      // 骨刺：白骨贴图弹体
    this.rocket = def.id === 'rpg';      // RPG：火箭弹体 + 尾烟
    this.hitSet = new Set();
  }
  update(dt, game) {
    // 轻微弹道追踪：锁定前方小锥形内最近的怪
    if (this.homing) {
      let best = null, bd = this.hDist;
      for (const m of game.monsters) {
        if (m.state === 'ambush' || this.hitSet.has(m)) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d > bd) continue;
        let da = Math.atan2(m.y - this.y, m.x - this.x) - this.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < this.hCone) { best = m; bd = d; }
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
    if (this.fire && Math.random() < dt * 42) game.fxTrailFire(this.x, this.y, 20);
    if (this.rocket && Math.random() < dt * 50) game.fxP({ tex: FxTex.smoke, x: this.x, y: this.y,
      vx: -this.vx * 0.06, vy: -this.vy * 0.06 - 10, s0: 12, s1: 30, a0: 0.5, a1: 0, life: 0.5, add: false });

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
          game.fxHit(this.x, this.y, this.angle);
          if (this.owner && this.owner.weaponDef) Sfx.impact();   // 武器命中专属闷响
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
          // 雷电箭：命中放出两跳小闪电
          if (this.zapArrow) {
            let node = m;
            const hs = new Set([m]);
            for (let c = 0; c < 2; c++) {
              let nx = null, nd = 140;
              for (const mm of game.monsters) {
                if (hs.has(mm)) continue;
                const dd = Math.hypot(mm.x - node.x, mm.y - node.y);
                if (dd < nd) { nx = mm; nd = dd; }
              }
              if (!nx) break;
              hs.add(nx);
              if (game.horde && game.hordeState.bolts) game.hordeState.bolts.push({ pts: [{ x: node.x, y: node.y }, { x: nx.x, y: nx.y }], t: 0.14 });
              game.spark(nx.x, nx.y, '#ffe95c');
              if (nx.hurt(Math.max(1, Math.round(this.dmg * 0.5)), game)) game.killMonster(nx, this.owner);
              node = nx;
            }
          }
          // —— 攻击流派弹芯（割草升级；弹片自身不再触发，防止无限连锁） ——
          if (game.horde && this.owner && this.owner.weaponDef && !this.sub && m.hp > 0) {
            const M = game.hordeState.mods;
            if (M.iceShot) {
              m.slowT = Math.max(m.slowT, 1.2);
              if (Math.random() < 0.22 * M.iceShot) { m.stunT = Math.max(m.stunT, 0.8); game.floater(m.x, m.y - 22, '❄', '#bfe9ff'); }
            }
            if (M.fireShot) { m.burnT = Math.max(m.burnT, 2.2); m.fireSpread = true; }
            if (M.zapShot && Math.random() < 0.25 * M.zapShot) {
              let node = m;
              const hs = new Set([m]);
              for (let c = 0; c < 3; c++) {
                let nx = null, nd = 150;
                for (const mm of game.monsters) {
                  if (hs.has(mm)) continue;
                  const dd = Math.hypot(mm.x - node.x, mm.y - node.y);
                  if (dd < nd) { nx = mm; nd = dd; }
                }
                if (!nx) break;
                hs.add(nx);
                if (game.hordeState.bolts) game.hordeState.bolts.push({ pts: [{ x: node.x, y: node.y }, { x: nx.x, y: nx.y }], t: 0.14 });
                if (nx.hurt(Math.max(1, Math.round(this.dmg * 0.4)), game)) game.killMonster(nx, this.owner);
                node = nx;
              }
            }
          }
          if (game.horde && this.owner && this.owner.weaponDef && !this.sub && game.hordeState.mods.splitShot) {
            for (let si = 0; si < 2; si++) {
              const sb = new Bullet(this.x, this.y, this.angle + (si ? 0.75 : -0.75),
                { id: 'splinter', dmg: Math.max(1, Math.round(this.dmg * 0.35)), speed: 520, range: 190, knock: 40 }, this.owner);
              sb.sub = true;
              sb.hitSet.add(m);
              game.bullets.push(sb);
            }
          }
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
    const hpMul = (Game.current && Game.current.horde && Game.current.hordeState && Game.current.hordeState.mods.mercHp) || 1;
    this.hp = Math.round(def.hp * hpMul); this.maxHp = this.hp;
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
      if (!this.isPet) {   // 左侧面板：阵亡名单（鸭灵走复活队列不进名单）
        game.allyFallen = game.allyFallen || [];
        game.allyFallen.push({ id: this.def.id, name: this.def.name, icon: this.def.icon });
      }
      Sfx.death();
    }
  }
  update(dt, game) {
    if (this.hp <= 0) return;
    this.anim += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    const o = this.owner;
    const pow = 1 + ((game.horde && game.hordeState.mods.mercPow) || 0);   // 战友号令：伤害与攻速增益
    // —— 元素法师：四系法术轮转（水元素/黑龙波/激光束/烈焰之环） ——
    if (this.def.mage) {
      this.castT = (this.castT === undefined ? 2.2 : this.castT) - dt;
      let tgt = null, td2 = this.def.range;
      for (const m of game.monsters) {
        if (m.state === 'ambush') continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d < td2) { tgt = m; td2 = d; }
      }
      if (tgt && this.castT <= 0) {
        this.castT = 3.6 / pow;
        this.spellIdx = ((this.spellIdx || 0) % 4) + 1;
        this.facing = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        const A = game.allyFx();
        if (this.spellIdx === 1) {
          // 💧 召唤水元素（同场限一只，存在则快速跳下一法术）
          if (!game.mercs.some(mc => mc.def.id === 'waterele' && mc.hp > 0)) {
            const we = new Mercenary(this.x + 26, this.y, { id: 'waterele', name: '水元素', icon: '💧',
              hp: 240, dmg: 0, rate: 0, range: 0, speed: 150, color: '#6fc8ff', sprite: 'm_waterele', waterele: true }, this.owner);
            we.despawnT = 22;
            unstick(we);
            game.mercs.push(we);
            game.floater(this.x, this.y - 28, '💧 水元素苏醒！', '#6fc8ff');
            Sfx.wisp();
          } else this.castT = 0.4;
        } else if (this.spellIdx === 2) {
          // 🐉 黑龙波：三条黑龙横扫，打出硬直（致敬奇迹MU）
          for (let i = -1; i <= 1; i++) {
            A.waves.push({ x: this.x, y: this.y + i * 46, a: this.facing, t: 2.0, hit: new Set() });
          }
          game.floater(this.x, this.y - 28, '🐉 黑龙波！', '#b48aff');
          Sfx.banshee();
        } else if (this.spellIdx === 3) {
          // ⚡ 激光束：直线贯穿
          A.beams.push({ x0: this.x, y0: this.y, x1: tgt.x, y1: tgt.y, t: 0.28 });
          const dx2 = tgt.x - this.x, dy2 = tgt.y - this.y, len2 = Math.hypot(dx2, dy2) || 1;
          for (const m of game.monsters.slice()) {
            const t2 = Math.max(0, Math.min(1, ((m.x - this.x) * dx2 + (m.y - this.y) * dy2) / (len2 * len2)));
            const px2 = this.x + dx2 * t2, py2 = this.y + dy2 * t2;
            if (Math.hypot(m.x - px2, m.y - py2) < m.r + 14) {
              if (m.hurt(Math.round(42 * pow), game)) game.killMonster(m, this.owner);
            }
          }
          Sfx.laser();
        } else {
          // 🔥 烈焰之环（血法师的火圈）
          A.fires.push({ x: tgt.x, y: tgt.y, r: 95, t: 3.5, tick: 0 });
          game.floater(tgt.x, tgt.y - 28, '🔥 烈焰之环！', '#ff9a4d');
          Sfx.boom();
        }
      }
      if (o && o.alive) {
        const d = Math.hypot(o.x - this.x, o.y - this.y);
        if (d > 96) {
          const a = Math.atan2(o.y - this.y, o.x - this.x);
          this.facing = a;
          const r = resolveCircle(this.x + Math.cos(a) * this.def.speed * dt, this.y + Math.sin(a) * this.def.speed * dt, 13);
          this.x = r.x; this.y = r.y;
          this.moving = true;
        } else this.moving = false;
      }
      unstick(this);
      return;
    }
    // —— 水元素：贴近怪群释放范围水波（击退+减速） ——
    if (this.def.waterele) {
      this.novaT = (this.novaT === undefined ? 1.4 : this.novaT) - dt;
      let near = null, nd2 = 300;
      for (const m of game.monsters) {
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d < nd2) { near = m; nd2 = d; }
      }
      if (this.novaT <= 0 && near && nd2 < 140) {
        this.novaT = 2.4;
        game.fxP({ tex: FxTex.ring, x: this.x, y: this.y, s0: 40, s1: 300, a0: 0.9, a1: 0, life: 0.4 });
        game.fxP({ tex: FxTex.glow, x: this.x, y: this.y, s0: 60, s1: 160, a0: 0.6, a1: 0, life: 0.3 });
        for (const m of game.monsters.slice()) {
          if (Math.hypot(m.x - this.x, m.y - this.y) > 130 + m.r) continue;
          m.knock(Math.atan2(m.y - this.y, m.x - this.x), 620);
          m.slowT = Math.max(m.slowT, 1.2);
          if (m.hurt(22, game)) game.killMonster(m, this.owner);
        }
        Sfx.wisp();
      }
      const goal2 = (near && nd2 < 280) ? near : (o && o.alive && Math.hypot(o.x - this.x, o.y - this.y) > 90 ? o : null);
      if (goal2) {
        const a = Math.atan2(goal2.y - this.y, goal2.x - this.x);
        this.facing = a;
        const r = resolveCircle(this.x + Math.cos(a) * this.def.speed * dt, this.y + Math.sin(a) * this.def.speed * dt, 13);
        this.x = r.x; this.y = r.y;
        this.moving = true;
      } else this.moving = false;
      unstick(this);
      return;
    }
    // —— 牧师鸭：不打怪，周期治疗血量比例最低的队友（玩家+佣兵） ——
    if (this.def.heal) {
      this.healT = (this.healT || 0) - dt;
      if (this.healT <= 0) {
        this.healT = this.def.healCd / pow;
        let tgt2 = null, worst = 0.99;
        for (const p of game.players) {
          if (!p.active || Math.hypot(p.x - this.x, p.y - this.y) > 340) continue;
          const f = p.hp / p.maxHp;
          if (f < worst) { worst = f; tgt2 = p; }
        }
        for (const mc of game.mercs) {
          if (mc === this || mc.hp <= 0 || Math.hypot(mc.x - this.x, mc.y - this.y) > 340) continue;
          const f = mc.hp / mc.maxHp;
          if (f < worst) { worst = f; tgt2 = mc; }
        }
        if (tgt2) {
          const amt = Math.round(this.def.heal * pow);
          tgt2.hp = Math.min(tgt2.maxHp, tgt2.hp + amt);
          game.floater(tgt2.x, tgt2.y - 30, `+${amt}💚`, '#7dff9a');
          game.fxP({ tex: FxTex.glow, x: tgt2.x, y: tgt2.y, s0: 30, s1: 56, a0: 0.5, a1: 0, life: 0.35 });
          Sfx.heal();
        }
      }
      // 跟随雇主
      if (o && o.alive) {
        const d = Math.hypot(o.x - this.x, o.y - this.y);
        if (d > 80) {
          const a = Math.atan2(o.y - this.y, o.x - this.x);
          this.facing = a;
          const r = resolveCircle(this.x + Math.cos(a) * this.def.speed * dt, this.y + Math.sin(a) * this.def.speed * dt, 13);
          this.x = r.x; this.y = r.y;
          this.moving = true;
        } else this.moving = false;
      }
      unstick(this);
      return;
    }
    // —— 金币嗅探犬：满场叼经验宝石和金币（不参战） ——
    if (this.def.fetch) {
      const H2 = game.horde ? game.hordeState : null;
      let tgt2 = null, td2 = this.def.fetch;
      if (H2) for (const gm of H2.gems) { const d = Math.hypot(gm.x - this.x, gm.y - this.y); if (d < td2) { tgt2 = gm; td2 = d; } }
      for (const gd of game.goldDrops) { const d = Math.hypot(gd.x - this.x, gd.y - this.y); if (d < td2) { tgt2 = gd; td2 = d; } }
      let goal2 = null;
      if (tgt2) {
        goal2 = tgt2;
        if (td2 < 24) {   // 叼到：直接结算给雇主
          if (H2 && H2.gems.includes(tgt2)) {
            tgt2.taken = true;
            game.hordeAddXp(Math.round(tgt2.v * (H2.mods.gemMul || 1) * tune('xpRate') * (1 + game.time / 300)));
            H2.gems = H2.gems.filter(g2 => g2 !== tgt2);
          } else {
            SAVE.gold += tgt2.value; game.runCash += tgt2.value;
            game.floater(this.x, this.y - 22, `🐕+${tgt2.value}💰`, '#ffd93d');
            game.goldDrops = game.goldDrops.filter(g2 => g2 !== tgt2);
            Sfx.coin();
          }
        }
      } else if (o && o.alive && Math.hypot(o.x - this.x, o.y - this.y) > 90) goal2 = o;
      if (goal2) {
        const a = Math.atan2(goal2.y - this.y, goal2.x - this.x);
        this.facing = a;
        const r = resolveCircle(this.x + Math.cos(a) * this.def.speed * dt, this.y + Math.sin(a) * this.def.speed * dt, 11);
        this.x = r.x; this.y = r.y;
        this.moving = true;
      } else this.moving = false;
      unstick(this);
      return;
    }
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
          this.attackCd = 1 / (this.def.rate * pow);
          Sfx.melee();
          this.swingT = 0.25;                       // 挥剑动画计时（drawMerc 用）
          if (this.def.sword) {                      // 鸭灵圣剑：小范围横扫（不止单体）
            for (const mm of game.monsters.slice()) {
              if (Math.hypot(mm.x - this.x, mm.y - this.y) > this.def.range + mm.r) continue;
              mm.knock(Math.atan2(mm.y - this.y, mm.x - this.x), 420);
              if (mm.hurt(Math.round(this.def.dmg * pow), game)) game.killMonster(mm, o);
            }
          } else {
            target.knock(this.facing, 500);
            if (target.hurt(Math.round(this.def.dmg * pow), game)) game.killMonster(target, o);
          }
        }
      } else {
        if (td > this.def.range) goal = target;
        else if (td < 110) goal = { x: this.x - Math.cos(this.facing) * 80, y: this.y - Math.sin(this.facing) * 80 };
        if (this.attackCd <= 0 && td <= this.def.range) {
          this.attackCd = 1 / (this.def.rate * pow);
          if (this.def.archer) {
            // 百变箭手：六种箭随机上弦
            const kinds = [
              { c: '#ff9a4d', burn: 2.2, n: '火' },
              { c: '#9fd8ff', slow: 2, freeze: 0.5, n: '冰' },
              { c: '#7ac74f', burn: 3, n: '毒' },
              { c: '#ffe95c', zapArrow: true, n: '雷' },
              { c: '#ff7b2d', explosive: 62, n: '爆' },
              { c: '#c9ced8', knock: 460, n: '退' },
            ];
            const k = kinds[Math.floor(Math.random() * kinds.length)];
            const ab = new Bullet(this.x + Math.cos(this.facing) * 18, this.y + Math.sin(this.facing) * 18,
              this.facing + (Math.random() - 0.5) * 0.04,
              { id: 'arrow', dmg: Math.round(this.def.dmg * pow), speed: this.def.bulletSpeed, range: this.def.range + 80,
                knock: k.knock || 90, burn: k.burn, slow: k.slow, freeze: k.freeze, explosive: k.explosive, noHoming: true }, o);
            ab.arrowC = k.c;
            ab.zapArrow = !!k.zapArrow;
            game.bullets.push(ab);
            Sfx.crossbow();
          } else if (this.def.mech) {
            // 重装机兵：双管 MG3 交替喷射 + 周期火炮支援
            this.barrel = 1 - (this.barrel || 0);
            const side = this.barrel ? 1 : -1;
            const ox2 = Math.cos(this.facing + Math.PI / 2) * 10 * side, oy2 = Math.sin(this.facing + Math.PI / 2) * 10 * side;
            game.bullets.push(new Bullet(this.x + ox2 + Math.cos(this.facing) * 20, this.y + oy2 + Math.sin(this.facing) * 20,
              this.facing + (Math.random() - 0.5) * 0.12,
              { id: 'mercgun', dmg: Math.round(this.def.dmg * pow), speed: this.def.bulletSpeed, range: this.def.range + 80, knock: 60, spread: 0 }, o));
            if (this.barrel) Sfx.mg();
          } else {
            (this.def.id === 'sniper' ? Sfx.crossbow : Sfx.shoot)();
            game.bullets.push(new Bullet(this.x + Math.cos(this.facing) * 18, this.y + Math.sin(this.facing) * 18,
              this.facing + (Math.random() - 0.5) * 0.06,
              { id:'mercgun', dmg:Math.round(this.def.dmg * pow), speed:this.def.bulletSpeed, range:this.def.range + 80, knock:70, spread:0 }, o));
          }
        }
        // 机兵：周期呼叫火炮覆盖目标区域
        if (this.def.mech) {
          this.artyT = (this.artyT === undefined ? 8 : this.artyT) - dt;
          if (this.artyT <= 0 && target) {
            this.artyT = 9;
            const A = game.allyFx();
            const placed = [];
            for (let i = 0; i < 5; i++) {
              // 落点避墙 + 彼此隔开 60px
              let sx3 = target.x, sy3 = target.y, ok3 = false;
              for (let tr = 0; tr < 12; tr++) {
                sx3 = target.x + (Math.random() - 0.5) * 260;
                sy3 = target.y + (Math.random() - 0.5) * 220;
                if (isSolidAt(sx3, sy3)) continue;
                if (placed.some(q => Math.hypot(q.x - sx3, q.y - sy3) < 60)) continue;
                ok3 = true; break;
              }
              if (!ok3) continue;
              placed.push({ x: sx3, y: sy3 });
              A.strikes.push({ x: sx3, y: sy3, t: 0.5 + i * 0.16 });
            }
            game.floater(this.x, this.y - 30, '📡 火炮支援！', '#7ef7ff');
            Sfx.aggro();
          }
        }
      }
    } else if (o && o.alive) {
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d > 70) { goal = o; this.facing = Math.atan2(o.y - this.y, o.x - this.x); }
    }
    if (goal) {
      let gx = goal.x, gy = goal.y;
      if (goal === o) {   // 跟随雇主：按队伍序号错开站位，不再挤同一个点
        const idx = game.mercs.indexOf(this);
        const slot = idx * 2.4 + 1.3;
        gx += Math.cos(slot) * 52; gy += Math.sin(slot) * 52;
      }
      const a = Math.atan2(gy - this.y, gx - this.x);
      const r = resolveCircle(this.x + Math.cos(a) * spd * dt, this.y + Math.sin(a) * spd * dt, 13);
      this.x = r.x; this.y = r.y;
      this.moving = true;
    } else this.moving = false;
    // 相互推挤：避免佣兵重叠共享路线
    for (const mc of game.mercs) {
      if (mc === this || mc.hp <= 0) continue;
      const d = Math.hypot(mc.x - this.x, mc.y - this.y);
      if (d > 0.01 && d < 26) {
        const push2 = (26 - d) * 2.2 * dt;
        const a2 = Math.atan2(this.y - mc.y, this.x - mc.x);
        const r2 = resolveCircle(this.x + Math.cos(a2) * push2 * 10, this.y + Math.sin(a2) * push2 * 10, 13);
        this.x = r2.x; this.y = r2.y;
      }
    }
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
