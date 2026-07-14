// ============ 地图随机道具系统（Game.prototype 扩展模块） ============
// 回血/护盾/随机药水/佣兵羽毛/混乱蘑菇/传送门/金色沙漏，经典与割草两模式通用。
'use strict';

class Powerup {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;            // POWERUPS 定义
    this.anim = Math.random() * 10;
  }
}

Object.assign(Game.prototype, {
  initPowerups() {
    this.powerups = [];
    this.confusionT = 0;
    this.powerupT = this.horde ? 14 : 42;   // 补充节奏
    if (this.versus) return;   // 对决：纯拼枪法，不刷道具
    const n = this.horde ? 3 : 5;
    for (let i = 0; i < n; i++) this.spawnPowerup();
  },

  spawnPowerup() {
    const cap = this.horde ? 8 : 6;
    if (this.powerups.length >= cap) return;
    const type = POWERUPS[POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)]];
    // 落点：随机怪物节点/宝箱点附近偏移，避开玩家 200px 内
    const spots = MapData.monsterNodes.concat(MapData.chestSpots);
    if (!spots.length) return;
    for (let tries = 0; tries < 12; tries++) {
      const s = spots[Math.floor(Math.random() * spots.length)];
      const x = s.x + (Math.random() - 0.5) * 60, y = s.y + (Math.random() - 0.5) * 60;
      if (isSolidAt(x, y)) continue;
      if (this.players.some(p => p.active && Math.hypot(p.x - x, p.y - y) < 200)) continue;
      this.powerups.push(new Powerup(x, y, type));
      return;
    }
  },

  updatePowerups(dt) {
    this.confusionT = Math.max(0, this.confusionT - dt);
    this.powerupT -= dt;
    if (this.powerupT <= 0) {
      this.powerupT = this.horde ? 14 : 42;
      this.spawnPowerup();
    }
    for (const pu of this.powerups) {
      pu.anim += dt;
      for (const p of this.players) {
        if (!p.active) continue;
        if (Math.hypot(pu.x - p.x, pu.y - p.y) < 26) { pu.taken = true; this.applyPowerup(pu, p); break; }
      }
    }
    this.powerups = this.powerups.filter(pu => !pu.taken);
    // 限时佣兵离场
    for (const mc of this.mercs) {
      if (mc.despawnT !== undefined) {
        mc.despawnT -= dt;
        if (mc.despawnT <= 0 && mc.hp > 0) {
          mc.hp = 0;
          this.floater(mc.x, mc.y - 24, '佣兵鸭挥手告别～', '#9fd8ff');
        }
      }
    }
  },

  applyPowerup(pu, p) {
    const t = pu.type;
    Sfx.pickup('epic');
    this.floater(pu.x, pu.y - 24, `${t.icon} ${t.name}！`, '#7dff9a');
    switch (t.id) {
      case 'heart':
        p.hp = Math.min(p.maxHp, p.hp + 60);
        break;
      case 'shield':
        p.tempShield = Math.min(120, p.tempShield + 50);
        break;
      case 'potion': {
        const key = CONSUM_ORDER[Math.floor(Math.random() * CONSUM_ORDER.length)];
        const c = CONSUMABLES[key];
        this.toast(`🧪 谜之药水原来是【${c.name}】！`, '#b48aff');
        if (c.heal) p.hp = Math.min(p.maxHp, p.hp + c.heal);
        if (c.speedMul) { p.sodaTime = c.dur; p.sodaMul = c.speedMul; }
        if (c.invis) p.invisT = c.invis;
        if (c.dmgMul) p.rageT = c.dur;
        if (c.reveal) this.revealT = Math.max(this.revealT, c.reveal);
        break;
      }
      case 'feather': {
        const mc = new Mercenary(p.x + 26, p.y + 26, MERCS.guard, p);
        mc.despawnT = 40;
        unstick(mc);
        this.mercs.push(mc);
        this.toast('🪶 一只保镖鸭应召而来（40 秒）！', '#7dff9a');
        break;
      }
      case 'chaos':
        this.confusionT = 8;
        this.toast('🍄 混乱蘑菇生效——怪物开始自相残杀！', '#ff8fd0');
        Sfx.mimic();
        break;
      case 'portal': {
        const spots = MapData.chestSpots.concat(MapData.monsterNodes);
        const s = spots[Math.floor(Math.random() * spots.length)];
        for (let i = 0; i < 8; i++) this.spark(p.x, p.y, '#b48aff');
        p.x = s.x; p.y = s.y;
        unstick(p);
        p.vx = p.vy = 0;
        for (let i = 0; i < 8; i++) this.spark(p.x, p.y, '#b48aff');
        this.toast('🌀 传送门把你甩到了……某个地方', '#b48aff');
        Sfx.laser();
        break;
      }
      case 'nuke': {
        Sfx.boom();
        this.shake = 12;
        let bag = 0;
        for (const m of this.monsters.slice()) {
          for (let i = 0; i < 4; i++) this.spark(m.x, m.y, '#ffb347');
          if (m.hurt(60, this)) { this.killMonster(m, p); bag++; }
        }
        this.toast(`💥 嘎嘎核弹！全场重创${bag ? `，${bag} 只当场蒸发` : ''}！`, '#ff8f5c');
        break;
      }
      case 'magnetx': {
        if (this.horde) for (const g of this.hordeState.gems) { g.x = p.x + (Math.random()-0.5)*30; g.y = p.y + (Math.random()-0.5)*30; }
        for (const gd of this.goldDrops) { gd.x = p.x + (Math.random()-0.5)*30; gd.y = p.y + (Math.random()-0.5)*30; }
        Sfx.coin();
        this.toast('🧲 磁暴线圈！全场财宝飞入怀中！', '#5af0c8');
        break;
      }
      case 'freeze': {
        for (const m of this.monsters) { m.stunT = Math.max(m.stunT, 3); m.slowT = Math.max(m.slowT, 5); }
        Sfx.laser();
        this.toast('🥶 寒冰爆！全场怪物冻成冰坨 3 秒！', '#9fd8ff');
        break;
      }
      case 'silverfeather': {
        const mc = new Mercenary(p.x + 30, p.y + 30, MERCS.vet, p);
        mc.despawnT = 40;
        unstick(mc);
        this.mercs.push(mc);
        this.toast('🕊️ 银翎羽毛！独眼老兵驰援 40 秒！', '#9fd8ff');
        break;
      }
      case 'goldpile': {
        const v = 80 + Math.round(Math.random() * 70);
        SAVE.gold += v; this.runCash += v;
        Sfx.coin();
        this.floater(p.x, p.y - 40, `+${v}💰`, '#ffd93d');
        break;
      }
      case 'hourgold':
        p.staminaFreeT = 10;
        this.toast('⌛ 金色沙漏：10 秒内翻滚不耗体力！', '#ffd93d');
        break;
    }
  },

  // 在视口内绘制道具（renderView 调用）
  drawPowerups(ctx, cam, w) {
    for (const pu of this.powerups) {
      const sx = pu.x - cam.x, sy = pu.y - cam.y;
      if (sx < -40 || sy < -40 || sx > w + 40 || sy > VIEW_H + 40) continue;
      const bob = Math.sin(pu.anim * 3) * 3;
      // 底座光圈
      ctx.fillStyle = 'rgba(125,255,154,.15)';
      ctx.beginPath(); ctx.arc(sx, sy + 6, 15 + Math.sin(pu.anim * 4) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(pu.type.icon, sx, sy + bob + 4);
    }
  },
});
