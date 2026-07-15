// ============ 静态数据：稀有度/系列/宝物×66/武器×12/弹药/药品/护甲/怪物×8/难度×4/皮肤 ============
'use strict';

const RARITIES = {
  common:    { name: '普通', color: '#b8c0cc', glow: 'rgba(184,192,204,.35)', points: 10 },
  rare:      { name: '稀有', color: '#4da6ff', glow: 'rgba(77,166,255,.45)',  points: 25 },
  epic:      { name: '史诗', color: '#b366ff', glow: 'rgba(179,102,255,.5)',  points: 60 },
  legendary: { name: '传说', color: '#ffc233', glow: 'rgba(255,194,51,.55)',  points: 150 },
  mythic:    { name: '神话', color: '#ff5c5c', glow: 'rgba(255,92,92,.6)',   points: 400 },
};
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// unlock: 集齐系列的实物奖励 —— skin=皮肤 / acc=装饰(帽子·光环) / weapon=武器图纸(送1把)
const SERIES = {
  attic:         { name: '阁楼杂物', icon: '🕰️', reward: '皮肤「拾荒鸭」+ 称号「破烂之王」', unlock: { type:'skin', id:'scavenger' } },
  pirate:        { name: '海盗遗产', icon: '🏴‍☠️', reward: '装饰「海盗三角帽」+ 称号「独眼船长」', unlock: { type:'acc', id:'pirate_hat' } },
  civilization:  { name: '失落文明', icon: '🏺', reward: '光环「法老金辉」+ 称号「考古大师」', unlock: { type:'acc', id:'gold_halo' } },
  jewelry:       { name: '珠光宝气', icon: '💎', reward: '光环「宝石虹光」+ 称号「珠光魅影」', unlock: { type:'acc', id:'gem_aura' } },
  occult:        { name: '诡秘藏品', icon: '👁️', reward: '皮肤「幽影皮肤」+ 称号「不信邪」', unlock: { type:'skin', id:'ghost' } },
  manor_relics:  { name: '王庭旧梦', icon: '🏚️', reward: '光环「烛光暖辉」+ 称号「庄园管家」', mapId: 'manor', unlock: { type:'acc', id:'candle_aura' } },
  mine_relics:   { name: '地心结晶', icon: '⛏️', reward: '武器图纸「矿脉鹤嘴镐」(送1把) + 称号「矿脉之友」', mapId: 'mine', unlock: { type:'weapon', id:'pickaxe' } },
  wreck_relics:  { name: '深海秘藏', icon: '⚓', reward: '装饰「船长白帽」+ 称号「打捞大王」', mapId: 'wreck', unlock: { type:'acc', id:'captain_hat' } },
  cath_relics:   { name: '晦暝圣物', icon: '🕯️', reward: '光环「血月凝辉」+ 称号「守夜人」', mapId: 'cathedral', unlock: { type:'acc', id:'blood_halo' } },
  swamp_relics:  { name: '瘴泽遗物', icon: '🌫️', reward: '皮肤「泽蛙蓑衣鸭」+ 称号「涉泽者」', mapId: 'swamp', unlock: { type:'skin', id:'swampduck' } },
  ice_relics:    { name: '永冻奇物', icon: '❄️', reward: '光环「霜华冷辉」+ 称号「破冰者」', mapId: 'icecave', unlock: { type:'acc', id:'frost_halo' } },
  mythic_relics: { name: '神话遗物', icon: '✨', reward: '皮肤「午夜神鸭」+ 称号「午夜馆长」', unlock: { type:'skin', id:'midnight' } },
};

// 装饰（帽子/光环）：集齐对应系列解锁，配装界面选择
const ACCESSORIES = {
  pirate_hat:  { id:'pirate_hat',  name:'海盗三角帽', icon:'🏴‍☠️', kind:'hat',  style:'pirate',  requires:'pirate' },
  captain_hat: { id:'captain_hat', name:'船长白帽',   icon:'⚓',   kind:'hat',  style:'captain', requires:'wreck_relics' },
  gold_halo:   { id:'gold_halo',   name:'法老金辉',   icon:'🏺',   kind:'aura', color:'255,210,80',  requires:'civilization' },
  gem_aura:    { id:'gem_aura',    name:'宝石虹光',   icon:'💎',   kind:'aura', color:'rainbow',     requires:'jewelry' },
  candle_aura: { id:'candle_aura', name:'烛光暖辉',   icon:'🕯️',  kind:'aura', color:'255,170,90',  requires:'manor_relics' },
  blood_halo:  { id:'blood_halo',  name:'血月凝辉',   icon:'🍷',   kind:'aura', color:'220,60,80',   requires:'cath_relics' },
  frost_halo:  { id:'frost_halo',  name:'霜华冷辉',   icon:'❄️',  kind:'aura', color:'150,220,255', requires:'ice_relics' },
};

// effect.kind: 'carry' 携带被动 | 'pickup' 拾取瞬发；mapId: 地图专属掉落
const TREASURES = [
  // —— 阁楼杂物 ——
  { id:'marble',          name:'玻璃弹珠',   series:'attic', rarity:'common', value:20,  size:1, icon:'🔵', flavor:'对着光看，里面好像有一颗星星。' },
  { id:'coin_pouch',      name:'铜币袋',     series:'attic', rarity:'common', value:25,  size:1, icon:'💰', flavor:'叮当作响。大部分其实是纽扣。' },
  { id:'chipped_teacup',  name:'缺角的茶杯', series:'attic', rarity:'common', value:25,  size:1, icon:'🍵', flavor:'据说某位女王用它喝过茶，然后摔了它。' },
  { id:'rusty_watch',     name:'生锈的怀表', series:'attic', rarity:'common', value:30,  size:1, icon:'⌚', flavor:'永远停在午夜十二点。' },
  { id:'old_lamp',        name:'旧油灯',     series:'attic', rarity:'rare',   value:90,  size:1, icon:'🪔', flavor:'擦了三次，什么也没冒出来。' },
  { id:'brass_telescope', name:'黄铜望远镜', series:'attic', rarity:'rare',   value:100, size:2, icon:'🔭', flavor:'能看得很远——除了背后。' },
  // —— 海盗遗产 ——
  { id:'rum_flask',   name:'朗姆酒壶',   series:'pirate', rarity:'common',    value:35,  size:1, icon:'🍶', flavor:'壶是空的，船长的忧伤是满的。' },
  { id:'gold_tooth',  name:'金牙',       series:'pirate', rarity:'common',    value:45,  size:1, icon:'🦷', flavor:'从谁嘴里来的，最好别问。' },
  { id:'jolly_ring',  name:'骷髅旗戒指', series:'pirate', rarity:'rare',      value:110, size:1, icon:'💀', flavor:'戴上它，感觉自己嚣张了不少。' },
  { id:'compass',     name:'航海罗盘',   series:'pirate', rarity:'rare',      value:130, size:1, icon:'🧭', flavor:'指针永远指向最近的宝箱。',
    effect:{ kind:'pickup', type:'chest_arrow', dur:6, desc:'拾取时：指向最近的未开宝箱 6 秒' } },
  { id:'map_page',    name:'藏宝图残页', series:'pirate', rarity:'epic',      value:260, size:2, icon:'🗺️', flavor:'X 标记的地方……就是这里？',
    effect:{ kind:'pickup', type:'gold_arrow', dur:8, desc:'拾取时：指向一个高级宝箱 8 秒' } },
  { id:'golden_eye',  name:'船长的黄金义眼', series:'pirate', rarity:'legendary', value:550, size:2, icon:'👁️', flavor:'它还在看着你。' },
  // —— 失落文明 ——
  { id:'clay_tablet',     name:'楔形文字泥板', series:'civilization', rarity:'common',    value:40,  size:2, icon:'🧱', flavor:'翻译过来是一张五千年前的购物清单。' },
  { id:'bronze_mask',     name:'青铜小面具',   series:'civilization', rarity:'rare',      value:95,  size:1, icon:'🎭', flavor:'笑容保持了三千年，敬业。' },
  { id:'scarab',          name:'圣甲虫护符',   series:'civilization', rarity:'rare',      value:140, size:1, icon:'🪲', flavor:'在黑暗里微微发烫。' },
  { id:'jade_bird',       name:'玉雕神鸟',     series:'civilization', rarity:'epic',      value:280, size:2, icon:'🦜', flavor:'羽毛的纹路细得不像人手雕的。' },
  { id:'sun_disc',        name:'太阳历石盘',   series:'civilization', rarity:'epic',      value:350, size:3, icon:'🌞', flavor:'预言世界终结于……下个周二？' },
  { id:'pharaoh_scepter', name:'法老权杖',     series:'civilization', rarity:'legendary', value:650, size:3, icon:'🐍', flavor:'拿着它，走路都想横着走。' },
  // —— 珠光宝气 ——
  { id:'pearl_necklace', name:'珍珠项链',     series:'jewelry', rarity:'rare',      value:120, size:1, icon:'📿', flavor:'每一颗都数过了，别多想。' },
  { id:'ruby_brooch',    name:'红宝石胸针',   series:'jewelry', rarity:'rare',      value:150, size:1, icon:'🔻', flavor:'在火光下像一小团不肯熄灭的火。' },
  { id:'sapphire_ring',  name:'蓝宝石戒指',   series:'jewelry', rarity:'epic',      value:240, size:1, icon:'💍', flavor:'盒子比戒指还贵——可惜盒子丢了。' },
  { id:'jade_bracelet',  name:'翡翠手镯',     series:'jewelry', rarity:'epic',      value:300, size:1, icon:'🍀', flavor:'凉的。一直是凉的。' },
  { id:'royal_crown',    name:'皇家王冠',     series:'jewelry', rarity:'legendary', value:700, size:3, icon:'👑', flavor:'它的重量提醒你：王位不好坐。' },
  { id:'pink_diamond',   name:'粉钻「晨曦」', series:'jewelry', rarity:'legendary', value:800, size:2, icon:'💎', flavor:'传说见过它的人，心跳都会漏一拍。' },
  // —— 诡秘藏品 ——
  { id:'stitched_doll',    name:'缝合玩偶',   series:'occult', rarity:'common',    value:50,  size:1, icon:'🧸', flavor:'它的纽扣眼睛……刚才是不是转了一下？' },
  { id:'music_box',        name:'无声八音盒', series:'occult', rarity:'rare',      value:130, size:1, icon:'🎵', flavor:'转动发条，怪物会停下来听。',
    effect:{ kind:'pickup', type:'stun', radius:280, dur:2.5, desc:'拾取时：附近怪物驻足聆听 2.5 秒' } },
  { id:'crystal_ball',     name:'占卜水晶球', series:'occult', rarity:'epic',      value:270, size:2, icon:'🔮', flavor:'一切潜伏之物，无所遁形。',
    effect:{ kind:'pickup', type:'reveal', dur:4, desc:'拾取时：全图怪物显形 4 秒' } },
  { id:'ghost_lantern',    name:'幽灵提灯',   series:'occult', rarity:'epic',      value:320, size:2, icon:'🏮', flavor:'灯芯烧的不是油。',
    effect:{ kind:'carry', vision:0.15, desc:'携带时：视野半径 +15%' } },
  { id:'winking_portrait', name:'会眨眼的画像', series:'occult', rarity:'legendary', value:600, size:4, icon:'🖼️', flavor:'别与它对视太久。',
    effect:{ kind:'carry', detect:0.10, desc:'诅咒：携带时怪物索敌范围 +10%' } },
  { id:'monster_fang',     name:'怪物的獠牙', series:'occult', rarity:'legendary', value:666, size:1, icon:'🦴', flavor:'只有从最凶的家伙眼皮底下才捡得到。', minDifficulty:'hard' },
  // —— 王庭旧梦（遗忘庄园专属）——
  { id:'silver_candelabra', name:'银烛台',     series:'manor_relics', rarity:'common',    value:45,  size:1, icon:'🕯️', flavor:'烛泪凝固成了小小的钟乳石。', mapId:'manor' },
  { id:'stopped_clock',     name:'停摆的座钟', series:'manor_relics', rarity:'rare',      value:100, size:2, icon:'🕰️', flavor:'它停下的那一刻，庄园也停了。', mapId:'manor' },
  { id:'yellowed_letter',   name:'泛黄的情书', series:'manor_relics', rarity:'rare',      value:120, size:1, icon:'💌', flavor:'落款处的名字被泪水晕开了。', mapId:'manor' },
  { id:'duchess_fan',       name:'女爵的折扇', series:'manor_relics', rarity:'epic',      value:290, size:1, icon:'🎐', flavor:'扇面上绣着一场再没跳完的舞。', mapId:'manor' },
  { id:'blood_painting',    name:'血色油画',   series:'manor_relics', rarity:'epic',      value:340, size:3, icon:'🎨', flavor:'画里的晚宴，每天都少一位客人。', mapId:'manor' },
  { id:'manor_deed',        name:'庄园地契',   series:'manor_relics', rarity:'legendary', value:720, size:2, icon:'📜', flavor:'恭喜，你现在是这里的主人了。连同里面的住户。', mapId:'manor' },
  // —— 地心结晶（幽暗矿洞专属）——
  { id:'coal_bird',      name:'煤精雕鸟',   series:'mine_relics', rarity:'common',    value:40,  size:1, icon:'🐦', flavor:'矿工闲暇时刻下的小玩意，还带着体温。', mapId:'mine' },
  { id:'miner_headlamp', name:'矿工的头灯', series:'mine_relics', rarity:'rare',      value:110, size:1, icon:'🔦', flavor:'主人没能走出来，灯还亮着。',
    effect:{ kind:'carry', vision:0.10, desc:'携带时：视野半径 +10%' }, mapId:'mine' },
  { id:'silver_ore',     name:'银矿原石',   series:'mine_relics', rarity:'rare',      value:125, size:2, icon:'🪨', flavor:'沉甸甸的，像揣了一小块月亮。', mapId:'mine' },
  { id:'amethyst',       name:'紫晶簇',     series:'mine_relics', rarity:'epic',      value:300, size:2, icon:'💜', flavor:'在黑暗里自己会发光，像不肯睡的眼睛。', mapId:'mine' },
  { id:'core_amber',     name:'地心琥珀',   series:'mine_relics', rarity:'epic',      value:360, size:2, icon:'🟠', flavor:'里面封着一只谁也叫不出名字的虫。', mapId:'mine' },
  { id:'star_iron',      name:'恒星陨铁',   series:'mine_relics', rarity:'legendary', value:750, size:3, icon:'☄️', flavor:'一颗星星的骨头。', mapId:'mine' },
  // —— 深海秘藏（沉船湾专属）——
  { id:'sea_glass',      name:'海玻璃',       series:'wreck_relics', rarity:'common',    value:35,  size:1, icon:'🔷', flavor:'大海花了三十年，把碎瓶子磨成宝石。', mapId:'wreck' },
  { id:'nautilus',       name:'鹦鹉螺壳',     series:'wreck_relics', rarity:'rare',      value:105, size:1, icon:'🐚', flavor:'贴在耳边，能听到那晚的风暴。', mapId:'wreck' },
  { id:'captain_log',    name:'船长航海日志', series:'wreck_relics', rarity:'rare',      value:135, size:1, icon:'📔', flavor:'最后一页只写了四个字：它上船了。', mapId:'wreck' },
  { id:'deep_pearl',     name:'深海夜明珠',   series:'wreck_relics', rarity:'epic',      value:310, size:1, icon:'🦪', flavor:'深海里唯一的路灯。',
    effect:{ kind:'carry', vision:0.08, desc:'携带时：视野半径 +8%' }, mapId:'wreck' },
  { id:'mermaid_scale',  name:'人鱼之鳞',     series:'wreck_relics', rarity:'epic',      value:330, size:1, icon:'🐟', flavor:'摸上去还是湿的，永远是湿的。', mapId:'wreck' },
  { id:'ghost_shipbell', name:'幽灵船钟',     series:'wreck_relics', rarity:'legendary', value:700, size:3, icon:'🔔', flavor:'敲响它，听见的不止是你。',
    effect:{ kind:'pickup', type:'stun', radius:240, dur:2, desc:'拾取时：附近怪物驻足 2 秒' }, mapId:'wreck' },
  // —— 晦暝圣物（血月教堂专属）——
  { id:'dead_candle',    name:'熄灭的圣烛',   series:'cath_relics', rarity:'common',    value:50,  size:1, icon:'🥀', flavor:'它见过太多不该见的东西，自己吹灭了自己。', mapId:'cathedral' },
  { id:'rose_window',    name:'破碎的玫瑰窗', series:'cath_relics', rarity:'rare',      value:115, size:2, icon:'⛪', flavor:'月光穿过它，落在地上是红色的。', mapId:'cathedral' },
  { id:'silver_cross',   name:'银十字',       series:'cath_relics', rarity:'rare',      value:130, size:1, icon:'✝️', flavor:'握久了，掌心会安静下来。', mapId:'cathedral' },
  { id:'penitent_beads', name:'忏悔者的念珠', series:'cath_relics', rarity:'epic',      value:320, size:1, icon:'📿', flavor:'一百零八颗，颗颗都数到一半就断了。', mapId:'cathedral' },
  { id:'blood_grail',    name:'血月圣杯',     series:'cath_relics', rarity:'legendary', value:760, size:3, icon:'🍷', flavor:'杯中之物，饮者自愈。',
    effect:{ kind:'pickup', type:'heal', amount:30, desc:'拾取时：恢复 30 点生命' }, mapId:'cathedral' },
  { id:'fallen_feather', name:'堕天使之羽',   series:'cath_relics', rarity:'legendary', value:888, size:2, icon:'🕊️', flavor:'落下来的时候，整座教堂都听见了。', mapId:'cathedral', minDifficulty:'hell' },
  // —— 瘴泽遗物（迷雾沼泽专属）——
  { id:'peat_carving',   name:'泥炭木雕',   series:'swamp_relics', rarity:'common',    value:40,  size:1, icon:'🪵', flavor:'在沼底睡了八百年，木纹变成了石纹。', mapId:'swamp' },
  { id:'glow_mushroom',  name:'萤火菌灯',   series:'swamp_relics', rarity:'rare',      value:115, size:1, icon:'🍄', flavor:'沼泽居民的路灯，摘下来还能亮很久。',
    effect:{ kind:'carry', vision:0.08, desc:'携带时：视野半径 +8%' }, mapId:'swamp' },
  { id:'gator_tooth',    name:'沼泽鳄牙',   series:'swamp_relics', rarity:'rare',      value:125, size:1, icon:'🐊', flavor:'齿痕的主人还在某片水下等着。', mapId:'swamp' },
  { id:'voodoo_totem',   name:'巫毒图腾',   series:'swamp_relics', rarity:'epic',      value:315, size:2, icon:'🗿', flavor:'雕的是谁？最好永远别对上号。', mapId:'swamp' },
  { id:'miasma_crystal', name:'瘴母结晶',   series:'swamp_relics', rarity:'epic',      value:345, size:2, icon:'💚', flavor:'迷雾的心脏，还在缓缓搏动。', mapId:'swamp' },
  { id:'frog_crown',     name:'泽王蛙冠',   series:'swamp_relics', rarity:'legendary', value:740, size:2, icon:'🐸', flavor:'沼泽之王的加冕之物。呱。', mapId:'swamp' },
  // —— 永冻奇物（冰湖洞窟专属）——
  { id:'ice_core',      name:'千年冰芯',   series:'ice_relics', rarity:'common',    value:40,  size:1, icon:'🧊', flavor:'一千个冬天，压缩成一小块透明。', mapId:'icecave' },
  { id:'frozen_rose',   name:'冻结的玫瑰', series:'ice_relics', rarity:'rare',      value:110, size:1, icon:'🌹', flavor:'开到一半被按下了暂停键。', mapId:'icecave' },
  { id:'aurora_shard',  name:'极光碎片',   series:'ice_relics', rarity:'rare',      value:140, size:1, icon:'🌈', flavor:'夜空掉下来的一小片。',
    effect:{ kind:'pickup', type:'reveal', dur:3, desc:'拾取时：全图怪物显形 3 秒' }, mapId:'icecave' },
  { id:'mammoth_ivory', name:'猛犸牙雕',   series:'ice_relics', rarity:'epic',      value:310, size:3, icon:'🦣', flavor:'雕的是一群向南迁徙的巨兽，没走到。', mapId:'icecave' },
  { id:'eternal_snow',  name:'不化雪',     series:'ice_relics', rarity:'epic',      value:350, size:1, icon:'❄️', flavor:'握在手心也不化，反而是手越来越凉。', mapId:'icecave' },
  { id:'frozen_heart',  name:'冰封的心脏', series:'ice_relics', rarity:'legendary', value:780, size:2, icon:'💙', flavor:'还在跳。很慢，但还在跳。', mapId:'icecave' },
  // —— 神话遗物（每局全图至多 1 件）——
  { id:'ocean_heart',   name:'海洋之心',     series:'mythic_relics', rarity:'mythic', value:1200, size:4, icon:'🌊', flavor:'整片深海的叹息，凝成了这一滴。' },
  { id:'moon_tear',     name:'月神之泪',     series:'mythic_relics', rarity:'mythic', value:1250, size:3, icon:'🌙', flavor:'月光为你引路。',
    effect:{ kind:'carry', vision:0.05, exitArrow:true, desc:'携带时：视野 +5%，且始终指示撤离点方向' } },
  { id:'hourglass',     name:'时之沙漏',     series:'mythic_relics', rarity:'mythic', value:1300, size:4, icon:'⏳', flavor:'时间也会为你屏住呼吸。',
    effect:{ kind:'pickup', type:'slow_all', factor:0.5, dur:5, desc:'拾取时：全场怪物减速 50%，持续 5 秒' } },
  { id:'eternal_ember', name:'不灭火种',     series:'mythic_relics', rarity:'mythic', value:1400, size:4, icon:'🔥', flavor:'从人类第一堆篝火燃到现在。',
    effect:{ kind:'carry', vision:0.25, detect:0.15, desc:'携带时：视野 +25%，但火光引怪（索敌 +15%）' } },
  { id:'world_seed',    name:'世界树种子',   series:'mythic_relics', rarity:'mythic', value:1500, size:5, icon:'🌱', flavor:'埋下它的人，会看到新的世界。', minDifficulty:'hard' },
  { id:'midnight_crown',name:'「午夜」皇冠', series:'mythic_relics', rarity:'mythic', value:2000, size:6, icon:'✨', flavor:'图鉴的最后一页。', unlockAll:true },
];
const TREASURE_BY_ID = Object.fromEntries(TREASURES.map(t => [t.id, t]));

