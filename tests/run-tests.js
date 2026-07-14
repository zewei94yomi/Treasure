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
for (const f of ['monsters-data.js', 'mugshots-data.js', 'data.js', 'save.js', 'map.js']) {
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
check('武器 19 种字段完整（含RPG/AK/MG3）', run(`
  Object.keys(WEAPONS).length === 19 && WEAPONS.rpg.explosive === 110 && WEAPONS.ak.sfx === 'ak' && WEAPONS.mg3.sfx === 'mg' && Object.values(WEAPONS).every(w =>
    w.weight !== undefined && w.knock > 0 && (w.melee ? w.range > 0 : (w.range > 0 && AMMO_TYPES[w.ammo])))`));
check('药品 6 种 & 顺序表一致', run(`CONSUM_ORDER.length === 6 && CONSUM_ORDER.every(k => CONSUMABLES[k])`));
check('护甲 3 种 + 腰包', run(`Object.keys(ARMORS).length === 3 && GEAR.pouch.extraSlots === 3`));
check('怪物 21 种（含6新怪+3Boss）', run('Object.keys(MONSTER_TYPES).length') === 21);
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
check('奖杯 15 个定义完整', run(`TROPHIES.length === 15 && TROPHIES.every(t => t.name && t.desc && t.icon)`));
check('雇佣兵 12 档（+鸭灵剑士）且试用次数齐', run(`
  Object.keys(MERCS).length === 12 && MERCS.dog.requiresMerc === 'sniper' && MERCS.priest.heal > 0 &&
  MERCS.archer.archer === true && MERCS.mage.mage === true && MERCS.mech.mech === true &&
  (() => { localStorage.setItem(SAVE_KEY, ''); loadSave(); return SAVE.mercTrials.guard === 2 && SAVE.mercTrials.mage === 1 && SAVE.mercTrials.mech === 1; })()`));
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
check('割草基准 900s/上限80/4个Boss波/时长可调', run(`HORDE_DURATION === 900 && HORDE_CAP === 80 && HORDE_BOSS_AT.length === 4 && tune('hordeTime') === 10`));
check('升级池 40 项字段完整', run(`HORDE_UPGRADES.length >= 39 && HORDE_UPGRADES.every(u => u.name && u.icon && u.desc && u.max > 0 && (u.skill || u.special || u.hmod || typeof u.mod === 'function'))`));
check('19 个技能项 id 合法（+呼叫支援）', run(`HORDE_UPGRADES.filter(u => u.skill).length === 19 && HORDE_UPGRADES.filter(u => u.skill).every(u => ['orbit','missile','nova','trail','lightning','whirlwind','barrier','mines','meteor','boomerang','chrono','garlic','spears','drone','thorns','fireball','summon','revenge','arty'].includes(u.skill))`));
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
check('奖杯 15 个含大逃亡', run(`TROPHIES.length === 15 && TROPHY_BY_ID.escape_dawn`));


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


// ==================== 第七轮：新怪/Boss/调参/狂暴 ====================
check('新怪 6 种带贴图与机制字段', run(`
  ['warlock','venomsnake','stoneling','direwolf','leapspider','scorpion'].every(id => MONSTER_TYPES[id] && MONSTER_TYPES[id].sprite) &&
  MONSTER_TYPES.warlock.caster === true && MONSTER_TYPES.venomsnake.poison > 0 && MONSTER_TYPES.scorpion.paralyze > 0 && MONSTER_TYPES.leapspider.leap === true`));
check('3 个 Boss 定义与轮换表', run(`
  HORDE_BOSS_IDS.length === 3 && HORDE_BOSS_IDS.every(id => MONSTER_TYPES[id] && MONSTER_TYPES[id].boss && MONSTER_TYPES[id].sprite)`));
check('贴图数据 26 张（+佣兵王）且为 dataURI', run(`
  Object.keys(MONSTER_SPRITES).length === 26 && MONSTER_SPRITES.m_archer && MONSTER_SPRITES.m_mage && MONSTER_SPRITES.m_mech && MONSTER_SPRITES.m_waterele && MONSTER_SPRITES.m_dragon && Object.values(MONSTER_SPRITES).every(v => v.startsWith('data:image/png;base64,'))`));
check('狂暴配置合法', run(`HORDE_ENRAGE.speedMul > 1 && HORDE_ENRAGE.atkMul < 1 && HORDE_ENRAGE.start > 0`));
check('攻击%升级已削弱为加算', run(`
  (() => { const m = { dmg: 1 }; HORDE_UPGRADE_BY_ID.dmg.mod(m); return Math.abs(m.dmg - 1.18) < 1e-9; })()`));
check('变体技能带 requires 且母技能存在', run(`
  HORDE_UPGRADES.filter(u => u.requires).length >= 4 &&
  HORDE_UPGRADES.filter(u => u.requires).every(u => HORDE_UPGRADES.some(o => o.skill === u.requires))`));
check('调参面板 27 项（英雄改专属详细面板）', run(`
  TUNE_DEFS.length === 27 && TUNE_DEFS.every(t => t.name && t.min < t.max) && tune('zapHop') === 0.35 &&
  tune('pSpeed') === 1.2 && tune('mimic') === 0.3 && tune('mDmg') === 1.3 && tune('rollCd') === 1 && tune('thorns') === 1.2`));
check('调参覆盖生效', run(`
  (() => { SAVE.tuning = { pDmg: 1.5 }; const v = tune('pDmg'); delete SAVE.tuning; return v === 1.5; })()`));
check('普通难度商人概率 0.5', run(`DIFFICULTIES.normal.merchant === 0.5`));

// ==================== 第八轮：特效引擎/图鉴/翻滚/鸭灵 ====================
check('翻滚 CD 大幅下调至 0.35', run(`STAMINA.rollCd === 0.35`));
check('怪物图鉴档案覆盖全部 21 种怪', run(`
  Object.keys(MONSTER_TYPES).every(id => CODEX_INFO[id] && CODEX_INFO[id].lore && CODEX_INFO[id].hint)`));
check('存档新增图鉴字段（monsterSeen / stats.mKills）', run(`
  typeof SAVE.monsterSeen === 'object' && typeof SAVE.stats.mKills === 'object'`));
check('鸭灵变体（成群/战意）带 requires', run(`
  HORDE_UPGRADE_BY_ID.summon_flock.requires === 'summon' && HORDE_UPGRADE_BY_ID.summon_war.requires === 'summon' &&
  (() => { const m = {}; HORDE_UPGRADE_BY_ID.summon_flock.mod(m); HORDE_UPGRADE_BY_ID.summon_war.mod(m); return m.petRate === 1.3 && m.petPow === 1; })()`));
check('升级池扩至 75 项（+招募·鸭灵剑士）', run(`HORDE_UPGRADES.length === 75 && HORDE_UPGRADE_BY_ID.arty && HORDE_UPGRADE_BY_ID.merc_dmg.mercOnly === true`));
{
  const fx = fs.readFileSync(base + 'fx.js', 'utf8');
  check('特效引擎：烘焙纹理 + 五类预设齐全',
    ['FxTex', 'fxExplosion', 'fxHit', 'fxDeath', 'fxMuzzle', 'fxTrailFire'].every(k => fx.includes(k)));
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('game.js 接入：击杀图鉴统计/荆棘护甲/翻滚调参/白闪剪影',
    gameSrc.includes('SAVE.stats.mKills[m.type.id]') && gameSrc.includes("skillVal('thorns', 'reduce')") &&
    gameSrc.includes("STAMINA.rollCd * tune('rollCd')") && gameSrc.includes('MonsterImagesWhite[m.type.sprite]') &&
    gameSrc.includes('rollCut'));
  const hordeSrc = fs.readFileSync(base + 'horde.js', 'utf8');
  check('horde.js 接入：无人机增强/鸭灵并行复活队列/精绘地雷陨石',
    hordeSrc.includes("skillVal('drone', 'dmg') + S.drone * skillVal('drone', 'dmgLv')") && hordeSrc.includes('ex.petQueue.push({ t: 5, pi: p.idx })') &&
    hordeSrc.includes('petCap') && hordeSrc.includes('fxExplosion'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('index.html：fx.js 脚本 + 怪物图鉴入口 + 缓存版本自洽', (() => {
    const vers = [...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
    return html.includes('js/fx.js?v=') && html.includes('monsterdex-overlay') && html.includes('js/dex.js?v=')
      && vers.length >= 20 && new Set(vers).size === 1;
  })());
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('ui.js：怪物图鉴界面（活体卡片渲染）',
    uiSrc.includes('showMonsterDex') && uiSrc.includes('drawMonster(ctx, c.m'));
}

// ==================== 第九轮：大逃亡/地图放大/图鉴/修复 ====================
check('地图放大器：唯一点位不重复、密度点位翻倍', run(`
  (() => { const s = scaleAscii(['#####', '#1cm#', '#####']);
    const all = s.join('');
    return s.length === 6 && s[0].length === 10 &&
      (all.match(/1/g) || []).length === 1 && (all.match(/c/g) || []).length === 2; })()`));
for (let i = 0; i < 3; i++) {
  const r = JSON.parse(run(`
    (() => { loadMap('escape');
      return JSON.stringify({ sp: !!(MapData.spawns[0] && MapData.spawns[1]), exit: MapData.exitTiles.length > 0,
        wide: MapData.w > 200, chests: MapData.chestSpots.length >= 10, nodes: MapData.monsterNodes.length >= 12,
        merchant: !!MapData.merchantSpot,
        path: bfsPath(MapData.spawns[0].x, MapData.spawns[0].y,
                      MapData.exitRect.x + MapData.exitRect.w/2, MapData.exitRect.y + MapData.exitRect.h/2).length > 0 }); })()`));
  check(`大逃亡随机图 #${i + 1}：出生/撤离/宝箱/怪点/商人/全程连通`, r.sp && r.exit && r.wide && r.chests && r.nodes && r.merchant && r.path);
}
check('MapData 携带放大后 ascii（prerender 防崩）', run(`
  (() => { loadMap('manor'); return MapData.ascii.length === MapData.h && MapData.ascii[0].length === MapData.w; })()`));
check('大逃亡配置与怪物池', run(`
  ESCAPE_CFG.vision === 480 && ESCAPE.tideSpeed > 0 && escapePool(0.1).length > 0 && escapePool(0.9).includes('stoneling')`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('game.js：大逃亡引擎（潮汐/追兵/结算/开箱掉枪）齐全',
    ['escapeUpdate', 'settleEscape', 'escapeLoot', 'this.tideX', 'escape_dawn'].every(k => gameSrc.includes(k)));
  check('伤害数字有渲染代码且统一冒自 Monster.hurt',
    gameSrc.includes('for (const n of this.dmgNums) {\n      const [sx, sy] = W2S(n.x, n.y);') === false ? gameSrc.includes('of this.dmgNums') && gameSrc.match(/of this\.dmgNums/g).length >= 2 : true);
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('Monster.hurt 集中冒伤害数字', entSrc.includes('game.dmgNum(this.x'));
  check('Boss 头顶名字血条', gameSrc.includes("'👑 ' + m.type.name"));
  check('贴图原生朝向镜像修正', gameSrc.includes("m.type.face === 'left'") && fs.readFileSync(base + 'data.js', 'utf8').split("face:'left'").length - 1 >= 5);
  const hordeSrc = fs.readFileSync(base + 'horde.js', 'utf8');
  check('陨石结算在共享段（红圈残留修复延续）', hordeSrc.includes('共享结算段') && hordeSrc.includes('ex.meteors = ex.meteors.filter'));
  check('旋风斩圣剑扫圈 + 无人机三度增强', hordeSrc.includes('fx_sword') && hordeSrc.includes("skillVal('drone', 'cd')"));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('商人买活队友 + 大逃亡玩法卡', uiSrc.includes('merchantRevive') && uiSrc.includes("setGameplay('escape')"));
  const dexSrc = fs.readFileSync(base + 'dex.js', 'utf8');
  check('武器/技能图鉴（演示+等级调节）', ['showWeaponDex', 'showSkillDex', 'setSkillLv', 'SKILL_ANIM'].every(k => dexSrc.includes(k)));
}

// ==================== 第十轮：强化/爆炸/时长/大逃亡重构/UI ====================
check('静音鹅弩专属追踪强化', run(`WEAPONS.crossbow.homing && WEAPONS.crossbow.homing.cone > HOMING.cone && WEAPONS.crossbow.homing.turn > HOMING.turn`));
check('大逃亡房间矩形导出（怪潮触发）', run(`
  (() => { loadMap('escape'); return Array.isArray(MapData.escapeRooms) && MapData.escapeRooms.length >= 10 && MapData.escapeRooms.every(r => r.w > 0 && r.h > 0); })()`));
check('小地图封顶 300×150', run(`
  (() => { loadMap('manor'); const ok1 = MapData.minimap.width <= 302 && MapData.minimap.height <= 152;
    loadMap('escape'); return ok1 && MapData.minimap.width <= 302 && MapData.minimap.height <= 152; })()`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('大逃亡房间怪潮引擎（escSpawnWave/escRoomReward/免战出生房）',
    ['escSpawnWave', 'escRoomReward', "state: i === 0 ? 'clear' : 'idle'", '肃清'].every(k => gameSrc.includes(k)));
  check('时长走 tune + 经验随时间上涨',
    gameSrc.includes('hordeDuration()') && gameSrc.includes('1 + this.time / 300'));
  check('小地图显示全部怪物与Boss', gameSrc.includes('全部怪物红点 + Boss 金色大点'));
  check('复仇之焰新特效 + 地面纹理层', gameSrc.includes('fxRevenge') && gameSrc.includes('贴图铺地'));
  const fxSrc = fs.readFileSync(base + 'fx.js', 'utf8');
  check('特效引擎：贴图粒子 + 火焰云爆炸 + fxRevenge',
    ['f.img', 'fx_flame0', 'fxRevenge'].every(k => fxSrc.includes(k)));
  const hordeSrc = fs.readFileSync(base + 'horde.js', 'utf8');
  check('无人机编队（僚机）+ 骨刺/飞盘增强',
    hordeSrc.includes('droneCount') && hordeSrc.includes("skillVal('spears', 'dmg')") && hordeSrc.includes("skillVal('boomerang', 'dmg')"));
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('菜单收纳：图鉴馆 + 设置中心', html.includes('dexhub-overlay') && html.includes('settingshub-overlay') && html.includes('UI.showDexHub()'));
}

// ==================== 第十一轮：弹芯/招募流/经济/曲线 ====================
check('经济再平衡：价格与宝物价值已上调', run(`
  WEAPONS.pistol.price === 420 && TREASURE_VALUE_MUL.mythic === 3.5 &&
  TREASURES.every(t => t.value > 0 && t.value % 5 === 0)`));
check('狂怒弹头仅武器伤害（技能公式已解耦）', (() => {
  const h = fs.readFileSync(base + 'horde.js', 'utf8'), g2 = fs.readFileSync(base + 'game.js', 'utf8');
  return !h.includes('* H.mods.dmg), this)') && !g2.includes('* H.mods.dmg), this)');
})());
check('XP 曲线超线性 + 后期低级怪退场', run(`
  (8 + 30 * 4 + 30 * 30 * 0.15) > (8 + 10 * 4 + 10 * 10 * 0.15) * 2 &&
  !hordeSpawnPool(500).includes('shade') && hordeSpawnPool(30).includes('shade')`));
check('弩/割草弹芯字段', run(`HORDE_UPGRADE_BY_ID.fireshot && HORDE_UPGRADE_BY_ID.iceshot && HORDE_UPGRADE_BY_ID.split && HORDE_UPGRADE_BY_ID.scatter`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('闪电逐跳传导引擎（间隔可调）', gameSrc.includes('chainJobs') && gameSrc.includes("job.hopT = tune('zapHop')"));
  check('毒雾文字说明 + 玩家中毒状态标识', gameSrc.includes('剧毒毒雾') && gameSrc.includes('🤢 中毒'));
  check('大逃亡紧张感：预警落地/速清奖励/潮汐暴涨/终点冲刺',
    ['escPend', '速清奖励', '死亡之潮即将暴涨', '最后冲刺'].every(k => gameSrc.includes(k)));
  check('通关时间显示统一（shownT）', gameSrc.includes('const shownT = H.victory ? hordeDuration()'));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('牧师治疗/嗅探犬拾取/战友号令', ['def.heal', 'def.fetch', 'mercPow'].every(k => entSrc.includes(k)));
  check('燃烧蔓延 + 弹芯命中特效', entSrc.includes('fireSpread') && entSrc.includes('zapShot') && entSrc.includes('splitShot'));
  const hordeSrc = fs.readFileSync(base + 'horde.js', 'utf8');
  check('巨型锯盘（反复切割+3级双盘）+ 招募流门槛', hordeSrc.includes('sawCd') && hordeSrc.includes('mercOnly'));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('调参面板高亮已改项 + 嗅探犬槽位', uiSrc.includes('tuning-changed-bar') && uiSrc.includes('setMerc2'));
  const tilesSrc = fs.readFileSync(base + 'tiles-data.js', 'utf8');
  check('地板贴图 6 主题（crawl CC0）', ['manor', 'mine', 'wreck', 'cathedral', 'swamp', 'icecave'].every(k => tilesSrc.includes(k + ':')) && gameSrc.includes('贴图铺地'));
}

// ==================== 第十二轮：鼠标操控/复仇条件/图鉴特效 ====================
check('鼠标操控默认开启（settings.mouseAim）', run(`defaultSave().settings.mouseAim === true`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('复仇之焰仅怪物直接攻击触发', gameSrc.includes('dmg > 0 && src && src.hurt'));
  check('鼠标操控核心（朝向/左键/右键翻滚/准星）',
    ['mouseAimOn', 'Input.mouseL', 'Input.mouseR', '鼠标准星'].every(k => gameSrc.includes(k)));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('鼠标操控削弱弹道追踪', entSrc.includes('owner.mouseAimed'));
  const mainSrc = fs.readFileSync(base + 'main.js', 'utf8');
  check('鼠标事件监听（移动/按键/右键屏蔽菜单）', mainSrc.includes('contextmenu') && mainSrc.includes('Input.mouse.x'));
  const dexSrc = fs.readFileSync(base + 'dex.js', 'utf8');
  check('技能图鉴特效同步（锯盘/逐跳闪电/火环/骨刺/火迹贴图）',
    ['巨型锯盘：钢盘锯齿', '逐跳传导：三个节点', '火焰云怒环', '白骨碎片贴图', '火焰云贴图足迹'].every(k => dexSrc.includes(k)));
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('按钮字色统一（v19 起由设计令牌 --ink2 统一）', cssSrc.includes('--ink2') && cssSrc.includes('.btn {'));
}

// ==================== 第十二轮：鼠标操控/盟友面板/三英雄/武器爽感 ====================
check('复仇之焰仅怪物直击触发', fs.readFileSync(base + 'game.js', 'utf8').includes('src && src.hurt'));
check('骨刺不追踪 + 升级回血 + 弹壳抛出', (() => {
  const g2 = fs.readFileSync(base + 'game.js', 'utf8'), h2 = fs.readFileSync(base + 'horde.js', 'utf8');
  return h2.includes('noHoming: true') && g2.includes('p.maxHp * 0.06') && g2.includes('弹壳抛出');
})());
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('鼠标操控（朝向/削弱追踪/设置开关）', gameSrc.includes('mouseAimOn') && fs.readFileSync(base + 'entities.js', 'utf8').includes('mouseAimed'));
  check('左侧盟友面板（头像/血条/复活倒计时/阵亡变灰）',
    ['renderAllyPanel', 'allyAvatar', 'allyFallen', 'petQueue'].every(k => gameSrc.includes(k)) &&
    fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('ally-panel'));
  check('盟友技能特效层（黑龙波/激光/火环/火炮）',
    ['allyFx', 'updateAllyFx', 'waves', 'beams', 'strikes'].every(k => gameSrc.includes(k)));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('三英雄 AI：箭手随机箭/法师四法术/机兵双管+火炮/水元素水波',
    ['def.archer', 'def.mage', 'def.mech', 'def.waterele', 'zapArrow', '黑龙波'].every(k => entSrc.includes(k)));
  check('鸭灵持剑横扫', entSrc.includes('def.sword') && fs.readFileSync(base + 'horde.js', 'utf8').includes('sword: true'));
  const sfxSrc = fs.readFileSync(base + 'sfx.js', 'utf8');
  check('武器专属音效（ak/mg/sniper/rpg/impact）', ['ak()', 'mg()', 'sniper()', 'rpg()', 'impact()'].every(k => sfxSrc.includes(k)));
  const dexSrc = fs.readFileSync(base + 'dex.js', 'utf8');
  check('技能图鉴动画同步（锯盘/逐跳/圣剑/骨刺/呼叫支援）',
    ['巨型锯盘', '逐跳', 'fx_sword', 'fx_bone', 'arty(ctx'].every(k => dexSrc.includes(k)));
}

// ==================== 第十三轮：招募流可达性/修复 ====================
check('商人局内卖佣兵（割草招募流入口）', run(`
  (() => { for (let i = 0; i < 20; i++) { const s = merchantStock(true); if (s.some(it => it.kind === 'merc')) return true; } return false; })()`));
check('呼叫支援带武器投资门槛', run(`
  typeof HORDE_UPGRADE_BY_ID.arty.gate === 'function' &&
  !HORDE_UPGRADE_BY_ID.arty.gate({ picked: {} }) && HORDE_UPGRADE_BY_ID.arty.gate({ picked: { dmg: 1, rate: 1 } })`));
{
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('佣兵分离 + 跟随错位 + 火炮落点校验', entSrc.includes('相互推挤') && entSrc.includes('按队伍序号错开') && entSrc.includes('落点避墙'));
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('三层闪电 + 每跳音效 + 鸭灵持剑绘制 + 拾枪互换', gameSrc.includes('三层闪电') && gameSrc.includes('Sfx.zap()') && gameSrc.includes('mc.def.sword') && gameSrc.includes('weaponDrops'));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('商人招募购买 + 升级卡数值预览', uiSrc.includes("item.kind === 'merc'") && uiSrc.includes('Dex.skillInfo'));
  const sfxSrc = fs.readFileSync(base + 'sfx.js', 'utf8');
  check('AK 音效 CS 化 + 闪电 zap 音效', sfxSrc.includes('6000') && sfxSrc.includes('zap()'));
}

// ==================== 第十四轮：弹夹修复/开发者模式/佣兵跟随 ====================
{
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('弹夹容量统一 magCap + 快手换弹生效', entSrc.includes('magCap(slot') && entSrc.includes('mods.reloadMul) || 1'));
  check('佣兵牵引绳（紧跟主角）', entSrc.includes('牵引绳') && entSrc.includes('leashD > 300'));
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('HUD 弹夹分母用扩容值 + 开发者经验走面板倍率', gameSrc.includes('p.magCap(s)') && gameSrc.includes("devMode ? tune('devXp') : 1"));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('佣兵随行播报 + 付不起警告 + 开发者开关', uiSrc.includes('随行佣兵') && uiSrc.includes('未能随行') && uiSrc.includes('toggleDevMode'));
}

// ==================== 第十五轮：招募卡/练习场/空手起家 ====================
check('招募卡进升级池（8 位英雄）', run(`
  HORDE_UPGRADES.filter(u => u.special === 'recruit').length === 8 &&
  HORDE_UPGRADES.filter(u => u.special === 'recruit').every(u => MERCS[u.mercId])`));
check('新调参默认值', run(`tune('mercRange') === 1.1 && tune('devXp') === 20 && tune('wRate') === 1`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('割草空手起家（默认手枪）+ 练习场引擎', gameSrc.includes("id: 'pistol', dur: 99999") && gameSrc.includes('arenaUpdate') && gameSrc.includes('arenaNextWeapon'));
  check('招募卡生效 + 曳光弹美化', gameSrc.includes("u.special === 'recruit'") && gameSrc.includes('曳光弹'));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('喷火兵火舌 + 佣兵范围调参', entSrc.includes('flamerCone') && entSrc.includes("tune('mercRange')"));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('练习场入口 + 割草隐藏装备行', uiSrc.includes('startArena') && uiSrc.includes('空手入场'));
}

// ==================== 第十六轮：英雄晋阶/形象重做/练习场增强 ====================
check('英雄详细调参体系 + 鹰眼超高伤 + 机兵弹夹', run(`
  Object.keys(HERO_TUNE).length === 12 && HERO_TUNE.mage.params.dragonKnock.def === 700 && heroVal('sniper', 'dmg') === 200 && MERCS.mech.mag === 40`));
check('机兵=武器流最高形态（gate 5 次武器强化）', run(`
  typeof HORDE_UPGRADE_BY_ID.recruit_mech.gate === 'function' && !HORDE_UPGRADE_BY_ID.recruit_mech.gate({ picked: {} }) &&
  HORDE_UPGRADE_BY_ID.recruit_mech.gate({ picked: { dmg: 3, rate: 2 } })`));
check('牧师持杖贴图+随机祝福 / 喷火兵人形贴图', run(`
  MERCS.priest.sprite === 'm_priest2' && MERCS.priest.buffCd > 0 && MERCS.flamerguy.sprite === 'm_flamer2'`));
check('devMode 全解锁（皮肤/装饰）', run(`
  (() => { SAVE.settings.devMode = true; const ok = SKINS.every(s => skinUnlocked(s, SAVE)) && Object.values(ACCESSORIES).every(a => accUnlocked(a, SAVE)); SAVE.settings.devMode = false; return ok; })()`));
{
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('英雄专属能力接线（升级卡驱动）', ['致命一击', '双重祝福', 'coneA', 'shots2', 'HM.mageLaser'].every(k => entSrc.includes(k)));
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('模型放大 + 火圈填满 + 激光加粗 + devMode金币', 
    ['mc.def.mech ? 52', '整圈火海', 'lineWidth = 22', 'SAVE.gold = 999999'].every(k => gameSrc.includes(k)));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('练习场武器/英雄选择器 + 全部重置', uiSrc.includes('arena-wsel') && fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('全部重置'));
}

// ==================== 第十七轮：英雄专属升级/详细调参/状态系统 ====================
check('英雄专属升级卡（15 张，需在场）', run(`
  HORDE_UPGRADES.filter(u => u.heroUp).length === 15 && HORDE_UPGRADES.filter(u => u.hmod).every(u => u.heroUp)`));
check('远程佣兵全配弹夹', run(`['vet','ace','sniper','archer','marine','mech'].every(id => MERCS[id].mag > 0 && MERCS[id].reload > 0)`));
check('旺财拾取范围大幅提升且可调', run(`MERCS.dog.fetch === 560 && HERO_TUNE.dog.params.fetch.def === 600`));
check('佣兵进攻欲望入面板（默认600）', run(`TUNE_DEFS.some(t => t.id === 'mercDesire' && t.def === 600)`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('旧局销毁（重置双循环修复）+ 英雄上限5 + 黑龙击退可调',
    ['cancelAnimationFrame(Game.current.raf)', 'canRecruitHero', "heroVal('mage', 'dragonKnock')"].every(k => gameSrc.includes(k)));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('通用弹夹（修机兵装填卡死）+ 佣兵状态系统 + 怪物欲望',
    ['通用弹夹', 'this.stunT > 0) { this.moving = false; return; }', '顺势撕咬佣兵', '💫晕眩！'].every(k => entSrc.includes(k)));
  check('晋阶体系已退役', !gameSrc.includes('随行英雄晋阶') && !entSrc.includes('this.tier || 1'));
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('英雄调参面板 + 英雄图鉴页 + 面板血量状态',
    ['showHeroTune', 'setHeroTune', 'showHeroDex'].every(k => uiSrc.includes(k)) && gameSrc.includes('❤${Math.ceil(mc.hp)}'));
}

// ==================== 第十九轮：方向A 野战档案 UI ====================
{
  const html = fs.readFileSync(base + '../index.html', 'utf8');
  const cssSrc = fs.readFileSync(base + '../css/style.css', 'utf8');
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  check('野战档案设计令牌（弹壳黄/骨白/警示红/军绿边框）',
    cssSrc.includes('--amber: #e0a63c') && cssSrc.includes('--ink: #e9e3c8')
    && cssSrc.includes('--red: #c2452a') && cssSrc.includes('--line: #454d2f'));
  check('设计字体接入（庆科黄油体标题/BlackOps番号/ShareTechMono数据）',
    cssSrc.includes("'ZCOOL QingKe HuangYou'") && cssSrc.includes("'Black Ops One'")
    && cssSrc.includes("'Share Tech Mono'") && html.includes('css/fonts.css?v='));
  check('字体自托管（fonts.css 指向本地 woff2）', (() => {
    const f = fs.readFileSync(base + '../css/fonts.css', 'utf8');
    return f.includes('../assets/fonts/') && !f.includes('http') && fs.existsSync(base + '../assets/fonts');
  })());
  check('主菜单重构：指令列表 + 行动简报档案',
    html.includes('class="menu-item primary"') && html.includes('OPERATION : DUCKOV')
    && html.includes('brief-inner') && uiSrc.includes('行动简报 // BRIEFING'));
  check('升级卡军需化 + 已选盖章 + 出击切角',
    cssSrc.includes('repeating-linear-gradient(45deg, var(--line)') && cssSrc.includes("content: '已选'")
    && cssSrc.includes('clip-path: polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)'));
  check('HUD 军规化（1P/2P 铭牌 + 血条刻度 + 军规配色血量）',
    cssSrc.includes('.np-name') && cssSrc.includes('repeating-linear-gradient(90deg, transparent 0 17px')
    && fs.readFileSync(base + 'game.js', 'utf8').includes("linear-gradient(#9cbb61,#7d9c48)"));
}

// ==================== 第十八轮：佣兵王/双人难度/抽卡/寻路 ====================
check('佣兵王重定义（狙击贴图+猎首+弹夹）', run(`MERCS.ace.sprite === 'm_ace' && MERCS.ace.bossHunter === true && MERCS.ace.mag === 8 && HERO_TUNE.ace.params.dmg.def === 60`));
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  check('双人难度大幅上调 + Boss 增强', gameSrc.includes('batch * 1.95') && gameSrc.includes("this.mode === 2 ? 1.9 : 1") && gameSrc.includes('mHp * 39'));
  check('升级分离后招募归属选卡玩家 + 每人上限5 + 主人阵亡英雄离场',
    ['canRecruitHero(owner)', 'canRecruitHero(p)', '随行英雄黯然离去'].every(k => gameSrc.includes(k)));
  check('结算抽卡（三箱选一）+ 大逃亡开出宝物', gameSrc.includes('lootDraw') && gameSrc.includes('折现') &&
    fs.readFileSync(base + 'ui.js', 'utf8').includes('pickLootCard'));
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  check('怪物解堵（相互分离+侧滑脱困）+ 佣兵王猎首弹', ['怪物相互分离', '侧滑', 'bossHunter'].every(k => entSrc.includes(k)));
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('血条过渡延迟修复 + 抽卡样式', cssSrc.includes('width .04s') && cssSrc.includes('.loot-chest'));
}

// ==================== 第二十轮：铭牌HUD/放怪/下拉/档案照/欲望调参 ====================
{
  const idxSrc = fs.readFileSync(base + '../index.html', 'utf8');
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  const cssSrc2 = fs.readFileSync(base + '../css/style.css', 'utf8');
  const entSrc2 = fs.readFileSync(base + 'entities.js', 'utf8');
  check('大胆版铭牌HUD DOM（任务层/世界层/铭牌/立绘/军衔星）',
    idxSrc.includes('id="hud-task"') && idxSrc.includes('id="hm-time"') && idxSrc.includes('class="np-face"')
    && idxSrc.includes('id="hw-feed"') && idxSrc.includes('class="np-stars"') && idxSrc.includes('class="nameplate"'));
  check('铭牌HUD 更新接线（updateHudLayers + 击杀播报 + 神话警报）',
    gameSrc.includes('updateHudLayers()') && gameSrc.includes('mythicAlertUntil') && gameSrc.includes('击杀 ▸'));
  check('铭牌CSS（低血呼吸/体力pips/护甲盾/武器卡大字/2P镜像）',
    cssSrc2.includes('.nameplate.low') && cssSrc2.includes('.stam-pips') && cssSrc2.includes('.armor-pips .ap')
    && cssSrc2.includes('.ws-ammo') && cssSrc2.includes('#hud-bot-p2 .np-inner'));
  check('练习场放置怪物（单只/一波/精英 + 下拉）',
    gameSrc.includes('arenaSpawnMonster(id)') && gameSrc.includes("id === 'wave'") && idxSrc.includes('arena-msel'));
  check('方向A自定义下拉组件', uiSrc.includes('function enhanceSelect') && cssSrc2.includes('.adrop-item'));
  check('怪物档案照 21 张（图鉴+下拉头像）', run(`Object.keys(MUGSHOTS).length === 21 && Object.values(MUGSHOTS).every(v => v.startsWith('data:image/webp'))`));
  check('英雄调参全量（12英雄 + 攻击欲望×10 + 通用hp/speed）', run(`
    Object.keys(HERO_TUNE).length === 12 &&
    Object.values(HERO_TUNE).filter(h => h.params.desire).length === 10 &&
    Object.values(HERO_TUNE).every(h => h.params.hp || h.params.fetch === undefined ? h.params.hp : true) &&
    heroVal('vet', 'desire') === 600 && heroVal('guard', 'hp') === 150`));
  check('攻击欲望接线（每英雄绝对值×全局缩放·600基准）', entSrc2.includes("hv('desire', 380) * (tune('mercDesire') / 600)"));
  check('牧师治疗间隔接线', entSrc2.includes("hv('healCd', this.def.healCd)"));
  check('调参固化为用户配置（抽查）', run(`
    tune('wSpeed') === 2.2 && tune('mSpeed') === 1.3 && tune('bossHp') === 1.1 &&
    heroVal('mech', 'mag') === 100 && heroVal('archer', 'dmg') === 40 && heroVal('priest', 'buffCd') === 4`));
  check('喷火兵火舌视觉=判定射程', entSrc2.includes('const reach = Math.max(80, rngF - 20)'));
  check('翻滚方向：移动优先/静止朝准星', gameSrc.includes('p.rollT > 0 && !movin'));
  check('保镖挥锅动画+弧光', gameSrc.includes('攻击抡锅动画'));
}

// ==================== 第二十一轮：升级分离/双人对决/怪物新技能/双调参面板/潜行增强 ====================
{
  const gameSrc = fs.readFileSync(base + 'game.js', 'utf8');
  const entSrc = fs.readFileSync(base + 'entities.js', 'utf8');
  const hordeSrc = fs.readFileSync(base + 'horde.js', 'utf8');
  const uiSrc = fs.readFileSync(base + 'ui.js', 'utf8');
  const mapSrc = fs.readFileSync(base + 'map.js', 'utf8');
  const sfxSrc = fs.readFileSync(base + 'sfx.js', 'utf8');
  const idxSrc = fs.readFileSync(base + '../index.html', 'utf8');
  const cssSrc = fs.readFileSync(base + '../css/style.css', 'utf8');
  check('升级分离：每玩家子状态 + 经验归属 + 弹窗归属',
    ['P: this.players.map', 'hsP(p)', 'hordeAddXp(v, who)', 'this.levelupFor = owner'].every(k => gameSrc.includes(k) || hordeSrc.includes(k)));
  check('升级分离：技能引擎按玩家跑（horde.js 重写）',
    hordeSrc.includes('const PP = H.P[p.idx], S = PP.skills, T = PP.exT') && hordeSrc.includes('共享结算段'));
  check('顶部大经验条（每人一条）', idxSrc.includes('id="hud-xp"') && cssSrc.includes('.xp-row') && gameSrc.includes('xp-row p'));
  check('双人对决：回合三胜引擎', ['versusKill', 'resetVersusRound', 'settleVersus', 'freezeT'].every(k => gameSrc.includes(k)));
  check('双人对决：互伤管线（子弹/近战/爆炸）',
    entSrc.includes('对决：子弹命中对方玩家') && gameSrc.includes('if (this.versus) {') && gameSrc.includes('bullet.owner === p ? null : bullet.owner'));
  check('决斗场地图 + 玩法卡 + 结算', mapSrc.includes("id: 'duel'") && uiSrc.includes("setGameplay('versus')") && uiSrc.includes('决斗获胜'));
  check('怪物调参 21 + 技能调参 19', run(`
    Object.keys(MONSTER_TUNE).length === 21 && Object.keys(SKILL_TUNE).length === 19 &&
    monsterVal('boss_cyclops', 'blindDur') === 2.5 && skillVal('whirlwind', 'dmg') === 18 && skillVal('arty', 'shellsLv') === 2`));
  check('新怪技能旗标（眼波/毒吐/掷戟/突进）', run(`
    MONSTER_TYPES.watcher.spit === 'blind' && MONSTER_TYPES.venomsnake.spit === 'poison' &&
    MONSTER_TYPES.skeleton.spit === 'bone' && MONSTER_TYPES.shade.dasher === true`));
  check('Boss 技能库 + 致盲 debuff', gameSrc.includes('bossSkill(m)') && gameSrc.includes('blindPlayer') &&
    entSrc.includes('pendingBossSkill') && gameSrc.includes('p.blindT > 0 ? 0.32 : 1'));
  check('技能公式全面接线 skillVal', ['game.js', 'horde.js'].every(f => fs.readFileSync(base + f, 'utf8').includes("skillVal(")) &&
    fs.readFileSync(base + 'dex.js', 'utf8').includes("sv('whirlwind','dmg')"));
  check('潜行三件套（草丛/投石/处决赏金）', mapSrc.includes('bushes.push') && gameSrc.includes('bushHides') &&
    gameSrc.includes('throwPebble') && gameSrc.includes('处决赏金'));
  check('投石键位入表', run(`KEY_ACTIONS.some(a => a[0] === 'pebble') && DEFAULT_KEYS[0].pebble === 'KeyG' && DEFAULT_KEYS[1].pebble === 'KeyO'`));
  check('鸭灵剑士 + 修隔空挥剑', run(`MERCS.spirit.sword === true && HERO_TUNE.spirit.params.range.def === 74`) &&
    entSrc.includes('修隔空挥剑'));
  check('鼠标追踪再削（键盘/双人保留）', entSrc.includes('this.turn *= 0.10; this.hCone *= 0.25; this.hDist *= 0.40;'));
  check('旋风斩剑系图标 + 挥剑音效', run(`HORDE_UPGRADE_BY_ID.whirlwind.icon === '🗡️'`) && sfxSrc.includes('sword()') && hordeSrc.includes('Sfx.sword()'));
  check('胜利才有战利抽取', gameSrc.includes('if (H.victory) for (let i = 0; i < 3; i++)'));
}

console.log(fails === 0 ? '\n全部通过 🎉' : `\n${fails} 项失败`);
process.exit(fails ? 1 : 0);
