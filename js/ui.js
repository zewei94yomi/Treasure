// ============ UI：主菜单 / 出发准备 / 商店 / 宝物图鉴 / 结算 ============
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  let setupState = {
    mode: 1, diff: 'normal', map: 'manor', gameplay: 'classic',
    loadouts: [{ w1: null, w2: null, armor: null, pouch: false }, { w1: null, w2: null, armor: null, pouch: false }],
    skins: ['duck_yellow', 'duck_blue'],
  };
  let setupInited = false;

  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    $(id).classList.add('active');
    if (id !== 'screen-game') { const ab = $('arena-bar'); if (ab) ab.style.display = 'none'; }   // 离开对局收起练习场工具条
  }

  // ---------- 主菜单 ----------
  function showMenu() {
    showScreen('screen-menu');
    const done = collectedCount();
    const newCount = TREASURES.filter(t => SAVE.codex[t.id] && SAVE.codex[t.id].isNew).length;
    $('menu-info').innerHTML = `
      <span class="gold-chip">💰 ${SAVE.gold}</span>
      <span class="title-chip">🏅 ${collectorTitle()}</span>
      <span class="codex-chip">📖 图鉴 ${done}/${TREASURES.length}</span>`;
    $('menu-codex-badge').style.display = newCount ? '' : 'none';
    $('menu-codex-badge').textContent = newCount;
    const bm = $('btn-music');
    if (bm) bm.textContent = Music.enabled() ? '🎵 音乐：开' : '🔇 音乐：关';
  }

  // ---------- 图鉴馆 / 设置中心 ----------
  function showDexHub() { $('dexhub-overlay').style.display = 'flex'; }
  function hideDexHub() { $('dexhub-overlay').style.display = 'none'; }
  function showSettingsHub() {
    $('settingshub-overlay').style.display = 'flex';
    const b = $('btn-music');
    if (b) b.textContent = Music.enabled() ? '🎵 音乐：开' : '🔇 音乐：关';
    const ma = $('btn-mouseaim');
    if (ma) ma.textContent = SAVE.settings.mouseAim !== false
      ? '🖱️ 鼠标操控（单人）：开 — 准星瞄准/左键攻击/右键翻滚'
      : '⌨️ 鼠标操控（单人）：关 — 使用键盘朝向';
    const dv = $('btn-devmode');
    if (dv) dv.textContent = SAVE.settings.devMode ? '🧪 开发者模式：开 — 金钱无限/全解锁/经验加倍' : '🧪 开发者模式：关';
  }
  function startArena() {
    showScreen('screen-game');
    new Game(1, 'normal', [{}], 'manor', SAVE.settings.skins, { horde: true, arena: true });
    const bar = $('arena-bar');
    if (bar) bar.style.display = 'flex';
    // 填充武器/英雄选择器
    const ws = $('arena-wsel');
    if (ws) ws.innerHTML = '<option value="">🔫 选武器试用…</option>' +
      Object.values(WEAPONS).filter(w => w.id !== 'fists').map(w => `<option value="${w.id}">${w.icon} ${w.name}</option>`).join('');
    const rs = $('arena-rsel');
    if (rs) rs.innerHTML = '<option value="">⚔️ 选英雄入队…</option>' +
      Object.values(MERCS).map(m => `<option value="${m.id}">${m.icon} ${m.name}</option>`).join('');
    setTimeout(() => Game.current && Game.current.toast('🎯 练习场：无敌+站桩木人；调参面板里有每位英雄的强度滑杆', '#7ef7ff'), 500);
  }
  function toggleDevMode() {
    SAVE.settings.devMode = !SAVE.settings.devMode;
    persistSave();
    const b = $('btn-devmode');
    if (b) b.textContent = SAVE.settings.devMode ? '🧪 开发者模式：开 — 金钱无限/全解锁/经验加倍' : '🧪 开发者模式：关';
    if (SAVE.settings.devMode) SAVE.gold = Math.max(SAVE.gold, 999999);
    persistSave();
    Sfx.tick();
  }
  function toggleMouseAim() {
    SAVE.settings.mouseAim = SAVE.settings.mouseAim === false;
    persistSave();
    showSettingsHub();
    Sfx.tick();
  }
  function hideSettingsHub() { $('settingshub-overlay').style.display = 'none'; }

  function toggleMusic() {
    const on = Music.toggle();
    $('btn-music').textContent = on ? '🎵 音乐：开' : '🔇 音乐：关';
    if (on) Music.play('menu');
  }

  // ---------- 出发准备 ----------
  function showSetup() {
    showScreen('screen-setup');
    if (!setupInited) {
      setupInited = true;
      const st = SAVE.settings;
      setupState.mode = st.lastMode || 1;
      setupState.diff = st.lastDiff || 'normal';
      setupState.map = st.lastMap || 'manor';
      setupState.skins = (st.skins || []).slice(0, 2);
      if (!setupState.skins[0]) setupState.skins[0] = 'duck_yellow';
      if (!setupState.skins[1]) setupState.skins[1] = 'duck_blue';
    }
    // 清理失效引用，并给主武器一个默认值
    const takenW = new Set(), takenA = new Set();
    const usable = SAVE.weapons.filter(w => w.dur > 0);
    for (let i = 0; i < 2; i++) {
      const lo = setupState.loadouts[i];
      for (const k of ['w1', 'w2']) {
        const inst = SAVE.weapons.find(w => w.uid === lo[k] && w.dur > 0);
        if (!inst || takenW.has(lo[k])) lo[k] = null;
        else takenW.add(lo[k]);
      }
      const arm = SAVE.armors.find(a => a.uid === lo.armor && a.dur > 0);
      if (!arm || takenA.has(lo.armor)) lo.armor = null;
      else takenA.add(lo.armor);
    }
    for (let i = 0; i < 2; i++) {
      const lo = setupState.loadouts[i];
      if (lo.w1 === null) {
        const spare = usable.find(w => !takenW.has(w.uid));
        if (spare) { lo.w1 = spare.uid; takenW.add(spare.uid); }
      }
    }
    // 腰包数量校验
    let pouchUsed = 0;
    for (let i = 0; i < 2; i++) {
      if (setupState.loadouts[i].pouch) {
        pouchUsed++;
        if (pouchUsed > SAVE.pouches) setupState.loadouts[i].pouch = false;
      }
    }
    renderSetup();
  }

  function renderSetup() {
    const modeHtml = [1, 2].map(m => `
      <div class="card ${setupState.mode === m ? 'sel' : ''}" onclick="UI.setMode(${m})">
        <div class="card-icon">${m === 1 ? '🦆' : '🦆🦆'}</div>
        <div class="card-title">${m === 1 ? '单人模式' : '双人模式'}</div>
        <div class="card-desc">${m === 1 ? '独自潜入，独享宝藏' : '同屏合作，共享图鉴'}</div>
      </div>`).join('');
    $('setup-modes').innerHTML = modeHtml;

    $('setup-diffs').innerHTML = Object.values(DIFFICULTIES).map(d => {
      const total = Object.values(d.spawn).reduce((a, b) => a + b, 0);
      const types = Object.keys(d.spawn).map(t => MONSTER_TYPES[t].name).join('/');
      return `
      <div class="card ${setupState.diff === d.id ? 'sel' : ''}" onclick="UI.setDiff('${d.id}')">
        <div class="card-icon">${d.icon}</div>
        <div class="card-title">${d.name}</div>
        <div class="card-desc">${d.desc}</div>
        <div class="card-meta">${types} 共 ${total}+ 只 · 追击 ${d.chaseSpeed} · 视野 ${d.vision}</div>
      </div>`; }).join('');

    // 地图选择
    const mapCards = MAP_ORDER.map(id => {
      const m = MAPS[id];
      return `
      <div class="card ${setupState.map === id ? 'sel' : ''}" onclick="UI.setMap('${id}')">
        <div class="card-icon">${m.icon}</div>
        <div class="card-title">${m.name}</div>
        <div class="card-desc">${m.desc}</div>
      </div>`; }).join('') + `
      <div class="card ${setupState.map === 'random' ? 'sel' : ''}" onclick="UI.setMap('random')">
        <div class="card-icon">🎲</div>
        <div class="card-title">随机</div>
        <div class="card-desc">开局才知道去哪儿。</div>
      </div>`;
    $('setup-maps').innerHTML = mapCards;

    // 玩法：经典搜打撤 / 无双割草
    $('setup-gameplay').innerHTML = `
      <div class="card ${setupState.gameplay === 'classic' ? 'sel' : ''}" onclick="UI.setGameplay('classic')">
        <div class="card-icon">🗺️</div>
        <div class="card-title">经典搜打撤</div>
        <div class="card-desc">搜宝箱、躲怪物、活着撤离。图鉴与财富之路。</div>
      </div>
      <div class="card ${setupState.gameplay === 'horde' ? 'sel' : ''}" onclick="UI.setGameplay('horde')">
        <div class="card-icon">🌾</div>
        <div class="card-title">无双割草</div>
        <div class="card-desc">怪山怪海，撑过 ${Math.round(tune('hordeTime'))} 分钟！击杀掉经验（越晚越肥），升级三选一，弹药无限、阵亡不丢装备。${SAVE.hordeBest ? `<br>最佳：${Math.floor(SAVE.hordeBest.time/60)}:${String(SAVE.hordeBest.time%60).padStart(2,'0')} · ${SAVE.hordeBest.kills}杀 · Lv.${SAVE.hordeBest.level}` : ''}</div>
      </div>
      <div class="card ${setupState.gameplay === 'escape' ? 'sel' : ''}" onclick="UI.setGameplay('escape')">
        <div class="card-icon">🏃</div>
        <div class="card-title">大逃亡</div>
        <div class="card-desc">超长随机地图一路向东：打怪升级、开箱捡枪，死亡之潮在身后碾来——边撤离边抵抗，冲进撤离点才算活！${SAVE.escapeBest ? `<br>最佳：里程 ${SAVE.escapeBest.prog}% · ${SAVE.escapeBest.kills}杀 · Lv.${SAVE.escapeBest.level}` : ''}</div>
      </div>`;
    const hordeSel = setupState.gameplay === 'horde' || setupState.gameplay === 'escape';
    $('setup-diffs-label').style.display = hordeSel ? 'none' : '';
    $('setup-diffs').style.display = hordeSel ? 'none' : '';
    // 大逃亡：地图为程序生成，隐藏地图选择
    const mapsRow = $('setup-maps');
    if (mapsRow) mapsRow.style.display = setupState.gameplay === 'escape' ? 'none' : '';

    // 双武器 + 护甲 + 腰包 + 皮肤
    let html = '';
    const allTakenW = [], allTakenA = [];
    for (let i = 0; i < setupState.mode; i++) {
      const lo = setupState.loadouts[i];
      if (lo.w1) allTakenW.push(lo.w1);
      if (lo.w2) allTakenW.push(lo.w2);
      if (lo.armor) allTakenA.push(lo.armor);
    }
    let pouchesLeft = SAVE.pouches;
    for (let i = 0; i < setupState.mode; i++) if (setupState.loadouts[i].pouch) pouchesLeft--;
    const noGear = setupState.gameplay !== 'classic';   // 割草/大逃亡：不带装备入场
    for (let i = 0; i < setupState.mode; i++) {
      const lo = setupState.loadouts[i];
      const wOpts = slotKey => ['<option value="">🐤 空手</option>'].concat(
        SAVE.weapons.filter(w => w.dur > 0 && (w.uid === lo[slotKey] || !allTakenW.includes(w.uid)))
          .map(w => `<option value="${w.uid}" ${lo[slotKey] === w.uid ? 'selected' : ''}>${weaponLabel(w)}</option>`)
      ).join('');
      const aOpts = ['<option value="">无护甲</option>'].concat(
        SAVE.armors.filter(a => a.dur > 0 && (a.uid === lo.armor || !allTakenA.includes(a.uid)))
          .map(a => `<option value="${a.uid}" ${lo.armor === a.uid ? 'selected' : ''}>${armorLabel(a)}</option>`)
      ).join('');
      // 皮肤：未解锁的显示 🔒
      if (!skinUnlocked(SKINS.find(s => s.id === setupState.skins[i]) || SKINS[0], SAVE)) setupState.skins[i] = 'duck_yellow';
      const skinOpts = SKINS.map(s => {
        const ok = skinUnlocked(s, SAVE);
        return `<option value="${s.id}" ${!ok ? 'disabled' : ''} ${setupState.skins[i] === s.id ? 'selected' : ''}>${ok ? (s.emoji || '🦆') : '🔒'} ${s.name}${ok ? '' : `（集齐「${SERIES[s.requires].name}」解锁）`}</option>`;
      }).join('');
      // 装饰（帽子/光环）
      const accOpts = ['<option value="">无装饰</option>'].concat(Object.values(ACCESSORIES).map(a => {
        const ok = accUnlocked(a, SAVE);
        return `<option value="${a.id}" ${!ok ? 'disabled' : ''} ${lo.acc === a.id ? 'selected' : ''}>${ok ? a.icon : '🔒'} ${a.name}${ok ? '' : `（集齐「${SERIES[a.requires].name}」）`}</option>`;
      })).join('');
      // 雇佣兵
      const sniperHired = setupState.loadouts.slice(0, setupState.mode).some(l => l.merc === 'sniper');
      const mercOpts = ['<option value="">不雇佣</option>'].concat(Object.values(MERCS).filter(mc => mc.id !== 'dog').map(mc => {
        const trials = SAVE.mercTrials[mc.id] || 0;
        const label = trials > 0 ? `免费试用×${trials}` : `💰${mc.price}/局`;
        const afford = trials > 0 || SAVE.gold >= mc.price;
        return `<option value="${mc.id}" ${!afford ? 'disabled' : ''} ${lo.merc === mc.id ? 'selected' : ''}>${mc.icon} ${mc.name}（${label}）</option>`;
      })).join('');
      // 嗅探犬：随狙击手解锁的第二槽位
      const dogDef = MERCS.dog;
      const dogTrials = SAVE.mercTrials.dog || 0;
      const dogLabel = dogTrials > 0 ? `免费试用×${dogTrials}` : `💰${dogDef.price}/局`;
      const dogSelect = lo.merc === 'sniper'
        ? `<select onchange="UI.setMerc2(${i}, this.value)" title="鹰眼专属">
             <option value="">不带汪财</option>
             <option value="dog" ${lo.merc2 === 'dog' ? 'selected' : ''}>🐕 ${dogDef.name}（${dogLabel}）</option>
           </select>`
        : `<span class="loadout-hint">🐕 汪财：先雇🎯鹰眼解锁</span>`;
      const pouchOk = lo.pouch || pouchesLeft > 0;
      html += `
        <div class="loadout-player">
          <div class="loadout-row">
            <span class="loadout-label" style="color:${i === 0 ? '#ffd93d' : '#9fd8ff'}">${i + 1}P</span>
            ${noGear
              ? '<span class="loadout-hint">🔫 空手入场·一把手枪起家——武器/护甲全靠局内升级、招募卡与商人成长</span>'
              : `<select onchange="UI.setGear(${i},'w1',this.value)" title="主武器">${wOpts('w1')}</select>
            <select onchange="UI.setGear(${i},'w2',this.value)" title="副武器">${wOpts('w2')}</select>`}
          </div>
          <div class="loadout-row sub">
            <span class="loadout-label"></span>
            ${noGear ? '' : `<select onchange="UI.setGear(${i},'armor',this.value)" title="护甲">${aOpts}</select>
            <label class="pouch-check ${pouchOk ? '' : 'disabled'}">
              <input type="checkbox" ${lo.pouch ? 'checked' : ''} ${pouchOk ? '' : 'disabled'} onchange="UI.setPouch(${i}, this.checked)">
              👝腰包${SAVE.pouches ? `(持有${SAVE.pouches})` : '(未持有)'}
            </label>`}
            <select onchange="UI.setMerc(${i}, this.value)" title="雇佣兵">${mercOpts}</select>
            ${dogSelect}
          </div>
          <div class="loadout-row sub">
            <span class="loadout-label"></span>
            <select class="skin-select" onchange="UI.setSkin(${i}, this.value)">${skinOpts}</select>
            <select class="skin-select" onchange="UI.setAcc(${i}, this.value)" title="装饰">${accOpts}</select>
            <span class="skin-dot" style="background:${(SKINS.find(s=>s.id===setupState.skins[i])||SKINS[0]).body}"></span>
          </div>
        </div>`;
    }
    html += `<div class="loadout-ammo">弹药：🔹×${SAVE.ammo.light} 🔸×${SAVE.ammo.shell} 🔺×${SAVE.ammo.heavy} 🔋×${SAVE.ammo.cell}　|　药品：${CONSUM_ORDER.map(k => `${CONSUMABLES[k].icon}×${SAVE.consumables[k]}`).join(' ')}</div>`;
    html += `<div class="loadout-warn">⚠️ 撤离模式规则：阵亡会丢失携带的武器、护甲、腰包和宝物！负重会拖慢移速、放大脚步声。</div>`;
    $('setup-loadout').innerHTML = html;
  }

  function setMode(m) { setupState.mode = m; renderSetup(); }
  function setGameplay(g) { setupState.gameplay = g; renderSetup(); }
  function setDiff(d) { setupState.diff = d; renderSetup(); }
  function setMap(m) { setupState.map = m; renderSetup(); }
  function setGear(i, slot, v) {
    setupState.loadouts[i][slot] = v ? +v : null;
    // 同一把武器不能占两个槽
    const lo = setupState.loadouts[i];
    if (slot === 'w1' && lo.w2 === lo.w1) lo.w2 = null;
    if (slot === 'w2' && lo.w1 === lo.w2) lo.w1 = null;
    renderSetup();
  }
  function setPouch(i, v) { setupState.loadouts[i].pouch = !!v; renderSetup(); }
  function setSkin(i, v) { setupState.skins[i] = v; renderSetup(); }
  function setAcc(i, v) { setupState.loadouts[i].acc = v || null; renderSetup(); }
  function setMerc(i, v) {
    setupState.loadouts[i].merc = v || null;
    if (v !== 'sniper') setupState.loadouts[i].merc2 = null;   // 换掉鹰眼则狗自动离队
    renderSetup();
  }
  function setMerc2(i, v) { setupState.loadouts[i].merc2 = v || null; renderSetup(); }

  function startRun() {
    const mapId = setupState.gameplay === 'escape' ? 'escape'
                : setupState.map === 'random' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : setupState.map;
    // 结算雇佣兵费用（优先消耗免费试用）
    for (let i = 0; i < setupState.mode; i++) {
      for (const key of ['merc', 'merc2']) {
        const mid = setupState.loadouts[i][key];
        if (!mid) continue;
        if (key === 'merc2' && setupState.loadouts[i].merc !== 'sniper') { setupState.loadouts[i].merc2 = null; continue; }
        if (SAVE.settings.devMode) { /* 开发者模式：招募全免费 */ }
        else if (SAVE.mercTrials[mid] > 0) SAVE.mercTrials[mid]--;
        else if (SAVE.gold >= MERCS[mid].price) SAVE.gold -= MERCS[mid].price;
        else {
          setupState.loadouts[i][key] = null;
          setTimeout(() => Game.current && Game.current.toast(`⚠️ 金币不足，${MERCS[mid].name} 未能随行`, '#ff8f8f'), 800);
        }
      }
    }
    // 出发播报：佣兵随行确认（避免"以为没出现"）
    const hired = [];
    for (let i = 0; i < setupState.mode; i++) {
      for (const key of ['merc', 'merc2']) {
        const mid = setupState.loadouts[i][key];
        if (mid && MERCS[mid]) hired.push(MERCS[mid].icon + MERCS[mid].name.split('·')[0]);
      }
    }
    if (hired.length) setTimeout(() => Game.current && Game.current.toast(`⚔️ 随行佣兵：${hired.join('、')}已就位（看左侧面板）`, '#7dff9a'), 400);
    SAVE.settings.lastMode = setupState.mode;
    SAVE.settings.lastDiff = setupState.diff;
    SAVE.settings.lastMap = setupState.map;
    SAVE.settings.skins = setupState.skins.slice();
    persistSave();
    showScreen('screen-game');
    new Game(setupState.mode, setupState.diff, setupState.loadouts.slice(0, setupState.mode), mapId, setupState.skins,
             { horde: setupState.gameplay === 'horde', escape: setupState.gameplay === 'escape' });
  }

  // ---------- 无双割草：升级三选一 ----------
  function renderLevelup(game, choices) {
    const H = game.hordeState;
    $('levelup-cards').innerHTML = choices.map((u, i) => {
      const cur = (u.skill ? H.skills[u.skill] : (H.picked && H.picked[u.id])) || 0;
      // 技能类：附上"下一级具体效果"（与技能图鉴同一套公式）
      let fx = '';
      try {
        if (u.skill && typeof Dex !== 'undefined' && Dex.skillInfo) {
          const line = Dex.skillInfo(u.skill, cur + 1);
          if (line) fx = `<span class="lv-fx">📈 ${line}</span>`;
        }
      } catch (e) {}
      return `
      <div class="levelup-card" onclick="UI.chooseLevelup(${i})">
        <span class="lv-icon">${u.icon}</span>
        <span class="lv-name">${u.name}</span>
        <span class="lv-level">Lv.${cur} → Lv.${cur + 1}${cur + 1 >= u.max ? '（满级）' : ''}</span>
        <span class="lv-desc">${u.desc}</span>
        ${fx}
        <span class="lv-key">按 ${i + 1}</span>
      </div>`;
    }).join('');
    document.getElementById('levelup-overlay').style.display = 'flex';
  }
  function chooseLevelup(i) {
    const g = Game.current;
    if (!g || !g.levelupOpen || !g.levelupChoices || !g.levelupChoices[i]) return;
    g.applyUpgrade(g.levelupChoices[i]);
  }

  // ---------- 奖杯陈列室 ----------
  function showTrophies() {
    showScreen('screen-trophies');
    const got = Object.keys(SAVE.trophies).length;
    $('trophy-count').textContent = `已解锁 ${got} / ${TROPHIES.length}`;
    $('trophy-body').innerHTML = TROPHIES.map(t => {
      const ts = SAVE.trophies[t.id];
      return `
      <div class="trophy-cell ${ts ? 'got' : 'locked'}">
        <span class="trophy-icon">${ts ? t.icon : '🔒'}</span>
        <span class="trophy-name">${t.name}</span>
        <span class="trophy-desc">${t.desc}</span>
        ${ts ? `<span class="trophy-date">${new Date(ts).toLocaleDateString()}</span>` : ''}
      </div>`;
    }).join('');
  }

  // ---------- 商店 ----------
  function showShop() {
    showScreen('screen-shop');
    renderShop();
  }

  function renderShop() {
    $('shop-gold').textContent = `💰 ${SAVE.gold}`;
    // 武器（图纸类需集齐对应系列解锁）
    $('shop-weapons').innerHTML = Object.values(WEAPONS).filter(w => w.price).map(w => {
      const locked = w.requires && !SAVE.claimedSeriesRewards.includes(w.requires);
      return `
      <div class="shop-item ${locked ? 'broken' : ''}">
        <div class="shop-item-head"><span class="shop-icon">${locked ? '🔒' : w.icon}</span><b>${w.name}</b></div>
        <div class="shop-item-desc">${w.desc}</div>
        <div class="shop-item-meta">伤害 ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · 射速 ${w.rate}/s · 耐久 ${w.dur}${w.ammo ? ' · ' + AMMO_TYPES[w.ammo].icon + AMMO_TYPES[w.ammo].name : ' · 无需弹药'}</div>
        ${locked ? `<span class="broken-tag">集齐「${SERIES[w.requires].name}」解锁图纸</span>`
                 : `<button class="btn small ${SAVE.gold < w.price ? 'disabled' : ''}" onclick="UI.buyWeapon('${w.id}')">购买 💰${w.price}</button>`}
      </div>`; }).join('');
    // 弹药
    $('shop-ammo').innerHTML = Object.entries(AMMO_TYPES).map(([k, a]) => `
      <div class="shop-item">
        <div class="shop-item-head"><span class="shop-icon">${a.icon}</span><b>${a.name} ×${a.pack}</b></div>
        <div class="shop-item-meta">库存 ${SAVE.ammo[k]} 发</div>
        <button class="btn small ${SAVE.gold < a.price ? 'disabled' : ''}" onclick="UI.buyAmmo('${k}')">购买 💰${a.price}</button>
      </div>`).join('');
    // 补给
    $('shop-supplies').innerHTML = Object.entries(CONSUMABLES).map(([k, c]) => `
      <div class="shop-item">
        <div class="shop-item-head"><span class="shop-icon">${c.icon}</span><b>${c.name}</b></div>
        <div class="shop-item-desc">${c.desc}</div>
        <div class="shop-item-meta">持有 ${SAVE.consumables[k]}</div>
        <button class="btn small ${SAVE.gold < c.price ? 'disabled' : ''}" onclick="UI.buyConsumable('${k}')">购买 💰${c.price}</button>
      </div>`).join('');
    // 护甲与装备
    $('shop-armor').innerHTML = Object.values(ARMORS).map(a => `
      <div class="shop-item">
        <div class="shop-item-head"><span class="shop-icon">${a.icon}</span><b>${a.name}</b></div>
        <div class="shop-item-desc">${a.desc}</div>
        <div class="shop-item-meta">甲片 ${a.pool} · 吸收 ${Math.round(a.absorb*100)}% · 重量 ${a.weight}</div>
        <button class="btn small ${SAVE.gold < a.price ? 'disabled' : ''}" onclick="UI.buyArmor('${a.id}')">购买 💰${a.price}</button>
      </div>`).join('') + `
      <div class="shop-item">
        <div class="shop-item-head"><span class="shop-icon">${GEAR.pouch.icon}</span><b>${GEAR.pouch.name}</b></div>
        <div class="shop-item-desc">${GEAR.pouch.desc}</div>
        <div class="shop-item-meta">持有 ${SAVE.pouches}</div>
        <button class="btn small ${SAVE.gold < GEAR.pouch.price ? 'disabled' : ''}" onclick="UI.buyPouch()">购买 💰${GEAR.pouch.price}</button>
      </div>`;
    // 军械库与维修（武器 + 护甲）
    const weaponCards = SAVE.weapons.map(w => {
      const def = WEAPONS[w.id];
      const missing = def.dur - w.dur;
      const cost = Math.ceil(missing * def.repairCost);
      return `
        <div class="shop-item ${w.dur <= 0 ? 'broken' : ''}">
          <div class="shop-item-head"><span class="shop-icon">${def.icon}</span><b>${def.name}</b>${w.dur <= 0 ? ' <span class="broken-tag">已损坏</span>' : ''}</div>
          <div class="dur-bar"><div class="dur-fill" style="width:${Math.max(0, w.dur / def.dur * 100)}%"></div></div>
          <div class="shop-item-meta">耐久 ${Math.max(0, Math.ceil(w.dur))}/${def.dur}</div>
          ${missing > 0.5 ? `<button class="btn small ${SAVE.gold < cost ? 'disabled' : ''}" onclick="UI.repairWeapon(${w.uid})">维修 💰${cost}</button>` : '<span class="ok-tag">状态完好</span>'}
        </div>`;
    });
    const armorCards = SAVE.armors.map(a => {
      const def = ARMORS[a.id];
      const missing = def.pool - a.dur;
      const cost = Math.ceil(missing * def.repairCost);
      return `
        <div class="shop-item ${a.dur <= 0 ? 'broken' : ''}">
          <div class="shop-item-head"><span class="shop-icon">${def.icon}</span><b>${def.name}</b>${a.dur <= 0 ? ' <span class="broken-tag">已破碎</span>' : ''}</div>
          <div class="dur-bar"><div class="dur-fill" style="width:${Math.max(0, a.dur / def.pool * 100)}%"></div></div>
          <div class="shop-item-meta">甲片 ${Math.max(0, Math.ceil(a.dur))}/${def.pool}</div>
          ${missing > 0.5 ? `<button class="btn small ${SAVE.gold < cost ? 'disabled' : ''}" onclick="UI.repairArmor(${a.uid})">修甲 💰${cost}</button>` : '<span class="ok-tag">状态完好</span>'}
        </div>`;
    });
    const cards = weaponCards.concat(armorCards);
    $('shop-armory').innerHTML = cards.length ? cards.join('') : '<div class="empty-tip">军械库空空如也</div>';
  }

  function buyWeapon(id) {
    const w = WEAPONS[id];
    if (w.requires && !SAVE.claimedSeriesRewards.includes(w.requires)) { Sfx.error(); return; }
    if (SAVE.gold < w.price) { Sfx.error(); return; }
    SAVE.gold -= w.price; addWeapon(id); persistSave(); Sfx.buy(); renderShop();
  }
  function buyAmmo(k) {
    const a = AMMO_TYPES[k];
    if (SAVE.gold < a.price) { Sfx.error(); return; }
    SAVE.gold -= a.price; SAVE.ammo[k] += a.pack; persistSave(); Sfx.buy(); renderShop();
  }
  function buyConsumable(k) {
    const c = CONSUMABLES[k];
    if (SAVE.gold < c.price) { Sfx.error(); return; }
    SAVE.gold -= c.price; SAVE.consumables[k]++; persistSave(); Sfx.buy(); renderShop();
  }
  function repairWeapon(uid) {
    const w = SAVE.weapons.find(x => x.uid === uid);
    if (!w) return;
    const def = WEAPONS[w.id];
    const cost = Math.ceil((def.dur - w.dur) * def.repairCost);
    if (SAVE.gold < cost) { Sfx.error(); return; }
    SAVE.gold -= cost; w.dur = def.dur; persistSave(); Sfx.buy(); renderShop();
  }
  function buyArmor(id) {
    const a = ARMORS[id];
    if (SAVE.gold < a.price) { Sfx.error(); return; }
    SAVE.gold -= a.price; addArmor(id); persistSave(); Sfx.buy(); renderShop();
  }
  function buyPouch() {
    if (SAVE.gold < GEAR.pouch.price) { Sfx.error(); return; }
    SAVE.gold -= GEAR.pouch.price; SAVE.pouches++; persistSave(); Sfx.buy(); renderShop();
  }
  function repairArmor(uid) {
    const a = SAVE.armors.find(x => x.uid === uid);
    if (!a) return;
    const def = ARMORS[a.id];
    const cost = Math.ceil((def.pool - a.dur) * def.repairCost);
    if (SAVE.gold < cost) { Sfx.error(); return; }
    SAVE.gold -= cost; a.dur = def.pool; persistSave(); Sfx.buy(); renderShop();
  }

  // ---------- 神秘商人 ----------
  function renderMerchant(game, p) {
    const m = game.merchant;
    $('merchant-gold').textContent = `💰 ${SAVE.gold}`;
    let buyHtml = '';
    m.stock.forEach((item, i) => {
      if (m.sold.has(i)) { buyHtml += `<div class="shop-item sold"><div class="shop-item-head">已售罄</div></div>`; return; }
      buyHtml += `
        <div class="shop-item">
          <div class="shop-item-head"><span class="shop-icon">${item.icon}</span><b>${item.label}</b></div>
          ${item.note ? `<div class="shop-item-meta" style="color:#ffd93d">${item.note}</div>` : ''}
          <button class="btn small ${SAVE.gold < item.price ? 'disabled' : ''}" onclick="UI.merchantBuy(${i})">买 💰${item.price}</button>
        </div>`;
    });
    // 买活队友：双人局有人彻底阵亡时的高价救赎
    const fallen = game.players.find(pl => pl.dead);
    if (fallen) {
      const cost = game.horde ? 400 : 1500;
      buyHtml += `
        <div class="shop-item" style="border-color:#ff8f8f">
          <div class="shop-item-head"><span class="shop-icon">⚰️</span><b>买活 ${game.pname(fallen)}</b></div>
          <div class="shop-item-meta" style="color:#ff8f8f">"死人也能谈价钱……就是贵。"（半血复活在摊位旁）</div>
          <button class="btn small ${SAVE.gold < cost ? 'disabled' : ''}" onclick="UI.merchantRevive()">买 💰${cost}</button>
        </div>`;
    }
    $('merchant-buy').innerHTML = buyHtml;
    const sellHtml = p.bag.map((t, i) => {
      const price = Math.floor(t.value * MERCHANT_SELL_RATE);
      return `
        <div class="shop-item" style="border-color:${RARITIES[t.rarity].color}">
          <div class="shop-item-head"><span class="shop-icon">${t.icon}</span><b>${t.name}</b></div>
          <div class="shop-item-meta">价值 💰${t.value}</div>
          <button class="btn small" onclick="UI.merchantSell(${i})">卖 💰${price}</button>
        </div>`;
    }).join('');
    $('merchant-sell').innerHTML = sellHtml || '<div class="empty-tip">背包里没有可以出手的宝物</div>';
  }
  let lootDrawState = null;
  function pickLootCard(i) {
    if (!lootDrawState || lootDrawState.picked) return;
    lootDrawState.picked = true;
    lootDrawState.list.forEach((t, j) => {
      const el = $('loot-chest-' + j);
      if (!el) return;
      const col = RARITIES[t.rarity].color;
      el.classList.add('opened');
      el.innerHTML = `
        <div class="loot-lid" style="text-shadow:0 0 14px ${col}">${t.icon}</div>
        <div class="loot-hint" style="color:${col}">${t.name}<br><span style="font-size:10px">${RARITIES[t.rarity].name} · 💰${t.value}</span></div>`;
      if (j === i) {
        el.style.borderColor = col;
        el.style.boxShadow = `0 0 18px ${col}`;
      } else el.style.opacity = '0.4';
    });
    const t = lootDrawState.list[i];
    const first = codexMarkCollected(t.id, t.value);
    SAVE.gold += t.value;
    persistSave();
    Sfx.pickup(t.rarity);
    const el = $('loot-chest-' + i);
    if (el && first) el.querySelector('.loot-hint').innerHTML += '<br><span style="color:#7dff9a;font-size:10px">✨ 首次收录图鉴！</span>';
  }

  function merchantRevive() {
    const g = Game.current;
    if (!g || !g.merchant) return;
    const fallen = g.players.find(pl => pl.dead);
    const cost = g.horde ? 400 : 1500;
    if (!fallen || SAVE.gold < cost) { Sfx.error(); return; }
    SAVE.gold -= cost;
    fallen.dead = false; fallen.downed = false;   // active 为派生 getter，清状态即可
    fallen.hp = Math.ceil(fallen.maxHp * 0.5);
    fallen.x = g.merchant.x + 30; fallen.y = g.merchant.y + 20;
    unstick(fallen);
    fallen.hurtCd = 2;                        // 起身保护
    if (!g.horde && !fallen.weapons.some(w => w)) fallen.weapons[0] = { id: 'pan', dur: 80, uid: -1 };  // 至少给口锅
    g.fxDeath(fallen.x, fallen.y, true);
    Sfx.revive();
    g.toast(`⚰️→🦆 ${g.pname(fallen)} 被商人从鬼门关拽了回来！`, '#7dff9a');
    persistSave();
    renderMerchant(g, g.trader);
  }
  function merchantBuy(i) {
    const g = Game.current;
    if (!g || !g.merchant) return;
    const item = g.merchant.stock[i];
    if (!item || g.merchant.sold.has(i) || SAVE.gold < item.price) { Sfx.error(); return; }
    SAVE.gold -= item.price;
    g.merchant.sold.add(i);
    if (item.kind === 'consumable') SAVE.consumables[item.id]++;
    else if (item.kind === 'ammo') SAVE.ammo[item.id] += AMMO_TYPES[item.id].pack;
    else if (item.kind === 'weapon') { addWeapon(item.id); g.toast(`${item.label} 已存入军械库`, '#b48aff'); }
    else if (item.kind === 'armor') { addArmor(item.id); g.toast(`${item.label} 已存入军械库`, '#b48aff'); }
    else if (item.kind === 'pouch') {
      SAVE.pouches++;
      if (g.trader && !g.trader.pouch) { g.trader.pouch = true; g.toast('腰包当场系上了！背包 +3 格', '#7dff9a'); }
    }
    else if (item.kind === 'potionpack') {
      for (const k of item.id.split(',')) SAVE.consumables[k]++;
      g.toast('🎁 药剂礼包到手！', '#b48aff');
    }
    else if (item.kind === 'upgrade') {
      g.hordeState.freeChoices++;
      g.toast('⬆️ 强化券已激活——离开商店立即三选一！', '#ffd93d');
    }
    else if (item.kind === 'healall') {
      for (const pl of g.players) if (pl.alive) pl.hp = pl.maxHp;
      g.toast('❤️ 全队生命回满！', '#7dff9a');
    }
    else if (item.kind === 'merc') {
      const mc = new Mercenary(g.trader.x + 34, g.trader.y + 26, MERCS[item.id], g.trader);
      unstick(mc);
      g.mercs.push(mc);
      g.toast(`${MERCS[item.id].icon} ${MERCS[item.id].name} 已入队并肩作战！`, '#7dff9a');
      Sfx.revive();
    }
    else if (item.kind === 'mercace') {
      const mc = new Mercenary(g.trader.x + 30, g.trader.y + 30, MERCS.ace, g.trader);
      mc.despawnT = 40;
      unstick(mc);
      g.mercs.push(mc);
      g.toast('🦅 佣兵王·灰羽驰援 40 秒！', '#ffd93d');
    }
    else if (item.kind === 'treasure') {
      const t = TREASURE_BY_ID[item.id];
      if (g.trader.addToBag(t)) { codexMarkSeen(t.id); g.toast(`${t.icon}${t.name} 已入背包——活着带出去才算图鉴收录！`, RARITIES[t.rarity].color); }
      else { SAVE.gold += item.price; g.merchant.sold.delete(i); g.toast('背包放不下！已退款', '#ff8f8f'); Sfx.error(); return; }
    }
    persistSave(); Sfx.trade();
    renderMerchant(g, g.trader);
  }
  // ---------- 策划调参面板 ----------
  function showTuning() {
    $('tuning-overlay').style.display = 'flex';
    renderTuning();
  }
  function closeTuning() { $('tuning-overlay').style.display = 'none'; }
  function renderTuning() {
    const fmt = n => Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
    const changedList = TUNE_DEFS.filter(t => tune(t.id) !== t.def);
    // 顶部汇总：所有被改动过的项
    let head = '';
    if (changedList.length) {
      head = `<div class="tuning-changed-bar">✏️ 已修改 ${changedList.length} 项：` +
        changedList.map(t => `<b>${t.name}</b> <span class="dim">${fmt(t.def)}</span>→<span class="cur">${fmt(tune(t.id))}</span>`).join('　') +
        '</div>';
    }
    $('tuning-body').innerHTML = head + '<div class="tuning-grid">' + TUNE_DEFS.map(t => {
      const v = tune(t.id);
      const changed = v !== t.def;
      return `
      <div class="tuning-row ${changed ? 'changed' : ''}" id="tune-row-${t.id}">
        <span class="tuning-name">${t.name}</span>
        <input type="range" min="${t.min}" max="${t.max}" step="${t.step}" value="${v}"
               oninput="UI.setTune('${t.id}', this.value)">
        <span class="tuning-val" id="tune-val-${t.id}">${changed ? `<span class="dim">${fmt(t.def)}</span>→` : ''}<span class="cur">${fmt(v)}</span></span>
      </div>`;
    }).join('') + '</div>';
  }
  function setTune(id, v) {
    if (!SAVE.tuning) SAVE.tuning = {};
    SAVE.tuning[id] = parseFloat(v);
    persistSave();
    const def = TUNE_DEFS.find(t => t.id === id);
    const fmt = n => Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
    const el = $('tune-val-' + id);
    const changed = def && parseFloat(v) !== def.def;
    if (el) el.innerHTML = changed ? `<span class="dim">${fmt(def.def)}</span>→<span class="cur">${fmt(v)}</span>` : `<span class="cur">${fmt(v)}</span>`;
    const row = $('tune-row-' + id);
    if (row) row.classList.toggle('changed', !!changed);
  }
  function resetTuning() {
    delete SAVE.tuning;
    persistSave();
    renderTuning();
    Sfx.buy();
  }

  // ---------- 英雄调参面板 ----------
  function showHeroTune() {
    $('herotune-overlay').style.display = 'flex';
    renderHeroTune();
  }
  function closeHeroTune() { $('herotune-overlay').style.display = 'none'; }
  function renderHeroTune() {
    const fmt = n => Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
    let html = '';
    for (const [hid, h] of Object.entries(HERO_TUNE)) {
      html += `<h4 class="section-label">${h.name}</h4><div class="tuning-grid">`;
      for (const [key, p] of Object.entries(h.params)) {
        const v = heroVal(hid, key);
        const changed = v !== p.def;
        html += `
        <div class="tuning-row ${changed ? 'changed' : ''}">
          <span class="tuning-name">${p.n}</span>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"
                 oninput="UI.setHeroTune('${hid}','${key}',this.value)">
          <span class="tuning-val" id="ht-val-${hid}-${key}">${changed ? `<span class="dim">${fmt(p.def)}</span>→` : ''}<span class="cur">${fmt(v)}</span></span>
        </div>`;
      }
      html += '</div>';
    }
    $('herotune-body').innerHTML = html;
  }
  function setHeroTune(hid, key, v) {
    if (!SAVE.heroTuning) SAVE.heroTuning = {};
    if (!SAVE.heroTuning[hid]) SAVE.heroTuning[hid] = {};
    SAVE.heroTuning[hid][key] = parseFloat(v);
    persistSave();
    const p = HERO_TUNE[hid].params[key];
    const fmt = n => Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
    const el = $(`ht-val-${hid}-${key}`);
    const changed = parseFloat(v) !== p.def;
    if (el) el.innerHTML = changed ? `<span class="dim">${fmt(p.def)}</span>→<span class="cur">${fmt(v)}</span>` : `<span class="cur">${fmt(v)}</span>`;
  }
  function resetHeroTune() {
    SAVE.heroTuning = {};
    persistSave();
    renderHeroTune();
    Sfx.buy();
  }

  // ---------- 英雄图鉴 ----------
  function heroAvatarUri(def) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    if (def.sprite && typeof MonsterImages !== 'undefined' && MonsterImages[def.sprite] && MonsterImages[def.sprite].naturalWidth) {
      x.imageSmoothingEnabled = false;
      x.drawImage(MonsterImages[def.sprite], 4, 4, 56, 56);
    } else {
      x.fillStyle = '#e8ddc8'; x.strokeStyle = '#100e1d'; x.lineWidth = 3;
      x.beginPath(); x.ellipse(32, 36, 19, 21, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#ff9f1c';
      x.beginPath(); x.ellipse(46, 36, 8, 6, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = def.color || '#888';
      x.beginPath(); x.ellipse(28, 16, 15, 8, -0.15, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    return c.toDataURL();
  }
  function showHeroDex() {
    $('herodex-overlay').style.display = 'flex';
    $('herodex-body').innerHTML = '<div class="mdex-grid">' + Object.values(MERCS).map(m => {
      const ups = HORDE_UPGRADES.filter(u => u.heroUp === m.id || (u.special === 'marinehp' && m.id === 'marine'));
      const stats = [m.dmg ? `⚔️伤害 ${m.dmg}` : '', m.rate ? `射速 ${m.rate}/s` : '', m.heal ? `💚治疗 ${m.heal}` : '',
        m.mag ? `🔋弹夹 ${m.mag}` : '', m.fetch ? `🐾拾取 ${m.fetch}` : '', `❤️${m.hp}`, `💰${m.price}`].filter(Boolean).join('　');
      return `
      <div class="mdex-card">
        <img src="${heroAvatarUri(m)}" style="width:56px;height:56px;border-radius:10px;image-rendering:pixelated;background:rgba(255,255,255,.05)">
        <div class="mdex-info">
          <div class="mdex-name">${m.icon} ${m.name}${m.requiresMerc ? `<span class="mdex-kills">需先雇 ${MERCS[m.requiresMerc].icon}</span>` : ''}</div>
          <div class="mdex-stats">${stats}</div>
          <div class="mdex-lore">${m.desc || ''}</div>
          ${ups.length ? `<div class="mdex-hint">📈 专属升级：${ups.map(u => `${u.icon}${u.name.split('·')[1] || u.name}`).join('、')}</div>` : ''}
        </div>
      </div>`;
    }).join('') + '</div>';
  }
  function closeHeroDex() { $('herodex-overlay').style.display = 'none'; }

  // ---------- 怪物图鉴（活体动画卡片） ----------
  let mdexRaf = null, mdexT = 0, mdexLast = 0, mdexCards = [];
  const MDEX_TAGS = t => {
    const tags = [];
    if (t.boss) tags.push(['BOSS', '#ff5c5c']);
    if (t.ranged) tags.push(['远程', '#7ef7ff']);
    if (t.caster) tags.push(['定身', '#b48aff']);
    if (t.poison) tags.push(['剧毒', '#7ac74f']);
    if (t.paralyze) tags.push(['麻痹', '#ffd93d']);
    if (t.charger && !t.leap) tags.push(['冲锋', '#ff8f5c']);
    if (t.leap) tags.push(['猛扑', '#ff8f5c']);
    if (t.ambush) tags.push(['伏击', '#9a86c8']);
    if (t.splits) tags.push(['分裂', '#7ac74f']);
    if (t.screamer) tags.push(['召集', '#ff8fd0']);
    if (t.shieldFront) tags.push(['格挡', '#c9ced8']);
    if (t.watcher) tags.push(['凝视', '#ffd93d']);
    if (t.shroom) tags.push(['自爆', '#7ac74f']);
    if (t.zigzag) tags.push(['蛇行', '#9fd8ff']);
    if (t.kbMul === 0 && !t.boss) tags.push(['免击退', '#c9a06a']);
    return tags;
  };
  function showMonsterDex() {
    $('monsterdex-overlay').style.display = 'flex';
    renderMonsterDex();
    if (!mdexRaf) mdexTick(mdexLast);
  }
  function closeMonsterDex() {
    $('monsterdex-overlay').style.display = 'none';
    if (mdexRaf) { cancelAnimationFrame(mdexRaf); mdexRaf = null; }
    mdexCards = [];
  }
  const mdexPips = (v, max) => { const n = Math.max(1, Math.min(5, Math.round(v / max * 5)));
    return '<span class="mdex-pips">' + '●'.repeat(n) + '<span class="dim">' + '●'.repeat(5 - n) + '</span></span>'; };
  function renderMonsterDex() {
    const ids = Object.keys(MONSTER_TYPES);
    const seen = id => !!((SAVE.monsterSeen && SAVE.monsterSeen[id]) || (SAVE.stats.mKills && SAVE.stats.mKills[id] > 0));
    $('mdex-progress').textContent = `已解锁 ${ids.filter(seen).length}/${ids.length}`;
    let html = '<div class="mdex-grid">';
    for (const id of ids) {
      const t = MONSTER_TYPES[id];
      const ok = seen(id);
      const info = CODEX_INFO[id] || {};
      const kills = (SAVE.stats.mKills && SAVE.stats.mKills[id]) || 0;
      const tags = ok ? MDEX_TAGS(t).map(([txt, c]) => `<span class="mdex-tag" style="color:${c};border-color:${c}55">${txt}</span>`).join('') : '';
      html += `
      <div class="mdex-card ${t.boss ? 'boss' : ''} ${ok ? '' : 'locked'}">
        <canvas id="mdex-cv-${id}" width="94" height="94"></canvas>
        <div class="mdex-info">
          <div class="mdex-name">${ok ? t.name : '？？？'}${ok && kills ? ` <span class="mdex-kills">已讨伐 ×${kills}</span>` : ''}</div>
          ${ok ? `<div class="mdex-tags">${tags}</div>
          <div class="mdex-stats">血 ${mdexPips(t.hpMul, t.boss ? 1 : 2.8)}　攻 ${mdexPips(t.dmgMul, 2.2)}　速 ${mdexPips(t.spdMul, 1.7)}</div>
          <div class="mdex-lore">${info.lore || ''}</div>
          <div class="mdex-hint">💡 ${info.hint || ''}</div>`
          : '<div class="mdex-lore dim">尚未遭遇。击败它（或吃它一记攻击）即可解锁档案。</div>'}
        </div>
      </div>`;
    }
    $('mdex-body').innerHTML = html + '</div>';
    // 活体卡片：mock 一个最小 Game 环境，直接复用游戏内 drawMonster 逐帧绘制
    mdexCards = ids.map((id, i) => {
      const cv = $('mdex-cv-' + id);
      if (!cv) return null;
      const t = MONSTER_TYPES[id];
      const mg = Object.create(Game.prototype);
      mg.time = 0; mg.sparks = []; mg.spark = () => {}; mg.fx = []; mg.fxP = () => {};
      return { id, t, ok: seen(id), ctx: cv.getContext('2d'), phase: i * 1.7, mg,
        m: { type: t, r: t.r, x: 0, y: 0, anim: 0, zigPhase: i, faceDir: 0.5, state: 'patrol',
             windupT: 0, stunT: 0, slowT: 0, burnT: 0, hpShowT: 0, flashT: 0, hp: 1, maxHp: 1, enraged: false, kvx: 0, kvy: 0 } };
    }).filter(Boolean);
  }
  function mdexTick(ts) {
    mdexRaf = requestAnimationFrame(mdexTick);
    if (ts - mdexLast < 33) return;   // ~30fps 足够
    const dt = Math.min(0.1, (ts - mdexLast) / 1000) || 0.033;
    mdexLast = ts;
    mdexT += dt;
    for (const c of mdexCards) {
      const { ctx } = c;
      ctx.clearRect(0, 0, 94, 94);
      c.mg.time = mdexT + c.phase;
      c.m.anim = mdexT + c.phase;
      try { c.mg.drawMonster(ctx, c.m, 47, c.t.boss ? 50 : 54); } catch (e) { /* 单卡失败不拖垮整页 */ }
      if (!c.ok) {   // 未解锁：涂黑成剪影
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(8,6,18,.94)';
        ctx.fillRect(0, 0, 94, 94);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // ---------- 键位设置 ----------
  let bindWait = null;   // { p, action }
  function showKeybinds() {
    $('keybind-overlay').style.display = 'flex';
    renderKeybinds();
    document.addEventListener('keydown', captureBind, true);
    Trainer.start();   // 双人练习场：实时试用当前键位
  }
  function closeKeybinds() {
    $('keybind-overlay').style.display = 'none';
    bindWait = null;
    document.removeEventListener('keydown', captureBind, true);
    Trainer.stop();
  }
  function renderKeybinds() {
    let html = '<table class="keybind-table"><tr><th>动作</th><th style="color:#ffd93d">1P 🟡</th><th style="color:#9fd8ff">2P 🔵</th></tr>';
    for (const [action, label] of KEY_ACTIONS) {
      html += `<tr><td>${label}</td>`;
      for (let pi = 0; pi < 2; pi++) {
        const waiting = bindWait && bindWait.p === pi && bindWait.action === action;
        html += `<td><button class="btn small keybtn ${waiting ? 'waiting' : ''}" onclick="UI.startBind(${pi}, '${action}')">${waiting ? '按任意键…' : keyLabel(KEYMAP[pi][action])}</button></td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    $('keybind-body').innerHTML = html;
  }
  function startBind(p, action) { bindWait = { p, action }; renderKeybinds(); }
  function captureBind(e) {
    if (!bindWait) return;
    e.preventDefault(); e.stopPropagation();
    const bcode = normalizeCode(e);
    if (bcode === 'Escape') { bindWait = null; renderKeybinds(); return; }
    const { p, action } = bindWait;
    if (!SAVE.settings.keys) SAVE.settings.keys = {};
    if (!SAVE.settings.keys[p]) SAVE.settings.keys[p] = {};
    // 同玩家冲突：与占用该键的动作互换
    const cur = Object.assign({}, DEFAULT_KEYS[p], SAVE.settings.keys[p]);
    for (const [a] of KEY_ACTIONS) {
      if (a !== action && cur[a] === bcode) SAVE.settings.keys[p][a] = cur[action];
    }
    SAVE.settings.keys[p][action] = bcode;
    persistSave();
    buildKeymaps();
    bindWait = null;
    Sfx.tick();
    renderKeybinds();
  }
  function resetKeybinds() {
    delete SAVE.settings.keys;
    persistSave();
    buildKeymaps();
    renderKeybinds();
    Sfx.buy();
  }

  // 帮助表动态生成（跟随自定义键位）
  function showHelp() {
    const tb = $('help-keys');
    if (tb) {
      let rows = '';
      for (const [action, label] of KEY_ACTIONS.filter(([a]) => !['up','down','left','right'].includes(a))) {
        rows += `<tr><td>${label}</td><td>${keyLabel(KEYMAP[0][action])}</td><td>${keyLabel(KEYMAP[1][action])}</td></tr>`;
      }
      tb.innerHTML = `<tr><th></th><th style="color:#ffd93d">1P 🟡</th><th style="color:#9fd8ff">2P 🔵</th></tr>
        <tr><td>移动</td><td>W A S D</td><td>方向键</td></tr>` + rows +
        `<tr><td>暂停</td><td colspan="2">Esc</td></tr>`;
    }
    $('help-overlay').style.display = 'flex';
  }

  function merchantSell(i) {
    const g = Game.current;
    if (!g || !g.trader) return;
    const p = g.trader;
    const t = p.bag[i];
    if (!t) return;
    p.bag.splice(i, 1);
    p.bagUsed -= t.size;
    const price = Math.floor(t.value * MERCHANT_SELL_RATE);
    SAVE.gold += price;
    g.runCash += price;
    persistSave(); Sfx.coin();
    g.toast(`卖出 ${t.icon}${t.name}（+${price}💰）— 卖掉的宝物不计入图鉴收录`, '#ffd93d');
    renderMerchant(g, p);
  }

  // ---------- 宝物图鉴 ----------
  function showCodex() {
    showScreen('screen-codex');
    renderCodex();
  }

  function renderCodex() {
    const done = collectedCount();
    const pct = Math.round(done / TREASURES.length * 100);
    $('codex-summary').innerHTML = `
      <div class="codex-progress-ring" style="--pct:${pct}"><span>${pct}%</span></div>
      <div>
        <div class="codex-total">已收录 <b>${done}</b> / ${TREASURES.length}</div>
        <div class="codex-title-line">🏅 ${collectorTitle()} · 收藏点数 ${SAVE.collectorPoints}</div>
      </div>`;

    let html = '';
    for (const sid in SERIES) {
      const s = SERIES[sid];
      const p = seriesProgress(sid);
      const claimed = SAVE.claimedSeriesRewards.includes(sid);
      html += `<div class="codex-series">
        <div class="codex-series-head">
          <span>${s.icon} ${s.name}</span>
          <span class="series-progress">${p.done}/${p.total} ${claimed ? '· ✅ ' + s.reward : p.done === p.total ? '' : '· 集齐奖励：' + s.reward}</span>
        </div>
        <div class="codex-grid">`;
      for (const t of TREASURES.filter(t => t.series === sid)) {
        const e = codexEntry(t.id);
        const r = RARITIES[t.rarity];
        if (e.state === 'collected') {
          html += `<div class="codex-cell collected" style="border-color:${r.color};box-shadow:0 0 10px ${r.glow}" onclick="UI.showDetail('${t.id}')">
            ${e.isNew ? '<span class="new-badge">NEW</span>' : ''}
            <span class="cell-icon">${t.icon}</span><span class="cell-name">${t.name}</span>
            <span class="cell-rarity" style="color:${r.color}">${r.name}</span></div>`;
        } else if (e.state === 'seen') {
          html += `<div class="codex-cell seen" onclick="UI.showDetail('${t.id}')">
            <span class="cell-icon dim">${t.icon}</span><span class="cell-name">${t.name}</span>
            <span class="cell-rarity">曾经拥有…</span></div>`;
        } else {
          html += `<div class="codex-cell unknown" onclick="UI.showDetail('${t.id}')">
            <span class="cell-icon silhouette">${t.icon}</span><span class="cell-name">？？？</span>
            <span class="cell-rarity" style="color:${r.color}">${r.name}</span></div>`;
        }
      }
      html += '</div></div>';
    }
    $('codex-body').innerHTML = html;
  }

  function showDetail(id) {
    const t = TREASURE_BY_ID[id];
    const e = codexEntry(id);
    const r = RARITIES[t.rarity];
    if (e.isNew) { e.isNew = false; persistSave(); }
    const src = [];
    for (const [tier, cfg] of Object.entries(CHEST_TIERS)) if (cfg.drops[t.rarity]) src.push(cfg.name);
    let body;
    if (e.state === 'unknown') {
      body = `<div class="detail-icon silhouette">${t.icon}</div>
        <h3>？？？</h3>
        <div class="detail-rarity" style="color:${r.color}">${r.name} · ${SERIES[t.series].name}</div>
        <p class="detail-flavor">尚未收录。把它带到撤离点，才能揭开它的故事。</p>
        <div class="detail-hint">📦 可能出自：${src.join(' / ')}${t.minDifficulty ? ' · 仅【' + DIFFICULTIES[t.minDifficulty].name + '】难度' : ''}${t.unlockAll ? ' · 需先收录其余 35 件宝物' : ''}</div>`;
    } else {
      const seenOnly = e.state === 'seen';
      body = `<div class="detail-icon ${seenOnly ? 'dim' : ''}">${t.icon}</div>
        <h3>${t.name}</h3>
        <div class="detail-rarity" style="color:${r.color}">${r.name} · ${SERIES[t.series].name} · 💰${t.value} · 占 ${t.size} 格</div>
        ${seenOnly ? '<p class="detail-flavor">你曾经把它握在手里……却没能带出来。下次一定。</p>'
                   : `<p class="detail-flavor">“${t.flavor}”</p>`}
        ${t.effect ? `<div class="detail-effect">✨ ${t.effect.desc}</div>` : ''}
        <div class="detail-hint">📦 出自：${src.join(' / ')}${t.minDifficulty ? ' · 仅【' + DIFFICULTIES[t.minDifficulty].name + '】难度' : ''}</div>
        ${seenOnly ? '' : `<div class="detail-stats">首次收录 ${new Date(e.firstCollectedAt).toLocaleDateString()} · 累计带出 ${e.totalExtracted} 次 · 累计产出 💰${e.totalGoldEarned}</div>`}`;
    }
    $('codex-modal-body').innerHTML = body;
    $('codex-modal').style.display = 'flex';
  }
  function closeDetail() { $('codex-modal').style.display = 'none'; renderCodex(); }

  // ---------- 结算 ----------
  function showResult(res) {
    showScreen('screen-result');
    if (res.horde) {
      $('result-title').textContent = res.escape
        ? (res.victory ? '🌅 夜尽天明！你逃出来了！' : '☠️ 倒在了黎明之前……')
        : (res.victory ? `🌾 割草大捷！撑过了 ${res.duration || 15} 分钟！` : '💀 被怪潮吞没……');
      $('result-title').className = res.victory ? 'ok' : 'fail';
      const mm = Math.floor(res.time / 60), ss = Math.floor(res.time % 60);
      $('result-stats').innerHTML =
        `【${res.mapName}】${res.escape ? `大逃亡 · 里程 <b class="gold-text">${res.progress}%</b>` : '无双割草'} · ${res.escape ? '用时' : '存活'} ${mm}:${String(ss).padStart(2, '0')} · 等级 Lv.${res.level} · 击杀 <b class="gold-text">${res.kills}</b>` +
        ` · 战利现金 <b class="gold-text">💰${res.cash}</b>${res.bonus ? ` · 通关奖金 <b class="gold-text">💰${res.bonus}</b>` : ''}`;
      let hordeHtml = res.escape
        ? `<div class="result-player"><div class="result-player-head" style="color:#ffd93d">📈 历史最佳：里程 ${res.best.prog}% · ${res.best.kills} 杀 · Lv.${res.best.level}</div>`
        : `<div class="result-player"><div class="result-player-head" style="color:#ffd93d">📈 历史最佳：存活 ${Math.floor(res.best.time/60)}:${String(res.best.time%60).padStart(2,'0')} · ${res.best.kills} 杀 · Lv.${res.best.level}</div>`;
      if (res.mode === 2) {
        hordeHtml += res.players.map(pr => `<div style="color:${pr.idx === 0 ? '#ffd93d' : '#9fd8ff'}">${pr.idx + 1}P 击杀 ${pr.kills}</div>`).join('');
      }
      hordeHtml += '</div>';
      // 🎁 战利抽取：三箱选一（胜利=金箱，可能开出神话红宝）
      if (res.lootDraw && res.lootDraw.length) {
        lootDrawState = { list: res.lootDraw, picked: false };
        hordeHtml += `<h4 class="section-label">🎁 战利抽取 · 三箱选一${res.lootTier === 'gold' ? '（金箱：有机会开出神话红宝！）' : '（木箱）'}</h4>
        <div class="loot-draw">` +
          res.lootDraw.map((t, i) => `
          <div class="loot-chest" id="loot-chest-${i}" onclick="UI.pickLootCard(${i})">
            <div class="loot-lid">${res.lootTier === 'gold' ? '🎁' : '📦'}</div>
            <div class="loot-hint">点我开箱</div>
          </div>`).join('') + '</div>';
      }
      if (res.newTrophies && res.newTrophies.length) {
        hordeHtml += `<div class="result-rewards">${res.newTrophies.map(t => `<div>🏆 新奖杯：${t.icon} ${t.name}</div>`).join('')}</div>`;
      }
      $('result-body').innerHTML = hordeHtml;
      return;
    }
    $('result-title').textContent = res.success ? '🎉 撤离成功！' : '💀 全员折损……';
    $('result-title').className = res.success ? 'ok' : 'fail';
    const mm = Math.floor(res.time / 60), ss = Math.floor(res.time % 60);
    $('result-stats').innerHTML =
      `【${res.mapName || ''}】难度【${res.diffName}】 · 用时 ${mm}:${String(ss).padStart(2, '0')} · 开箱 ${res.chests} · 击杀 ${res.kills}` +
      ` · 宝物 <b class="gold-text">💰${res.goldGained}</b>${res.cash ? ` · 战利现金 <b class="gold-text">💰${res.cash}</b>` : ''}`;

    let html = '';
    for (const pr of res.players) {
      const pname = res.mode === 2 ? `${pr.idx + 1}P` : '你';
      const color = pr.idx === 0 ? '#ffd93d' : '#9fd8ff';
      html += `<div class="result-player"><div class="result-player-head" style="color:${color}">
        ${pname} — ${pr.status === 'extracted' ? '✅ 成功撤离' : pr.status === 'abandoned' ? '🏳️ 放弃行动' : '💀 阵亡'}
        ${pr.gearLost && pr.gearLost.length ? `<span class="lost-tag">丢失装备：${pr.gearLost.join('、')}</span>` : ''}</div>`;
      if (pr.items.length) {
        html += '<div class="result-items">' + pr.items.map(({ t, isNew }) => `
          <div class="result-item" style="border-color:${RARITIES[t.rarity].color}">
            ${isNew ? '<span class="new-badge">新收录!</span>' : ''}
            <span class="cell-icon">${t.icon}</span><span class="cell-name">${t.name}</span>
            <span class="cell-rarity" style="color:${RARITIES[t.rarity].color}">💰${t.value}</span>
          </div>`).join('') + '</div>';
      } else if (pr.status === 'extracted') {
        html += '<div class="empty-tip">两手空空地回来了</div>';
      }
      if (pr.lostItems.length) {
        html += `<div class="result-lost">散落的宝物（已记为"目击"）：${pr.lostItems.map(t => t.icon + t.name).join('、')}</div>`;
      }
      html += '</div>';
    }
    if (res.rewards.length) {
      html += `<div class="result-rewards">${res.rewards.map(r => `<div>🎁 ${r}</div>`).join('')}</div>`;
    }
    if (res.newTrophies && res.newTrophies.length) {
      html += `<div class="result-rewards">${res.newTrophies.map(t => `<div>🏆 新奖杯：${t.icon}「${t.name}」— ${t.desc}</div>`).join('')}</div>`;
      Sfx.extract();
    }
    $('result-body').innerHTML = html;
  }

  function retry() { showSetup(); }

  function buyWeaponGuard(id) {
    const w = WEAPONS[id];
    if (w.requires && !SAVE.claimedSeriesRewards.includes(w.requires)) { Sfx.error(); return false; }
    return true;
  }

  return { showScreen, showMenu, showSetup, showShop, showCodex, showResult, showDetail, closeDetail,
           setMode, setDiff, setMap, setGear, setPouch, setSkin, setAcc, setMerc, setMerc2, setGameplay, startRun, retry, toggleMusic,
           renderLevelup, chooseLevelup, showKeybinds, closeKeybinds, startBind, resetKeybinds, showHelp,
           showTuning, closeTuning, setTune, resetTuning,
           showMonsterDex, closeMonsterDex, showDexHub, hideDexHub, showSettingsHub, hideSettingsHub, toggleDevMode, toggleMouseAim, startArena,
           showHeroTune, closeHeroTune, setHeroTune, resetHeroTune, showHeroDex, closeHeroDex,
           showTrophies, buyWeaponGuard,
           buyWeapon, buyAmmo, buyConsumable, buyArmor, buyPouch, repairWeapon, repairArmor,
           renderMerchant, merchantBuy, merchantSell, merchantRevive, pickLootCard };
})();