// ============ 武器（耐久/射程/击退/重量）============
const WEAPONS = {
  fists:    { id:'fists',    name:'鸭拳',           icon:'🐤', melee:true, dmg:5,  rate:1.6, range:44, knock:80,  dur:Infinity, weight:0,   price:null, desc:'走投无路时的最后尊严。' },
  pan:      { id:'pan',      name:'平底锅',         icon:'🍳', melee:true, dmg:18, rate:1.7, range:60, knock:260, dur:80,  weight:1,   price:60,   repairCost:0.4, desc:'铛！近战经典，无需弹药。' },
  dagger:   { id:'dagger',   name:'影袭匕首',       icon:'🗡️', melee:true, dmg:22, rate:2.2, range:48, knock:60,  dur:70,  weight:0.5, price:450,  repairCost:0.8, silent:true, backstab:3, desc:'潜行者的獠牙：无声，且背刺未察觉的怪物造成 3 倍伤害。' },
  pistol:   { id:'pistol',   name:'嘎嘎-9 手枪',    icon:'🔫', dmg:14, rate:3.0, speed:560, range:480, knock:90,  ammo:'light', spread:0.05,  mag:12, reload:1.0, dur:70,  weight:1,   price:300,  repairCost:0.8, desc:'可靠的入门火力，指哪嘎哪。' },
  revolver: { id:'revolver', name:'老公爵 左轮',    icon:'🤠', dmg:30, rate:1.6, speed:620, range:520, knock:170, ammo:'light', spread:0.02,  mag:6, reload:1.6, dur:55,  weight:1.5, price:700,  repairCost:1.2, desc:'六发威严。慢，但每一发都算数。' },
  smg:      { id:'smg',      name:'泡泡冲锋枪',     icon:'🫧', dmg:8,  rate:8.5, speed:520, range:360, knock:50,  ammo:'light', spread:0.13,  mag:32, reload:1.4, dur:150, weight:2,   price:900,  repairCost:0.9, desc:'泼水一样的弹幕，费子弹。' },
  shotgun:  { id:'shotgun',  name:'老铁桶 双管',    icon:'💥', dmg:8,  rate:1.1, speed:480, range:240, knock:110, ammo:'shell', spread:0.30,  pellets:6, durPerShot:2, mag:2, reload:1.5, dur:60, weight:2.5, price:1300, repairCost:1.8, desc:'一次六颗铁砂，贴脸没有怪。' },
  frost:    { id:'frost',    name:'寒霜喷罐',       icon:'🧯', dmg:4,  rate:2.5, speed:300, range:170, knock:40,  ammo:'cell',  spread:0.45,  pellets:5, mag:24, reload:1.3, dur:80, weight:2, price:1600, repairCost:1.5, slow:2, desc:'一片冰雾，命中的怪物减速 2 秒。' },
  crossbow: { id:'crossbow', name:'静音鹅 弩',      icon:'🏹', dmg:38, rate:1.0, speed:700, range:640, knock:120, ammo:'heavy', spread:0.005, mag:1, reload:1.1, dur:50,  weight:2,   price:1500, repairCost:2.0, silent:true, homing:{ cone:1.7, dist:600, turn:13 }, desc:'无声无息，箭矢如活物般咬住猎物拐弯追杀。' },
  rifle:    { id:'rifle',    name:'长颈鹅 栓动步枪', icon:'🎯', dmg:50, rate:0.9, speed:780, range:900, knock:200, ammo:'heavy', spread:0.01,  pierce:3, mag:5, reload:1.9, dur:45, weight:3, price:2200, repairCost:2.5, desc:'一枪穿三个，绅士的选择。' },
  cannon:   { id:'cannon',   name:'轰天雷',         icon:'🧨', dmg:60, rate:0.6, speed:420, range:520, knock:300, ammo:'shell', spread:0.02,  durPerShot:2, mag:1, reload:2.2, dur:40, weight:3, price:2600, repairCost:3.0, explosive:90, desc:'炮弹落点 90 范围内的怪一起上天。动静极大。' },
  laser:    { id:'laser',    name:'嘎嘎射线',       icon:'⚡', dmg:13, rate:7.0, speed:1500, range:700, knock:40, ammo:'cell',  spread:0.01,  pierce:2, mag:24, reload:1.2, dur:90, weight:2, price:3000, repairCost:3.0, desc:'来自未来的鸭科技，贯穿一切。' },
  flamer:   { id:'flamer',   name:'火舌喷灯',       icon:'🔥', dmg:5,  rate:10,  speed:260, range:190, knock:20,  ammo:'cell',  spread:0.30,  pellets:2, mag:45, reload:1.8, dur:150, weight:2.5, price:2400, repairCost:2.0, burn:2.5, desc:'一条火舌舔过去，怪物边跑边烧。' },
  freezer:  { id:'freezer',  name:'急冻线圈枪',     icon:'❄️', dmg:8,  rate:1.4, speed:520, range:420, knock:60,  ammo:'cell',  spread:0.02,  mag:8, reload:1.4, dur:70,  weight:2, price:2000, repairCost:2.2, freeze:1.3, desc:'命中直接冻成冰坨，动弹不得 1.3 秒。' },
  sniper:   { id:'sniper',   name:'鹅王·穿云',      icon:'🛰️', dmg:90, rate:0.5, speed:1100, range:1400, knock:340, ammo:'heavy', spread:0.002, pierce:4, durPerShot:2, mag:3, reload:2.1, dur:35, weight:4, price:4500, repairCost:4.0, desc:'超越视野的一枪。听到枪声时子弹已经到了。' },
  ak:       { id:'ak',       name:'AK-鸭7 突击步枪', icon:'🥖', dmg:16, rate:6.0, speed:640, range:520, knock:110, ammo:'light', spread:0.07, mag:30, reload:1.6, dur:120, weight:2.5, price:1900, repairCost:1.6, sfx:'ak', desc:'哒哒哒哒。可靠、暴躁、永远不卡壳（大概）。' },
  mg3:      { id:'mg3',      name:'MG3 通用机枪',    icon:'⛓️', dmg:12, rate:11,  speed:700, range:560, knock:90,  ammo:'heavy', spread:0.10, mag:60, reload:2.6, dur:160, weight:4.5, price:3400, repairCost:2.8, sfx:'mg', desc:'泼出一整条金属风暴，换弹时记得找掩体。' },
  rpg:      { id:'rpg',      name:'呱牛 RPG',       icon:'🚀', dmg:85, rate:0.7, speed:520, range:700, knock:340, ammo:'shell', spread:0.01,  durPerShot:2, mag:1, reload:2.4, dur:40, weight:3.5, price:3800, repairCost:3.5, explosive:110, desc:'肩上一响，黄金万两。落点 110 半径灰飞烟灭。' },
  pickaxe:  { id:'pickaxe',  name:'矿脉鹤嘴镐',     icon:'⛏️', melee:true, dmg:26, rate:1.4, range:62, knock:240, dur:120, weight:1.5, price:800, repairCost:0.6, requires:'mine_relics', desc:'集齐「地心结晶」解锁。刨矿刨怪，一镐两用。' },
};
const AMMO_TYPES = {
  light: { name:'轻型子弹', icon:'🔹', pack:30, price:120 },
  shell: { name:'霰弹',     icon:'🔸', pack:10, price:100 },
  heavy: { name:'重型子弹', icon:'🔺', pack:10, price:180 },
  cell:  { name:'能量电池', icon:'🔋', pack:20, price:320 },
};

