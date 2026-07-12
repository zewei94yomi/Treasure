// ============ UI：主菜单 / 出发准备 / 商店 / 宝物图鉴 / 结算 ============
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  let setupState = {
    mode: 1, diff: 'normal', map: 'manor',
    loadouts: [{ w1: null, w2: null, armor: null, pouch: false }, { w1: null, w2: null, armor: null, pouch: false }],
    skins: ['duck_yellow', 'duck_blue'],
  };
  let setupInited = false;

  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    $(id).classList.add('active');
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
    $('btn-music').textContent = Music.enabled() ? '🎵 音乐：开' : '🔇 音乐：关';
  }

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
      const mercOpts = ['<option value="">不雇佣</option>'].concat(Object.values(MERCS).map(mc => {
        const trials = SAVE.mercTrials[mc.id] || 0;
        const label = trials > 0 ? `免费试用×${trials}` : `💰${mc.price}/局`;
        const afford = trials > 0 || SAVE.gold >= mc.price;
        return `<option value="${mc.id}" ${!afford ? 'disabled' : ''} ${lo.merc === mc.id ? 'selected' : ''}>${mc.icon} ${mc.name}（${label}）</option>`;
      })).join('');
      const pouchOk = lo.pouch || pouchesLeft > 0;
      html += `
        <div class="loadout-player">
          <div class="loadout-row">
            <span class="loadout-label" style="color:${i === 0 ? '#ffd93d' : '#9fd8ff'}">${i + 1}P</span>
            <select onchange="UI.setGear(${i},'w1',this.value)" title="主武器">${wOpts('w1')}</select>
            <select onchange="UI.setGear(${i},'w2',this.value)" title="副武器">${wOpts('w2')}</select>
          </div>
          <div class="loadout-row sub">
            <span class="loadout-label"></span>
            <select onchange="UI.setGear(${i},'armor',this.value)" title="护甲">${aOpts}</select>
            <label class="pouch-check ${pouchOk ? '' : 'disabled'}">
              <input type="checkbox" ${lo.pouch ? 'checked' : ''} ${pouchOk ? '' : 'disabled'} onchange="UI.setPouch(${i}, this.checked)">
              👝腰包${SAVE.pouches ? `(持有${SAVE.pouches})` : '(未持有)'}
            </label>
            <select onchange="UI.setMerc(${i}, this.value)" title="雇佣兵">${mercOpts}</select>
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
  function setMerc(i, v) { setupState.loadouts[i].merc = v || null; renderSetup(); }

  function startRun() {
    const mapId = setupState.map === 'random' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : setupState.map;
    // 结算雇佣兵费用（优先消耗免费试用）
    for (let i = 0; i < setupState.mode; i++) {
      const mid = setupState.loadouts[i].merc;
      if (!mid) continue;
      if (SAVE.mercTrials[mid] > 0) SAVE.mercTrials[mid]--;
      else if (SAVE.gold >= MERCS[mid].price) SAVE.gold -= MERCS[mid].price;
      else setupState.loadouts[i].merc = null;   // 付不起就不带
    }
    SAVE.settings.lastMode = setupState.mode;
    SAVE.settings.lastDiff = setupState.diff;
    SAVE.settings.lastMap = setupState.map;
    SAVE.settings.skins = setupState.skins.slice();
    persistSave();
    showScreen('screen-game');
    new Game(setupState.mode, setupState.diff, setupState.loadouts.slice(0, setupState.mode), mapId, setupState.skins);
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
          <button class="btn small ${SAVE.gold < item.price ? 'disabled' : ''}" onclick="UI.merchantBuy(${i})">买 💰${item.price}</button>
        </div>`;
    });
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
    persistSave(); Sfx.trade();
    renderMerchant(g, g.trader);
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
           setMode, setDiff, setMap, setGear, setPouch, setSkin, setAcc, setMerc, startRun, retry, toggleMusic,
           showTrophies, buyWeaponGuard,
           buyWeapon, buyAmmo, buyConsumable, buyArmor, buyPouch, repairWeapon, repairArmor,
           renderMerchant, merchantBuy, merchantSell };
})();
