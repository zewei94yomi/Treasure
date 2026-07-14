// ============ 存档：localStorage 持久化（图鉴 / 金币 / 军械库 / 弹药 / 统计） ============
'use strict';

const SAVE_KEY = 'treasure-hunt.save.v1';
let SAVE = null;

function defaultSave() {
  return {
    version: 1,
    gold: 150,
    codex: {},                 // id -> { state:'seen'|'collected', isNew, firstCollectedAt, totalExtracted, totalGoldEarned }
    collectorPoints: 0,
    claimedSeriesRewards: [],
    pity: 0,                   // 连续未出史诗+的开箱数
    nextUid: 3,
    weapons: [                 // 军械库：武器实例（带各自耐久度）
      { uid: 1, id: 'pan', dur: 80 },
      { uid: 2, id: 'pan', dur: 80 },
    ],
    ammo: { light: 30, shell: 0, heavy: 0, cell: 0 },
    consumables: { bandage: 1, soda: 1, adrenaline: 0, stealth: 0, rage: 0, eagle: 0 },
    armors: [],                // 护甲实例 { uid, id, dur }（dur = 剩余甲片池）
    pouches: 0,                // 腰包数量
    mercTrials: { guard: 2, vet: 2, ace: 2, sniper: 1, priest: 1, dog: 1, archer: 1, mage: 1, mech: 1 },   // 雇佣兵免费试玩次数
    trophies: {},              // 奖杯 id -> 解锁时间戳
    settings: { music: true, mouseAim: true, skins: ['duck_yellow', 'duck_blue'], lastMap: 'manor', lastDiff: 'normal', lastMode: 1 },
    hordeBest: null,           // 无双割草最佳战绩 { time, kills, level }
    stats: { runs: 0, extractions: 0, goldEarned: 0, kills: 0, chestsOpened: 0, deaths: 0, mKills: {} },
    monsterSeen: {},           // 怪物图鉴解锁（击败过或被它击中过）
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1) {
        const d = defaultSave();
        // 先留住默认嵌套对象的引用，再整体覆盖，最后往默认对象里合并（老存档升级补新字段）
        const dAmmo = d.ammo, dSettings = d.settings, dStats = d.stats, dConsum = d.consumables;
        SAVE = Object.assign(d, s);
        SAVE.ammo = Object.assign(dAmmo, s.ammo || {});
        SAVE.consumables = Object.assign(dConsum, s.consumables || {});
        SAVE.settings = Object.assign(dSettings, s.settings || {});
        SAVE.stats = Object.assign(dStats, s.stats || {});
        if (!Array.isArray(SAVE.armors)) SAVE.armors = [];
        if (typeof SAVE.pouches !== 'number') SAVE.pouches = 0;
        SAVE.mercTrials = Object.assign({ guard: 2, vet: 2, ace: 2, sniper: 1, priest: 1, dog: 1, archer: 1, mage: 1, mech: 1 }, s.mercTrials || {});
        if (!SAVE.trophies || typeof SAVE.trophies !== 'object') SAVE.trophies = {};
        if (!SAVE.monsterSeen || typeof SAVE.monsterSeen !== 'object') SAVE.monsterSeen = {};
        if (!SAVE.stats.mKills || typeof SAVE.stats.mKills !== 'object') SAVE.stats.mKills = {};
        return SAVE;
      }
    }
  } catch (e) { console.warn('读取存档失败，使用新存档', e); }
  SAVE = defaultSave();
  return SAVE;
}

let saveBroken = false;
function persistSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE));
    // 写后读回校验，第一时间发现"存档存不住"的环境
    if (!saveBroken && localStorage.getItem(SAVE_KEY) === null) throw new Error('read-back null');
  } catch (e) {
    console.warn('写入存档失败（浏览器可能禁用了 localStorage）', e);
    if (!saveBroken) {
      saveBroken = true;
      const el = document.getElementById('save-warning');
      if (el) el.style.display = 'block';
    }
  }
}

function codexEntry(id) {
  return SAVE.codex[id] || { state: 'unknown', totalExtracted: 0, totalGoldEarned: 0 };
}

// 拾取过（进过背包）：未收录则标记"已目击"
function codexMarkSeen(id) {
  const e = SAVE.codex[id];
  if (!e) SAVE.codex[id] = { state: 'seen', totalExtracted: 0, totalGoldEarned: 0 };
}

// 成功带出撤离点：收录。返回是否首次收录
function codexMarkCollected(id, value) {
  let e = SAVE.codex[id];
  if (!e) e = SAVE.codex[id] = { state: 'seen', totalExtracted: 0, totalGoldEarned: 0 };
  const first = e.state !== 'collected';
  if (first) {
    e.state = 'collected';
    e.isNew = true;
    e.firstCollectedAt = new Date().toISOString();
    SAVE.collectorPoints += RARITIES[TREASURE_BY_ID[id].rarity].points;
  }
  e.totalExtracted++;
  e.totalGoldEarned += value;
  return first;
}

function collectedCount() {
  return TREASURES.filter(t => codexEntry(t.id).state === 'collected').length;
}

function seriesProgress(seriesId) {
  const items = TREASURES.filter(t => t.series === seriesId);
  const done = items.filter(t => codexEntry(t.id).state === 'collected').length;
  return { done, total: items.length };
}

function collectorTitle() {
  let cur = COLLECTOR_LEVELS[0];
  for (const lv of COLLECTOR_LEVELS) if (SAVE.collectorPoints >= lv.need) cur = lv;
  return cur.title;
}

// 检查并授予系列集齐奖励（皮肤/装饰/武器图纸），返回新解锁的奖励文案列表
function checkSeriesRewards() {
  const unlocked = [];
  for (const sid in SERIES) {
    const p = seriesProgress(sid);
    if (p.done === p.total && !SAVE.claimedSeriesRewards.includes(sid)) {
      SAVE.claimedSeriesRewards.push(sid);
      const u = SERIES[sid].unlock;
      if (u && u.type === 'weapon') addWeapon(u.id);   // 图纸解锁 + 免费送一把
      unlocked.push(`${SERIES[sid].name} 集齐！获得 ${SERIES[sid].reward}`);
    }
  }
  return unlocked;
}

// 授予奖杯：返回新解锁的奖杯定义（已有则 null）
function awardTrophy(id) {
  if (SAVE.trophies[id]) return null;
  SAVE.trophies[id] = Date.now();
  return TROPHY_BY_ID[id] || null;
}

// —— 军械库辅助（每次增删都立即落盘）——
function addWeapon(id) {
  const w = { uid: SAVE.nextUid++, id, dur: WEAPONS[id].dur };
  SAVE.weapons.push(w);
  persistSave();
  return w;
}
function removeWeapon(uid) {
  SAVE.weapons = SAVE.weapons.filter(w => w.uid !== uid);
}
function weaponLabel(inst) {
  const def = WEAPONS[inst.id];
  return `${def.icon} ${def.name}（耐久 ${Math.max(0, Math.ceil(inst.dur))}/${def.dur}）`;
}
function addArmor(id) {
  const a = { uid: SAVE.nextUid++, id, dur: ARMORS[id].pool };
  SAVE.armors.push(a);
  persistSave();
  return a;
}
function removeArmor(uid) {
  SAVE.armors = SAVE.armors.filter(a => a.uid !== uid);
}
function armorLabel(inst) {
  const def = ARMORS[inst.id];
  return `${def.icon} ${def.name}（甲片 ${Math.max(0, Math.ceil(inst.dur))}/${def.pool}）`;
}