// ============ 药品/增益（Tab/K 切换，Q/M 使用）============
const CONSUMABLES = {
  bandage:    { name:'医疗绷带', icon:'🩹', price:100, heal:55, desc:'恢复 55 点生命' },
  soda:       { name:'能量汽水', icon:'🥤', price:80,  speedMul:1.3, dur:8, desc:'移速 +30%，持续 8 秒' },
  adrenaline: { name:'肾上腺素', icon:'💉', price:180, heal:25, speedMul:1.4, dur:5, desc:'恢复 25 生命 + 移速 +40% 5 秒' },
  stealth:    { name:'隐身药剂', icon:'🌫️', price:260, invis:10, desc:'10 秒内怪物看不见你（仍能听见）' },
  rage:       { name:'狂暴药剂', icon:'😡', price:220, dmgMul:1.5, dur:12, desc:'伤害 +50%，持续 12 秒' },
  eagle:      { name:'鹰眼药剂', icon:'🦅', price:160, reveal:8, desc:'全图怪物显形 8 秒' },
};
const CONSUM_ORDER = ['bandage', 'soda', 'adrenaline', 'stealth', 'rage', 'eagle'];

// ============ 护甲与装备（有耐久池，阵亡丢失，可维修）============
const ARMORS = {
  leather: { id:'leather', name:'鸭绒软甲',   icon:'🦺', pool:40,  absorb:0.6, weight:1, price:500,  repairCost:1.0, desc:'挡下 60% 伤害，直到甲片碎光。轻便。' },
  iron:    { id:'iron',    name:'铁桶胸甲',   icon:'🛡️', pool:90,  absorb:0.7, weight:3, price:1400, repairCost:1.5, desc:'挡下 70% 伤害。有点沉。' },
  knight:  { id:'knight',  name:'骑士全甲',   icon:'⚔️', pool:160, absorb:0.8, weight:5, price:3000, repairCost:2.0, desc:'挡下 80% 伤害。走起来像个铁皮罐头。' },
};
const GEAR = {
  pouch: { id:'pouch', name:'鸭皮腰包', icon:'👝', price:900, extraSlots:3, weight:0.5, desc:'背包 +3 格。阵亡会连包一起丢。' },
};

// ============ 负重系统 ============
// 总重 = 背包占格 + 武器重量 + 护甲重量 + 腰包重量；容量基准 14
const WEIGHT_CAP = 14;
// 移速: 轻装(≤35%) 1.08 | 标准 1.0→0.92 | 重装(≥80%) 0.85 | 超载(≥100%) 0.75
function weightSpeedMul(f) {
  if (f <= 0.35) return 1.08;
  if (f >= 1.0) return 0.75;
  if (f >= 0.8) return 0.85;
  return 1.0 - (f - 0.35) * (0.08 / 0.45);
}
// 脚步声半径倍率 & 被怪物看见的距离倍率：越重越吵越显眼
function weightNoiseMul(f)  { return 0.7 + f * 0.6; }
function weightDetectMul(f) { return 0.92 + f * 0.2; }

// ============ 怪物种类 ============
const MONSTER_TYPES = {
  shade:    { id:'shade',    name:'幽影',     hpMul:1,    spdMul:1,    dmgMul:1,   visMul:1,    r:16, kbMul:1,   dasher:true },
  skitter:  { id:'skitter',  name:'疾爪蝠',   hpMul:0.55, spdMul:1.5,  dmgMul:0.7, visMul:0.85, r:12, kbMul:1.6, zigzag:true },
  brute:    { id:'brute',    name:'石巨魁',   hpMul:2.4,  spdMul:0.6,  dmgMul:1.9, visMul:0.9,  r:22, kbMul:0,   memMul:2.5, windup:0.5, recover:0.7 },
  lurker:   { id:'lurker',   name:'潜伏者',   hpMul:0.9,  spdMul:1.25, dmgMul:1.3, visMul:0.55, r:15, kbMul:1,   ambush:true },
  wisp:     { id:'wisp',     name:'幽火',     hpMul:0.5,  spdMul:1.0,  dmgMul:0.8, visMul:1.1,  r:12, kbMul:1.2, ranged:true },
  slime:    { id:'slime',    name:'裂形泥怪', hpMul:1.2,  spdMul:0.8,  dmgMul:0.9, visMul:0.8,  r:17, kbMul:1.2, splits:true },
  banshee:  { id:'banshee',  name:'尖啸者',   hpMul:0.45, spdMul:1.15, dmgMul:0.5, visMul:1.3,  r:13, kbMul:1.5, screamer:true },
  skeleton: { id:'skeleton', name:'骨戟卫兵', hpMul:1.5,  spdMul:0.85, dmgMul:1.25, visMul:0.95, r:17, kbMul:0.5, shieldFront:true, spit:'bone', windup:0.4, recover:0.55 },
  watcher:  { id:'watcher',  name:'咒眼',     hpMul:0.6,  spdMul:0.7,  dmgMul:0.4, visMul:1.5,  r:14, kbMul:1.3, watcher:true, spit:'blind' },
  mimic:    { id:'mimic',    name:'宝箱怪',   hpMul:1.6,  spdMul:1.25, dmgMul:1.2, visMul:1.1,  r:16, kbMul:0.6 },
  charger:  { id:'charger',  name:'冲撞蛮牛', hpMul:1.3,  spdMul:0.9,  dmgMul:1.4, visMul:1.0,  r:18, kbMul:0.4, charger:true, windup:0.55, recover:0.6 },
  shroom:   { id:'shroom',   name:'毒爆菇',   hpMul:0.8,  spdMul:0.5,  dmgMul:0,   visMul:0.9,  r:14, kbMul:1.3, shroom:true },
  // —— 第七轮新怪（Dungeon Crawl CC0 贴图，机制各异） ——
  warlock:   { id:'warlock',   name:'缚魂术士', hpMul:0.9,  spdMul:0.75, dmgMul:0.6, visMul:1.2,  r:15, kbMul:1,   sprite:'warlock', face:'left',   caster:true,  windup:0.7, recover:0.6 },
  venomsnake:{ id:'venomsnake',name:'毒鳞海蛇', hpMul:0.7,  spdMul:1.3,  dmgMul:0.6, visMul:0.9,  r:13, kbMul:1.4, sprite:'venomsnake', face:'left',poison:4,     spit:'poison', windup:0.28, recover:0.4 },
  stoneling: { id:'stoneling', name:'石肤巨像', hpMul:2.8,  spdMul:0.5,  dmgMul:1.6, visMul:0.8,  r:21, kbMul:0,   sprite:'stonegiantling', windup:0.6, recover:0.8, memMul:2 },
  direwolf:  { id:'direwolf',  name:'暗影恶狼', hpMul:0.6,  spdMul:1.7,  dmgMul:0.8, visMul:1.1,  r:14, kbMul:1.5, sprite:'direwolf', face:'left',  windup:0.25, recover:0.35 },
  leapspider:{ id:'leapspider',name:'跃击蛛',   hpMul:0.8,  spdMul:1.1,  dmgMul:1.0, visMul:1.0,  r:14, kbMul:1.2, sprite:'leapspider',charger:true, windup:0.4, recover:0.5, leap:true },
  scorpion:  { id:'scorpion',  name:'麻痹巨蝎', hpMul:1.2,  spdMul:0.8,  dmgMul:1.1, visMul:0.85, r:16, kbMul:0.7, sprite:'scorpion', face:'left',  paralyze:2,   windup:0.45, recover:0.55 },
  // —— Boss（割草模式三波） ——
  boss_cyclops:     { id:'boss_cyclops',     name:'独眼巨人',   hpMul:1, spdMul:0.55, dmgMul:2.2, visMul:2, r:30, kbMul:0, sprite:'boss_cyclops',     boss:true, windup:0.6, recover:0.6 },
  boss_stormdragon: { id:'boss_stormdragon', name:'风暴巨龙',   hpMul:1, spdMul:0.7,  dmgMul:1.8, visMul:2, r:30, kbMul:0, sprite:'boss_stormdragon', face:'left', boss:true, windup:0.5, recover:0.5 },
  boss_lich:        { id:'boss_lich',        name:'巫妖王',     hpMul:1, spdMul:0.6,  dmgMul:1.6, visMul:2, r:26, kbMul:0, sprite:'boss_lich',        boss:true, windup:0.5, recover:0.5 },
};
const HORDE_BOSS_IDS = ['boss_cyclops', 'boss_stormdragon', 'boss_lich'];

// ============ 怪物图鉴档案（击败或被其击中过才解锁） ============
const CODEX_INFO = {
  shade:      { lore:'游荡在废墟里的暗影残魂，永远追着有体温的东西。', hint:'最基础的追猎者，什么流派都能拿它练手。' },
  skitter:    { lore:'翼膜薄得透光的洞穴蝠，飞行轨迹像喝醉了一样。', hint:'走位飘忽但一碰就碎，散射武器的最爱。' },
  brute:      { lore:'石头缝里长出来的巨魁，出拳前会把整条手臂抡圆。', hint:'看到它抬手就翻滚——前摇大，但挨一下半管血。' },
  lurker:     { lore:'趴在地上装成影子的伏击者，眼睛偶尔会闪红光。', hint:'路过可疑阴影先打一枪；被扑到再反应就晚了。' },
  wisp:       { lore:'烧不尽的怨火，隔着老远就往你脸上吐火星。', hint:'唯一的远程杂兵，优先点名，它的吐息弹能躲。' },
  slime:      { lore:'一大坨会分裂的活泥巴，砍一刀变两坨。', hint:'击杀会分裂成两只小泥怪，AOE 收尾最省事。' },
  banshee:    { lore:'嗓子是它唯一的武器——一嗓子能喊来半张地图的怪。', hint:'见到必须秒杀，让它叫出声麻烦就大了。' },
  skeleton:   { lore:'生前是仪仗卫兵，死后还端着长戟保持队形。', hint:'正面子弹被盾牌格挡只吃 35% 伤害，绕背打。' },
  watcher:    { lore:'一颗被诅咒的眼球，凝视着的东西无处可藏。', hint:'被它盯 1.8 秒会全场揭示你的位置，速杀或断视线。' },
  mimic:      { lore:'伪装成宝箱的贪吃鬼，牙缝里还卡着上个冒险者的头盔。', hint:'开神秘箱前留半管体力，随时准备翻滚拉开。' },
  charger:    { lore:'鼻息喷火的蛮牛，刨地三下就直线冲锋。', hint:'冲锋是直线，横向翻滚就能躲，撞墙后它会硬直。' },
  shroom:     { lore:'剧毒孢子撑起来的伞菇，靠近就会自爆。', hint:'远程点爆它，毒云还能顺便熏别的怪。' },
  warlock:    { lore:'贩卖灵魂的术士，吟唱时指尖缠着紫黑色的锁链。', hint:'吟唱结束会定身你 1.2 秒——看到抬手就翻滚打断锁定。' },
  venomsnake: { lore:'鳞片渗着毒液的海蛇，咬痕会发绿。', hint:'被咬中毒持续掉血（不致死），带瓶回复药更安心。' },
  stoneling:  { lore:'石肤巨像，皮糙肉厚，击退对它完全无效。', hint:'血牛+免击退，风筝它，别站撸。' },
  direwolf:   { lore:'暗影里的猎手，成群时会从两翼包抄。', hint:'全场最快的杂兵，留一发子弹给身后。' },
  leapspider: { lore:'腿节上有弹簧般的肌腱，八米开外一跃扑脸。', hint:'它蓄力压低身体时就是起跳前兆，侧移即可让它扑空。' },
  scorpion:   { lore:'尾针注射的不是毒，是让肌肉罢工的麻痹素。', hint:'被蜇中会麻痹减速 2 秒，千万别在怪堆里挨这一下。' },
  boss_cyclops:     { lore:'独眼巨人扛着半座山来了。它扔出的巨石会把地面砸出坑。', hint:'掷石有红圈预警，翻滚出圈；近身缠斗反而安全。' },
  boss_stormdragon: { lore:'风暴巨龙的每次俯冲都带着雷云，吐息能犁出一道焦土。', hint:'正面扇形吐息+脚下召雷双威胁，贴着它的侧后方绕圈。' },
  boss_lich:        { lore:'巫妖王生前是知识的殉道者，死后是灾厄本身。', hint:'暗影三连弹可以横向走位躲，优先清掉它召的幽影仆从。' },
};

// ============ 难度 ============
const DIFFICULTIES = {
  easy: {
    id:'easy', name:'简单', icon:'🐣',
    desc:'只有慢吞吞的幽影，适合熟悉地图。',
    spawn:{ shade:4 }, lurkerGuard:false, merchant:false,
    mHp:30, mDmg:12, chaseSpeed:82, patrolSpeed:40, vision:175, hear:220, memory:2, smart:0, huntInterval:0,
    chests:{ wood:10, silver:3, gold:1, mystery:0 },
  },
  normal: {
    id:'normal', name:'普通', icon:'🦆',
    desc:'疾爪蝠、石巨魁、远程幽火与骨戟卫兵登场。',
    spawn:{ shade:4, skitter:2, brute:1, wisp:1, skeleton:1 , venomsnake:1, direwolf:1}, lurkerGuard:false, merchant:0.5,
    mHp:45, mDmg:16, chaseSpeed:106, patrolSpeed:50, vision:235, hear:380, memory:4.5, smart:1, huntInterval:0,
    chests:{ wood:9, silver:5, gold:2, mystery:1 },
  },
  hard: {
    id:'hard', name:'困难', icon:'👹',
    desc:'潜伏者蹲守高级宝箱，咒眼在暗中凝视。神秘商人出没。',
    spawn:{ shade:4, skitter:3, brute:2, lurker:1, wisp:2, slime:1, skeleton:1, watcher:1, charger:1, shroom:1, venomsnake:1, direwolf:1, warlock:1, scorpion:1 }, lurkerGuard:true, merchant:true,
    mHp:70, mDmg:22, chaseSpeed:128, patrolSpeed:58, vision:300, hear:540, memory:8, smart:2, huntInterval:20,
    chests:{ wood:8, silver:6, gold:3, mystery:2 },
  },
  hell: {
    id:'hell', name:'地狱', icon:'🔥',
    desc:'全种类倾巢而出，尖啸者会召集猎杀。宝箱最豪华，商人必定出没。',
    spawn:{ shade:5, skitter:4, brute:3, lurker:2, wisp:3, slime:2, banshee:1, skeleton:2, watcher:1, charger:2, shroom:2, venomsnake:2, direwolf:2, warlock:1, scorpion:1, stoneling:1, leapspider:1 }, lurkerGuard:true, merchant:true,
    mHp:95, mDmg:26, chaseSpeed:138, patrolSpeed:62, vision:330, hear:620, memory:10, smart:2, huntInterval:14,
    chests:{ wood:7, silver:7, gold:4, mystery:2 },
  },
};
const DIFF_RANK = { easy:0, normal:1, hard:2, hell:3 };

