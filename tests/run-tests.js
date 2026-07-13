// ============ 惊魂寻宝鸭 · 固定回归测试 ============
// 运行：node tests/run-tests.js（零依赖，纯 Node）
// 覆盖：地图连通性 / 数据完整性 / 掉落规则 / 存档迁移 / 割草模式 / 翻滚·弹夹·天气·道具
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const base = path.join(__dirname, '..', 'js') + path.sep;

const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : () => {}) });
const sandbox = {
  window: { addEventListener() {} },
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx }), getElementById: () => null },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
  Image: class { constructor() { this.src = ''; } },
  console, Math, Date, JSON, Object, Array, Map, Set, Proxy, isFinite, Infinity, performance: { now: () => 0 },
};
vm.createContext(sandbox);
for (const f of ['data.js', 'save.js', 'map.js']) {
  vm.runInContext(fs.readFileSync(base + f, 'utf8'), sandbox, { filename: f });
}
const run = code => vm.runInContext(code, sandbox);

let fails = 0;
const check = (name, cond) => { console.log((cond ? '✅' : '❌') + ' ' + name); if (!cond) fails++; };

run('loadSave()');

// —— 六张地图 ——
check('地图共 6 张', run('MAP_ORDER.length') === 6);
for (const mapId of ['manor', 'mine', 'wreck', 'cathedral', 'swamp', 'icecave']) {
  const r = JSON.parse(run(`
    (() => {
      loadMap('${mapId}');
      const out = { name: MapData.def.name, spawns: !!(MapData.spawns[0] && MapData.spawns[1]),
                    exit: MapData.exitTiles.length > 0, gold: MapData.goldSpots.length >= 4,
                    merchant: !!MapData.merchantSpot && !isSolidAt(MapData.merchantSpot.x, MapData.merchantSpot.y),
                    path: bfsPath(MapData.spawns[0].x, MapData.spawns[0].y,
                                  MapData.exitRect.x + MapData.exitRect.w/2, MapData.exitRect.y + MapData.exitRect.h/2).length > 0,
                    reachable: MapData.goldSpots.concat(MapData.chestSpots).every(s =>
                      bfsPath(MapData.spawns[0].x, MapData.spawns[0].y, s.x, s.y).length > 0) };
      for (const d of ['easy','normal','hard','hell']) {
        const cfg = DIFFICULTIES[d];
        const cs = placeChests(cfg);
        out['chests_' + d] = cs.length > 0 && !cs.some(c => isSolidAt(c.x, c.y));
      }
      return JSON.stringify(out);
    })()`));
  check(`地图[${r.name}] 出生/撤离/金点/商人点/全点可达`, r.spawns && r.exit && r.gold && r.merchant && r.path && r.reachable);
  check(`地图[${r.name}] 四难度宝箱放置合法`, r.chests_easy && r.chests_normal && r.chests_hard && r.chests_hell);
}

// —— 数据完整性 ——
check('宝物 72 件且字段完整', run(`TREASURES.length === 72 && TREASURES.every(t => t.name && t.icon && t.flavor && SERIES[t.series] && RARITIES[t.rarity])`));
check('每张地图都有专属系列', run(`['manor','mine','wreck','cathedral','swamp','icecave'].every(m => TREASURES.some(t => t.mapId === m))`));
check('武器 16 种字段完整（重量/射程/击退）', run(`
  Object.keys(WEAPONS).length === 16 && Object.values(WEAPONS).every(w =>
    w.weight !== undefined && w.knock > 0 && (w.melee ? w.range > 0 : (w.range > 0 && AMMO_TYPES[w.ammo])))`));
