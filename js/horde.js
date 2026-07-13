// ============ 无双割草扩展模块（Game.prototype 扩展） ============
// 六个新技能引擎 / 贴合 build 的智能三选一 / Boss 后局内商人
'use strict';

Object.assign(Game.prototype, {

  // —— 智能三选一：优先贴合已选技能与当前状态（覆盖 game.js 基础版） ——
  openLevelup() {
    const H = this.hordeState;
    H.picked = H.picked || {};
    const owned = u => u.skill ? H.skills[u.skill] : (H.picked[u.id] || 0);
    const pool = HORDE_UPGRADES.filter(u => owned(u) < u.max);
    if (!pool.length) { H.freeChoices = 0; return; }

    const anySkill = Object.values(H.skills).some(v => v > 0);
    const lowHp = this.players.some(p => p.active && p.hp < p.maxHp * 0.4);
    const weights = new Map();
    for (const u of pool) {
      let w = 10;
      const cur = owned(u);
      if (cur > 0) w *= 1.8 + cur * 0.6;                    // 已投资的路线优先出现
      if (u.skill && !anySkill) w *= 1.7;                    // 还没技能时鼓励开技能
      if (lowHp && (u.id === 'maxhp' || u.id === 'steal' || u.id === 'regen' || u.id === 'barrier')) w *= 2.2;  // 残血时供生存牌
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
          ex.whirlFx.push({ x: p.x, y: p.y, r: R, t: 0.35, pl: p });
          for (const m of this.monsters.slice()) {
            if (Math.hypot(m.x - p.x, m.y - p.y) > R + m.r) continue;
            m.knock(Math.atan2(m.y - p.y, m.x - p.x), 700);
            if (m.hurt(Math.round((14 + S.whirlwind * 6) * H.mods.dmg), this)) this.killMonster(m, p);
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
            for (let i = 0; i < 10; i++) this.spark(mine.x, mine.y, '#ffb347');
            for (const m of this.monsters.slice()) {
              const d = Math.hypot(m.x - mine.x, m.y - mine.y);
              if (d > 74 + m.r) continue;
              m.knock(Math.atan2(m.y - mine.y, m.x - mine.x), 800);
              if (m.hurt(Math.round((26 + S.mines * 10) * H.mods.dmg), this)) this.killMonster(m, this.players[0]);
            }
          }
        }
      }
      ex.mines = ex.mines.filter(mn => !mn.boom && mn.t > 0);
    }
    // ☄️ 天降正义
    if (S.meteor > 0) {
      ex.meteorT -= dt;
      if (ex.meteorT <= 0) {
        ex.meteorT = Math.max(2.2, 5.5 - S.meteor * 0.5);
        const count = 1 + Math.floor(S.meteor / 2);
        for (let i = 0; i < count && this.monsters.length; i++) {
          const m = this.monsters[Math.floor(Math.random() * this.monsters.length)];
          ex.meteors.push({ x: m.x, y: m.y, t: 0.8 });
        }
      }
      for (const mt of ex.meteors) {
        mt.t -= dt;
        if (mt.t <= 0) {
          Sfx.boom();
          this.shake = Math.max(this.shake, 7);
          for (let i = 0; i < 12; i++) this.spark(mt.x, mt.y, i % 2 ? '#ff7b2d' : '#ffd93d');
          for (const m of this.monsters.slice()) {
            const d = Math.hypot(m.x - mt.x, m.y - mt.y);
            if (d > 84 + m.r) continue;
            m.burnT = Math.max(m.burnT, 1.5);
            if (m.hurt(Math.round((30 + S.meteor * 12) * H.mods.dmg), this)) this.killMonster(m, this.players[0]);
          }
        }
      }
      ex.meteors = ex.meteors.filter(mt => mt.t > 0);
    }
    // 🥏 回旋飞盘
    if (S.boomerang > 0) {
      ex.boomT -= dt;
      if (ex.boomT <= 0) {
        ex.boomT = Math.max(1.4, 3.0 - S.boomerang * 0.3);
        for (const p of this.players) {
          if (!p.active) continue;
          ex.booms.push({ x: p.x, y: p.y, a: p.facing, d: 0, max: 260 + S.boomerang * 25, back: false, pl: p, hit: new Set(), spin: 0 });
        }
        Sfx.crossbow();
      }
      for (const b of ex.booms) {
        b.spin += dt * 14;
        const sp = 380 * dt;
        if (!b.back) {
          b.x += Math.cos(b.a) * sp; b.y += Math.sin(b.a) * sp;
          b.d += sp;
          if (b.d >= b.max || isSolidAt(b.x, b.y)) { b.back = true; b.hit.clear(); }
        } else {
          const ang = Math.atan2(b.pl.y - b.y, b.pl.x - b.x);
          b.x += Math.cos(ang) * sp * 1.25; b.y += Math.sin(ang) * sp * 1.25;
          if (Math.hypot(b.pl.x - b.x, b.pl.y - b.y) < 24) b.done = true;
        }
        for (const m of this.monsters.slice()) {
          if (b.hit.has(m)) continue;
          if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + 14) {
            b.hit.add(m);
            m.knock(b.a, 300);
            if (m.hurt(Math.round((18 + S.boomerang * 7) * H.mods.dmg), this)) this.killMonster(m, b.pl);
            this.spark(b.x, b.y, '#ffd93d');
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
            if (m.hurt(Math.round((5 + S.garlic * 3) * H.mods.dmg), this)) this.killMonster(m, p);
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
          const n = 6 + S.spears;
          for (let i = 0; i < n; i++) {
            const a = i * Math.PI * 2 / n + this.time;
            this.bullets.push(new Bullet(p.x, p.y, a,
              { id: 'spear', dmg: 10 + S.spears * 4, speed: 480, range: 230 + S.spears * 15, knock: 90 }, p, H.mods.dmg));
          }
        }
        Sfx.crossbow();
      }
    }
    // 🛸 无人机鸭（自动点射）
    if (S.drone > 0) {
      ex.droneT = (ex.droneT || 0) - dt;
      if (ex.droneT <= 0) {
        ex.droneT = Math.max(0.5, 1.6 - S.drone * 0.15);
        for (const p of this.players) {
          if (!p.active) continue;
          const dx = p.x - Math.cos(this.time * 1.4) * 56;
          const dy = p.y - Math.sin(this.time * 1.4) * 56 - 24;
          let tgt = null, td = 430;
          for (const m of this.monsters) {
            const d = Math.hypot(m.x - dx, m.y - dy);
            if (d < td) { tgt = m; td = d; }
          }
          if (tgt) {
            const a = Math.atan2(tgt.y - dy, tgt.x - dx);
            this.bullets.push(new Bullet(dx, dy, a,
              { id: 'dronegun', dmg: 9 + S.drone * 4, speed: 620, range: 460, knock: 50 }, p, H.mods.dmg));
          }
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
      const blink = Math.sin(this.time * 8) > 0;
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
      ctx.globalAlpha = blink ? 1 : 0.55;
      ctx.fillText('🧨', sx, sy + 5);
      ctx.globalAlpha = 1;
    }
    for (const mt of ex.meteors) {
      const [sx, sy] = W2S(mt.x, mt.y);
      // 落点预警圈 + 下坠的陨石
      ctx.strokeStyle = `rgba(255,120,40,${0.4 + Math.sin(this.time * 10) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.stroke();
      const fall = mt.t / 0.8;
      ctx.font = '26px sans-serif';
      ctx.fillText('☄️', sx + fall * 90, sy - fall * 260 + 8);
    }
    for (const b of ex.booms) {
      const [sx, sy] = W2S(b.x, b.y);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(b.spin);
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🥏', 0, 7);
      ctx.restore();
    }
    for (const fx of ex.whirlFx) {
      const [sx, sy] = W2S(fx.pl.x, fx.pl.y);
      ctx.strokeStyle = `rgba(255,230,150,${fx.t * 2.4})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(sx, sy, fx.r * (1 - fx.t / 0.35 * 0.4), this.time * 10, this.time * 10 + Math.PI * 1.4);
      ctx.stroke();
    }
    if (H.skills.drone > 0) {
      for (const p of this.players) {
        if (!p.active) continue;
        const [sx, sy] = W2S(p.x - Math.cos(this.time * 1.4) * 56, p.y - Math.sin(this.time * 1.4) * 56 - 24);
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🛸', sx, sy + Math.sin(this.time * 5) * 3 + 6);
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