// ============ 键位系统：默认布局（可在"键位设置"中自定义，存至 SAVE.settings.keys） ============
const KEY_ACTIONS = [
  ['up', '上移'], ['down', '下移'], ['left', '左移'], ['right', '右移'],
  ['shoot', '射击/攻击'], ['roll', '翻滚'], ['sneak', '潜行'], ['reload', '换弹'],
  ['swap', '切换武器'], ['use', '使用药品'], ['cycle', '切换药品'], ['interact', '开箱/救人/互动'],
  ['pebble', '投石(引开怪物)'],
];
const DEFAULT_KEYS = [
  { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD',
    shoot:'Space', roll:'ShiftLeft', sneak:'CapsLock', reload:'KeyR',
    swap:'KeyQ', use:'KeyE', cycle:'Tab', interact:'KeyF', pebble:'KeyG' },
  { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
    shoot:'Period', roll:'ShiftRight', sneak:'Slash', reload:'KeyI',
    swap:'KeyL', use:'Comma', cycle:'KeyK', interact:'KeyJ', pebble:'KeyO' },
];
// 键码 → 友好显示
function keyLabel(code) {
  const map = { Space:'空格', ShiftLeft:'左Shift', ShiftRight:'右Shift', CapsLock:'Caps',
    Tab:'Tab', Comma:'，', Period:'。', Slash:'/', Semicolon:';', Quote:"'", Backquote:'`',
    ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', Escape:'Esc',
    ControlLeft:'左Ctrl', ControlRight:'右Ctrl', AltLeft:'左Alt', AltRight:'右Alt',
    BracketLeft:'[', BracketRight:']', Minus:'-', Equal:'=', Enter:'回车', Backspace:'退格' };
  if (map[code]) return map[code];
  if (/^Key([A-Z])$/.test(code)) return code.slice(3);
  if (/^Digit(\d)$/.test(code)) return code.slice(5);
  return code;
}

// ============ 收藏家等级（66 件宝物，总点数 5675）============
const COLLECTOR_LEVELS = [
  { need:0,    title:'见习寻宝鸭' },
  { need:500,  title:'寻宝行家' },
  { need:1400, title:'藏品鉴赏家' },
  { need:2800, title:'传奇收藏鸭' },
  { need:4500, title:'午夜馆长' },
];

// ============ 角色皮肤 ============
const SKINS = [
  { id:'duck_yellow', name:'小黄鸭',   kind:'proc',  emoji:'🦆', body:'#ffd93d', wing:'#f0b429' },
  { id:'duck_blue',   name:'蓝羽鸭',   kind:'proc',  emoji:'🦆', body:'#bfe3ff', wing:'#8fc5ee' },
  { id:'duck_pink',   name:'粉桃鸭',   kind:'proc',  emoji:'🦆', body:'#ffb7d0', wing:'#f28bb0' },
  { id:'duck_green',  name:'抹茶鸭',   kind:'proc',  emoji:'🦆', body:'#b8e986', wing:'#8fc65a' },
  { id:'duck_black',  name:'夜行鸭',   kind:'proc',  emoji:'🦆', body:'#5a5a6e', wing:'#3f3f52' },
  { id:'duck_white',  name:'天鹅绒',   kind:'proc',  emoji:'🦆', body:'#f5f2ea', wing:'#d8d2c2' },
  { id:'img_duck',    name:'绿头鸭',   kind:'img',   emoji:'🦆', src:'assets/skins/duck.png',    body:'#3ec46d' },
  { id:'img_chick',   name:'小鸡仔',   kind:'img',   emoji:'🐤', src:'assets/skins/chick.png',   body:'#ffdf6b' },
  { id:'img_penguin', name:'企鹅绅士', kind:'img',   emoji:'🐧', src:'assets/skins/penguin.png', body:'#5a6572' },
  { id:'img_owl',     name:'夜枭',     kind:'img',   emoji:'🦉', src:'assets/skins/owl.png',     body:'#b98a5a' },
  { id:'img_parrot',  name:'鹦鹉水手', kind:'img',   emoji:'🦜', src:'assets/skins/parrot.png',  body:'#ff5c5c' },
  { id:'img_frog',    name:'蛙侠',     kind:'img',   emoji:'🐸', src:'assets/skins/frog.png',    body:'#7ac74f' },
  { id:'img_panda',   name:'滚滚',     kind:'img',   emoji:'🐼', src:'assets/skins/panda.png',   body:'#e8e4dc' },
  { id:'img_pig',     name:'富贵猪',   kind:'img',   emoji:'🐷', src:'assets/skins/pig.png',     body:'#ffb7c5' },
  // —— 集齐系列解锁的奖励皮肤 ——
  { id:'scavenger',   name:'拾荒鸭',     kind:'proc',  emoji:'🧹', body:'#c9a06a', wing:'#a37c48', requires:'attic' },
  { id:'ghost',       name:'幽影皮肤',   kind:'ghost', emoji:'👻', body:'#4a3d6b', wing:'#372c52', requires:'occult' },
  { id:'swampduck',   name:'泽蛙蓑衣鸭', kind:'proc',  emoji:'🐸', body:'#8aa864', wing:'#5f7a42', requires:'swamp_relics' },
  { id:'midnight',    name:'午夜神鸭',   kind:'proc',  emoji:'✨', body:'#2c2440', wing:'#ffd93d', golden:true, requires:'mythic_relics' },
];
function skinUnlocked(s, save) { return (save.settings && save.settings.devMode) || !s.requires || (save.claimedSeriesRewards || []).includes(s.requires); }
function accUnlocked(a, save) { return (save.settings && save.settings.devMode) || (save.claimedSeriesRewards || []).includes(a.requires); }
const SkinImages = {};
function preloadSkins() {
  for (const s of SKINS) if (s.kind === 'img') {
    const im = new Image();
    // 加载后烘焙黑色描边版（八方向剪影扩张），替换原图供绘制
    im.onload = () => {
      const pad = 12, r = 7;
      const c = document.createElement('canvas');
      c.width = im.naturalWidth + pad * 2; c.height = im.naturalHeight + pad * 2;
      const x = c.getContext('2d');
      for (let a = 0; a < 8; a++) x.drawImage(im, pad + Math.cos(a * Math.PI / 4) * r, pad + Math.sin(a * Math.PI / 4) * r);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#100e1d';
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-over';
      x.drawImage(im, pad, pad);
      c.complete = true; c.naturalWidth = c.width;             // 伪装成 Image 供现有判定
      c.drawScale = c.width / im.naturalWidth;                 // 绘制尺寸补偿（含描边内边距）
      SkinImages[s.id] = c;
    };
    // 优先用内联 data-URI（纯文本、无外部依赖）；缺失时回退到 assets/ 下的 png
    im.src = (typeof SKIN_DATA_URI !== 'undefined' && SKIN_DATA_URI[s.id]) ? SKIN_DATA_URI[s.id] : s.src;
    SkinImages[s.id] = im;
  }
}

// ============ 宝箱 ============
const CHEST_TIERS = {
  wood:    { name:'木箱',   openTime:1.2, drops:{common:70, rare:25, epic:5},                 ammoChance:0.35, bandageChance:0.10 },
  silver:  { name:'银箱',   openTime:1.5, drops:{common:40, rare:40, epic:17, legendary:3},   ammoChance:0.45, bandageChance:0.15 },
  gold:    { name:'金箱',   openTime:2.0, drops:{rare:35, epic:45, legendary:17, mythic:3},   ammoChance:0.60, bandageChance:0.20 },
  mystery: { name:'神秘箱', openTime:2.0, drops:{rare:30, epic:45, legendary:20, mythic:5},   ammoChance:0.60, bandageChance:0.20, mimicChance:0.35 },
};

// ============ 开箱掉落 ============
// ctx: { difficulty, mapId, mythicSpawned:{v}, save }
function rollTreasure(tier, ctx) {
  const table = { ...CHEST_TIERS[tier].drops };
  const save = ctx.save;
  if (save.pity >= 20) { delete table.common; delete table.rare; if (!table.epic && !table.legendary && !table.mythic) table.epic = 100; }
  if (ctx.mythicSpawned.v) delete table.mythic;

  let rarity = weightedPick(table);
  let pool = eligibleTreasures(rarity, ctx);
  let ri = RARITY_ORDER.indexOf(rarity);
  while (pool.length === 0 && ri > 0) { ri--; rarity = RARITY_ORDER[ri]; pool = eligibleTreasures(rarity, ctx); }
  if (pool.length === 0) pool = eligibleTreasures('common', ctx);

  const weights = {};
  for (const t of pool) {
    const e = save.codex[t.id];
    let w = (e && e.state === 'collected') ? 10 : 15;   // 未收录 ×1.5
    if (t.mapId) w *= 1.6;                              // 地图专属在本图更常见
    weights[t.id] = w;
  }
  const picked = TREASURE_BY_ID[weightedPick(weights)];
  if (picked.rarity === 'mythic') ctx.mythicSpawned.v = true;
  if (picked.rarity === 'epic' || picked.rarity === 'legendary' || picked.rarity === 'mythic') save.pity = 0;
  else save.pity++;
  return picked;
}

function eligibleTreasures(rarity, ctx) {
  return TREASURES.filter(t => {
    if (t.rarity !== rarity) return false;
    if (t.mapId && t.mapId !== ctx.mapId) return false;                                   // 地图专属
    if (t.minDifficulty && DIFF_RANK[ctx.difficulty] < DIFF_RANK[t.minDifficulty]) return false;
    if (t.unlockAll) {
      const others = TREASURES.filter(x => x.id !== t.id);
      if (!others.every(x => ctx.save.codex[x.id] && ctx.save.codex[x.id].state === 'collected')) return false;
    }
    return true;
  });
}

function weightedPick(table) {
  let total = 0;
  for (const k in table) total += table[k];
  let r = Math.random() * total;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// ============ 神秘商人 V2 ============
// 必有 1 件特价高级武器 + 药剂礼包 + 好护甲；割草模式追加专属强力服务
function merchantStock(isHorde) {
  const stock = [];
  const push = (kind, id, price, label, icon, note) => stock.push({ kind, id, price, label, icon, note });
  // ① 特价高级武器（85 折）
  const bigGuns = ['rifle', 'cannon', 'sniper', 'laser', 'crossbow', 'flamer', 'freezer'];
  const gw = WEAPONS[bigGuns[Math.floor(Math.random() * bigGuns.length)]];
  push('weapon', gw.id, Math.ceil(gw.price * 0.85), gw.name, gw.icon, '特价85折');
  // ② 药剂大礼包（随机 3 瓶强力药剂）
  const strong = ['adrenaline', 'stealth', 'rage', 'eagle'].sort(() => Math.random() - 0.5).slice(0, 3);
  const packPrice = Math.ceil(strong.reduce((s, k) => s + CONSUMABLES[k].price, 0) * 0.9);
  push('potionpack', strong.join(','), packPrice, `药剂礼包(${strong.map(k => CONSUMABLES[k].icon).join('')})`, '🎁', '9折');
  // ③ 上等护甲（9 折）
  const arm = Math.random() < 0.5 ? ARMORS.knight : ARMORS.iron;
  push('armor', arm.id, Math.ceil(arm.price * 0.9), arm.name, arm.icon, '9折');
  // ④ 弹药一组
  const ak = Object.keys(AMMO_TYPES)[Math.floor(Math.random() * 4)];
  push('ammo', ak, Math.ceil(AMMO_TYPES[ak].price * 1.1), `${AMMO_TYPES[ak].name} ×${AMMO_TYPES[ak].pack}`, AMMO_TYPES[ak].icon);
  // ⑤ 割草/大逃亡：现场招募佣兵（招募流的局内入口！随机两位上架）
  if (isHorde) {
    const heroes = ['guard', 'vet', 'ace', 'sniper', 'priest', 'archer', 'mage', 'marine', 'flamerguy'].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const hid of heroes) {
      const h = MERCS[hid];
      push('merc', h.id, Math.ceil(h.price * 0.9), `招募 ${h.name}`, h.icon, '当场入队·9折');
    }
  }
  if (isHorde) {
    // 割草专属：免费升级券 / 全队回满 / 佣兵王驰援
    push('upgrade', 'upgrade', 600, '强化券（立即三选一）', '⬆️');
    push('healall', 'healall', 350, '全队生命回满', '❤️');
    push('mercace', 'ace', 900, '佣兵王驰援 40 秒', '🦅');
  } else {
    // 经典专属：传说宝物直售（仍需活着带出撤离才计图鉴）
    const legs = TREASURES.filter(t => t.rarity === 'legendary' && !t.mapId && !t.minDifficulty);
    const tr = legs[Math.floor(Math.random() * legs.length)];
    push('treasure', tr.id, Math.ceil(tr.value * 1.4), tr.name, tr.icon, '需带出撤离才入图鉴');
  }
  return stock;
}
const MERCHANT_SELL_RATE = 0.55;

