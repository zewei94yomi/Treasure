// ============ 随机环境天气系统（Game.prototype 扩展模块） ============
// 每局随机：晴朗/落雨/风雪/沙尘暴/血月。影响移速/视野/怪物强度，并带全屏视觉效果。
'use strict';

Object.assign(Game.prototype, {
  initWeather() {
    this.setWeather(rollWeather());
    this.weatherT = tune('weatherLen') || 75;
  },
  setWeather(w) {
    this.weather = w;
    this.weatherParts = [];
    if (w.id === 'rain' || w.id === 'snow' || w.id === 'sandstorm') {
      const n = w.id === 'sandstorm' ? 70 : 110;
      for (let i = 0; i < n; i++) {
        this.weatherParts.push({
          x: Math.random() * VIEW_W, y: Math.random() * VIEW_H,
          v: 0.6 + Math.random() * 0.8, ph: Math.random() * 10,
        });
      }
    }
    if (w.desc) this.toast(`${w.icon} ${w.name} — ${w.desc}`, '#9fd8ff');
    else this.toast(`${w.icon} 天空放晴了`, '#9fd8ff');
  },

  // 倍率查询：偏离 1 的部分按「环境效果强度」放大（面板可调）
  _wPow(v) { return v ? 1 + (v - 1) * tune('weatherPow') : 1; },
  weatherPSpd()   { return this._wPow(this.weather && this.weather.pSpd); },
  weatherMSpd()   { return this._wPow(this.weather && this.weather.mSpd); },
  weatherMDmg()   { return this._wPow(this.weather && this.weather.mDmg); },
  weatherVision() { return this._wPow(this.weather && this.weather.vision); },

  updateWeather(dt) {
    // 天气轮换：一局不再从头下雨到尾
    this.weatherT = (this.weatherT === undefined ? tune('weatherLen') : this.weatherT) - dt;
    if (this.weatherT <= 0) {
      this.weatherT = tune('weatherLen') || 75;
      let next = rollWeather();
      for (let i = 0; i < 6 && next.id === this.weather.id; i++) next = rollWeather();
      this.setWeather(next);
    }
    const w = this.weather;
    if (!w || !this.weatherParts.length) return;
    for (const p of this.weatherParts) {
      if (w.id === 'rain') { p.y += 520 * p.v * dt; p.x += 90 * dt; }
      else if (w.id === 'snow') { p.y += 90 * p.v * dt; p.x += Math.sin(this.time * 1.5 + p.ph) * 40 * dt; }
      else if (w.id === 'sandstorm') { p.x += 480 * p.v * dt; p.y += Math.sin(this.time * 3 + p.ph) * 30 * dt; }
      if (p.y > VIEW_H) { p.y = -6; p.x = Math.random() * VIEW_W; }
      if (p.x > VIEW_W) { p.x = -6; p.y = Math.random() * VIEW_H; }
    }
  },

  // 在单个视口上绘制（黑暗层之上：天气在黑暗中也可见）
  drawWeather(ctx, w) {
    const wt = this.weather;
    if (!wt || wt.id === 'clear') return;
    if (wt.tint) { ctx.fillStyle = wt.tint; ctx.fillRect(0, 0, w, VIEW_H); }
    if (wt.id === 'rain') {
      ctx.strokeStyle = 'rgba(160,200,255,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const p of this.weatherParts) {
        if (p.x > w) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 3, p.y + 13 * p.v);
      }
      ctx.stroke();
    } else if (wt.id === 'snow') {
      ctx.fillStyle = 'rgba(235,245,255,.7)';
      for (const p of this.weatherParts) {
        if (p.x > w) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + p.v, 0, Math.PI * 2); ctx.fill();
      }
    } else if (wt.id === 'sandstorm') {
      ctx.fillStyle = 'rgba(215,180,110,.4)';
      for (const p of this.weatherParts) {
        if (p.x > w) continue;
        ctx.fillRect(p.x, p.y, 5 + p.v * 4, 1.6);
      }
    } else if (wt.id === 'bloodmoon') {
      // 角落血月 + 呼吸红光
      const pulse = 0.06 + Math.sin(this.time * 1.2) * 0.03;
      ctx.fillStyle = `rgba(180,20,35,${pulse})`;
      ctx.fillRect(0, 0, w, VIEW_H);
      ctx.fillStyle = 'rgba(220,60,70,.85)';
      ctx.beginPath(); ctx.arc(w - 70, 64, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,10,25,.5)';
      ctx.beginPath(); ctx.arc(w - 78, 58, 8, 0, Math.PI * 2); ctx.fill();
    }
  },
});
