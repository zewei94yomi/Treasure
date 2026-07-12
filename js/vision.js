// ============ 视野/阴影系统：射线步进生成可视多边形，叠加黑暗层 ============
'use strict';

const VISION = {
  baseRadius: 250,
  rays: 200,
  darkness: 0.965,   // 阴影不透明度
};

// 计算某个光源的可视多边形（世界坐标）
function visionPolygon(x, y, radius) {
  const pts = [];
  const n = VISION.rays;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = castRay(x, y, a, radius);
    pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
  }
  return pts;
}

// 在 overlay 画布上绘制黑暗 + 挖出所有光源
// lights: [{x, y, radius}]，glows: [{x, y, r}] 微光点（金箱透雾光）
function drawDarkness(octx, cam, lights, glows) {
  const W = octx.canvas.width, H = octx.canvas.height;
  octx.globalCompositeOperation = 'source-over';
  octx.clearRect(0, 0, W, H);
  octx.fillStyle = `rgba(8, 6, 22, ${VISION.darkness})`;
  octx.fillRect(0, 0, W, H);

  octx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const poly = visionPolygon(L.x, L.y, L.radius);
    const sx = L.x - cam.x, sy = L.y - cam.y;
    const g = octx.createRadialGradient(sx, sy, 0, sx, sy, L.radius);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.85, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = g;
    octx.beginPath();
    octx.moveTo(poly[0][0] - cam.x, poly[0][1] - cam.y);
    for (let i = 1; i < poly.length; i++) octx.lineTo(poly[i][0] - cam.x, poly[i][1] - cam.y);
    octx.closePath();
    octx.fill();
  }
  // 高级宝箱的微光可以穿透黑暗，远远就能看见一点金光
  for (const gl of glows || []) {
    const sx = gl.x - cam.x, sy = gl.y - cam.y;
    if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
    const g = octx.createRadialGradient(sx, sy, 0, sx, sy, gl.r);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = g;
    octx.beginPath(); octx.arc(sx, sy, gl.r, 0, Math.PI * 2); octx.fill();
  }
  octx.globalCompositeOperation = 'source-over';
}