// ============ 雇佣兵（单局雇佣，各 2 次免费试玩）============
const MERCS = {
  guard: { id:'guard', name:'铁嘴保镖',   icon:'🪖', hp:150, dmg:17, rate:1.5, melee:true, range:58, speed:142, price:600,
           color:'#c9853a', desc:'一把铁平底锅走天下，帮你挡刀。' },
  vet:   { id:'vet',   name:'独眼老兵',   icon:'🎖️', hp:200, dmg:15, rate:2.2, range:420, bulletSpeed:560, speed:148, price:1500,
           color:'#7a9c5a', mag:12, reload:1.6, desc:'手枪点射，弹无虚发。' },
  ace:   { id:'ace',   name:'佣兵王·灰羽', icon:'🦅', hp:270, dmg:60, rate:0.8, range:720, bulletSpeed:1100, speed:158, price:3200,
           color:'#8a7ab8', sprite:'m_ace', mag:8, reload:2.0, bossHunter:true,
           desc:'反器材狙击：对 Boss 与精英双倍伤害。老兵管清杂，他管斩首。' },
  sniper:{ id:'sniper', name:'退役传奇·鹰眼', icon:'🎯', hp:190, dmg:150, rate:0.45, range:980, bulletSpeed:1350, speed:150, price:2600,
           color:'#5a7a9c', mag:5, reload:2.2, desc:'超高伤狙击：一枪带走精英。雇佣他，才能唤来爱犬「汪财」。' },
  priest:{ id:'priest', name:'圣光牧师·晨祷', icon:'✨', hp:170, dmg:0, rate:0, heal:15, healCd:2.4, buffCd:7, range:0, speed:152, price:2000,
           color:'#e8d8a0', sprite:'m_priest2', desc:'持杖治疗，并随机施放增益：经验/护甲/回血/移速/狂暴（各有 CD）。' },
  spirit:{ id:'spirit', name:'鸭灵剑士·小碎', icon:'🐥', hp:220, dmg:22, rate:1.6, melee:true, range:74, sword:true, speed:178, price:1000,
           color:'#ffd93d', desc:'从旋风斩里修炼成型的持剑小鸭，横扫近身之敌。别看个头小，剑气很足。' },
  dog:   { id:'dog',   name:'金币嗅探犬·汪财', icon:'🐕', hp:130, dmg:0, rate:0, fetch:560, range:0, speed:210, price:1200, requiresMerc:'sniper',
           color:'#c9a06a', sprite:'fx_dog', desc:'自动叼回经验宝石与金币。只认鹰眼当主人。' },
  archer:{ id:'archer', name:'百变箭手·翎', icon:'🏹', hp:210, dmg:24, rate:1.5, range:640, bulletSpeed:780, speed:150, price:2800,
           color:'#7ac74f', sprite:'m_archer', archer:true, mag:14, reload:1.8, desc:'箭无定式：火/冰/毒/雷/爆/击退箭随机上弦。' },
  mage:  { id:'mage',  name:'元素法师·蓝袍', icon:'🔮', hp:190, dmg:0, rate:0, range:560, speed:145, price:3600,
           color:'#8e9bff', sprite:'m_mage', mage:true, desc:'水元素、黑龙波、激光束、烈焰之环轮番施法。' },
  mech:  { id:'mech',  name:'重装机兵·GD鸭', icon:'🤖', hp:380, dmg:8, rate:10, range:500, bulletSpeed:820, speed:112, price:5200,
           color:'#9aa4b8', sprite:'m_mech', mech:true, mag:40, reload:2.2, desc:'双持 MG3 泼弹幕（40 发弹链需换弹），周期呼叫火炮。' },
  marine:{ id:'marine', name:'星际战士·铁誓', icon:'🛡️', hp:290, dmg:13, rate:3.8, range:560, bulletSpeed:900, speed:135, price:3000,
           color:'#7a9cc9', sprite:'m_marine', mag:30, reload:2.0, desc:'动力甲加步枪，点射稳定。为了鸭皇！' },
  flamerguy:{ id:'flamerguy', name:'喷火兵·燎原', icon:'🔥', hp:280, dmg:7, rate:0, range:210, speed:140, price:2600,
           color:'#e07030', sprite:'m_flamer2', flamerCone:true, desc:'肩扛喷火器的步兵，火舌横扫身前，怪物排队变烤串。' },
};

// ============ 奖杯 ============
const TROPHIES = [
  { id:'first_extract', name:'初出茅庐', icon:'🐣', desc:'首次成功撤离' },
  { id:'rich_run',      name:'满载而归', icon:'💰', desc:'单人单局带出价值 ≥ 2000 金币的宝物' },
  { id:'pacifist_hard', name:'一鸭当先', icon:'🕊️', desc:'困难或地狱难度，全队 0 击杀成功撤离' },
  { id:'shadow_walker', name:'影子行者', icon:'🌑', desc:'困难或地狱难度，全程未被任何怪物盯上并成功撤离' },
  { id:'silent_blade',  name:'无声杀戮', icon:'🗡️', desc:'单局 3 次以上背刺击杀，且没有任何非背刺击杀' },
  { id:'slayer',        name:'屠魔者',   icon:'⚔️', desc:'单局击杀 15 只怪物' },
  { id:'hell_return',   name:'地狱归来', icon:'🔥', desc:'地狱难度成功撤离' },
  { id:'duo_extract',   name:'双鸭同行', icon:'🤝', desc:'双人模式两人都成功撤离' },
  { id:'ice_dancer',    name:'冰湖舞者', icon:'⛸️', desc:'冰湖洞窟一次伤害都没挨、成功撤离' },
  { id:'collector_36',  name:'半部图鉴', icon:'📖', desc:'图鉴收录 36 件宝物' },
  { id:'collector_all', name:'午夜馆长', icon:'👑', desc:'收录全部 72 件宝物' },
  { id:'tycoon',        name:'富甲一方', icon:'🏦', desc:'持有金币达到 10000' },
  { id:'horde_win',     name:'无双割草王', icon:'🌾', desc:'无双割草模式存活满 10 分钟' },
  { id:'horde_slayer',  name:'千军辟易', icon:'💥', desc:'无双割草单局击杀 150 只怪物' },
  { id:'escape_dawn',   name:'夜尽天明', icon:'🌅', desc:'大逃亡模式成功撤离' },
];
const TROPHY_BY_ID = Object.fromEntries(TROPHIES.map(t => [t.id, t]));

// ============ 无双割草模式 ============
// 怪物基准（数值随时间在局内继续膨胀）
const HORDE_CFG = {
  id:'horde', name:'割草', icon:'🌾',
  mHp:42, mDmg:15, chaseSpeed:98, patrolSpeed:70, vision:9999, hear:9999, memory:99,
  smart:1, huntInterval:0, lurkerGuard:false, merchant:false,
  spawn:{}, chests:{ wood:0, silver:0, gold:0, mystery:0 },
};
// ============ 大逃亡模式 ============
// 长条生成图，一路向东：打怪升级、开箱捡枪，死亡之潮从西边碾来
const ESCAPE_CFG = {
  id:'escape', name:'大逃亡', icon:'🏃',
  mHp:52, mDmg:15, chaseSpeed:104, patrolSpeed:60, vision:480, hear:560, memory:7,
  smart:1, huntInterval:0, lurkerGuard:false, merchant:false,
  spawn:{}, chests:{ wood:10, silver:6, gold:4, mystery:3 },
};
const ESCAPE = { tideDelay: 30, tideSpeed: 34, tideAccel: 0.018, pursuitEvery: 7 };
// 沿途怪物池：越往东越凶
function escapePool(prog) {
  if (prog < 0.25) return ['shade', 'skitter', 'slime', 'direwolf'];
  if (prog < 0.5)  return ['shade', 'skitter', 'slime', 'wisp', 'charger', 'venomsnake', 'direwolf'];
  if (prog < 0.75) return ['skeleton', 'brute', 'wisp', 'charger', 'shroom', 'scorpion', 'warlock', 'leapspider', 'venomsnake'];
  return ['skeleton', 'brute', 'banshee', 'stoneling', 'warlock', 'leapspider', 'scorpion', 'lurker', 'direwolf'];
}

const HORDE_DURATION = 900;        // 基准 15 分钟（实际用 tune('hordeTime')*60，策划面板可调）
function hordeDuration() { return tune('hordeTime') * 60; }
const HORDE_CAP = 80;              // 同屏怪物上限（性能与可读性）
const HORDE_BOSS_AT = [140, 340, 560, 800];  // Boss 波时间点（15 分钟四波，轮换出场）
// 狂暴：中期起怪物有概率狂暴出生（+移速+攻频，红焰特效）；涌潮全员狂暴
const HORDE_ENRAGE = { start: 130, maxChance: 0.5, speedMul: 1.3, atkMul: 0.62 };

// 随时间解锁的刷怪池
function hordeSpawnPool(t) {
  if (t < 60)  return ['shade', 'shade', 'skitter', 'direwolf'];
  if (t < 180) return ['shade', 'skitter', 'slime', 'wisp', 'charger', 'direwolf', 'venomsnake'];
  if (t < 300) return ['shade', 'skitter', 'slime', 'wisp', 'charger', 'skeleton', 'brute', 'shroom', 'venomsnake', 'scorpion', 'warlock', 'leapspider'];
  // 后期：低级杂兵逐步退场，精英当家
  if (t < 480) return ['slime', 'wisp', 'charger', 'skeleton', 'brute', 'shroom', 'lurker', 'banshee', 'mimic', 'venomsnake', 'direwolf', 'warlock', 'scorpion', 'stoneling', 'leapspider'];
  return ['charger', 'skeleton', 'brute', 'brute', 'shroom', 'lurker', 'banshee', 'mimic', 'warlock', 'scorpion', 'stoneling', 'stoneling', 'leapspider', 'direwolf'];
}