check('药品 6 种 & 顺序表一致', run(`CONSUM_ORDER.length === 6 && CONSUM_ORDER.every(k => CONSUMABLES[k])`));
check('护甲 3 种 + 腰包', run(`Object.keys(ARMORS).length === 3 && GEAR.pouch.extraSlots === 3`));
check('怪物 12 种', run('Object.keys(MONSTER_TYPES).length') === 12);
check('难度 4 档且 spawn 合法', run(`
  Object.keys(DIFFICULTIES).length === 4 &&
  Object.values(DIFFICULTIES).every(d => Object.keys(d.spawn).every(t => MONSTER_TYPES[t]))`));
check('地狱难度怪物总数 ≥ 20', run(`Object.values(DIFFICULTIES.hell.spawn).reduce((a,b)=>a+b,0)`) >= 20);

// —— 负重曲线 ——
check('负重曲线：轻装快/超载慢', run(`weightSpeedMul(0.2) > 1 && weightSpeedMul(0.6) < 1 && weightSpeedMul(1.1) === 0.75`));
check('负重噪音：越重越吵', run(`weightNoiseMul(1) > weightNoiseMul(0.2)`));

// —— 地图专属掉落 ——
const excl = run(`
  (() => {
    loadMap('mine');
    for (let i = 0; i < 1500; i++) {
      const t = rollTreasure(['wood','silver','gold'][i%3], { difficulty:'hell', mapId:'mine', mythicSpawned:{v:false}, save:SAVE });
      if (t.mapId && t.mapId !== 'mine') return 'ERR:' + t.id + ' 掉在了矿洞';
    }
    return 'OK';
  })()`);
check('地图专属宝物不会掉错图 (' + excl + ')', excl === 'OK');
check('矿洞里能掉到矿洞专属', run(`
  (() => {
    for (let i = 0; i < 800; i++) {
      const t = rollTreasure('silver', { difficulty:'normal', mapId:'mine', mythicSpawned:{v:false}, save:SAVE });
      if (t.mapId === 'mine') return true;
    }
    return false;
  })()`));
check('地狱独占(堕天使之羽)不在困难掉落', run(`
  !eligibleTreasures('legendary', { difficulty:'hard', mapId:'cathedral', save:SAVE }).some(t => t.id === 'fallen_feather') &&
  eligibleTreasures('legendary', { difficulty:'hell', mapId:'cathedral', save:SAVE }).some(t => t.id === 'fallen_feather')`));

// —— 商人 ——
check('商人货表 4 件且价格为正', run(`
  (() => { const s = merchantStock(); return s.length >= 4 && s.every(i => i.price > 0 && i.label); })()`));

// —— 存档升级（v2 老存档 → 新字段）——
check('老存档升级：armors/pouches/新药品补齐', run(`
  (() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version:1, gold:999, weapons:[{uid:1,id:'pan',dur:50}], consumables:{bandage:2,soda:0} }));
    loadSave();
    return SAVE.gold === 999 && SAVE.weapons.length === 1 && Array.isArray(SAVE.armors) && SAVE.pouches === 0 &&
           SAVE.consumables.bandage === 2 && SAVE.consumables.stealth === 0;
  })()`));
check('军械库持久化：addWeapon/addArmor 立即落盘', run(`
  (() => {
    addWeapon('rifle'); addArmor('iron');
    const disk = JSON.parse(localStorage.getItem(SAVE_KEY));
    return disk.weapons.some(w => w.id === 'rifle') && disk.armors.some(a => a.id === 'iron');
  })()`));


// —— 第四轮新增 ——
check('宝箱怪概率降至 35%', run('CHEST_TIERS.mystery.mimicChance') === 0.35);
check('隐身药剂 10 秒', run('CONSUMABLES.stealth.invis') === 10);
check('奖杯 14 个定义完整', run(`TROPHIES.length === 14 && TROPHIES.every(t => t.name && t.desc && t.icon)`));
check('雇佣兵 3 档且新存档各 2 次试用', run(`
  Object.keys(MERCS).length === 3 &&
  (() => { localStorage.setItem(SAVE_KEY, ''); loadSave(); return SAVE.mercTrials.guard === 2 && SAVE.mercTrials.ace === 2; })()`));
