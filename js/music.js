// ============ 程序化背景音乐：菜单主题 / 对局紧张氛围（无外部资源） ============
'use strict';

const Music = (() => {
  let ac = null, master = null;
  let theme = null;          // 'menu' | 'game' | null
  let timer = null;
  let nextT = 0, beat = 0;
  let danger = false;
  let droneNodes = [], dangerGain = null;

  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.22;
        master.connect(ac.destination);
      } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function enabled() { return !SAVE || !SAVE.settings || SAVE.settings.music !== false; }

  function note(freq, t, dur, type = 'triangle', vol = 0.5, dest = master) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // A 小调进行 (Am - F - C - G) 与五声音阶
  const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
  const PENTA = [440, 523.3, 587.3, 659.3, 784, 880];

  function scheduleMenu(t, b) {
    if (b % 8 === 0) {
      const ch = CHORDS[(b / 8) % 4];
      for (const f of ch) note(f / 2, t, 3.6, 'triangle', 0.16);
    }
    if (b % 2 === 1 && Math.random() < 0.65) {
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      note(f, t, 0.9, 'sine', 0.12);
      note(f, t + 0.25, 0.7, 'sine', 0.05); // 简易回声
    }
  }

  function scheduleGame(t, b) {
    // 心跳：追击时加倍
    const interval = danger ? 1 : 2;
    if (b % interval === 0) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(65, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      g.gain.setValueAtTime(danger ? 0.5 : 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.3);
    }
    // 稀疏的不安泛音
    if (b % 8 === 4 && Math.random() < 0.5) {
      note(PENTA[Math.floor(Math.random() * 3)] / 2, t, 2.2, 'sine', 0.06);
    }
    if (danger && b % 2 === 0) {
      note(233.1 + Math.random() * 4, t, 0.5, 'sawtooth', 0.045); // 小二度摩擦
    }
  }

  function startDrone() {
    stopDrone();
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 55;
    f.type = 'lowpass'; f.frequency.value = 240;
    g.gain.value = 0.10;
    o.connect(f).connect(g).connect(master);
    o.start();
    droneNodes = [o, g];
  }
  function stopDrone() {
    for (const n of droneNodes) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }
    droneNodes = [];
  }

  function tick() {
    if (!ac || !theme) return;
    const BPS = theme === 'menu' ? 1.9 : 1.6; // 每拍秒数
    while (nextT < ac.currentTime + 0.4) {
      (theme === 'menu' ? scheduleMenu : scheduleGame)(nextT, beat);
      nextT += BPS / 2;
      beat++;
    }
  }

  return {
    play(name) {
      if (!enabled()) { this.stop(); return; }
      if (!ctx()) return;
      if (theme === name) return;
      this.stop();
      theme = name;
      nextT = ac.currentTime + 0.1;
      beat = 0;
      if (name === 'game') startDrone();
      timer = setInterval(tick, 120);
    },
    stop() {
      theme = null;
      if (timer) { clearInterval(timer); timer = null; }
      stopDrone();
    },
    setDanger(v) { danger = v; },
    // 用户手势后恢复被浏览器拦截的 AudioContext
    kick() { if (theme && ac && ac.state === 'suspended') ac.resume(); },
    toggle() {
      SAVE.settings.music = !enabled() ? true : false;
      persistSave();
      if (!enabled()) this.stop();
      return enabled();
    },
    enabled,
  };
})();