// 升级三选一的池子：mods 数值强化 + skill 奇招技能（可重复选升级）
const HORDE_UPGRADES = [
  { id:'dmg',    name:'狂怒弹头',   icon:'💢', max:5, desc:'武器伤害 +18%（加算，不含技能）', mod:m => m.dmg += skillVal('base', 'dmgUp'),
    descFn:() => `武器伤害 +${Math.round(skillVal('base', 'dmgUp') * 100)}%（加算，不含技能）` },
  { id:'rate',   name:'嘎特林之魂', icon:'🌀', max:5, desc:'攻击速度 +22%',        mod:m => m.rate *= skillVal('base', 'rateMul'),
    descFn:() => `攻击速度 +${Math.round((skillVal('base', 'rateMul') - 1) * 100)}%` },
  { id:'multi',  name:'分裂弹道',   icon:'🎯', max:3, desc:'每次射击 +1 发弹道',   mod:m => m.multi += 1 },
  { id:'pierce', name:'贯穿之力',   icon:'📌', max:3, desc:'子弹穿透 +1 个目标',   mod:m => m.pierce += 1 },
  { id:'range',  name:'鹰眼延伸',   icon:'🔭', max:3, desc:'射程 +18%',            mod:m => m.range *= skillVal('base', 'rangeMul'),
    descFn:() => `射程 +${Math.round((skillVal('base', 'rangeMul') - 1) * 100)}%` },
  { id:'knock',  name:'重锤冲击',   icon:'🔨', max:3, desc:'击退力 +45%',          mod:m => m.knock *= skillVal('base', 'knockMul'),
    descFn:() => `击退力 +${Math.round((skillVal('base', 'knockMul') - 1) * 100)}%` },
  { id:'speed',  name:'疾风鸭步',   icon:'💨', max:4, desc:'移动速度 +9%',         mod:m => m.speed *= skillVal('base', 'speedMul'),
    descFn:() => `移动速度 +${Math.round((skillVal('base', 'speedMul') - 1) * 100)}%` },
  { id:'maxhp',  name:'钢铁鸭躯',   icon:'❤️', max:4, desc:'最大生命 +30%，并回复一半', special:'maxhp' },
  { id:'magnet', name:'贪婪磁场',   icon:'🧲', max:4, desc:'经验/金币拾取范围 +45%', mod:m => m.magnet *= skillVal('base', 'magnetMul'),
    descFn:() => `经验/金币拾取范围 +${Math.round((skillVal('base', 'magnetMul') - 1) * 100)}%` },
  { id:'steal',  name:'嗜血之喙',   icon:'🩸', max:3, desc:'每次击杀回复 2 点生命', mod:m => m.lifesteal += skillVal('base', 'stealHp'),
    descFn:() => `每次击杀回复 ${skillVal('base', 'stealHp')} 点生命` },
  { id:'regen',  name:'再生羽毛',   icon:'🪶', max:3, desc:'每秒回复 2 点生命',     mod:m => m.regen += skillVal('base', 'regenHp'),
    descFn:() => `每秒回复 ${skillVal('base', 'regenHp')} 点生命` },
  { id:'orbit',     name:'环绕飞锅', icon:'🍳', max:5, skill:'orbit',     desc:'+1 只环绕身边的平底锅，撞飞怪物' },
  { id:'missile',   name:'追踪鸭雷', icon:'🦆', max:5, skill:'missile',   desc:'高频发射自动追踪的爆走鸭' },
  { id:'nova',      name:'寒冰新星', icon:'❄️', max:5, skill:'nova',      desc:'周期冻结并炸伤身边的怪物' },
  { id:'trail',     name:'火焰足迹', icon:'🔥', max:5, skill:'trail',     desc:'跑动时身后留下灼烧路径' },
  { id:'lightning', name:'雷霆链爪', icon:'⚡', max:5, skill:'lightning', desc:'闪电逐跳传导：一个接一个劈过去' },
  { id:'whirlwind', name:'旋风斩',   icon:'🗡️', max:5, skill:'whirlwind', desc:'周期性旋身横扫，击飞身边所有怪物' },
  { id:'barrier',   name:'圣盾守护', icon:'🛡️', max:5, skill:'barrier',   desc:'周期性获得吸收伤害的临时护盾' },
  { id:'mines',     name:'鸭式地雷', icon:'🧨', max:5, skill:'mines',     desc:'边跑边埋雷，怪物踩上轰然起飞' },
  { id:'meteor',    name:'天降正义', icon:'☄️', max:5, skill:'meteor',    desc:'陨石从天而降砸进怪群（附带灼烧）' },
  { id:'boomerang', name:'巨型锯盘', icon:'🪚', max:5, skill:'boomerang', desc:'甩出巨锯一路碾过去再碾回来，可反复切割（3 级双盘）' },
  { id:'chrono',    name:'时缓力场', icon:'⏱️', max:5, skill:'chrono',    desc:'身边环绕减速力场，怪物近身如陷泥沼' },
  { id:'garlic',    name:'蒜香领域', icon:'🧄', max:5, skill:'garlic',    desc:'贴身的气味结界持续灼烧近身怪物' },
  { id:'spears',    name:'骨刺环发', icon:'🦴', max:5, skill:'spears',    desc:'周期向四面八方射出一圈骨刺' },
  { id:'drone',     name:'无人机鸭', icon:'🛸', max:5, skill:'drone',     desc:'一架小飞鸭跟随你自动点射敌人' },
  { id:'thorns',    name:'荆棘羽甲', icon:'🌵', max:5, skill:'thorns',    desc:'反弹近身伤害，且每级减免 1.5 点受击伤害' },
  { id:'luck',      name:'幸运骰',   icon:'🎲', max:4, desc:'经验宝石价值 +25%', mod:m => m.gemMul = (m.gemMul || 1) * skillVal('base', 'gemLuck'),
    descFn:() => `经验宝石价值 +${Math.round((skillVal('base', 'gemLuck') - 1) * 100)}%` },
  { id:'crit',      name:'会心之喙', icon:'💢', max:4, desc:'暴击率 +12%（双倍伤害）', mod:m => m.crit = (m.crit || 0) + skillVal('base', 'critUp'),
    descFn:() => `暴击率 +${Math.round(skillVal('base', 'critUp') * 100)}%（双倍伤害）` },
  // —— 第七轮新技能 ——
  { id:'fireball',  name:'火球术',   icon:'🔥', max:5, skill:'fireball',  desc:'周期掷出爆裂火球，命中炸裂灼烧' },
  { id:'summon',    name:'召唤鸭灵', icon:'🐥', max:3, skill:'summon',    desc:'新增一只持剑鸭灵（升级=多一只，已有的不消失；阵亡 5 秒复活）' },
  { id:'vamp',      name:'汲血之羽', icon:'🧛', max:3, desc:'造成伤害的 3% 转化为生命',  mod:m => m.vamp = (m.vamp || 0) + skillVal('base', 'vampUp'),
    descFn:() => `造成伤害的 ${Math.round(skillVal('base', 'vampUp') * 100)}% 转化为生命` },
  { id:'magsize',   name:'扩容弹夹', icon:'📦', max:3, desc:'弹夹容量 +30%',            mod:m => m.magMul = (m.magMul || 1) + skillVal('base', 'magUp'),
    descFn:() => `弹夹容量 +${Math.round(skillVal('base', 'magUp') * 100)}%` },
  { id:'reloadspd', name:'快手换弹', icon:'⚡', max:3, desc:'换弹速度 +25%',            mod:m => m.reloadMul = (m.reloadMul || 1) * skillVal('base', 'reloadMul'),
    descFn:() => `换弹速度 +${Math.round((1 - skillVal('base', 'reloadMul')) * 100)}%` },
  { id:'agility',   name:'灵敏反射', icon:'🩰', max:4, desc:'移速 +4%，闪避 +5%（完全躲开攻击）', mod:m => { m.speed *= skillVal('base', 'agiSpeed'); m.dodge = (m.dodge || 0) + skillVal('base', 'dodgeUp'); },
    descFn:() => `移速 +${Math.round((skillVal('base', 'agiSpeed') - 1) * 100)}%，闪避 +${Math.round(skillVal('base', 'dodgeUp') * 100)}%（完全躲开攻击）` },
  { id:'greed',     name:'贪婪之喙', icon:'🤑', max:3, desc:'怪物掉落金币 +40%',        mod:m => m.goldMul = (m.goldMul || 1) + skillVal('base', 'goldUp'),
    descFn:() => `怪物掉落金币 +${Math.round(skillVal('base', 'goldUp') * 100)}%` },
  { id:'revenge',   name:'复仇之焰', icon:'💢', max:3, skill:'revenge',   desc:'被怪物直击时爆出火焰怒环反噬（DoT 不触发）' },
  { id:'arty',      name:'呼叫支援', icon:'📡', max:3, skill:'arty',      desc:'周期呼叫火炮空袭覆盖射击方向（需先投资 2 次武器强化）',
    gate: H => ['dmg','rate','multi','pierce','range','scatter','bspeed','split'].reduce((s, k) => s + ((H.picked || {})[k] || 0), 0) >= 2 },
  // —— 变体强化（持有母技能后才会出现） ——
  { id:'meteor_big',  name:'陨石·巨岩', icon:'🪨', max:2, requires:'meteor', desc:'陨石半径 +35%', mod:m => m.meteorR = (m.meteorR || 1) + 0.35 },
  { id:'meteor_twin', name:'陨石·连星', icon:'✨', max:2, requires:'meteor', desc:'每轮多落 1 颗陨石', mod:m => m.meteorN = (m.meteorN || 0) + 1 },
  { id:'meteor_freq', name:'陨石·天怒', icon:'🌋', max:2, requires:'meteor', desc:'陨石冷却 -22%', mod:m => m.meteorCd = (m.meteorCd || 1) * 0.78 },
  { id:'drone_strike',name:'无人机·空袭', icon:'🛰️', max:2, requires:'drone', desc:'无人机不时呼叫天降正义轰炸', mod:m => m.droneStrike = (m.droneStrike || 0) + 1 },
  { id:'drone_wing',  name:'无人机·僚机', icon:'🛩️', max:2, requires:'drone', desc:'再起飞一架无人机协同点射', mod:m => m.droneN = (m.droneN || 0) + 1 },
  { id:'summon_flock',name:'鸭灵·锐爪',   icon:'🐣', max:2, requires:'summon', desc:'鸭灵攻速 +30%（鸭灵至多 3 只，此后走强化）', mod:m => m.petRate = (m.petRate || 1) * 1.3 },
  { id:'summon_war',  name:'鸭灵·战意',   icon:'🔥', max:2, requires:'summon', desc:'鸭灵生命与伤害 +40%（对之后复活/新召的生效）', mod:m => m.petPow = (m.petPow || 0) + 1 },
  // —— 第十一轮：攻击流派 ——
  { id:'scatter',  name:'散射枪管', icon:'💠', max:3, desc:'每次射击额外 +2 发散射弹（60% 伤害）', mod:m => m.scatter = (m.scatter || 0) + 2 },
  { id:'bspeed',   name:'超音速弹', icon:'💨', max:3, desc:'弹速 +30%、射程 +10%',              mod:m => { m.bSpeed = (m.bSpeed || 1) * 1.3; m.range *= 1.1; } },
  { id:'split',    name:'裂变弹头', icon:'🧩', max:2, desc:'命中时分裂 2 枚小弹片（35% 伤害）',  mod:m => m.splitShot = (m.splitShot || 0) + 1 },
  { id:'iceshot',  name:'寒冰弹芯', icon:'🧊', max:2, desc:'子弹附带减速，每级 22% 概率冻结 0.8s', mod:m => m.iceShot = (m.iceShot || 0) + 1 },
  { id:'fireshot', name:'燃烧弹芯', icon:'🔥', max:2, desc:'子弹点燃目标，火焰会向贴近的怪缓慢蔓延', mod:m => m.fireShot = (m.fireShot || 0) + 1 },
  { id:'zapshot',  name:'雷击弹芯', icon:'⚡', max:2, desc:'命中时每级 25% 概率放出小型连锁闪电',  mod:m => m.zapShot = (m.zapShot || 0) + 1 },
  // —— 第十一轮：招募流（场上有雇佣兵才会刷出） ——
  { id:'merc_dmg', name:'战友号令', icon:'📯', max:3, mercOnly:true, desc:'雇佣兵伤害与攻速 +25%', mod:m => m.mercPow = (m.mercPow || 0) + 0.25 },
  { id:'merc_hp',  name:'铁血军团', icon:'🎖️', max:3, mercOnly:true, desc:'雇佣兵最大生命 +30% 并回满', special:'merchp' },
  // —— 招募卡：直接从升级三选一里招募英雄（各限 1 次，阵亡不退场费） ——
  { id:'recruit_sniper', name:'招募·鹰眼',   icon:'🎯', max:1, special:'recruit', mercId:'sniper', desc:'退役传奇狙击手入队：920 射程一枪一个' },
  { id:'recruit_priest', name:'招募·牧师',   icon:'✨', max:1, special:'recruit', mercId:'priest', desc:'牧师鸭入队：周期治疗血量最低的队友' },
  { id:'recruit_archer', name:'招募·箭手',   icon:'🏹', max:1, special:'recruit', mercId:'archer', desc:'百变箭手入队：火/冰/毒/雷/爆/击退箭随机' },
  { id:'recruit_mage',   name:'招募·法师',   icon:'🔮', max:1, special:'recruit', mercId:'mage',   desc:'元素法师入队：水元素/黑龙波/激光/烈焰之环' },
  { id:'recruit_mech',   name:'招募·机兵',   icon:'🤖', max:1, special:'recruit', mercId:'mech',   desc:'武器流最高形态：投资 5 次武器强化后解锁重装机兵',
    gate: H => ['dmg','rate','multi','pierce','range','scatter','bspeed','split','iceshot','fireshot','zapshot'].reduce((s, k) => s + ((H.picked || {})[k] || 0), 0) >= 5 },
  { id:'recruit_marine', name:'招募·星际战士', icon:'🛡️', max:1, special:'recruit', mercId:'marine', desc:'动力甲步枪兵入队：高射速点射不停火' },
  { id:'recruit_flamer', name:'招募·喷火兵', icon:'🔥', max:1, special:'recruit', mercId:'flamerguy', desc:'喷火兵入队：火舌持续横扫身前' },
  { id:'recruit_spirit', name:'招募·鸭灵剑士', icon:'🐥', max:1, special:'recruit', mercId:'spirit', desc:'鸭灵剑士入队：圣剑横扫，越战越勇' },
  // —— 英雄专属升级卡（该英雄在场才出现；替代旧的统一晋阶） ——
  { id:'up_mage_water',  name:'法师·双子元素', icon:'💧', max:1, heroUp:'mage', desc:'可同时召唤 2 只水元素', hmod:'mageWater' },
  { id:'up_mage_laser',  name:'法师·激光折射', icon:'⚡', max:2, heroUp:'mage', desc:'施放激光时额外向随机方向再射 1 道', hmod:'mageLaser' },
  { id:'up_mage_dragon', name:'法师·龙群怒啸', icon:'🐉', max:2, heroUp:'mage', desc:'黑龙波每次多 2 条黑龙', hmod:'mageDragon' },
  { id:'up_sniper_pierce', name:'鹰眼·钨芯弹', icon:'📌', max:2, heroUp:'sniper', desc:'狙击弹穿透 +1 个目标', hmod:'sniperPierce' },
  { id:'up_sniper_crit',   name:'鹰眼·致命一击', icon:'💥', max:2, heroUp:'sniper', desc:'15%/级 概率造成三倍伤害', hmod:'sniperCrit' },
  { id:'up_archer_double', name:'箭手·双弦',   icon:'🏹', max:1, heroUp:'archer', desc:'每次拉弓齐射两箭', hmod:'archerDouble' },
  { id:'up_archer_dur',    name:'箭手·淬毒工艺', icon:'🧪', max:2, heroUp:'archer', desc:'箭矢附加效果时长 +50%/级', hmod:'archerDur' },
  { id:'up_priest_cd',   name:'牧师·虔诚祷言', icon:'📿', max:2, heroUp:'priest', desc:'祝福间隔 -25%/级', hmod:'priestCd' },
  { id:'up_priest_dual', name:'牧师·双重祝福', icon:'🌟', max:1, heroUp:'priest', desc:'每次祝福同时施放两种', hmod:'priestDual' },
  { id:'up_mech_mag',   name:'机兵·扩容弹链', icon:'⛓️', max:2, heroUp:'mech', desc:'弹链 +30 发/级', hmod:'mechMag' },
  { id:'up_mech_arty',  name:'机兵·饱和轰炸', icon:'📡', max:2, heroUp:'mech', desc:'火炮支援每轮 +3 发', hmod:'mechArty' },
  { id:'up_marine_rate', name:'战士·风暴点射', icon:'🌀', max:2, heroUp:'marine', desc:'点射速度 +25%/级', hmod:'marineRate' },
  { id:'up_marine_hp',   name:'战士·强化装甲', icon:'🛡️', max:2, heroUp:'marine', desc:'星际战士生命 +40% 并回满', special:'marinehp' },
  { id:'up_flamer_wide', name:'喷火·广角喷嘴', icon:'🔥', max:1, heroUp:'flamerguy', desc:'火舌锥角大幅加宽', hmod:'flamerWide' },
  { id:'up_flamer_burn', name:'喷火·凝固汽油', icon:'🛢️', max:1, heroUp:'flamerguy', desc:'灼烧 +1.5s 且火焰会蔓延', hmod:'flamerBurn' },
];
// 弹道追踪（全局强化版）：锁定锥角/搜索距离/转向速率
const HOMING = { cone: 0.8, dist: 420, turn: 5.2 };

// ============ 随机环境天气（每局随机，经典+割草通用） ============
const WEATHERS = {
  clear:     { id:'clear', name:'晴朗', icon:'🌙', desc:'' },
  rain:      { id:'rain', name:'落雨', icon:'🌧️', desc:'大雨滂沱：全员移速 -7%', pSpd:0.93, mSpd:0.96, tint:'rgba(60,90,140,0.10)' },
  snow:      { id:'snow', name:'风雪', icon:'❄️', desc:'积雪没踝：全员移速 -10%', pSpd:0.90, mSpd:0.93, tint:'rgba(200,220,255,0.08)' },
  sandstorm: { id:'sandstorm', name:'沙尘暴', icon:'🌪️', desc:'黄沙蔽目：视野 -28%', vision:0.72, tint:'rgba(180,140,70,0.14)' },
  bloodmoon: { id:'bloodmoon', name:'血月', icon:'🔴', desc:'血月高悬：怪物狂暴（移速/伤害 +15%）', mSpd:1.15, mDmg:1.15, tint:'rgba(160,20,30,0.10)' },
};
function rollWeather() {
  const r = Math.random();
  if (r < 0.20) return WEATHERS.clear;
  const pool = ['rain', 'snow', 'sandstorm', 'bloodmoon'];
  return WEATHERS[pool[Math.floor(Math.random() * pool.length)]];
}