check('系列奖励全部挂了实物解锁', run(`Object.values(SERIES).every(s => s.unlock && ['skin','acc','weapon'].includes(s.unlock.type))`));
check('奖励皮肤/装饰 id 都存在', run(`
  Object.values(SERIES).every(s =>
    s.unlock.type === 'skin' ? SKINS.some(k => k.id === s.unlock.id) :
    s.unlock.type === 'acc' ? !!ACCESSORIES[s.unlock.id] : !!WEAPONS[s.unlock.id])`));
check('鹤嘴镐需要地心结晶图纸', run(`WEAPONS.pickaxe.requires === 'mine_relics'`));
check('皮肤解锁门槛生效', run(`
  (() => {
    SAVE.claimedSeriesRewards = [];
    const ghost = SKINS.find(s => s.id === 'ghost');
    if (skinUnlocked(ghost, SAVE)) return false;
    SAVE.claimedSeriesRewards.push('occult');
    return skinUnlocked(ghost, SAVE);
  })()`));
check('集齐地心结晶自动送鹤嘴镐', run(`
  (() => {
    SAVE = defaultSave();
    for (const t of TREASURES.filter(t => t.series === 'mine_relics')) codexMarkCollected(t.id, t.value);
    checkSeriesRewards();
    return SAVE.weapons.some(w => w.id === 'pickaxe') && SAVE.claimedSeriesRewards.includes('mine_relics');
  })()`));
check('奖杯授予幂等', run(`
  (() => {
    SAVE = defaultSave();
    const a = awardTrophy('slayer'), b = awardTrophy('slayer');
    return a && a.id === 'slayer' && b === null && SAVE.trophies.slayer > 0;
  })()`));



// ==================== 无双割草 ====================
check('割草配置存在且无宝箱', run(`HORDE_CFG.id === 'horde' && Object.values(HORDE_CFG.chests).every(v => v === 0)`));
check('割草 600s/上限80/3个Boss波', run(`HORDE_DURATION === 600 && HORDE_CAP === 80 && HORDE_BOSS_AT.length === 3`));
check('升级池 28 项字段完整', run(`HORDE_UPGRADES.length === 28 && HORDE_UPGRADES.every(u => u.name && u.icon && u.desc && u.max > 0 && (u.skill || u.special || typeof u.mod === 'function'))`));
check('15 个技能项 id 合法', run(`HORDE_UPGRADES.filter(u => u.skill).length === 15 && HORDE_UPGRADES.filter(u => u.skill).every(u => ['orbit','missile','nova','trail','lightning','whirlwind','barrier','mines','meteor','boomerang','chrono','garlic','spears','drone','thorns'].includes(u.skill))`));
check('刷怪池随时间解锁', run(`hordeSpawnPool(10).length < hordeSpawnPool(400).length && hordeSpawnPool(400).includes('banshee')`));

// ==================== 第五轮：翻滚/弹夹/天气/道具 ====================
check('体力常量合法（消耗<上限，翻滚有CD）', run(`STAMINA.rollCost < STAMINA.max && STAMINA.rollCd > 0 && STAMINA.regen > 0 && STAMINA.rollDur > 0`));
check('全部枪械都有弹夹与换弹时间', run(`Object.values(WEAPONS).filter(w => !w.melee).every(w => w.mag > 0 && w.reload > 0)`));
check('近战武器无弹夹', run(`Object.values(WEAPONS).filter(w => w.melee).every(w => !w.mag)`));
check('天气 5 种且倍率有意义', run(`
  Object.keys(WEATHERS).length === 5 &&
  WEATHERS.rain.pSpd < 1 && WEATHERS.snow.pSpd < WEATHERS.rain.pSpd &&
  WEATHERS.sandstorm.vision < 1 && WEATHERS.bloodmoon.mSpd > 1 && WEATHERS.bloodmoon.mDmg > 1`));
