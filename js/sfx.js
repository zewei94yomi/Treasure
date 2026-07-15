// ============ 极简 WebAudio 音效（无外部资源） ============
'use strict';

// 采样音效（CC0：qubodup swoshes / bart icespells，via OpenGameArt）
const SFX_SAMPLES = {};
for (const [k, url] of Object.entries({ roll: 'assets/sfx/roll.m4a', freeze: 'assets/sfx/freeze.m4a' })) {
  try { const a = new Audio(url); a.preload = 'auto'; SFX_SAMPLES[k] = a; } catch (e) {}
}
function playSample(name, vol = 0.5) {
  const a = SFX_SAMPLES[name];
  if (!a) return false;
  try { const c = a.cloneNode(); c.volume = vol; c.play().catch(() => {}); return true; } catch (e) { return false; }
}

const Sfx = (() => {
  let ac = null;
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  function noise(dur, vol = 0.2, lp = 1200) {
    const a = ctx(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start();
  }
  return {
    shoot()   { noise(0.09, 0.22, 2400); tone(160, 0.08, 'square', 0.1, -80); },
    ak()      { noise(0.03, 0.32, 6000); noise(0.09, 0.2, 1000); tone(150, 0.05, 'square', 0.15, -100); tone(58, 0.09, 'sine', 0.16, -18); },
    mg()      { noise(0.045, 0.24, 2600); tone(95, 0.05, 'square', 0.12, -30); },
    smg()     { noise(0.05, 0.18, 3200); tone(200, 0.05, 'square', 0.08, -90); },
    sniper()  { noise(0.22, 0.34, 1000); tone(70, 0.28, 'sawtooth', 0.2, -35); tone(400, 0.06, 'sine', 0.08, -300); },
    rpg()     { noise(0.3, 0.3, 900); tone(60, 0.35, 'sawtooth', 0.18, 40); },
    impact()  { noise(0.05, 0.24, 950); tone(92, 0.07, 'sine', 0.22, -42); tone(320, 0.03, 'square', 0.07, -170); },
    roll()    { playSample('roll', 0.5) || (noise(0.05, 0.1, 3000), tone(300, 0.05, 'triangle', 0.08, -120)); },
    freeze()  { playSample('freeze', 0.45) || tone(880, 0.09, 'sawtooth', 0.1, -500); },
    grenThrow(){ noise(0.05, 0.09, 1800); tone(210, 0.09, 'triangle', 0.09, 100); },
    grenBoom() { noise(0.5, 0.42, 520); tone(42, 0.5, 'sine', 0.32, -14); tone(130, 0.12, 'square', 0.11, -70); },
    zap()     { tone(1600, 0.05, 'sawtooth', 0.09, -900); tone(700, 0.07, 'square', 0.07, -400); noise(0.03, 0.1, 5000); },
    shotgun() { noise(0.18, 0.3, 1400); tone(90, 0.15, 'square', 0.14, -40); },
    melee()   { noise(0.06, 0.12, 900); tone(220, 0.06, 'triangle', 0.12, -100); },
    hit()     { tone(140, 0.08, 'sawtooth', 0.12, -60); },
    flesh()   { noise(0.05, 0.14, 900); tone(95, 0.06, 'triangle', 0.1, -40); },
    crit()    { noise(0.07, 0.2, 1400); tone(320, 0.1, 'square', 0.14, -180); tone(660, 0.08, 'sine', 0.1, -200); },
    hurt()    { tone(110, 0.2, 'sawtooth', 0.16, -50); },
    open()    { tone(330, 0.1, 'triangle', 0.12); setTimeout(() => tone(440, 0.12, 'triangle', 0.12), 90); },
    pickup(r) { const base = { common:440, rare:520, epic:620, legendary:740, mythic:880 }[r] || 440;
                tone(base, 0.1, 'sine', 0.14); setTimeout(() => tone(base * 1.5, 0.16, 'sine', 0.14), 90); },
    buy()     { tone(660, 0.08, 'sine', 0.12); setTimeout(() => tone(880, 0.1, 'sine', 0.12), 70); },
    error()   { tone(160, 0.15, 'square', 0.1); },
    extract() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.14), i * 110)); },
    death()   { [300, 220, 150, 90].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.13), i * 130)); },
    aggro()   { tone(90, 0.3, 'sawtooth', 0.13, 60); },
    brute()   { tone(55, 0.5, 'sawtooth', 0.18, 25); noise(0.3, 0.15, 400); },
    lurker()  { tone(600, 0.25, 'sawtooth', 0.14, -350); tone(320, 0.3, 'square', 0.08, -180); },
    laser()   { tone(880, 0.09, 'sawtooth', 0.1, -500); tone(1400, 0.06, 'sine', 0.08, -600); },
    crossbow(){ noise(0.05, 0.1, 3000); tone(300, 0.05, 'triangle', 0.08, -120); },
    sword()   { noise(0.09, 0.14, 2200); tone(520, 0.08, 'triangle', 0.07, -380); tone(240, 0.12, 'sine', 0.05, -140); },
    windup()  { tone(180, 0.12, 'square', 0.09, 120); },
    wisp()    { tone(720, 0.18, 'sine', 0.1, -300); },
    banshee() { tone(950, 0.5, 'sawtooth', 0.12, -400); tone(1150, 0.4, 'sawtooth', 0.08, -500); },
    boom()    { noise(0.4, 0.35, 700); tone(50, 0.4, 'sine', 0.25, -20); },
    coin()    { tone(988, 0.06, 'square', 0.08); setTimeout(() => tone(1319, 0.1, 'square', 0.08), 60); },
    trade()   { tone(523, 0.08, 'sine', 0.1); setTimeout(() => tone(784, 0.1, 'sine', 0.1), 80); },
    tick()    { tone(500, 0.04, 'square', 0.06); },
    // 宝石连击：音高随连击攀升（多巴胺注入）
    gem(n)    { const f = 620 * Math.pow(2, Math.min(n, 14) / 12);
                tone(f, 0.07, 'sine', 0.13); setTimeout(() => tone(f * 1.5, 0.09, 'sine', 0.08), 45); },
    revive()  { tone(392, 0.12, 'sine', 0.13); setTimeout(() => tone(523, 0.15, 'sine', 0.13), 100); },
    heal()    { tone(494, 0.1, 'sine', 0.12); setTimeout(() => tone(587, 0.12, 'sine', 0.12), 80); },
    broke()   { noise(0.12, 0.18, 600); tone(80, 0.25, 'square', 0.1, -30); },
    mimic()   { tone(70, 0.4, 'sawtooth', 0.18, 100); noise(0.2, 0.2, 800); },
  };
})();