// ============ 地图随机道具（拾取即生效） ============
const POWERUPS = {
  heart:   { id:'heart',   name:'回生桃心', icon:'💖', desc:'回复 60 生命' },
  shield:  { id:'shield',  name:'守护泡泡', icon:'🫧', desc:'获得 50 点临时护盾' },
  potion:  { id:'potion',  name:'谜之药水', icon:'🧪', desc:'随机一种药剂效果' },
  feather: { id:'feather', name:'佣兵羽毛', icon:'🪶', desc:'召唤一名保镖鸭助战 40 秒' },
  chaos:   { id:'chaos',   name:'混乱蘑菇', icon:'🍄', desc:'8 秒内怪物自相残杀！' },
  portal:  { id:'portal',  name:'紊乱传送门', icon:'🌀', desc:'随机传送到地图某处（福祸难料）' },
  hourgold:{ id:'hourgold',name:'金色沙漏', icon:'⌛', desc:'10 秒内翻滚不耗体力' },
  nuke:    { id:'nuke',    name:'嘎嘎核弹', icon:'💥', desc:'对全场可见怪物造成 60 点伤害' },
  magnetx: { id:'magnetx', name:'磁暴线圈', icon:'🧲', desc:'吸来全场经验宝石与金币' },
  freeze:  { id:'freeze',  name:'寒冰爆',   icon:'🥶', desc:'冻结全场怪物 3 秒' },
  silverfeather:{ id:'silverfeather', name:'银翎羽毛', icon:'🕊️', desc:'召唤独眼老兵助战 40 秒' },
  goldpile:{ id:'goldpile',name:'金币袋',   icon:'💰', desc:'白捡 80~150 金币' },
};
const POWERUP_KEYS = Object.keys(POWERUPS);

// ============ 翻滚/体力 ============
const STAMINA = { max:100, regen:22, rollCost:35, rollDur:0.34, rollSpeed:430, rollCd:0.35, regenDelay:0.35 };

const HORDE_UPGRADE_BY_ID = Object.fromEntries(HORDE_UPGRADES.map(u => [u.id, u]));

