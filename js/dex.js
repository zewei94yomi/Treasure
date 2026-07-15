// ============ 武器图鉴 & 技能图鉴（活体演示 + 等级调节） ============
// 每张卡一块小画布：武器卡实时模拟弹道/射速/散布/命中；技能卡按当前等级播放该技能的招牌动画。
'use strict';

const Dex = (() => {
  const $ = id => document.getElementById(id);
  const CW = 216, CH = 84;                     // 演示画布尺寸
  const DUCK_X = 34, TGT_X = 178, MID_Y = 46;  // 鸭子/靶子标准站位

  // —— 通用小画笔 ——
  function drawDuck(ctx, x, y, t) {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 12, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd93d'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y + Math.sin(t * 4) * 1.5, 11, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9f1c'; ctx.strokeStyle = '#c76f00'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x + 9, y - 2, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#100e1d';
    ctx.beginPath(); ctx.arc(x + 4, y - 5, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  function drawDummy(ctx, x, y, t, hurt) {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 13, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hurt ? '#e88a9a' : '#8a74b8'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y + Math.sin(t * 3 + 2) * 1.5, 12, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath(); ctx.arc(x - 4, y - 3, 2.2, 0, Math.PI * 2); ctx.arc(x + 4, y - 3, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  function glow(ctx, x, y, r, color, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('$', a)); g.addColorStop(1, color.replace('$', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  const FIRE = 'rgba(255,180,70,$)', ICE = 'rgba(150,220,255,$)', HOLY = 'rgba(255,240,180,$)';

  // ============ 武器图鉴 ============
  let wRaf = null, wLast = 0, wCards = [];

  function weaponStats(d) {
    const rows = [];
    const dmgTxt = d.pellets ? `${d.dmg} ×${d.pellets}粒` : d.dmg;
    rows.push(['伤害', dmgTxt], ['射速', d.rate + '/s'], ['射程', d.melee ? d.range + '(近战)' : d.range]);
    rows.push(['击退', d.knock]);
    if (d.mag) rows.push(['弹夹', d.mag + ' 发 · 换弹 ' + d.reload + 's']);
    if (d.pierce) rows.push(['穿透', d.pierce + ' 目标']);
    const sp = [];
    if (d.silent) sp.push('无声');
    if (d.backstab) sp.push(`背刺 ×${d.backstab}`);
    if (d.slow) sp.push(`减速 ${d.slow}s`);
    if (d.burn) sp.push(`灼烧 ${d.burn}s`);
    if (d.freeze) sp.push(`冻结 ${d.freeze}s`);
    if (d.explosive) sp.push(`爆炸半径 ${d.explosive}`);
    if (sp.length) rows.push(['特性', sp.join(' · ')]);
    return rows;
  }

  function showWeaponDex() {
    $('weapondex-overlay').style.display = 'flex';
    const ids = Object.keys(WEAPONS);
    $('wdex-body').innerHTML = '<div class="mdex-grid">' + ids.map(id => {
      const d = WEAPONS[id];
      return `
      <div class="mdex-card wdex-card">
        <div class="mdex-info" style="flex:1">
          <div class="mdex-name">${d.icon} ${d.name} ${d.price ? `<span class="mdex-kills">💰${d.price}</span>` : ''}</div>
          <div class="mdex-stats">${weaponStats(d).map(([k, v]) => `${k} <b style="color:#ffd93d">${v}</b>`).join('　')}</div>
          <div class="mdex-lore">${d.desc || ''}</div>
          <canvas id="wdex-cv-${id}" width="${CW}" height="${CH}" style="margin-top:6px"></canvas>
        </div>
      </div>`;
    }).join('') + '</div>';
    wCards = ids.map(id => ({ d: WEAPONS[id], ctx: $('wdex-cv-' + id).getContext('2d'),
      t: Math.random() * 2, cd: 0.3, shots: [], fxs: [], swing: 0, hurtT: 0 }));
    wLast = 0;
    if (!wRaf) wTick(0);
  }
  function closeWeaponDex() { $('weapondex-overlay').style.display = 'none'; if (wRaf) { cancelAnimationFrame(wRaf); wRaf = null; } wCards = []; }

  function wTick(ts) {
    wRaf = requestAnimationFrame(wTick);
    if (ts - wLast < 33) return;
    const dt = Math.min(0.08, (ts - wLast) / 1000) || 0.033;
    wLast = ts;
    for (const c of wCards) {
      c.t += dt;
      const { ctx, d } = c;
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      ctx.fillRect(0, 0, CW, CH);
      c.hurtT = Math.max(0, c.hurtT - dt);
      // 开火节奏 = 真实射速（近战为挥击）
      c.cd -= dt;
      if (c.cd <= 0) {
        c.cd = 1 / d.rate;
        if (d.melee) { c.swing = 0.22; c.hurtT = 0.18; c.fxs.push({ x: DUCK_X + 30, y: MID_Y, t: 0.18, kind: 'slash' }); }
        else {
          const n = d.pellets || 1;
          for (let i = 0; i < n; i++) {
            const a = (Math.random() - 0.5) * 2 * (d.spread || 0);
            c.shots.push({ x: DUCK_X + 14, y: MID_Y - 2, vx: Math.cos(a) * d.speed * 0.35, vy: Math.sin(a) * d.speed * 0.35, dist: 0 });
          }
          c.fxs.push({ x: DUCK_X + 16, y: MID_Y - 2, t: 0.08, kind: 'muzzle' });
        }
      }
      // 弹道推进（按比例缩放的真实射程）
      const maxD = Math.min(150, (d.range || 400) * 0.3);
      for (const s of c.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.dist += Math.hypot(s.vx, s.vy) * dt;
        if (Math.abs(s.x - TGT_X) < 10 && Math.abs(s.y - MID_Y) < 14) {
          s.dead = true; c.hurtT = 0.18;
          c.fxs.push({ x: s.x, y: s.y, t: d.explosive ? 0.3 : 0.15, kind: d.explosive ? 'boom' : 'hit' });
        } else if (s.dist > maxD) s.dead = true;
      }
      c.shots = c.shots.filter(s => !s.dead);
      // 角色
      drawDuck(ctx, DUCK_X, MID_Y, c.t);
      drawDummy(ctx, TGT_X, MID_Y, c.t, c.hurtT > 0);
      // 近战挥击弧
      if (c.swing > 0) {
        c.swing -= dt;
        ctx.strokeStyle = `rgba(255,240,180,${c.swing * 4})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, 24, -0.8 + (0.22 - c.swing) * 8, -0.2 + (0.22 - c.swing) * 8); ctx.stroke();
      }
      // 子弹
      for (const s of c.shots) {
        const cold = d.slow || d.freeze || d.id === 'frost' || d.id === 'freezer';
        ctx.fillStyle = d.id === 'laser' ? '#7ef7ff' : cold ? '#bfe9ff' : d.burn ? '#ff9a4d' : '#ffe28a';
        ctx.beginPath(); ctx.arc(s.x, s.y, d.explosive ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // 特效
      for (const f of c.fxs) {
        f.t -= dt;
        if (f.kind === 'muzzle') glow(ctx, f.x, f.y, 14, FIRE, f.t * 8);
        else if (f.kind === 'hit') glow(ctx, f.x, f.y, 12, HOLY, f.t * 5);
        else if (f.kind === 'boom') { glow(ctx, f.x, f.y, 34, FIRE, f.t * 3); ctx.strokeStyle = `rgba(255,200,120,${f.t * 3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, (0.3 - f.t) * 120, 0, Math.PI * 2); ctx.stroke(); }
        else if (f.kind === 'slash') glow(ctx, f.x, f.y, 18, HOLY, f.t * 4);
      }
      c.fxs = c.fxs.filter(f => f.t > 0);
    }
  }

  // ============ 技能图鉴 ============
  // 每个技能：按等级的效果文案（公式与 horde.js/game.js 实现一一对应）+ 招牌动画
  // 说明文字实时读 SKILL_TUNE（技能调参面板改数值，这里与升级卡同步变化）
  const sv = (s, k) => skillVal(s, k);
  const SKILL_INFO = {
    orbit:     { fx: 'orbit',     info: lv => `${lv} 只平底锅环绕，撞击 ${sv('orbit','dmg')} 伤害/次并强力击飞` },
    missile:   { fx: 'missile',   info: lv => `每 ${Math.max(0.5, sv('missile','cd') - lv * sv('missile','cdLv')).toFixed(1)}s 发射 ${1 + Math.floor(lv / 2)} 枚追踪鸭雷，命中 ${sv('missile','dmg') + lv * sv('missile','dmgLv')} 伤害` },
    nova:      { fx: 'nova',      info: lv => `每 ${Math.max(2.6, sv('nova','cd') - lv * sv('nova','cdLv')).toFixed(1)}s 冻结新星：${sv('nova','dmg') + lv * sv('nova','dmgLv')} 伤害 + 冻结 ${(sv('nova','stun') + lv * sv('nova','stunLv')).toFixed(1)}s（半径 ${sv('nova','r') + lv * sv('nova','rLv')}）` },
    trail:     { fx: 'trail',     info: lv => `跑动残留火径 ${sv('trail','dur')}s，踩中每跳 ${sv('trail','dmg') + lv * sv('trail','dmgLv')} 伤害` },
    lightning: { fx: 'lightning', info: lv => `闪电逐跳传导 ${sv('lightning','hops') + lv} 跳，每跳 ${sv('lightning','dmg') + lv * sv('lightning','dmgLv')} 伤害（${sv('lightning','hopT')}s/跳，面板可调）` },
    whirlwind: { fx: 'whirlwind', info: lv => `每 ${Math.max(1.2, sv('whirlwind','cd') - lv * sv('whirlwind','cdLv')).toFixed(1)}s 圣剑横扫：半径 ${sv('whirlwind','r') + lv * sv('whirlwind','rLv')}，${sv('whirlwind','dmg') + lv * sv('whirlwind','dmgLv')} 伤害 + 击飞` },
    barrier:   { fx: 'barrier',   info: lv => `每 ${Math.max(5, sv('barrier','cd') - lv * sv('barrier','cdLv'))}s 获得 ${sv('barrier','shield') + lv * sv('barrier','shieldLv')} 点吸收护盾` },
    mines:     { fx: 'mines',     info: lv => `边跑边埋雷（场上至多 ${6 + lv} 颗），踩中 ${sv('mines','dmg') + lv * sv('mines','dmgLv')} 伤害 + 击飞（半径 ${sv('mines','r')}）` },
    meteor:    { fx: 'meteor',    info: lv => `每轮 ${1 + Math.floor(lv / 2)} 颗陨石，${sv('meteor','dmg') + lv * sv('meteor','dmgLv')} 伤害 + 灼烧（半径 ${sv('meteor','r')}）` },
    boomerang: { fx: 'boomerang', info: lv => `巨锯 ${sv('boomerang','dmg') + lv * sv('boomerang','dmgLv')} 伤害/次·同一目标可反复切割，飞出 ${sv('boomerang','dist') + lv * sv('boomerang','distLv')} 折返${lv >= 3 ? '（双盘对甩）' : ''}` },
    chrono:    { fx: 'chrono',    info: lv => `半径 ${sv('chrono','r') + lv * sv('chrono','rLv')} 时缓力场，入场怪物持续减速` },
    garlic:    { fx: 'garlic',    info: lv => `贴身结界（半径 ${sv('garlic','r') + lv * sv('garlic','rLv')}），每 0.5s 灼烧 ${sv('garlic','dmg') + lv * sv('garlic','dmgLv')}` },
    spears:    { fx: 'spears',    info: lv => `每轮向八方射 ${sv('spears','n') + lv} 根骨刺，各 ${sv('spears','dmg') + lv * sv('spears','dmgLv')} 伤害` },
    drone:     { fx: 'drone',     info: lv => `无人机每 ${Math.max(0.24, sv('drone','cd') - lv * sv('drone','cdLv')).toFixed(2)}s 点射 ${sv('drone','dmg') + lv * sv('drone','dmgLv')} 伤害（穿透 2，僚机变体可加机）` },
    thorns:    { fx: 'thorns',    info: lv => `被近身击中反弹 ${sv('thorns','dmg') + lv * sv('thorns','dmgLv')} 伤害，受击伤害 -${(lv * sv('thorns','reduce')).toFixed(1)}` },
    fireball:  { fx: 'fireball',  info: lv => `火球 ${sv('fireball','dmg') + lv * sv('fireball','dmgLv')} 伤害，爆炸半径 ${sv('fireball','boom') + lv * sv('fireball','boomLv')} + 灼烧 2s` },
    summon:    { fx: 'summon',    info: lv => `${lv} 只鸭灵（${sv('summon','hp') + lv * sv('summon','hpLv')} 血 / ${sv('summon','dmg') + lv * sv('summon','dmgLv')} 伤害），阵亡 5s 复活` },
    revenge:   { fx: 'revenge',   info: lv => `受击炸出火焰云怒环：${sv('revenge','dmg') + lv * sv('revenge','dmgLv')} 伤害 + 灼烧 + 击飞（半径 ${sv('revenge','r')}）` },
    grenade:   { fx: 'meteor',    info: lv => `每 ${Math.max(1.4, sv('grenade','cd') - lv * sv('grenade','cdLv')).toFixed(1)}s 丢 ${1 + (lv - 1) * 2} 颗手雷，各 ${sv('grenade','dmg') + lv * sv('grenade','dmgLv')} 伤害（半径 ${sv('grenade','r')}，变体：冰冻/闪电/燃烧）` },
    arty:      { fx: 'arty',      info: lv => `每 ${Math.max(7, sv('arty','cd') - lv * sv('arty','cdLv'))}s 呼叫火炮：${sv('arty','shells') + lv * sv('arty','shellsLv')} 发炮弹覆盖射击方向大范围` },
  };
  // 变体强化归到母技能卡下备注
  const SKILL_VARIANTS = {};
  for (const u of HORDE_UPGRADES) if (u.requires) (SKILL_VARIANTS[u.requires] = SKILL_VARIANTS[u.requires] || []).push(u);

  let sRaf = null, sLast = 0, sCards = [], sLv = {};

  function showSkillDex() {
    $('skilldex-overlay').style.display = 'flex';
    renderSkillDex();
    if (!sRaf) sTick(0);
  }
  function closeSkillDex() { $('skilldex-overlay').style.display = 'none'; if (sRaf) { cancelAnimationFrame(sRaf); sRaf = null; } sCards = []; }
  function setSkillLv(id, delta, max) {
    sLv[id] = Math.min(max, Math.max(1, (sLv[id] || 1) + delta));
    renderSkillDex();
  }
  function renderSkillDex() {
    const skills = HORDE_UPGRADES.filter(u => u.skill);
    let html = '<div class="mdex-grid">' + skills.map(u => {
      const lv = sLv[u.id] || 1;
      const info = SKILL_INFO[u.skill];
      const vars = (SKILL_VARIANTS[u.skill] || []).map(v => `<div class="mdex-hint">${v.icon} ${v.name}：${v.desc}</div>`).join('');
      return `
      <div class="mdex-card wdex-card">
        <div class="mdex-info" style="flex:1">
          <div class="mdex-name">${u.icon} ${u.name}
            <span class="sdex-lv">
              <button class="btn tiny" onclick="Dex.setSkillLv('${u.id}',-1,${u.max})">−</button>
              Lv.${lv}/${u.max}
              <button class="btn tiny" onclick="Dex.setSkillLv('${u.id}',1,${u.max})">＋</button>
            </span></div>
          <div class="mdex-stats" style="color:#ffe9a0">${info ? info.info(lv) : u.desc}</div>
          <div class="mdex-lore">${u.desc}</div>
          ${vars}
          <canvas id="sdex-cv-${u.id}" width="${CW}" height="${CH}" style="margin-top:6px"></canvas>
        </div>
      </div>`;
    }).join('') + '</div>';
    // 数值强化附录（无演示）
    const mods = HORDE_UPGRADES.filter(u => !u.skill && !u.requires);
    html += '<h4 class="section-label" style="margin-top:12px">📈 数值强化（可重复叠加）</h4><div class="sdex-modgrid">' +
      mods.map(u => `<div class="sdex-mod">${u.icon} <b>${u.name}</b> ×${u.max}<br><span>${u.descFn ? u.descFn() : u.desc}</span></div>`).join('') + '</div>';
    $('sdex-body').innerHTML = html;
    sCards = skills.map(u => ({ u, id: u.id, fx: (SKILL_INFO[u.skill] || {}).fx, ctx: $('sdex-cv-' + u.id).getContext('2d'), t: Math.random() * 3, state: {} }));
  }

  // —— 18 个技能的招牌演示动画 ——
  const SKILL_ANIM = {
    orbit(ctx, t, lv) {
      for (let i = 0; i < lv; i++) {
        const a = t * 3 + i * Math.PI * 2 / lv;
        const x = DUCK_X + Math.cos(a) * 26, y = MID_Y + Math.sin(a) * 20;
        ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🍳', x, y + 5);
      }
    },
    missile(ctx, t, lv) {
      const k = (t * (0.6 + lv * 0.1)) % 1;
      const x = DUCK_X + k * (TGT_X - DUCK_X), y = MID_Y - Math.sin(k * Math.PI) * 22;
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🦆', x, y + 4);
      if (k > 0.94) glow(ctx, TGT_X, MID_Y, 20, FIRE, 0.8);
    },
    nova(ctx, t, lv) {
      const k = (t % 2) / 2;
      ctx.strokeStyle = `rgba(150,220,255,${1 - k})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, k * (40 + lv * 6), 0, Math.PI * 2); ctx.stroke();
      glow(ctx, DUCK_X, MID_Y, 20, ICE, (1 - k) * 0.5);
    },
    trail(ctx, t, lv) {
      // 火焰云贴图足迹（三帧轮播）
      for (let i = 0; i < 6; i++) {
        const x = DUCK_X + 20 + i * 18;
        const fimg = typeof MonsterImages !== 'undefined' && MonsterImages['fx_flame' + ((Math.floor(t * 9) + i) % 3)];
        glow(ctx, x, MID_Y + 10, 8 + lv, FIRE, 0.4);
        if (fimg && fimg.naturalWidth) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fimg, x - 9, MID_Y - 4 - Math.sin(t * 10 + i) * 1.5, 18, 18);
          ctx.imageSmoothingEnabled = true;
        }
      }
    },
    lightning(ctx, t, lv) {
      // 逐跳传导：三个节点依次被劈中
      const nodes = [[DUCK_X + 52, MID_Y - 12], [DUCK_X + 96, MID_Y + 10], [TGT_X, MID_Y]];
      const k = (t % 1.4) / 1.4;
      const lit = Math.min(nodes.length, Math.floor(k * 5));
      let px = DUCK_X + 10, py = MID_Y - 6;
      for (let i = 0; i < lit; i++) {
        const [nx, ny] = nodes[i];
        ctx.strokeStyle = i === lit - 1 ? '#fffbe0' : 'rgba(255,233,92,.45)';
        ctx.lineWidth = i === lit - 1 ? 2.4 : 1.4;
        ctx.beginPath(); ctx.moveTo(px, py);
        const mx2 = (px + nx) / 2 + (Math.random() - 0.5) * 8;
        ctx.lineTo(mx2, (py + ny) / 2 + (Math.random() - 0.5) * 10);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        if (i === lit - 1) glow(ctx, nx, ny, 13, HOLY, 0.8);
        for (let d2 = 0; d2 < 2; d2++) { ctx.fillStyle = '#8a74b8'; ctx.strokeStyle = '#100e1d'; }
        px = nx; py = ny;
      }
      // 小节点示意怪
      for (const [nx, ny] of nodes.slice(0, 2)) {
        ctx.fillStyle = '#8a74b8'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(nx, ny + 6, 7, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    },
    whirlwind(ctx, t, lv) {
      const ang = t * 5;
      const rr = 26 + lv * 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 5; i++) {
        ctx.strokeStyle = `rgba(255,235,160,${0.5 - i * 0.09})`; ctx.lineWidth = 8 - i;
        ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, rr, ang - i * 0.3, ang - (i - 1) * 0.3); ctx.stroke();
      }
      ctx.restore();
      const simg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_sword;
      if (simg && simg.naturalWidth) {
        ctx.save();
        ctx.translate(DUCK_X + Math.cos(ang) * rr, MID_Y + Math.sin(ang) * rr);
        ctx.rotate(ang + Math.PI / 4);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(simg, -13, -13, 26, 26);
        ctx.restore();
      }
    },
    barrier(ctx, t, lv) {
      const pulse = 0.5 + Math.sin(t * 3) * 0.2;
      ctx.strokeStyle = `rgba(160,220,255,${pulse})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, 20 + lv, 0, Math.PI * 2); ctx.stroke();
      glow(ctx, DUCK_X, MID_Y, 22 + lv, ICE, 0.25);
    },
    mines(ctx, t, lv) {
      for (let i = 0; i < Math.min(4, 1 + lv); i++) {
        const x = DUCK_X + 34 + i * 30;
        ctx.fillStyle = '#4a5264'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, MID_Y + 10, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = Math.sin(t * 6 + i * 2) > 0 ? '#ff3b3b' : '#5c1420';
        ctx.beginPath(); ctx.arc(x, MID_Y + 8, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      const bk = (t % 2.4) / 2.4;
      if (bk > 0.92) glow(ctx, DUCK_X + 34 + 30, MID_Y + 6, 30, FIRE, (1 - bk) * 10);
    },
    meteor(ctx, t, lv) {
      const k = (t % 1.6) / 1.6;
      if (k < 0.6) {
        const x = TGT_X - 30 + k * 50, y = 4 + k * (MID_Y - 8) / 0.6 * 1;
        const yy = 4 + (k / 0.6) * (MID_Y - 4);
        glow(ctx, x, yy, 12, FIRE, 0.8);
        ctx.fillStyle = '#5a4438';
        ctx.beginPath(); ctx.arc(x, yy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,140,60,.6)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(TGT_X + 20, MID_Y + 6, 16, 0, Math.PI * 2); ctx.stroke();
      } else if (k < 0.75) glow(ctx, TGT_X + 20, MID_Y + 6, 36 + lv * 3, FIRE, (0.75 - k) * 7);
    },
    boomerang(ctx, t, lv) {
      // 巨型锯盘：钢盘锯齿去而复返（3 级双盘）
      const draw = (k, flip) => {
        const d = k < 0.5 ? k * 2 : (1 - k) * 2;
        const x = DUCK_X + (flip ? -1 : 1) * d * (96 + lv * 5);
        ctx.save(); ctx.translate(x, MID_Y - 4); ctx.rotate(t * 16);
        const R = 10;
        ctx.fillStyle = '#aeb6c8'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a0 = i * Math.PI / 5, a1 = a0 + Math.PI / 10;
          ctx.lineTo(Math.cos(a0) * (R + 3.4), Math.sin(a0) * (R + 3.4));
          ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3a4152';
        ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };
      const k = (t % 1.6) / 1.6;
      draw(k, false);
      if (lv >= 3) draw(k, true);
    },
    chrono(ctx, t, lv) {
      ctx.strokeStyle = 'rgba(160,200,255,.5)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, 30 + lv * 2, t * 0.8, t * 0.8 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    },
    garlic(ctx, t, lv) {
      glow(ctx, DUCK_X, MID_Y, 30 + lv * 2, 'rgba(200,230,140,$)', 0.35 + Math.sin(t * 3) * 0.1);
    },
    spears(ctx, t, lv) {
      // 白骨碎片贴图放射
      const k = (t % 1.4) / 1.4;
      const n = 8 + lv;
      const bimg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_bone;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n;
        const r0 = 14 + k * 44;
        const bx = DUCK_X + Math.cos(a) * r0, by = MID_Y + Math.sin(a) * r0;
        if (bimg && bimg.naturalWidth) {
          ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bimg, -7, -7, 14, 14);
          ctx.imageSmoothingEnabled = true;
          ctx.restore();
        } else {
          ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 8, by + Math.sin(a) * 8); ctx.stroke();
        }
      }
    },
    drone(ctx, t, lv) {
      const dx = DUCK_X + 26, dy = MID_Y - 20 + Math.sin(t * 5) * 2;
      ctx.strokeStyle = '#2a3145'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const [ax, ay] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) {
        ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + ax, dy + ay); ctx.stroke();
        ctx.fillStyle = 'rgba(180,200,235,.5)';
        ctx.beginPath(); ctx.ellipse(dx + ax, dy + ay, 5, 1.8, t * 30, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#464e68'; ctx.strokeStyle = '#100e1d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(dx, dy, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath(); ctx.ellipse(dx, dy - 1.5, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      const k = (t * (1 + lv * 0.2)) % 0.9;
      if (k < 0.35) {
        const bx = dx + 10 + (k / 0.35) * (TGT_X - dx - 14);
        ctx.fillStyle = '#7ef7ff';
        ctx.beginPath(); ctx.arc(bx, dy + (MID_Y - dy) * (k / 0.35), 2.2, 0, Math.PI * 2); ctx.fill();
      }
    },
    thorns(ctx, t, lv) {
      ctx.strokeStyle = '#7ac74f'; ctx.lineWidth = 2;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n + t * 0.6;
        ctx.beginPath();
        ctx.moveTo(DUCK_X + Math.cos(a) * 16, MID_Y + Math.sin(a) * 16);
        ctx.lineTo(DUCK_X + Math.cos(a) * (22 + lv), MID_Y + Math.sin(a) * (22 + lv));
        ctx.stroke();
      }
      if (Math.sin(t * 2.5) > 0.8) glow(ctx, DUCK_X, MID_Y, 26, 'rgba(150,230,120,$)', 0.5);
    },
    fireball(ctx, t, lv) {
      const k = (t % 1.4) / 1.4;
      if (k < 0.62) {
        const x = DUCK_X + 14 + (k / 0.62) * (TGT_X - DUCK_X - 20);
        glow(ctx, x, MID_Y - 4, 11, FIRE, 0.9);
        const fimg = typeof MonsterImages !== 'undefined' && MonsterImages.fx_fireball;
        if (fimg && fimg.naturalWidth) {
          ctx.save(); ctx.translate(x, MID_Y - 4); ctx.rotate(Math.PI / 2);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(fimg, -8, -8, 16, 16); ctx.restore();
        }
      } else if (k < 0.8) glow(ctx, TGT_X, MID_Y, (30 + lv * 3), FIRE, (0.8 - k) * 6);
    },
    summon(ctx, t, lv) {
      for (let i = 0; i < lv; i++) drawDuck(ctx, DUCK_X + 30 + i * 24, MID_Y + 8, t + i);
    },
    revenge(ctx, t, lv) {
      // 火焰云怒环 + 双冲击波（与实战 fxRevenge 一致）
      const k = (t % 1.8) / 1.8;
      if (k < 0.38) {
        const kk = k / 0.38;
        ctx.strokeStyle = `rgba(255,150,60,${(1 - kk) * 0.9})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, kk * 120, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,220,140,${(1 - kk) * 0.6})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(DUCK_X, MID_Y, kk * 86, 0, Math.PI * 2); ctx.stroke();
        glow(ctx, DUCK_X, MID_Y, 26, FIRE, (1 - kk) * 1.2);
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n;
          const fr = kk * 58;
          const fimg = typeof MonsterImages !== 'undefined' && MonsterImages['fx_flame' + (i % 3)];
          if (fimg && fimg.naturalWidth) {
            ctx.save();
            ctx.globalAlpha = 1 - kk;
            ctx.translate(DUCK_X + Math.cos(a) * fr, MID_Y + Math.sin(a) * fr);
            ctx.rotate(a);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(fimg, -8, -8, 16, 16);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
            ctx.globalAlpha = 1;
          }
        }
      }
    },
    arty(ctx, t, lv) {
      // 火炮支援：预警圈 + 依次落弹
      const k = (t % 2) / 2;
      for (let i = 0; i < 3; i++) {
        const x = TGT_X - 30 + i * 26, y = MID_Y - 8 + (i % 2) * 16;
        const bt = k * 3 - i * 0.5;
        if (bt < 1 && bt > 0) {
          ctx.strokeStyle = `rgba(255,120,40,${0.8 - bt * 0.4})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
        } else if (bt >= 1 && bt < 1.3) glow(ctx, x, y, 22, FIRE, (1.3 - bt) * 3);
      }
    },
  };

  function sTick(ts) {
    sRaf = requestAnimationFrame(sTick);
    if (ts - sLast < 33) return;
    const dt = Math.min(0.08, (ts - sLast) / 1000) || 0.033;
    sLast = ts;
    for (const c of sCards) {
      c.t += dt;
      const { ctx } = c;
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      ctx.fillRect(0, 0, CW, CH);
      drawDuck(ctx, DUCK_X, MID_Y, c.t);
      if (c.fx !== 'summon') drawDummy(ctx, TGT_X, MID_Y, c.t, false);
      const anim = SKILL_ANIM[c.fx];
      if (anim) { try { anim(ctx, c.t, sLv[c.id] || 1); } catch (e) {} }
    }
  }

  function skillInfo(skill, lv) {
    const info = SKILL_INFO[skill];
    return info ? info.info(lv) : '';
  }
  return { showWeaponDex, closeWeaponDex, showSkillDex, closeSkillDex, setSkillLv, skillInfo };
})();
