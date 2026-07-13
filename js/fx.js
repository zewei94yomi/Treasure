// ============ 高级粒子特效引擎（Game.prototype 扩展模块） ============
// 离屏烘焙柔和纹理 + 加色混合，取代"纯色小方块"的塑料感特效。
// 预设：fxExplosion 分层爆炸 / fxHit 定向火花 / fxDeath 死亡烟散 / fxMuzzle 枪口焰 / fxTrailFire 火焰拖尾
'use strict';

const FxTex = (() => {
  function bake(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }
  // 柔和白色辉光（配 globalAlpha 当闪光/光晕）
  const glow = bake(64, (x, s) => {
    const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  // 火焰团：白热核心 → 橙 → 暗红消散
  const fire = bake(64, (x, s) => {
    const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, 'rgba(255,246,190,1)');
    g.addColorStop(0.3, 'rgba(255,176,58,.92)');
    g.addColorStop(0.62, 'rgba(232,84,26,.5)');
    g.addColorStop(1, 'rgba(150,30,8,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  // 烟团：三个错位软圆叠出不规则边缘
  const smoke = bake(64, (x, s) => {
    for (const [ox, oy, r, a] of [[0.5,0.52,0.42,0.5],[0.36,0.42,0.3,0.4],[0.64,0.4,0.28,0.4]]) {
      const g = x.createRadialGradient(s*ox, s*oy, 0, s*ox, s*oy, s*r);
      g.addColorStop(0, `rgba(120,116,130,${a})`);
      g.addColorStop(1, 'rgba(90,86,100,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
    }
  });
  // 火星：小而炽亮
  const spark = bake(32, (x, s) => {
    const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.4, 'rgba(255,200,90,.85)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  // 冲击波环
  const ring = bake(128, (x, s) => {
    const g = x.createRadialGradient(s/2, s/2, s*0.30, s/2, s/2, s*0.5);
    g.addColorStop(0, 'rgba(255,230,180,0)');
    g.addColorStop(0.72, 'rgba(255,230,180,.75)');
    g.addColorStop(0.86, 'rgba(255,200,130,.35)');
    g.addColorStop(1, 'rgba(255,180,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
  return { glow, fire, smoke, spark, ring };
})();

Object.assign(Game.prototype, {
  // 入队一枚粒子（带默认值；上限保护，超限丢最老的）
  fxP(o) {
    if (!this.fx) this.fx = [];
    if (this.fx.length > 340) this.fx.splice(0, 20);
    this.fx.push(Object.assign({
      tex: FxTex.glow, x: 0, y: 0, vx: 0, vy: 0, drag: 0, grav: 0,
      rot: Math.random() * Math.PI * 2, rv: 0,
      s0: 20, s1: 40, a0: 1, a1: 0, life: 0.5, t: 0, add: true,
    }, o));
  },

  updateFx(dt) {
    if (!this.fx) return;
    for (const f of this.fx) {
      f.t += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.drag) { const k = Math.max(0, 1 - f.drag * dt); f.vx *= k; f.vy *= k; }
      f.vy += (f.grav || 0) * dt;
      f.rot += f.rv * dt;
    }
    this.fx = this.fx.filter(f => f.t < f.life);
  },

  // 分两遍绘制：普通合成（烟）在下，加色混合（光/火/火星）在上
  drawFx(ctx, cam, w) {
    if (!this.fx || !this.fx.length) return;
    for (const pass of [false, true]) {
      let began = false;
      for (const f of this.fx) {
        if (!!f.add !== pass) continue;
        const sx = f.x - cam.x, sy = f.y - cam.y;
        if (sx < -80 || sy < -80 || sx > w + 80 || sy > VIEW_H + 80) continue;
        if (!began && pass) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; began = true; }
        const k = f.t / f.life;
        const s = f.s0 + (f.s1 - f.s0) * k;
        ctx.globalAlpha = Math.max(0, f.a0 + (f.a1 - f.a0) * k);
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(f.rot);
        if (f.img) {           // 像素贴图粒子（火焰云等）
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(f.img, -s / 2, -s / 2, s, s);
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.drawImage(f.tex, -s / 2, -s / 2, s, s);
        }
        ctx.restore();
      }
      if (began) ctx.restore();
      ctx.globalAlpha = 1;
    }
  },

  // —— 预设：分层爆炸（闪光→冲击环→火团→火星→烟） ——
  fxExplosion(x, y, R = 80, opts = {}) {
    if (!tune('juice')) return;
    const k = R / 80;
    this.fxP({ tex: FxTex.glow, x, y, s0: R * 1.6, s1: R * 2.6, a0: 0.95, a1: 0, life: 0.14 });                 // 闪光帧
    this.fxP({ tex: FxTex.ring, x, y, s0: R * 0.5, s1: R * 2.7, a0: 0.85, a1: 0, life: 0.34 });                 // 冲击波
    for (let i = 0; i < Math.round(9 * k) + 4; i++) {                                                            // 火团
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 150) * k;
      this.fxP({ tex: FxTex.fire, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3.2,
                 s0: 26 * k + Math.random() * 18, s1: 6, a0: 0.95, a1: 0, life: 0.36 + Math.random() * 0.22, rv: (Math.random()-0.5)*6 });
    }
    for (let i = 0; i < Math.round(10 * k) + 4; i++) {                                                           // 火星
      const a = Math.random() * Math.PI * 2, v = (220 + Math.random() * 320) * k;
      this.fxP({ tex: FxTex.spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, grav: 260,
                 s0: 10, s1: 3, a0: 1, a1: 0, life: 0.4 + Math.random() * 0.3 });
    }
    // 火焰云贴图碎片：向外飞散的真实火焰（crawl CC0）
    const flames = typeof MonsterImages !== 'undefined' &&
      [MonsterImages.fx_flame0, MonsterImages.fx_flame1, MonsterImages.fx_flame2].filter(im => im && im.naturalWidth);
    if (flames && flames.length) {
      for (let i = 0; i < Math.round(6 * k) + 3; i++) {
        const a = Math.random() * Math.PI * 2, v = (50 + Math.random() * 160) * k;
        this.fxP({ img: flames[i % flames.length], x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, drag: 2.6,
                   s0: 22 * k + Math.random() * 14, s1: 8, a0: 1, a1: 0, life: 0.4 + Math.random() * 0.25, rv: (Math.random()-0.5)*7 });
      }
      // 滞留地面余火（原地烧一会儿）
      for (let i = 0; i < Math.round(4 * k) + 2; i++) {
        this.fxP({ img: flames[i % flames.length], x: x + (Math.random()-0.5) * R * 0.9, y: y + (Math.random()-0.5) * R * 0.9,
                   vx: 0, vy: -12, s0: 16 + Math.random() * 10, s1: 4, a0: 0.95, a1: 0,
                   life: 0.8 + Math.random() * 0.7, rv: (Math.random()-0.5)*2 });
      }
    }
    for (let i = 0; i < Math.round(5 * k) + 2; i++) {                                                            // 余烟
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60;
      this.fxP({ tex: FxTex.smoke, x: x + (Math.random()-0.5) * R * 0.5, y: y + (Math.random()-0.5) * R * 0.5,
                 vx: Math.cos(a) * v, vy: Math.sin(a) * v - 34, drag: 1.6,
                 s0: 30 * k, s1: 80 * k, a0: 0.5, a1: 0, life: 0.8 + Math.random() * 0.5, add: false, rv: (Math.random()-0.5)*2 });
    }
    if (!opts.quiet) { this.shake = Math.max(this.shake, Math.min(12, 5 + 5 * k)); }
  },

  // 定向命中火花（子弹命中/近战劈中）
  fxHit(x, y, ang) {
    if (!tune('juice')) return;
    this.fxP({ tex: FxTex.glow, x, y, s0: 26, s1: 8, a0: 0.8, a1: 0, life: 0.12 });
    for (let i = 0; i < 4; i++) {
      const a = ang + Math.PI + (Math.random() - 0.5) * 1.5;   // 反弹向来弹方向溅
      const v = 120 + Math.random() * 220;
      this.fxP({ tex: FxTex.spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, grav: 220,
                 s0: 8, s1: 2, a0: 1, a1: 0, life: 0.22 + Math.random() * 0.18 });
    }
  },

  // 怪物死亡：烟散 + 灵魂微光
  fxDeath(x, y, big = false) {
    if (!tune('juice')) return;
    const k = big ? 1.8 : 1;
    this.fxP({ tex: FxTex.glow, x, y, s0: 40 * k, s1: 90 * k, a0: 0.5, a1: 0, life: 0.25 });
    for (let i = 0; i < (big ? 7 : 4); i++) {
      const a = Math.random() * Math.PI * 2, v = 24 + Math.random() * 50;
      this.fxP({ tex: FxTex.smoke, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 26, drag: 1.4,
                 s0: 24 * k, s1: 58 * k, a0: 0.55, a1: 0, life: 0.6 + Math.random() * 0.4, add: false, rv: (Math.random()-0.5)*3 });
    }
    for (let i = 0; i < (big ? 8 : 5); i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 130;
      this.fxP({ tex: FxTex.spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, drag: 2, grav: 150,
                 s0: 7 * k, s1: 2, a0: 0.9, a1: 0, life: 0.4 + Math.random() * 0.3 });
    }
  },

  // 枪口焰
  fxMuzzle(x, y, ang) {
    if (!tune('juice')) return;
    this.fxP({ tex: FxTex.fire, x: x + Math.cos(ang) * 6, y: y + Math.sin(ang) * 6,
               vx: Math.cos(ang) * 90, vy: Math.sin(ang) * 90, s0: 18, s1: 4, a0: 0.9, a1: 0, life: 0.09, rot: ang });
    this.fxP({ tex: FxTex.glow, x, y, s0: 22, s1: 10, a0: 0.6, a1: 0, life: 0.08 });
  },

  // 复仇之焰：火焰云环形爆发 + 双冲击环（受击反噬的怒火）
  fxRevenge(x, y, R = 150) {
    if (!tune('juice')) return;
    this.fxP({ tex: FxTex.glow, x, y, s0: R * 0.8, s1: R * 2.2, a0: 0.9, a1: 0, life: 0.16 });
    this.fxP({ tex: FxTex.ring, x, y, s0: 30, s1: R * 2.3, a0: 0.9, a1: 0, life: 0.32 });
    this.fxP({ tex: FxTex.ring, x, y, s0: 10, s1: R * 1.7, a0: 0.7, a1: 0, life: 0.42 });
    const flames = typeof MonsterImages !== 'undefined' &&
      [MonsterImages.fx_flame0, MonsterImages.fx_flame1, MonsterImages.fx_flame2].filter(im => im && im.naturalWidth);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n + Math.random() * 0.3;
      const v = 260 + Math.random() * 120;
      if (flames && flames.length) {
        this.fxP({ img: flames[i % flames.length], x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.8,
                   s0: 30, s1: 10, a0: 1, a1: 0, life: 0.45 + Math.random() * 0.2, rot: a, rv: (Math.random()-0.5)*6 });
      }
      this.fxP({ tex: FxTex.spark, x, y, vx: Math.cos(a) * v * 1.3, vy: Math.sin(a) * v * 1.3, drag: 2.2,
                 s0: 10, s1: 3, a0: 1, a1: 0, life: 0.35 });
    }
    this.shake = Math.max(this.shake, 7);
  },

  // 火焰拖尾（火球/陨石下坠）
  fxTrailFire(x, y, s = 18) {
    if (!tune('juice')) return;
    this.fxP({ tex: FxTex.fire, x: x + (Math.random()-0.5)*6, y: y + (Math.random()-0.5)*6,
               vx: (Math.random()-0.5)*30, vy: -20 - Math.random()*30, s0: s, s1: 4, a0: 0.85, a1: 0,
               life: 0.28 + Math.random() * 0.14, rv: (Math.random()-0.5)*5 });
  },
});
