// ============ 入口：加载存档，进入主菜单 ============
'use strict';

window.addEventListener('DOMContentLoaded', () => {
  loadSave();
  buildKeymaps();
  preloadSkins();
  preloadFloorTiles();
  preloadMonsterSprites();
  UI.showMenu();

  // 浏览器要求用户手势后才能出声：首次点击时启动音乐
  const unlock = () => {
    Music.kick();
    if (!Game.current) Music.play('menu');
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  // 关页面前兜底落盘（军械库/弹药等对局中的变动不丢失）
  window.addEventListener('beforeunload', () => { if (SAVE) persistSave(); });

  // 让画布随窗口等比缩放
  const fit = () => {
    const c = document.getElementById('game-canvas');
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H, 1.4);
    c.style.width = VIEW_W * scale + 'px';
    c.style.height = VIEW_H * scale + 'px';
  };
  window.addEventListener('resize', fit);
  fit();

  // —— 鼠标操控（单人）：准星跟踪 + 左键攻击 + 右键向准星翻滚 ——
  const cvs = document.getElementById('game-canvas');
  window.addEventListener('mousemove', e => {
    const r = cvs.getBoundingClientRect();
    if (!r.width) return;
    Input.mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
    Input.mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
    // DOM 准星在 mousemove 里直接位移：不等画布下一帧，指哪是哪
    const ac = document.getElementById('aim-cursor');
    if (ac) ac.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  });
  cvs.addEventListener('mousedown', e => {
    if (e.button === 0) Input.mouseL = true;
    if (e.button === 2) { Input.mouseR = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) Input.mouseL = false; });
  cvs.addEventListener('contextmenu', e => e.preventDefault());
});