// ============ 英雄详细调参（每位招募英雄的具体数值，SAVE.heroTuning 持久化） ============
const HERO_TUNE = {
  guard: { name: '🪖 铁嘴保镖', params: {
    hp:     { n: '生命上限',   min: 60,  max: 600, step: 10,  def: 150 },
    dmg:    { n: '平底锅伤害', min: 5,   max: 80,  step: 1,   def: 17 },
    rate:   { n: '攻速(次/秒)', min: 0.5, max: 4,  step: 0.1, def: 1.5 },
    range:  { n: '近战距离',   min: 40,  max: 120, step: 2,   def: 58 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,   def: 142 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  vet: { name: '🎖️ 独眼老兵', params: {
    hp:     { n: '生命上限',   min: 80,  max: 600, step: 10,  def: 200 },
    dmg:    { n: '单发伤害',   min: 5,   max: 60,  step: 1,   def: 15 },
    rate:   { n: '射速(发/秒)', min: 0.5, max: 6,  step: 0.1, def: 2.2 },
    range:  { n: '射程',       min: 200, max: 800, step: 20,  def: 420 },
    mag:    { n: '弹夹容量',   min: 4,   max: 40,  step: 1,   def: 12 },
    reload: { n: '换弹时间(秒)', min: 0.5, max: 5, step: 0.1, def: 1.6 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,   def: 148 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  ace: { name: '🦅 佣兵王', params: {
    hp:     { n: '生命上限',   min: 100, max: 800, step: 10,   def: 270 },
    dmg:    { n: '单发伤害',   min: 20,  max: 200, step: 5,    def: 60 },
    rate:   { n: '射速(发/秒)', min: 0.3, max: 2,  step: 0.05, def: 0.8 },
    range:  { n: '射程',       min: 400, max: 1200, step: 20,  def: 720 },
    mag:    { n: '弹夹容量',   min: 3,   max: 24,  step: 1,    def: 8 },
    reload: { n: '换弹时间(秒)', min: 0.5, max: 5, step: 0.1,  def: 2.0 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,    def: 158 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  sniper: { name: '🎯 鹰眼', params: {
    hp:     { n: '生命上限',   min: 80,  max: 600, step: 10,   def: 190 },
    dmg:    { n: '单发伤害',   min: 30,  max: 500, step: 10,   def: 200 },
    rate:   { n: '射速(发/秒)', min: 0.2, max: 2,   step: 0.05, def: 0.4 },
    range:  { n: '射程',       min: 400, max: 1500, step: 20,  def: 1500 },
    mag:    { n: '弹夹容量',   min: 2,   max: 20,  step: 1,    def: 5 },
    reload: { n: '换弹时间(秒)', min: 0.5, max: 6, step: 0.1,  def: 2.2 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,    def: 150 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  priest: { name: '✨ 牧师', params: {
    hp:     { n: '生命上限',   min: 80,  max: 600, step: 10, def: 170 },
    heal:   { n: '单次治疗量', min: 5,  max: 60, step: 1,   def: 15 },
    healCd: { n: '治疗间隔(秒)', min: 0.5, max: 8, step: 0.1, def: 2 },
    buffCd: { n: '祝福间隔(秒)', min: 2,  max: 20, step: 0.5, def: 4 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,  def: 152 },
  } },
  archer: { name: '🏹 箭手', params: {
    hp:     { n: '生命上限',   min: 80,  max: 600, step: 10,  def: 210 },
    dmg:    { n: '箭矢伤害',   min: 8,  max: 120, step: 2,    def: 40 },
    rate:   { n: '射速(发/秒)', min: 0.5, max: 4,  step: 0.1,  def: 1.4 },
    range:  { n: '射程',       min: 300, max: 1000, step: 20, def: 740 },
    mag:    { n: '箭袋容量',   min: 5,   max: 40,  step: 1,   def: 14 },
    reload: { n: '补箭时间(秒)', min: 0.5, max: 5, step: 0.1, def: 1.8 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,   def: 150 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  mage: { name: '🔮 法师', params: {
    hp:          { n: '生命上限',       min: 80, max: 600, step: 10,  def: 190 },
    castCd:      { n: '施法间隔(秒)',   min: 1,  max: 8,   step: 0.2, def: 3.4 },
    range:       { n: '施法距离',       min: 300, max: 1000, step: 20, def: 560 },
    dragonDmg:   { n: '黑龙波伤害',     min: 5,  max: 120, step: 5,   def: 30 },
    dragonKnock: { n: '黑龙波击退',     min: 0,  max: 1500, step: 50, def: 700 },
    laserDmg:    { n: '激光伤害',       min: 10, max: 200, step: 5,   def: 60 },
    fireDmg:     { n: '火环每跳伤害',   min: 3,  max: 40,  step: 1,   def: 9 },
    fireR:       { n: '火环半径',       min: 50, max: 220, step: 5,   def: 120 },
    waterDmg:    { n: '水元素水波伤害', min: 5,  max: 80,  step: 1,   def: 23 },
    waterHp:     { n: '水元素生命',     min: 80, max: 800, step: 20,  def: 260 },
    speed:       { n: '移动速度',       min: 90, max: 260, step: 5,   def: 145 },
    desire:      { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 380 },
  } },
  mech: { name: '🤖 机兵', params: {
    hp:     { n: '生命上限',   min: 150, max: 1000, step: 10, def: 380 },
    dmg:    { n: '单发伤害',   min: 3,  max: 40,  step: 1,   def: 6 },
    rate:   { n: '射速(发/秒)', min: 3,  max: 20,  step: 0.5, def: 12 },
    range:  { n: '射程',       min: 250, max: 900, step: 20, def: 500 },
    mag:    { n: '弹链容量',   min: 15, max: 150, step: 5,   def: 100 },
    reload: { n: '换弹时间(秒)', min: 0.5, max: 5, step: 0.1, def: 3 },
    artyDmg:{ n: '火炮伤害',   min: 10, max: 120, step: 5,   def: 40 },
    speed:  { n: '移动速度',   min: 70,  max: 220, step: 5,  def: 112 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  marine: { name: '🛡️ 星际战士', params: {
    hp:     { n: '生命上限',   min: 100, max: 800, step: 10, def: 290 },
    dmg:    { n: '单发伤害',   min: 5,  max: 60, step: 1,   def: 11 },
    rate:   { n: '射速(发/秒)', min: 1,  max: 10, step: 0.2, def: 5 },
    range:  { n: '射程',       min: 250, max: 900, step: 20, def: 560 },
    mag:    { n: '弹夹容量',   min: 10, max: 90, step: 5,   def: 40 },
    reload: { n: '换弹时间(秒)', min: 0.5, max: 5, step: 0.1, def: 2.0 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,  def: 135 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  flamerguy: { name: '🔥 喷火兵', params: {
    hp:     { n: '生命上限',   min: 100, max: 800, step: 10, def: 280 },
    dmg:    { n: '火舌每跳伤害', min: 2,  max: 30,  step: 1,  def: 8 },
    range:  { n: '火舌射程',    min: 120, max: 420, step: 10, def: 280 },
    burn:   { n: '灼烧时长(秒)', min: 0.5, max: 6,  step: 0.5, def: 2 },
    speed:  { n: '移动速度',   min: 90,  max: 260, step: 5,  def: 140 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 600 },
  } },
  spirit: { name: '🐥 鸭灵剑士', params: {
    hp:     { n: '生命上限',   min: 80,  max: 600, step: 10,  def: 220 },
    dmg:    { n: '横扫伤害',   min: 6,   max: 90,  step: 2,   def: 22 },
    rate:   { n: '攻速(次/秒)', min: 0.5, max: 4,  step: 0.1, def: 1.6 },
    range:  { n: '横扫半径',   min: 50,  max: 160, step: 4,   def: 74 },
    speed:  { n: '移动速度',   min: 100, max: 300, step: 5,   def: 178 },
    desire: { n: '攻击欲望(锁敌距离)', min: 150, max: 900, step: 10, def: 380 },
  } },
  dog: { name: '🐕 汪财', params: {
    hp:    { n: '生命上限', min: 60,  max: 500, step: 10, def: 130 },
    fetch: { n: '拾取范围', min: 200, max: 1400, step: 40, def: 600 },
    speed: { n: '奔跑速度', min: 120, max: 360, step: 10,  def: 220 },
  } },
};
function heroVal(hid, key) {
  const h = HERO_TUNE[hid];
  if (!h || !h.params[key]) return undefined;
  const saved = (typeof SAVE !== 'undefined' && SAVE && SAVE.heroTuning && SAVE.heroTuning[hid]) || {};
  return saved[key] !== undefined ? saved[key] : h.params[key].def;
}

// ============ 怪物详细调参（21 种怪 + Boss 技能参数，SAVE.monsterTuning 持久化） ============
const _MT_BASE = () => ({
  hp:  { n: '生命倍率', min: 0.2, max: 3, step: 0.05, def: 1 },
  dmg: { n: '伤害倍率', min: 0.2, max: 3, step: 0.05, def: 1 },
  spd: { n: '速度倍率', min: 0.4, max: 2.2, step: 0.05, def: 1 },
});
const MONSTER_TUNE = {};
for (const [mid, mt] of Object.entries(MONSTER_TYPES)) {
  MONSTER_TUNE[mid] = { name: (mt.boss ? '👑 ' : '') + mt.name, params: _MT_BASE() };
}
// 特殊技能参数
Object.assign(MONSTER_TUNE.shade.params, {
  dashCd:  { n: '突进冷却(秒)', min: 1.5, max: 12, step: 0.5, def: 4 },
  dashPow: { n: '突进力度',     min: 300, max: 2000, step: 50, def: 900 },
});
Object.assign(MONSTER_TUNE.watcher.params, {
  spitCd:   { n: '眼波冷却(秒)', min: 1, max: 10, step: 0.2, def: 3.2 },
  blindDur: { n: '致盲时长(秒)', min: 0.4, max: 5, step: 0.2, def: 1.2 },
});
Object.assign(MONSTER_TUNE.venomsnake.params, {
  spitCd: { n: '毒吐冷却(秒)', min: 1, max: 10, step: 0.2, def: 3.6 },
});
Object.assign(MONSTER_TUNE.skeleton.params, {
  spitCd: { n: '掷戟冷却(秒)', min: 1, max: 12, step: 0.2, def: 4.2 },
});
Object.assign(MONSTER_TUNE.boss_cyclops.params, {
  skillCd:  { n: '技能冷却(秒)', min: 3, max: 20, step: 0.5, def: 8 },
  blindDur: { n: '致盲时长(秒)', min: 1, max: 6, step: 0.5, def: 2.5 },
  quakeR:   { n: '重踏半径',     min: 120, max: 480, step: 20, def: 260 },
});
Object.assign(MONSTER_TUNE.boss_stormdragon.params, {
  skillCd: { n: '技能冷却(秒)', min: 3, max: 20, step: 0.5, def: 8 },
  orbN:    { n: '弹幕数量',     min: 6, max: 28, step: 1, def: 14 },
});
Object.assign(MONSTER_TUNE.boss_lich.params, {
  skillCd:  { n: '技能冷却(秒)', min: 3, max: 20, step: 0.5, def: 9 },
  blindDur: { n: '致盲时长(秒)', min: 1, max: 6, step: 0.5, def: 2.5 },
  summonN:  { n: '召唤骷髅数',   min: 1, max: 6, step: 1, def: 3 },
});
// ============ 技能详细调参（割草 19 技能的基础值与每级增量，SAVE.skillTuning 持久化） ============
const SKILL_TUNE = {
  base: { name: '📊 基础强化（每张卡的增量）', params: {
    dmgUp:    { n: '狂怒弹头·伤害加算', min: 0.05, max: 1,   step: 0.01, def: 0.18 },
    rateMul:  { n: '嘎特林·攻速倍率',   min: 1.05, max: 2,   step: 0.01, def: 1.22 },
    rangeMul: { n: '鹰眼·射程倍率',     min: 1.05, max: 1.8, step: 0.01, def: 1.18 },
    knockMul: { n: '重锤·击退倍率',     min: 1.1,  max: 2.5, step: 0.05, def: 1.45 },
    speedMul: { n: '鸭步·移速倍率',     min: 1.02, max: 1.4, step: 0.01, def: 1.09 },
    magnetMul:{ n: '磁场·拾取倍率',     min: 1.1,  max: 2.5, step: 0.05, def: 1.45 },
    stealHp:  { n: '嗜血·击杀回血',     min: 1,    max: 10,  step: 1,    def: 2 },
    regenHp:  { n: '再生·每秒回血',     min: 1,    max: 10,  step: 1,    def: 2 },
    gemLuck:  { n: '幸运骰·宝石价值倍率', min: 1.1, max: 2,  step: 0.05, def: 1.25 },
    critUp:   { n: '会心·暴击率增量',   min: 0.04, max: 0.5, step: 0.01, def: 0.12 },
    vampUp:   { n: '汲血·吸血比例增量', min: 0.01, max: 0.2, step: 0.005, def: 0.03 },
    magUp:    { n: '扩容·弹夹增量',     min: 0.1,  max: 1,   step: 0.05, def: 0.3 },
    reloadMul:{ n: '快手·换弹耗时倍率', min: 0.3,  max: 0.95, step: 0.05, def: 0.75 },
    goldUp:   { n: '贪婪·金币增量',     min: 0.1,  max: 1.5, step: 0.05, def: 0.4 },
    agiSpeed: { n: '灵敏·移速倍率',     min: 1.01, max: 1.2, step: 0.01, def: 1.04 },
    dodgeUp:  { n: '灵敏·闪避增量',     min: 0.02, max: 0.2, step: 0.01, def: 0.05 },
  } },
  orbit:     { name: '🍳 环绕飞锅', params: {
    dmg:   { n: '撞击伤害',   min: 5,   max: 120, step: 1,   def: 24 } } },
  missile:   { name: '🦆 追踪鸭雷', params: {
    cd:    { n: '基础冷却(秒)', min: 0.5, max: 5,  step: 0.1, def: 1.6 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 0.5, step: 0.05, def: 0.2 },
    dmg:   { n: '基础伤害',     min: 5,   max: 80, step: 1,   def: 18 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 30, step: 1,   def: 7 } } },
  nova:      { name: '❄️ 寒冰新星', params: {
    cd:    { n: '基础冷却(秒)', min: 2,   max: 12, step: 0.5, def: 6.5 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 2,  step: 0.1, def: 0.7 },
    dmg:   { n: '基础伤害',     min: 4,   max: 60, step: 1,   def: 13 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 25, step: 1,   def: 6 },
    r:     { n: '基础半径',     min: 80,  max: 400, step: 10, def: 170 },
    rLv:   { n: '每级加半径',   min: 0,   max: 60, step: 2,   def: 22 },
    stun:  { n: '基础冻结(秒)', min: 0.2, max: 4,  step: 0.1, def: 1 },
    stunLv:{ n: '每级加冻结',   min: 0,   max: 1,  step: 0.05, def: 0.2 } } },
  trail:     { name: '🔥 火焰足迹', params: {
    dmg:   { n: '每跳基础伤害', min: 2,   max: 40, step: 1,   def: 5 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 15, step: 1,   def: 3 },
    dur:   { n: '火径留存(秒)', min: 0.8, max: 6,  step: 0.2, def: 2.2 } } },
  lightning: { name: '⚡ 雷霆链爪', params: {
    cd:    { n: '基础冷却(秒)', min: 0.8, max: 6,  step: 0.1, def: 2.6 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 1,  step: 0.05, def: 0.3 },
    dmg:   { n: '每跳基础伤害', min: 5,   max: 70, step: 1,   def: 17 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 25, step: 1,   def: 6 },
    hops:  { n: '基础跳数(+等级)', min: 1, max: 8, step: 1,   def: 2 } } },
  whirlwind: { name: '🗡️ 旋风斩', params: {
    cd:    { n: '基础冷却(秒)', min: 1,   max: 6,  step: 0.1, def: 2.6 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 1,  step: 0.05, def: 0.25 },
    dmg:   { n: '基础伤害',     min: 6,   max: 80, step: 1,   def: 18 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 30, step: 1,   def: 8 },
    r:     { n: '基础半径',     min: 50,  max: 240, step: 5,  def: 90 },
    rLv:   { n: '每级加半径',   min: 0,   max: 30, step: 1,   def: 8 } } },
  barrier:   { name: '🛡️ 圣盾守护', params: {
    cd:     { n: '基础冷却(秒)', min: 4,  max: 20, step: 0.5, def: 12 },
    cdLv:   { n: '每级减冷却',   min: 0,  max: 3,  step: 0.5, def: 1 },
    shield: { n: '基础护盾',     min: 5,  max: 80, step: 5,   def: 20 },
    shieldLv:{ n: '每级加护盾',  min: 0,  max: 40, step: 5,   def: 10 } } },
  mines:     { name: '🧨 鸭式地雷', params: {
    cd:    { n: '布雷间隔(秒)', min: 0.8, max: 6,  step: 0.2, def: 3.2 },
    cdLv:  { n: '每级减间隔',   min: 0,   max: 1,  step: 0.1, def: 0.3 },
    dmg:   { n: '基础伤害',     min: 8,   max: 100, step: 2,  def: 26 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 40, step: 2,   def: 10 },
    r:     { n: '爆炸半径',     min: 40,  max: 180, step: 5,  def: 74 } } },
  meteor:    { name: '☄️ 天降正义', params: {
    cd:    { n: '基础冷却(秒)', min: 2,   max: 12, step: 0.5, def: 5.5 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 2,  step: 0.1, def: 0.5 },
    dmg:   { n: '基础伤害',     min: 10,  max: 120, step: 5,  def: 30 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 50, step: 2,   def: 12 },
    r:     { n: '爆炸半径',     min: 40,  max: 220, step: 5,  def: 84 } } },
  boomerang: { name: '🪚 巨型锯盘', params: {
    cd:    { n: '基础冷却(秒)', min: 1,   max: 6,  step: 0.1, def: 2.8 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 1,  step: 0.05, def: 0.28 },
    dmg:   { n: '每次切割伤害', min: 10,  max: 120, step: 2,  def: 34 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 50, step: 2,   def: 14 },
    dist:  { n: '基础射程',     min: 150, max: 700, step: 10, def: 300 },
    distLv:{ n: '每级加射程',   min: 0,   max: 80, step: 5,   def: 30 } } },
  chrono:    { name: '⏱️ 时缓力场', params: {
    r:     { n: '基础半径',     min: 60,  max: 320, step: 10, def: 120 },
    rLv:   { n: '每级加半径',   min: 0,   max: 50, step: 5,   def: 15 } } },
  garlic:    { name: '🧄 蒜香领域', params: {
    r:     { n: '基础半径',     min: 50,  max: 240, step: 5,  def: 88 },
    rLv:   { n: '每级加半径',   min: 0,   max: 40, step: 2,   def: 12 },
    dmg:   { n: '每跳基础伤害', min: 2,   max: 40, step: 1,   def: 5 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 15, step: 1,   def: 3 } } },
  spears:    { name: '🦴 骨刺环发', params: {
    cd:    { n: '基础冷却(秒)', min: 1,   max: 8,  step: 0.2, def: 3.5 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 1,  step: 0.05, def: 0.3 },
    n:     { n: '基础根数(+等级)', min: 4, max: 20, step: 1,  def: 8 },
    dmg:   { n: '基础伤害',     min: 5,   max: 60, step: 1,   def: 14 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 25, step: 1,   def: 6 },
    range: { n: '基础射程',     min: 120, max: 600, step: 10, def: 260 } } },
  drone:     { name: '🛸 无人机鸭', params: {
    cd:    { n: '点射间隔(秒)', min: 0.15, max: 2, step: 0.01, def: 0.92 },
    cdLv:  { n: '每级减间隔',   min: 0,   max: 0.3, step: 0.01, def: 0.12 },
    dmg:   { n: '基础伤害',     min: 8,   max: 90, step: 2,   def: 24 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 40, step: 2,   def: 10 } } },
  thorns:    { name: '🌵 荆棘羽甲', params: {
    dmg:   { n: '反弹基础伤害', min: 2,   max: 50, step: 1,   def: 8 },
    dmgLv: { n: '每级加反弹',   min: 0,   max: 25, step: 1,   def: 6 },
    reduce:{ n: '每级减伤点数', min: 0,   max: 8,  step: 0.5, def: 1.5 } } },
  fireball:  { name: '🔥 火球术', params: {
    cd:    { n: '基础冷却(秒)', min: 1,   max: 6,  step: 0.1, def: 2.9 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 1,  step: 0.05, def: 0.3 },
    dmg:   { n: '基础伤害',     min: 6,   max: 80, step: 2,   def: 18 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 30, step: 1,   def: 7 },
    boom:  { n: '爆炸基础半径', min: 30,  max: 160, step: 5,  def: 58 },
    boomLv:{ n: '每级加半径',   min: 0,   max: 30, step: 1,   def: 7 } } },
  summon:    { name: '🐥 召唤鸭灵', params: {
    hp:    { n: '鸭灵基础生命', min: 40,  max: 400, step: 10, def: 100 },
    hpLv:  { n: '每级加生命',   min: 0,   max: 150, step: 10, def: 50 },
    dmg:   { n: '鸭灵基础伤害', min: 5,   max: 60, step: 1,   def: 14 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 25, step: 1,   def: 7 } } },
  revenge:   { name: '💢 复仇之焰', params: {
    dmg:   { n: '基础伤害',     min: 5,   max: 80, step: 1,   def: 16 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 35, step: 1,   def: 10 },
    r:     { n: '怒环半径',     min: 80,  max: 320, step: 10, def: 150 } } },
  arty:      { name: '📡 呼叫支援', params: {
    cd:    { n: '基础冷却(秒)', min: 5,   max: 25, step: 0.5, def: 14 },
    cdLv:  { n: '每级减冷却',   min: 0,   max: 5,  step: 0.5, def: 2 },
    shells:{ n: '基础炮弹数',   min: 3,   max: 15, step: 1,   def: 5 },
    shellsLv:{ n: '每级加炮弹', min: 0,   max: 6,  step: 1,   def: 2 },
    dmg:   { n: '基础伤害',     min: 10,  max: 90, step: 2,   def: 26 },
    dmgLv: { n: '每级加伤害',   min: 0,   max: 30, step: 1,   def: 9 } } },
};
function skillVal(sid, key) {
  const sd = SKILL_TUNE[sid];
  if (!sd || !sd.params[key]) return undefined;
  const saved = (typeof SAVE !== 'undefined' && SAVE && SAVE.skillTuning && SAVE.skillTuning[sid]) || {};
  return saved[key] !== undefined ? saved[key] : sd.params[key].def;
}

function monsterVal(mid, key) {
  const m = MONSTER_TUNE[mid];
  if (!m || !m.params[key]) return undefined;
  const saved = (typeof SAVE !== 'undefined' && SAVE && SAVE.monsterTuning && SAVE.monsterTuning[mid]) || {};
  return saved[key] !== undefined ? saved[key] : m.params[key].def;
}

// ============ 第十一轮经济再平衡：抑制通胀 ============
// 商品适度涨价（×1.4），摸金收益按稀有度大幅上调（普通×1.5 → 神话×3.5）
for (const w of Object.values(WEAPONS)) if (w.price) w.price = Math.round(w.price * 1.4 / 10) * 10;
for (const a of Object.values(ARMORS)) if (a.price) a.price = Math.round(a.price * 1.4 / 10) * 10;
if (GEAR && GEAR.pouch && GEAR.pouch.price) GEAR.pouch.price = Math.round(GEAR.pouch.price * 1.4 / 10) * 10;
for (const c of Object.values(CONSUMABLES)) if (c.price) c.price = Math.round(c.price * 1.3 / 5) * 5;
const TREASURE_VALUE_MUL = { common: 1.5, rare: 1.8, epic: 2.2, legendary: 2.8, mythic: 3.5 };
for (const t of TREASURES) t.value = Math.round(t.value * TREASURE_VALUE_MUL[t.rarity] / 5) * 5;


// ============ 策划调参面板（SAVE.tuning 持久化，实时生效） ============
const TUNE_DEFS = [
  { id:'pSpeed',   name:'玩家移速',        min:0.7,  max:1.5,  step:0.05, def:1.2 },
  { id:'pDmg',     name:'玩家伤害',        min:0.5,  max:2.5,  step:0.05, def:1 },
  { id:'pHp',      name:'玩家生命上限',    min:0.5,  max:3,    step:0.1,  def:0.9 },
  { id:'mHp',      name:'怪物血量',        min:0.5,  max:2.5,  step:0.05, def:1 },
  { id:'mDmg',     name:'怪物伤害',        min:0.5,  max:2.5,  step:0.05, def:1.3 },
  { id:'mSpeed',   name:'怪物移速',        min:0.7,  max:1.6,  step:0.05, def:1.3 },
  { id:'spawnRate',name:'割草刷怪速率',    min:0.5,  max:2,    step:0.05, def:1.15 },
  { id:'xpRate',   name:'经验获取',        min:0.5,  max:2.5,  step:0.1,  def:1 },
  { id:'goldRate', name:'金币掉落',        min:0.5,  max:3,    step:0.1,  def:1 },
  { id:'magnet',   name:'磁吸范围',        min:0.5,  max:3,    step:0.1,  def:1.1 },
  { id:'staminaRegen', name:'体力恢复',    min:0.5,  max:2.5,  step:0.1,  def:1 },
  { id:'rollCd',   name:'翻滚冷却倍率',    min:0.1,  max:3,    step:0.05, def:1 },
  { id:'thorns',   name:'荆棘强度(反伤/护甲)', min:0, max:3,   step:0.1,  def:1.2 },
  { id:'mimic',    name:'宝箱怪概率',      min:0,    max:1,    step:0.05, def:0.3, abs:true },
  { id:'merchantF',name:'商人出现倍率',    min:0,    max:2,    step:0.1,  def:1.2 },
  { id:'bossHp',   name:'Boss 血量',       min:0.5,  max:2.5,  step:0.1,  def:1.1 },
  { id:'dda',      name:'自适应难度(0关1开)', min:0, max:1,    step:1,    def:1, abs:true },
  { id:'ddaStr',   name:'自适应强度',      min:0,    max:0.3,  step:0.02, def:0.2, abs:true },
  { id:'juice',    name:'打击特效(0关1开)', min:0,   max:1,    step:1,    def:1, abs:true },
  { id:'hordeTime',name:'割草时长(分钟)',   min:5,    max:30,   step:1,    def:10, abs:true },
  { id:'zapHop',   name:'闪电传导间隔(秒)', min:0.05, max:0.5,  step:0.05, def:0.35, abs:true },
  { id:'mercRange',name:'佣兵攻击范围',    min:0.5,  max:3,    step:0.1,  def:1.1 },
  { id:'devXp',    name:'开发者经验倍率',  min:1,    max:50,   step:1,    def:20, abs:true },
  { id:'wRate',    name:'武器射速倍率',    min:0.5,  max:3,    step:0.1,  def:1 },
  { id:'wSpeed',   name:'武器弹速倍率',    min:0.5,  max:3,    step:0.1,  def:2.2 },
  { id:'wKnock',   name:'武器击退倍率',    min:0.5,  max:3,    step:0.1,  def:1 },
  { id:'mercDesire',name:'佣兵进攻欲望(全局缩放·600=基准)', min:150, max:900, step:10, def:600 },
];
// 读取调参值（面板未改过则用默认）
function tune(id) {
  const def = TUNE_DEFS.find(t => t.id === id);
  const v = (typeof SAVE !== 'undefined' && SAVE && SAVE.tuning && SAVE.tuning[id] !== undefined) ? SAVE.tuning[id] : (def ? def.def : 1);
  return v;
}