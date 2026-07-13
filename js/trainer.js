// ============ 键位练习场：键位设置页内的双人迷你沙盘 ============
// 一左一右两块小区域（1P/2P），实时使用当前 KEYMAP——改完键立刻可试。
// 可练：移动 / 翻滚 / 射击(枪·锅) / 换弹 / 切换武器 / 潜行 / 使用·切换药品 / 开箱互动
'use strict';

const Trainer = (() => {
  const W = 360, H = 220;
  let states = null, raf = null, last = 0, keyHandler = null;

  function mkState(pi) {
    return {
      pi,
      x: 70, y: 110, facing: 0,
      stamina: 100, rollT: 0, rollCd: 0, rollDir: 0,
      sneak: false,
      weapon: 1,                 // 0=平底锅 1=手枪
      mag: 6, reloadT: 0, shootCd: 0, swing: 0,
      bullets: [],
      dummy: { cx: 245, cy: 100, ang: Math.random() * 6.28, x: 245, y: 100, faceDir: 0,
               hp: 30, hurtT: 0, kills: 0, bob: Math.random() * 5, spotT: 0, spotCd: 0, spots: 0 },
      chest: { x: 265, y: 172, open: false, prog: 0, opened: 0, respawnT: 0 },
      msg: '试试你的按键吧！', msgT: 3, anim: 0,
    };
  }

  function say(s, text) { s.msg = text; s.msgT = 1.6; }

  let lastKey = '';   // 屏上自检：显示最近收到的按键
  function onKeyDown(e) {
    if (!states) return;
    const code = normalizeCode(e);
    lastKey = code;
    if (e.repeat) return;   // 忽略按住产生的系统重复
    for (const s of states) {
      const km = KEYMAP[s.pi];
      if (code === km.roll) {
        if (s.rollT <= 0 && s.rollCd <= 0 && s.stamina >= STAMINA.rollCost) {
          s.stamina -= STAMINA.rollCost;
          s.rollT = STAMINA.rollDur; s.rollCd = STAMINA.rollCd;
          const d = moveDir(km);
          s.rollDir = d !== null ? d : s.facing;
          if (s.sneak) { s.sneak = false; }
          say(s, '🤸 翻滚！（无敌帧）');
          Sfx.crossbow();
        } else if (s.stamina < STAMINA.rollCost) say(s, '体力不足，等蓝条回复');
      } else if (code === km.sneak) {
        s.sneak = !s.sneak;
        say(s, s.sneak ? '🤫 潜行开（再按关；翻滚/开枪会破隐）' : '潜行解除');
      } else if (code === km.reload) {
        if (s.weapon === 1 && s.mag < 6 && s.reloadT <= 0) { s.reloadT = 0.9; say(s, '🔄 换弹中…'); Sfx.tick(); }
      } else if (code === km.swap) {
        s.weapon = 1 - s.weapon;
        say(s, `切换武器 → ${s.weapon === 1 ? '🔫 手枪' : '🍳 平底锅'}`);
        Sfx.tick();
      } else if (code === km.use) {
        say(s, '🩹 使用药品 ✓'); Sfx.heal();
      } else if (code === km.cycle) {
        say(s, '🔁 切换药品 ✓'); Sfx.tick();
      }
    }
  }

  function moveDir(km) {
    let dx = 0, dy = 0;
    if (Input.keys[km.up]) dy--;
    if (Input.keys[km.down]) dy++;
    if (Input.keys[km.left]) dx--;
    if (Input.keys[km.right]) dx++;
    return (dx || dy) ? Math.atan2(dy, dx) : null;
  }

  function update(s, dt) {
    const km = KEYMAP[s.pi];
    s.anim += dt;
    s.rollCd = Math.max(0, s.rollCd - dt);
    s.shootCd = Math.max(0, s.shootCd - dt);
    s.swing = Math.max(0, s.swing - dt);
    s.msgT = Math.max(0, s.msgT - dt);
    s.stamina = Math.min(100, s.stamina + STAMINA.regen * dt);
    if (s.reloadT > 0) { s.reloadT -= dt; if (s.reloadT <= 0) { s.mag = 6; Sfx.tick(); say(s, '换弹完成 6/6'); } }

    // 移动 / 翻滚
    if (s.rollT > 0) {
      s.rollT -= dt;
      s.x += Math.cos(s.rollDir) * STAMINA.rollSpeed * dt;
      s.y += Math.sin(s.rollDir) * STAMINA.rollSpeed * dt;
    } else {
      const d = moveDir(km);
      if (d !== null) {
        const spd = 130 * (s.sneak ? 0.55 : 1);
        s.x += Math.cos(d) * spd * dt;
        s.y += Math.sin(d) * spd * dt;
        s.facing = d;
        s.moving = true;
      } else s.moving = false;
      // 射击（按住）
      if (Input.keys[km.shoot] && s.shootCd <= 0 && s.reloadT <= 0) {
        if (s.weapon === 1) {
          if (s.mag > 0) {
            s.mag--; s.shootCd = 0.28;
            s.bullets.push({ x: s.x + Math.cos(s.facing) * 14, y: s.y + Math.sin(s.facing) * 14, a: s.facing, t: 0.8 });
            if (s.sneak) { s.sneak = false; say(s, '开枪破隐！'); }
            Sfx.shoot();
            if (s.mag === 0) { s.reloadT = 0.9; say(s, '弹夹打空，自动换弹…'); }
          } else s.reloadT = 0.9;
        } else {
          s.shootCd = 0.5; s.swing = 0.2;
          Sfx.melee();
          const dd = Math.hypot(s.dummy.x - s.x, s.dummy.y - s.y);
          if (dd < 46) {
            let da = Math.atan2(s.y - s.dummy.y, s.x - s.dummy.x) - s.dummy.faceDir;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            const backstab = s.sneak && Math.abs(da) > 1.9;   // 潜行 + 在背后
            hitDummy(s, backstab ? 30 : 10);
            if (backstab) say(s, '🗡️ 背刺！三倍伤害！');
          }
        }
      }
    }
    s.x = Math.max(16, Math.min(W - 16, s.x));
    s.y = Math.max(20, Math.min(H - 16, s.y));

    // 子弹（带弹道追踪：前方 ±0.55 弧度、220px 内向假人转向）
    for (const b of s.bullets) {
      b.t -= dt;
      const dxT = s.dummy.x - b.x, dyT = s.dummy.y - b.y;
      const dT = Math.hypot(dxT, dyT);
      if (dT < 220) {
        let da = Math.atan2(dyT, dxT) - b.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.55) {
          const turn = 3.5 * dt;
          b.a += Math.max(-turn, Math.min(turn, da));
        }
      }
      b.x += Math.cos(b.a) * 420 * dt;
      b.y += Math.sin(b.a) * 420 * dt;
      if (Math.hypot(b.x - s.dummy.x, b.y - s.dummy.y) < 16) { b.t = 0; hitDummy(s, 8); }
    }
    s.bullets = s.bullets.filter(b => b.t > 0 && b.x > 0 && b.x < W && b.y > 0 && b.y < H);

    // —— 假人绕圈巡逻（练潜行绕背）——
    const d2 = s.dummy;
    d2.ang += dt * 0.85;
    const px2 = d2.cx + Math.cos(d2.ang) * 78;
    const py2 = d2.cy + Math.sin(d2.ang) * 40;
    d2.faceDir = Math.atan2(py2 - d2.y, px2 - d2.x);
    d2.x = px2; d2.y = py2;
    d2.hurtT = Math.max(0, d2.hurtT - dt);
    d2.spotCd = Math.max(0, d2.spotCd - dt);
    // 警戒锥判定：非潜行走进锥形 → 被发现（与正式游戏同理，潜行需 0.7s 蓄力才暴露）
    {
      const dd = Math.hypot(s.x - d2.x, s.y - d2.y);
      let da = Math.atan2(s.y - d2.y, s.x - d2.x) - d2.faceDir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const inCone = dd < 92 && Math.abs(da) < 0.65;
      if (inCone && d2.spotCd <= 0) {
        if (!s.sneak) {
          d2.spotT += dt * 3;                 // 非潜行：极快被发现
        } else d2.spotT += dt;                // 潜行：0.7s 蓄力（有时间撤出）
        if (d2.spotT >= 0.7) {
          d2.spotT = 0; d2.spotCd = 2; d2.spots++;
          say(s, `👁 被发现了！×${d2.spots}（试试潜行绕到它背后）`);
          Sfx.aggro();
        }
      } else d2.spotT = Math.max(0, d2.spotT - dt * 2);
    }

    // 开箱（按住互动键靠近宝箱）
    const c = s.chest;
    if (c.respawnT > 0) { c.respawnT -= dt; if (c.respawnT <= 0) { c.open = false; c.prog = 0; } }
    else if (!c.open) {
      const near = Math.hypot(c.x - s.x, c.y - s.y) < 40;
      if (near && Input.keys[km.interact]) {
        c.prog += dt;
        if (c.prog >= 1) { c.open = true; c.opened++; c.respawnT = 2; say(s, `📦 开箱成功！（第 ${c.opened} 次）`); Sfx.open(); }
      } else c.prog = Math.max(0, c.prog - dt * 2);
    }
  }

  function hitDummy(s, dmg) {
    s.dummy.hp -= dmg; s.dummy.hurtT = 0.2;
    Sfx.hit();
    if (s.dummy.hp <= 0) { s.dummy.hp = 30; s.dummy.kills++; say(s, `🎯 击倒假人！×${s.dummy.kills}`); Sfx.pickup('rare'); }
  }

  function draw(ctx, s) {
    const km = KEYMAP[s.pi];
    const col = s.pi === 0 ? '#ffd93d' : '#9fd8ff';
    // 地板
    ctx.fillStyle = '#241f38';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    for (let x = 0; x < W; x += 40) for (let y = 0; y < H; y += 40)
      if ((x + y) / 40 % 2 === 0) ctx.fillRect(x, y, 40, 40);

    // 练习宝箱
    const c = s.chest;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = c.open ? '#5a4327' : '#8a6a3b';
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2;
    ctx.fillRect(-14, -8, 28, 18); ctx.strokeRect(-14, -8, 28, 18);
    ctx.fillStyle = c.open ? '#3a2c18' : '#6b512c';
    ctx.fillRect(-16, -14, 32, 9); ctx.strokeRect(-16, -14, 32, 9);
    if (c.open) { ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✨', 0, -18); }
    ctx.restore();
    if (c.prog > 0 && !c.open) {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, 22, -Math.PI / 2, -Math.PI / 2 + c.prog * Math.PI * 2); ctx.stroke();
    }
    ctx.font = '10px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(`按住 ${keyLabel(km.interact)} 开箱`, c.x, c.y + 26);

    // 假人警戒锥（在假人身后先画）
    const d = s.dummy;
    {
      const grad = ctx.createRadialGradient(d.x, d.y, 6, d.x, d.y, 92);
      grad.addColorStop(0, d.spotT > 0 ? 'rgba(255,120,90,.30)' : 'rgba(255,210,90,.16)');
      grad.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.arc(d.x, d.y, 92, d.faceDir - 0.65, d.faceDir + 0.65);
      ctx.closePath(); ctx.fill();
    }
    const bob = Math.sin(s.anim * 5 + d.bob) * 2;
    ctx.save();
    ctx.translate(d.x, d.y + bob);
    if (d.hurtT > 0) ctx.globalAlpha = 0.6;
    ctx.fillStyle = d.hurtT > 0 ? '#8a4a6a' : '#4a3d6b';
    ctx.strokeStyle = '#1a1530'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, 13, Math.PI, 0);
    for (let i = 0; i <= 3; i++) {
      const wx = 13 - i * 13 * 2 / 3;
      ctx.quadraticCurveTo(wx + 3, 13 + Math.sin(s.anim * 6 + i) * 2, wx - 4, 10);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.spotT > 0 ? '#ff5c5c' : '#ffe28a';
    const ex = Math.cos(d.faceDir) * 3, ey = Math.sin(d.faceDir) * 2;
    ctx.beginPath(); ctx.arc(-4 + ex, -4 + ey, 2.4, 0, Math.PI * 2); ctx.arc(4 + ex, -4 + ey, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 假人血条
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(d.x - 16, d.y - 24, 32, 4);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(d.x - 16, d.y - 24, 32 * Math.max(0, d.hp / 30), 4);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(`${keyLabel(km.shoot)} 攻击 · 避开光锥潜行绕背`, d.x, Math.max(12, d.y - 32));

    // 子弹
    ctx.fillStyle = '#ffe28a';
    for (const b of s.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill(); }

    // 小鸭
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.rollT > 0) ctx.rotate((1 - s.rollT / STAMINA.rollDur) * Math.PI * 2);
    if (s.sneak) ctx.globalAlpha = 0.6;
    const fx = Math.cos(s.facing), fy = Math.sin(s.facing);
    const walk = s.moving ? Math.sin(s.anim * 12) : 0;
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath(); ctx.ellipse(-4, 12 + walk * 2, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, 12 - walk * 2, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.strokeStyle = '#241f38'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 12 + Math.abs(walk), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath(); ctx.ellipse(fx * 9, fy * 9 - 3, 5, 3.2, s.facing, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(fx * 4 - 3, fy * 4 - 6, 2.8, 0, Math.PI * 2); ctx.arc(fx * 4 + 3, fy * 4 - 6, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241f38';
    ctx.beginPath(); ctx.arc(fx * 5 - 3, fy * 5 - 6, 1.4, 0, Math.PI * 2); ctx.arc(fx * 5 + 3, fy * 5 - 6, 1.4, 0, Math.PI * 2); ctx.fill();
    // 武器
    ctx.rotate(s.facing + (s.swing > 0 ? Math.sin(s.swing * 30) * 0.8 : 0));
    if (s.weapon === 1) { ctx.fillStyle = '#3a3a48'; ctx.fillRect(7, -2.5, 13, 5); }
    else { ctx.fillStyle = '#555'; ctx.fillRect(7, -1.5, 9, 3); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(19, 0, 5.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (s.sneak) { ctx.font = '11px sans-serif'; ctx.fillText('🤫', s.x + 13, s.y - 14); }
    // 换弹环
    if (s.reloadT > 0) {
      ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 17, -Math.PI / 2, -Math.PI / 2 + (1 - s.reloadT / 0.9) * Math.PI * 2); ctx.stroke();
    }

    // 顶部状态：体力条 + 弹夹
    ctx.fillStyle = 'rgba(8,6,20,.7)'; ctx.fillRect(6, 6, 96, 24);
    ctx.fillStyle = '#5ad0e8'; ctx.fillRect(10, 10, 60 * (s.stamina / 100), 5);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(10, 10, 60, 5);
    ctx.font = '11px "PingFang SC",sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#f2eefc';
    ctx.fillText(s.weapon === 1 ? `🔫 ${s.reloadT > 0 ? '…' : s.mag}/6（追踪弹道）` : '🍳 近战（潜行绕背=背刺×3）', 10, 26);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText(`${keyLabel(km.roll)} 翻滚 · ${keyLabel(km.sneak)} 潜行`, W - 8, 16);
    ctx.fillText(`${keyLabel(km.reload)} 换弹 · ${keyLabel(km.swap)} 切枪`, W - 8, 30);

    // 自检：最近收到的按键（按了没反应=事件被输入法/系统吞掉）
    ctx.font = '10px "PingFang SC",sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillText(`最近按键: ${lastKey ? keyLabel(lastKey) : '—'}`, 8, H - 8);

    // 动作反馈
    if (s.msgT > 0) {
      ctx.globalAlpha = Math.min(1, s.msgT * 2);
      ctx.font = 'bold 13px "PingFang SC",sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.fillText(s.msg, W / 2, H - 10);
      ctx.globalAlpha = 1;
    }
  }

  function tick(dt) {
    if (!states) return;
    try {
      for (const s of states) {
        update(s, dt);
        const cv = document.getElementById(`trainer-p${s.pi + 1}`);
        if (cv) draw(cv.getContext('2d'), s);
      }
    } catch (e) {
      console.error('[Trainer]', e);
      // 出错也别黑屏：画出错误提示
      for (let i = 1; i <= 2; i++) {
        const cv = document.getElementById(`trainer-p${i}`);
        if (cv) {
          const c = cv.getContext('2d');
          c.fillStyle = '#241f38'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#ff8f8f'; c.font = '12px sans-serif'; c.textAlign = 'center';
          c.fillText('练习场出错: ' + e.message, W / 2, H / 2);
        }
      }
    }
  }

  function loop(t) {
    if (!states) return;
    const dt = Math.min(0.05, (t - last) / 1000) || 0.016;
    last = t;
    tick(dt);
    raf = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (states) return;
      states = [mkState(0), mkState(1)];
      keyHandler = e => onKeyDown(e);
      document.addEventListener('keydown', keyHandler);
      last = performance.now();
      tick(0.016);              // 同步先画一帧，避免任何情况下的黑屏
      raf = requestAnimationFrame(loop);
    },
    tick,   // 供测试驱动
    debug() { return states; },   // 供测试读取内部状态
    stop() {
      states = null;
      if (raf) cancelAnimationFrame(raf);
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      raf = null; keyHandler = null;
    },
  };
})();
