// ============ 无双割草扩展模块（Game.prototype 扩展） ============
// 六个新技能引擎 / 贴合 build 的智能三选一 / Boss 后局内商人
'use strict';

Object.assign(Game.prototype, {

  // —— 智能三选一：优先贴合已选技能与当前状态（覆盖 game.js 基础版） ——
  openLevelup() {
    const H = this.hordeState;
    H.picked = H.picked || {};
    const owned = u => (u.skill ? H.skills[u.skill] : H.picked[u.id]) || 0;
    const pool = HORDE_UPGRADES.filter(u => {
      if (owned(u) >= u.max) return false;
      if (u.requires && !(H.skills[u.requires] > 0)) return false;   // 变体：先有母技能
      if (u.mercOnly && !this.mercs.some(mc => mc.hp > 0)) return false;   // 招募流：有佣兵在场才出
      if (u.gate && !u.gate(H)) return false;                              // 门槛型升级（呼叫支援等）
      if (u.heroUp && !this.mercs.some(mc => mc.hp > 0 && mc.def.id === u.heroUp)) return false;   // 英雄专属卡：该英雄在场才出
      return true;
    });
    if (!pool.length) { H.freeChoices = 0; return; }

    const anySkill = Object.values(H.skills).some(v => v > 0);
    const lowHp = this.players.some(p => p.active && p.hp < p.maxHp * 0.4);
    const weights = new Map();
    for (const u of pool) {
      let w = 10;
      const cur = owned(u);
      if (cur > 0) w *= 1.8 + cur * 0.6;                    // 已投资的路线优先出现
      if (u.skill && !anySkill) w *= 1.7;                    // 还没技能时鼓励开技能
      if (u.requires) w *= 1.6;                              // 变体强化贴合已有 build
      if (lowHp && (u.id === 'maxhp' || u.id === 'steal' || u.id === 'regen' || u.id === 'barrier')) w *= 2.2;  // 残血时供生存牌
      if (u.special === 'recruit') w *= this.mercs.some(mc => mc.hp > 0) ? 1.2 : 1.8;   // 招募卡：无佣兵时更常见
      if (u.heroUp) w *= 1.5;                                                             // 英雄专属卡贴合 build
      // 近战流没有弹道类需求
      const def = this.players[0].weaponDef();
      if (def.melee && (u.id === 'multi' || u.id === 'pierce' || u.id === 'range')) w *= 0.35;
      weights.set(u, w);
    }
    const choices = [];
    const bag = pool.slice();
    while (choices.length < 3 && bag.length) {
      let total = 0;
      for (const u of bag) total += weights.get(u);
      let r = Math.random() * total;
      let pick = bag[0];
      for (const u of bag) { r -= weights.get(u); if (r <= 0) { pick = u; break; } }
      choices.push(pick);
      bag.splice(bag.indexOf(pick), 1);
    }
    this.levelupChoices = choices;
    this.levelupOpen = true;
    this.paused = true;
    UI.renderLevelup(this, choices);
  },

  // —— 六个新技能（由 hordeUpdate 调用） ——
  updateHordeExtraSkills(dt) {
    const H = this.hordeState;
    if (!H.ex) H.ex = { whirlT: 2, barrierT: 5, mineT: 2, meteorT: 4, boomT: 2.5, mines: [], meteors: [], booms: [], whirlFx: [] };
    const ex = H.ex;
    const S = H.skills;

    // 🌪️ 旋风斩
    if (S.whirlwind > 0) {
      ex.whirlT -= dt;
      if (ex.whirlT <= 0) {
        ex.whirlT = Math.max(1.2, 2.6 - S.whirlwind * 0.25);
        for (const p of this.players) {
          if (!p.active) continue;
          const R = 90 + S.whirlwind * 8;
          ex.whirlFx.push({ x: p.x, y: p.y, r: R, t: 0.35, pl: p, a0: p.facing });
          for (const m of this.monsters.slice()) {
            if (Math.hypot(m.x - p.x, m.y - p.y) > R + m.r) continue;
            m.knock(Math.atan2(m.y - p.y, m.x - p.x), 700);
            if (m.hurt(18 + S.whirlwind * 8, this)) this.killMonster(m, p);
          }
          Sfx.melee();
        }
      }
    }
    // 🛡️ 圣盾守护
    if (S.barrier > 0) {
      ex.barrierT -= dt;
      if (ex.barrierT <= 0) {
        ex.barrierT = Math.max(5, 12 - S.barrier);
        for (const p of this.players) {
          if (!p.active) continue;
          p.tempShield = Math.min(150, p.tempShield + 20 + S.barrier * 10);
        }
        Sfx.buy();
        this.floater(this.players[0].x, this.players[0].y - 46, '🛡️ 圣盾展开！', '#9fd8ff');
      }
    }
    // 🧨 鸭式地雷
    if (S.mines > 0) {
      ex.mineT -= dt;
      if (ex.mineT <= 0) {
        ex.mineT = Math.max(1.2, 3.2 - S.mines * 0.3);
        for (const p of this.players) {
          if (!p.active || !p.moving) continue;
          if (ex.mines.length >= 6 + S.mines) ex.mines.shift();
          ex.mines.push({ x: p.x, y: p.y + 10, t: 30 });
        }
      }
      for (const mine of ex.mines) {
        mine.t -= dt;
        for (const m of this.monsters) {
          if (Math.hypot(m.x - mine.x, m.y - mine.y) < m.r + 20) { mine.boom = true; break; }
        }
        if (mine.boom || mine.t <= 0) {
          if (mine.boom) {
            Sfx.boom();
            this.shake = Math.max(this.shake, 5);
            this.fxExplosion(mine.x, mine.y, 74);
            for (const m of this.monsters.slice()) {
              const d = Math.hypot(m.x - mine.x, m.y - mine.y);
              if (d > 74 + m.r) continue;
              m.knock(Math.atan2(m.y - mine.y, m.x - mine.x), 800);
              if (m.hurt(26 + S.mines * 10, this)) this.killMonster(m, this.players[0]);
            }
          }
        }
      }
      ex.mines = ex.mines.filter(mn => !mn.boom && mn.t > 0);
    }
    // ☄️ 天降正义：排程仅在持有技能时；下坠/引爆/清理永远执行
    //（修复：无人机·空袭在未点陨石时砸下的陨石曾因守卫跳过结算，红圈永久残留）
    if (S.meteor > 0) {
      ex.meteorT -= dt;
      if (ex.meteorT <= 0) {
        ex.meteorT = Math.max(1.6, (5.5 - S.meteor * 0.5) * (H.mods.meteorCd || 1));
        const count = 1 + Math.floor(S.meteor / 2) + (H.mods.meteorN || 0);
        for (let i = 0; i < count && this.monsters.length; i++) {
          const m = this.monsters[Math.floor(Math.random() * this.monsters.length)];
          ex.meteors.push({ x: m.x, y: m.y, t: 0.8 });
        }
      }
    }
    {
      for (const mt of ex.meteors) {
        mt.t -= dt;
        // 下坠中的火焰彗尾
        const fall = Math.max(0, mt.t / 0.8);
        if (Math.random() < dt * 40) this.fxTrailFire(mt.x + fall * 90, mt.y - fall * 260, 24);
        if (mt.t <= 0) {
          Sfx.boom();
          this.shake = Math.max(this.shake, 7);
          const mR = 84 * (H.mods.meteorR || 1);
          this.fxExplosion(mt.x, mt.y, mR);
          for (const m of this.monsters.slice()) {
            const d = Math.hypot(m.x - mt.x, m.y - mt.y);
            if (d > mR + m.r) continue;
            m.burnT = Math.max(m.burnT, 1.5);
            if (m.hurt(mt.arty ? 26 + (mt.lv || 1) * 9 : 30 + S.meteor * 12, this)) this.killMonster(m, this.players[0]);
          }
        }
      }
      ex.meteors = ex.meteors.filter(mt => mt.t > 0);
    }
    // 🪚 回旋飞盘 → 巨型锯盘：一路碾过去再碾回来，同一目标可被反复切割（与追踪鸭雷彻底区分：
    // 鸭雷=单点追踪导弹，锯盘=一条血路的清线器）
    if (S.boomerang > 0) {
      ex.boomT -= dt;
      if (ex.boomT <= 0) {
        ex.boomT = Math.max(1.2, 2.8 - S.boomerang * 0.28);
        for (const p of this.players) {
          if (!p.active) continue;
          ex.booms.push({ x: p.x, y: p.y, a: p.facing, d: 0, max: 300 + S.boomerang * 30, back: false, pl: p, spin: 0 });
          if (S.boomerang >= 3) ex.booms.push({ x: p.x, y: p.y, a: p.facing + Math.PI, d: 0, max: 300 + S.boomerang * 30, back: false, pl: p, spin: 0 });  // 3 级起背后再甩一片
        }
        Sfx.crossbow();
      }
      for (const b of ex.booms) {
        b.spin += dt * 18;
        const sp = 500 * dt;
        if (!b.back) {
          b.x += Math.cos(b.a) * sp; b.y += Math.sin(b.a) * sp;
          b.d += sp;
          if (b.d >= b.max || isSolidAt(b.x, b.y)) b.back = true;
        } else {
          const ang = Math.atan2(b.pl.y - b.y, b.pl.x - b.x);
          b.x += Math.cos(ang) * sp * 1.3; b.y += Math.sin(ang) * sp * 1.3;
          if (Math.hypot(b.pl.x - b.x, b.pl.y - b.y) < 26) b.done = true;
        }
        for (const m of this.monsters.slice()) {
          if ((m.sawCd || 0) > this.time) continue;          // 0.3s 后可被同一锯盘再次切割
          if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + 20) {
            m.sawCd = this.time + 0.3;
            m.knock(b.back ? Math.atan2(m.y - b.y, m.x - b.x) : b.a, 260);
            if (m.hurt(34 + S.boomerang * 14, this)) this.killMonster(m, b.pl);
            this.spark(b.x, b.y, '#ffd93d');
            this.fxHit(b.x, b.y, b.a);
          }
        }
      }
      ex.booms = ex.booms.filter(b => !b.done);
    }
    // 🧄 蒜香领域（贴身持续灼烧）
    if (S.garlic > 0) {
      ex.garlicT = (ex.garlicT || 0) - dt;
      if (ex.garlicT <= 0) {
        ex.garlicT = 0.5;
        for (const p of this.players) {
          if (!p.active) continue;
          const R = 88 + S.garlic * 12;
          for (const m of this.monsters.slice()) {
            if (Math.hypot(m.x - p.x, m.y - p.y) > R + m.r) continue;
            if (m.hurt(5 + S.garlic * 3, this)) this.killMonster(m, p);
          }
        }
      }
    }
    // 🦴 骨刺环发（八方radial弹）
    if (S.spears > 0) {
      ex.spearT = (ex.spearT === undefined ? 2 : ex.spearT) - dt;
      if (ex.spearT <= 0) {
        ex.spearT = Math.max(1.6, 3.5 - S.spears * 0.3);
        for (const p of this.players) {
          if (!p.active) continue;
          const n = 8 + S.spears;
          for (let i = 0; i < n; i++) {
            const a = i * Math.PI * 2 / n + this.time;
            this.bullets.push(new Bullet(p.x, p.y, a,
              { id: 'spear', dmg: 14 + S.spears * 6, speed: 560, range: 260 + S.spears * 18, knock: 110, noHoming: true }, p, 1));
          }
        }
        Sfx.crossbow();
      }
    }
    // 🛸 无人机鸭：编队点射（僚机变体可加机，频率随级提升）
    if (S.drone > 0) {
      ex.droneT = (ex.droneT || 0) - dt;
      const droneCount = 1 + (H.mods.droneN || 0);
      if (ex.droneT <= 0) {
        ex.droneT = Math.max(0.24, 0.92 - S.drone * 0.12);
        if (!ex.droneAims) ex.droneAims = [];
        for (const p of this.players) {
          if (!p.active) continue;
          for (let di = 0; di < droneCount; di++) {
            const ph = this.time * 1.4 + di * Math.PI * 2 / droneCount;
            const dx = p.x - Math.cos(ph) * 56;
            const dy = p.y - Math.sin(ph) * 56 - 24;
            let tgt = null, td = 490;
            for (const m of this.monsters) {
              const d = Math.hypot(m.x - dx, m.y - dy);
              if (d < td) { tgt = m; td = d; }
            }
            if (tgt) {
              const a = Math.atan2(tgt.y - dy, tgt.x - dx);
              ex.droneAims[di] = a;
              this.fxMuzzle(dx + Math.cos(a) * 16, dy + Math.sin(a) * 16, a);
              this.bullets.push(new Bullet(dx, dy, a,
                { id: 'dronegun', dmg: 24 + S.drone * 10, speed: 760, range: 560, knock: 80, pierce: 2 }, p, 1));
              // 无人机·空袭：概率呼叫天降正义
              if (H.mods.droneStrike && Math.random() < 0.12 * H.mods.droneStrike && !isSolidAt(tgt.x, tgt.y)) {
                ex.meteors.push({ x: tgt.x, y: tgt.y, t: 0.7 });
                this.floater(dx, dy - 16, '📡 呼叫空袭！', '#7ef7ff');
              }
            }
          }
        }
      }
    }
    // 🔥 火球术：掷向最近怪群，爆裂灼烧
    if (S.fireball > 0) {
      ex.fireT = (ex.fireT === undefined ? 1.5 : ex.fireT) - dt;
      if (ex.fireT <= 0) {
        ex.fireT = Math.max(1.1, 2.9 - S.fireball * 0.3);
        for (const p of this.players) {
          if (!p.active) continue;
          let tgt = null, td = 560;
          for (const m of this.monsters) {
            const d = Math.hypot(m.x - p.x, m.y - p.y);
            if (d < td) { tgt = m; td = d; }
          }
          if (tgt) {
            const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
            this.bullets.push(new Bullet(p.x, p.y, a,
              { id: 'fireball', dmg: 18 + S.fireball * 7, speed: 360, range: 560,
                knock: 120, explosive: 58 + S.fireball * 7, burn: 2 }, p, 1));
            Sfx.wisp();
          }
        }
      }
    }
    // 🐥 召唤鸭灵：持圣剑的小战士——每只阵亡后独立计时 5 秒并行复活（修复：团灭后只能 5 秒回一只）
    if (S.summon > 0) {
      if (!ex.pets) ex.pets = [];
      if (!ex.petQueue) ex.petQueue = [];
      const before = ex.pets.length;
      ex.pets = ex.pets.filter(pet => pet.hp > 0);
      for (let i = 0; i < before - ex.pets.length; i++) ex.petQueue.push(5);   // 每只阵亡挂一个 5s 复活计时
      const petCap = S.summon + (H.mods.petN || 0);
      const pow = 1 + (H.mods.petPow || 0) * 0.4;
      while (ex.pets.length + ex.petQueue.length < petCap) ex.petQueue.push(0.5);  // 新升级立刻补编制
      for (let i = ex.petQueue.length - 1; i >= 0; i--) {
        ex.petQueue[i] -= dt;
        if (ex.petQueue[i] > 0 || ex.pets.length >= petCap) continue;
        ex.petQueue.splice(i, 1);
        const owner = this.players.find(p => p.active);
        if (!owner) continue;
        const pet = new Mercenary(owner.x + 26, owner.y + 26,
          { id: 'petduck', name: '鸭灵', icon: '🐥', hp: Math.round((100 + S.summon * 50) * pow), dmg: Math.round((14 + S.summon * 7) * pow),
            rate: 1.6, melee: true, range: 70, sword: true, speed: 175 }, owner);
        pet.isPet = true;
        unstick(pet);
        this.mercs.push(pet);
        ex.pets.push(pet);
        this.floater(pet.x, pet.y - 20, '🐥 鸭灵苏醒！', '#ffd93d');
      }
    }
    // 📡 呼叫支援：周期火炮空袭——沿射击方向的大范围炮弹雨
    if (S.arty > 0) {
      ex.artyT = (ex.artyT === undefined ? 6 : ex.artyT) - dt;
      if (ex.artyT <= 0) {
        ex.artyT = Math.max(7, 14 - S.arty * 2);
        for (const p of this.players) {
          if (!p.active) continue;
          const cx = p.x + Math.cos(p.facing) * 260, cy = p.y + Math.sin(p.facing) * 260;
          const shells = 5 + S.arty * 2;
          const placed = [];
          for (let i = 0; i < shells; i++) {
            // 落点校验：不进墙、彼此至少隔 70px（不重叠）
            let sx2 = cx, sy2 = cy, ok = false;
            for (let tries = 0; tries < 14; tries++) {
              sx2 = cx + (Math.random() - 0.5) * 360;
              sy2 = cy + (Math.random() - 0.5) * 280;
              if (isSolidAt(sx2, sy2)) continue;
              if (placed.some(q => Math.hypot(q.x - sx2, q.y - sy2) < 70)) continue;
              ok = true; break;
            }
            if (!ok) continue;
            placed.push({ x: sx2, y: sy2 });
            ex.meteors.push({ x: sx2, y: sy2, t: 0.5 + i * 0.14, arty: true, lv: S.arty });
          }
          this.floater(p.x, p.y - 46, '📡 火炮支援已呼叫！', '#7ef7ff');
          Sfx.aggro();
        }
      }
    }
    // ⏱️ 时缓力场（被动光环）
    if (S.chrono > 0) {
      const R = 120 + S.chrono * 15;
      for (const p of this.players) {
        if (!p.active) continue;
        for (const m of this.monsters) {
          if (Math.hypot(m.x - p.x, m.y - p.y) < R + m.r) m.slowT = Math.max(m.slowT, 0.25);
        }
      }
    }
    for (const fx of ex.whirlFx) fx.t -= dt;
    ex.whirlFx = ex.whirlFx.filter(fx => fx.t > 0);

    // —— 局内商人倒计时 ——
    if (this.merchant && this.merchantDespawnT !== undefined) {
      this.merchantDespawnT -= dt;
      if (this.merchantDespawnT <= 0 && !this.merchantOpen) {
        this.merchant = null;
        this.toast('神秘商人收摊离开了……', '#b48aff');
      }
    }
  },

  // Boss 死后：商人闻着金币味赶来摆摊 45 秒
  spawnHordeMerchant() {
    const p = this.players.find(pl => pl.active) || this.players[0];
    const a = Math.random() * Math.PI * 2;
    const mx = p.x + Math.cos(a) * 240, my = p.y + Math.sin(a) * 240;
    this.merchant = new Merchant(mx, my, true);
    const r = resolveCircle(this.merchant.x, this.merchant.y, 16);
    this.merchant.x = r.x; this.merchant.y = r.y;
    unstick(this.merchant);
    this.merchantDespawnT = 45;
    this.toast('🏮 神秘商人闻着金币味赶来了！45 秒内可交易（换武器/买补给）', '#b48aff');
  },

  // 新技能的视觉层（renderView 黑暗层之上调用）
  drawHordeExtras(ctx, cam, w) {
    const H = this.hordeState;
    if (!H || !H.ex) return;
    const ex = H.ex;
    const W2S = (x, y) => [x - cam.x, y - cam.y];
    for (const mine of ex.mines) {
      const [sx, sy] = W2S(mine.x, mine.y);
      // 精绘地雷：金属盘 + 铆钉 + 呼吸红灯（临爆快闪）
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 4, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      const mg = ctx.createRadialGradient(-3, -4, 2, 0, 0, 12);
      mg.addColorStop(0, '#8a94a6'); mg.addColorStop(0.55, '#4a5264'); mg.addColorStop(1, '#23283a');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#141826'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#9aa4b8';
      for (const a of [0.6, 2.2, 4.0, 5.6]) { ctx.beginPath(); ctx.arc(Math.cos(a) * 7, Math.sin(a) * 5, 1.2, 0, Math.PI * 2); ctx.fill(); }
      const urgent = mine.t < 4;
      const led = Math.sin(this.time * (urgent ? 22 : 6)) > 0;
      ctx.fillStyle = led ? '#ff3b3b' : '#5c1420';
      ctx.beginPath(); ctx.arc(0, -2, 2.4, 0, Math.PI * 2); ctx.fill();
      if (led) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(FxTex.glow, -9, -11, 18, 18);
      }
      ctx.restore();
    }
    for (const mt of ex.meteors) {
      const [sx, sy] = W2S(mt.x, mt.y);
      const prog = Math.max(0, Math.min(1, 1 - mt.t / 0.8));   // 火炮引信可长于 0.8s，收拢进度须钳制
      // 落点预警：双环 + 随进度收拢的实心警告
      ctx.strokeStyle = `rgba(255,120,40,${0.45 + Math.sin(this.time * 10) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,90,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 60 * prog, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,110,40,${0.10 + prog * 0.10})`;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.fill();
      // 下坠岩体：火焰辉光包裹的碎裂陨石
      const fall = mt.t / 0.8;
      const rx = sx + fall * 90, ry = sy - fall * 260;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(FxTex.fire, rx - 20, ry - 20, 40, 40);
      ctx.restore();
      ctx.save();
      ctx.translate(rx, ry); ctx.rotate(this.time * 6 + mt.x);
      const rg = ctx.createRadialGradient(-3, -3, 1, 0, 0, 10);
      rg.addColorStop(0, '#7a6355'); rg.addColorStop(1, '#332420');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-9, -3); ctx.lineTo(-3, -9); ctx.lineTo(5, -8); ctx.lineTo(9, 0); ctx.lineTo(5, 8); ctx.lineTo(-4, 8); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff9a4d'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(1, 1); ctx.lineTo(-1, 5); ctx.stroke();
      ctx.restore();
    }
    for (const b of ex.booms) {
      const [sx, sy] = W2S(b.x, b.y);
      ctx.save();
      ctx.translate(sx, sy);
      // 拖影
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.drawImage(FxTex.glow, -22, -22, 44, 44);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.rotate(b.spin);
      // 巨型锯盘：钢盘 + 锯齿 + 中轴
      const R = 17;
      ctx.fillStyle = '#aeb6c8'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a0 = i * Math.PI / 5, a1 = a0 + Math.PI / 10;
        ctx.lineTo(Math.cos(a0) * (R + 5), Math.sin(a0) * (R + 5));
        ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const sg = ctx.createRadialGradient(-4, -4, 2, 0, 0, R);
      sg.addColorStop(0, '#dde3ee'); sg.addColorStop(1, '#7d8598');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a4152';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const fx of ex.whirlFx) {
      // 旋风斩：一把圣剑绕身横扫一整圈 + 加色拖影弧 + 剑尖火星
      const [sx, sy] = W2S(fx.pl.x, fx.pl.y);
      const prog = 1 - fx.t / 0.35;
      const ang = (fx.a0 || 0) + prog * Math.PI * 2;
      const rr = fx.r * 0.68;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 6; i++) {
        ctx.strokeStyle = `rgba(255,235,160,${Math.max(0, 0.55 - i * 0.085)})`;
        ctx.lineWidth = 12 - i * 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, rr, ang - i * 0.34, ang - (i - 1) * 0.34); ctx.stroke();
      }
      ctx.restore();
      const simg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_sword;
      if (simg && simg.naturalWidth) {
        ctx.save();
        ctx.translate(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr);
        ctx.rotate(ang + Math.PI / 4);   // 贴图剑尖朝东北(-45°)，补偿后指向扫击方向外侧
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(simg, -21, -21, 42, 42);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        ctx.strokeStyle = `rgba(255,230,150,${fx.t * 2.4})`;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(sx, sy, rr, ang - 0.5, ang); ctx.stroke();
      }
      if (Math.random() < 0.5) this.fxP({ tex: FxTex.spark, x: fx.pl.x + Math.cos(ang) * fx.r * 0.9, y: fx.pl.y + Math.sin(ang) * fx.r * 0.9,
        vx: Math.cos(ang + 1.6) * 160, vy: Math.sin(ang + 1.6) * 160, drag: 3, s0: 9, s1: 2, a0: 1, a1: 0, life: 0.25 });
    }
    if (H.skills.drone > 0) {
      const droneCount = 1 + (H.mods.droneN || 0);
      for (const p of this.players) {
        if (!p.active) continue;
        for (let di = 0; di < droneCount; di++) {
        const ph = this.time * 1.4 + di * Math.PI * 2 / droneCount;
        const [sx, sy0] = W2S(p.x - Math.cos(ph) * 56, p.y - Math.sin(ph) * 56 - 24);
        const sy = sy0 + Math.sin(this.time * 5 + di * 2) * 3;
        const aim = (ex.droneAims && ex.droneAims[di]) || 0;
        // 精绘四旋翼无人机（大尺寸、不透明）：机臂+旋翼虚影+机身+炮管+航行灯
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1.35, 1.35);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(0, 26, 13, 4, 0, 0, Math.PI * 2); ctx.fill();   // 投在地面的影子
        ctx.strokeStyle = '#2a3145'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const [ax, ay] of [[-11, -7], [11, -7], [-11, 7], [11, 7]]) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax, ay); ctx.stroke();       // 机臂
          const spin = this.time * 40 + ax;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.fillStyle = 'rgba(180,200,235,.5)';
          ctx.beginPath(); ctx.ellipse(0, 0, 8, 2.6, spin, 0, Math.PI * 2); ctx.fill();  // 旋翼虚影
          ctx.fillStyle = '#39415c';
          ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        const bg = ctx.createRadialGradient(-3, -4, 2, 0, 0, 12);
        bg.addColorStop(0, '#6d7896'); bg.addColorStop(0.6, '#464e68'); bg.addColorStop(1, '#262c40');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill();     // 机身
        ctx.strokeStyle = '#141826'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath(); ctx.ellipse(0, -2.5, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); // 小鸭涂装
        ctx.fillStyle = '#1c2233';
        ctx.beginPath(); ctx.arc(1.6, -3, 1, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.rotate(aim);
        ctx.fillStyle = '#7ef7ff';
        ctx.fillRect(8, -1.4, 8, 2.8);                                                // 指向目标的炮管
        ctx.restore();
        const nav = Math.sin(this.time * 7 + di * 3) > 0;
        ctx.fillStyle = nav ? '#ff5c5c' : '#48ffa0';
        ctx.beginPath(); ctx.arc(nav ? -8 : 8, -6, 1.6, 0, Math.PI * 2); ctx.fill();  // 航行灯
        ctx.restore();
        }
      }
    }
    if (H.skills.garlic > 0) {
      const R = 88 + H.skills.garlic * 12;
      for (const p of this.players) {
        if (!p.active) continue;
        const [sx, sy] = W2S(p.x, p.y);
        ctx.strokeStyle = 'rgba(220,240,160,.18)';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (H.skills.chrono > 0) {
      const R = 120 + H.skills.chrono * 15;
      for (const p of this.players) {
        if (!p.active) continue;
        const [sx, sy] = W2S(p.x, p.y);
        ctx.strokeStyle = 'rgba(160,200,255,.22)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 10]);
        ctx.beginPath(); ctx.arc(sx, sy, R, this.time * 0.6, this.time * 0.6 + Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },
});