check('rollWeather 只返回合法天气', run(`
  (() => { for (let i = 0; i < 200; i++) { const w = rollWeather(); if (!WEATHERS[w.id]) return false; } return true; })()`));
check('道具 12 种定义完整', run(`POWERUP_KEYS.length === 12 && POWERUP_KEYS.every(k => POWERUPS[k].name && POWERUPS[k].icon && POWERUPS[k].desc)`));
check('追踪弹全局参数强化(转向≥5)', run(`HOMING.turn >= 5 && HOMING.cone >= 0.7 && HOMING.dist >= 400`));
check('奖杯 14 个定义完整', run(`TROPHIES.length === 14 && TROPHIES.every(t => t.name && t.desc && t.icon)`));


// ==================== 第六轮：键位/新怪/商人V2 ====================
check('默认键位：动作齐全且同玩家无冲突', run(`
  DEFAULT_KEYS.every(km => {
    const codes = KEY_ACTIONS.map(([a]) => km[a]);
    return codes.every(c => c) && new Set(codes).size === codes.length;
  })`));
check('1P 新默认键位符合定制（空格射击/左Shift翻滚/F互动/E药品/Q切枪/R换弹）', run(`
  DEFAULT_KEYS[0].shoot === 'Space' && DEFAULT_KEYS[0].roll === 'ShiftLeft' && DEFAULT_KEYS[0].sneak === 'CapsLock' &&
  DEFAULT_KEYS[0].interact === 'KeyF' && DEFAULT_KEYS[0].use === 'KeyE' && DEFAULT_KEYS[0].swap === 'KeyQ' && DEFAULT_KEYS[0].reload === 'KeyR'`));
check('2P 新默认键位符合定制', run(`
  DEFAULT_KEYS[1].sneak === 'Slash' && DEFAULT_KEYS[1].roll === 'ShiftRight' && DEFAULT_KEYS[1].interact === 'KeyJ' &&
  DEFAULT_KEYS[1].use === 'Comma' && DEFAULT_KEYS[1].shoot === 'Period' && DEFAULT_KEYS[1].cycle === 'KeyK' && DEFAULT_KEYS[1].swap === 'KeyL'`));
check('keyLabel 可读显示', run(`keyLabel('Space') === '空格' && keyLabel('KeyF') === 'F' && keyLabel('CapsLock') === 'Caps'`));
check('新怪物字段（蛮牛冲锋/毒菇自爆）', run(`MONSTER_TYPES.charger.charger === true && MONSTER_TYPES.shroom.shroom === true`));
check('割草刷怪池含新怪', run(`hordeSpawnPool(200).includes('charger') && hordeSpawnPool(250).includes('shroom')`));
check('商人V2：必有特价武器+礼包+护甲', run(`
  (() => { const s = merchantStock(false);
    return s.some(i => i.kind === 'weapon' && i.note) && s.some(i => i.kind === 'potionpack') && s.some(i => i.kind === 'armor'); })()`));
check('商人V2割草专属服务', run(`
  (() => { const s = merchantStock(true);
    return s.some(i => i.kind === 'upgrade') && s.some(i => i.kind === 'healall') && s.some(i => i.kind === 'mercace'); })()`));
check('经典商人卖传说宝物', run(`
  (() => { const s = merchantStock(false); const t = s.find(i => i.kind === 'treasure');
    return t && TREASURE_BY_ID[t.id] && TREASURE_BY_ID[t.id].rarity === 'legendary'; })()`));
check('天气晴朗概率降至 20%', run(`
  (() => { let clear = 0; for (let i = 0; i < 3000; i++) if (rollWeather().id === 'clear') clear++;
    return clear > 400 && clear < 800; })()`));

console.log(fails === 0 ? '\n全部通过 🎉' : `\n${fails} 项失败`);
process.exit(fails ? 1 : 0);
