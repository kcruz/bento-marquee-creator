const ASPECT = { desktop: 16 / 10, mobile: 9 / 19.5 };
const BASE_SPEED = { h: 80, v: 60, d: 70 };

function canvasContentInset(canvasW, canvasH, config) {
  let m = Number(config.margin);
  if (Number.isNaN(m) || m < 0) m = 0;
  const maxM = Math.max(0, Math.floor(Math.min(canvasW, canvasH) / 2) - 2);
  m = Math.min(m, maxM);
  const iw = Math.max(1, canvasW - 2 * m);
  const ih = Math.max(1, canvasH - 2 * m);
  return { ox: m, oy: m, iw, ih };
}

/** Clip + translate into the margined content box (coordinates 0..iw, 0..ih). */
function beginContentLayer(ctx, canvasW, canvasH, config) {
  const r = canvasContentInset(canvasW, canvasH, config);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.ox, r.oy, r.iw, r.ih);
  ctx.clip();
  ctx.translate(r.ox, r.oy);
  return r;
}

function endContentLayer(ctx) {
  ctx.restore();
}

function rowImageScalePct(config, rowIndex) {
  const def = 100;
  const arr = config.imageScale;
  if (!arr || !Array.isArray(arr)) return def;
  const v = arr[rowIndex];
  if (v == null || Number.isNaN(v)) return def;
  return Math.min(500, Math.max(10, Number(v)));
}

/** Per-row bands: each row is sized independently at (baseH * scale%), not proportionally. */
function rowBandLayouts(innerH, rowCount, gap, config) {
  const verticalGaps = (rowCount + 1) * gap;
  const availableH = Math.max(0, innerH - verticalGaps);
  const baseH = rowCount > 0 ? availableH / rowCount : availableH;
  const layouts = [];
  let y = gap;
  for (let r = 0; r < rowCount; r++) {
    const scalePct = rowImageScalePct(config, r);
    const imgH = Math.max(1, baseH * scalePct / 100);
    const rowType = config.rowTypes[r] || 'desktop';
    const imgW = imgH * (ASPECT[rowType] || ASPECT.desktop);
    layouts.push({ imgW, imgH, y });
    y += imgH + gap;
  }
  return layouts;
}

function seamlessRowsDuration(config, w, h, images, baseSpeed) {
  const { ih } = canvasContentInset(w, h, config);
  const layouts = rowBandLayouts(ih, config.rowCount, config.gap, config);
  let maxDur = 0;
  for (let r = 0; r < config.rowCount; r++) {
    const { imgW } = layouts[r];
    const rowImages = images[r] || [];
    if (rowImages.length === 0) continue;
    const totalW = rowImages.length * (imgW + config.gap);
    const speed = Array.isArray(config.speed) ? (config.speed[r] || 1) : config.speed;
    const dur = totalW / (speed * baseSpeed);
    if (dur > maxDur) maxDur = dur;
  }
  return maxDur;
}


const TEMPLATES = [
  {
    id: 'horizontal-scroll',
    name: 'Horizontal Scroll',
    description: 'Classic left-scrolling marquee with screenshots in a single row',
    direction: 'left',
    perspective: 0,
    speed: 1,
    defaultRowCount: 1,
    tags: ['Horizontal', 'Flat', 'Medium'],

    seamlessDuration(config, w, h, images) {
      return seamlessRowsDuration(config, w, h, images, BASE_SPEED.h);
    },

    render(ctx, images, config, time) {
      const { width: w, height: h } = ctx.canvas;
      const gap = config.gap;
      const inset = beginContentLayer(ctx, w, h, config);
      const { iw, ih } = inset;
      const layouts = rowBandLayouts(ih, config.rowCount, gap, config);

      for (let r = 0; r < config.rowCount; r++) {
        const rowImages = images[r] || [];
        if (rowImages.length === 0) continue;

        const { imgW, imgH, y } = layouts[r];
        const totalW = rowImages.length * (imgW + gap);

        const speed = Array.isArray(config.speed) ? (config.speed[r] || 1) : config.speed;
        const dir = Array.isArray(config.direction) ? (config.direction[r] || 'left') : config.direction;
        const actualDir = dir === 'default' ? 'left' : dir;
        const sign = (actualDir === 'right' || actualDir === 'down') ? 1 : -1;

        const offset = ((time * speed * BASE_SPEED.h * sign) % totalW + totalW) % totalW;

        for (let copy = -1; copy <= 1; copy++) {
          rowImages.forEach((img, i) => {
            const x = i * (imgW + gap) - offset + copy * totalW;
            if (x + imgW < -imgW || x > iw + imgW) return;
            drawRoundedImage(ctx, img, x, y, imgW, imgH, config);
          });
        }
      }
      endContentLayer(ctx);
    }
  },

  {
    id: 'vertical-cascade',
    name: 'Vertical Cascade',
    description: 'Upward-scrolling columns with a gentle tilt for depth',
    direction: 'up',
    perspective: 0,
    speed: 0.7,
    defaultRowCount: 3,
    tags: ['Vertical', 'Tilted', 'Slow'],

    seamlessDuration(config, w, h, images) {
      const { iw } = canvasContentInset(w, h, config);
      const gap = config.gap;
      const cols = config.rowCount;
      const baseColW = Math.max(1, (iw - (cols + 1) * gap) / cols);
      let maxDur = 0;
      for (let c = 0; c < cols; c++) {
        const colImages = images[c] || [];
        if (colImages.length === 0) continue;
        const scalePct = rowImageScalePct(config, c);
        const colW = Math.max(1, baseColW * scalePct / 100);
        const imgH = colW / (ASPECT[config.rowTypes[c] || 'desktop'] || ASPECT.desktop);
        const speed = Array.isArray(config.speed) ? (config.speed[c] || 1) : config.speed;
        const dur = colImages.length * (imgH + gap) / (speed * BASE_SPEED.v);
        if (dur > maxDur) maxDur = dur;
      }
      return maxDur;
    },

    render(ctx, images, config, time) {
      const { width: w, height: h } = ctx.canvas;
      const gap = config.gap;
      const inset = beginContentLayer(ctx, w, h, config);
      const { iw, ih } = inset;
      const cols = config.rowCount;
      const baseColW = Math.max(1, (iw - (cols + 1) * gap) / cols);

      // Each column is sized independently at (baseColW * scale%)
      let xCursor = gap;
      const colLayouts = Array.from({ length: cols }, (_, c) => {
        const scalePct = rowImageScalePct(config, c);
        const colW = Math.max(1, baseColW * scalePct / 100);
        const imgH = colW / (ASPECT[config.rowTypes[c] || 'desktop'] || ASPECT.desktop);
        const layout = { x: xCursor, colW, imgH };
        xCursor += colW + gap;
        return layout;
      });

      ctx.save();
      if (config.perspective !== 0) {
        const angleRad = config.perspective * Math.PI / 180;
        ctx.translate(iw / 2, ih / 2);
        ctx.rotate(angleRad);
        ctx.translate(-iw / 2, -ih / 2);
      }

      for (let c = 0; c < cols; c++) {
        const colImages = images[c] || [];
        if (colImages.length === 0) continue;

        const { x, colW, imgH } = colLayouts[c];
        const totalH = colImages.length * (imgH + gap);

        const speed = Array.isArray(config.speed) ? (config.speed[c] || 1) : config.speed;
        const dirConf = Array.isArray(config.direction) ? (config.direction[c] || 'up') : config.direction;
        const dir = dirConf === 'default' ? 'up' : dirConf;
        const sign = (dir === 'down' || dir === 'right') ? 1 : -1;

        const offset = ((time * speed * BASE_SPEED.v * sign) % totalH + totalH) % totalH;
        const yAnchor = totalH < ih ? (ih - totalH) / 2 : 0;

        for (let copy = -1; copy <= 2; copy++) {
          colImages.forEach((img, i) => {
            const y = yAnchor + i * (imgH + gap) - offset + copy * totalH;
            if (y + imgH < -imgH * 2 || y > ih + imgH * 2) return;
            drawRoundedImage(ctx, img, x, y, colW, imgH, config);
          });
        }
      }

      ctx.restore();
      endContentLayer(ctx);
    }
  },

  {
    id: 'diagonal-flow',
    name: 'Diagonal Flow',
    description: 'Screenshots drift diagonally with a rotated perspective',
    direction: 'left',
    perspective: 0,
    speed: 1.2,
    defaultRowCount: 3,
    tags: ['Diagonal', '3D', 'Fast'],

    seamlessDuration(config, w, h, images) {
      return seamlessRowsDuration(config, w, h, images, BASE_SPEED.d);
    },

    render(ctx, images, config, time) {
      const { width: w, height: h } = ctx.canvas;

      const inset = beginContentLayer(ctx, w, h, config);
      const { iw, ih } = inset;
      const layouts = rowBandLayouts(ih, config.rowCount, config.gap, config);

      ctx.save();
      if (config.perspective !== 0) {
        const angleRad = config.perspective * Math.PI / 180;
        ctx.translate(iw / 2, ih / 2);
        ctx.rotate(angleRad);
        ctx.translate(-iw / 2, -ih / 2);
      }

      const gap = config.gap;
      for (let r = 0; r < config.rowCount; r++) {
        const rowImages = images[r] || [];
        if (rowImages.length === 0) continue;

        const { imgW, imgH, y } = layouts[r];
        const totalW = rowImages.length * (imgW + gap);

        const speed = Array.isArray(config.speed) ? (config.speed[r] || 1) : config.speed;
        const dir = Array.isArray(config.direction) ? (config.direction[r] || 'left') : config.direction;
        const actualDir = dir === 'default' ? 'left' : dir;
        const sign = (actualDir === 'right' || actualDir === 'down') ? 1 : -1;

        const offset = ((time * speed * BASE_SPEED.d * sign) % totalW + totalW) % totalW;

        for (let copy = -2; copy <= 2; copy++) {
          rowImages.forEach((img, i) => {
            const x = i * (imgW + gap) - offset + copy * totalW;
            if (x + imgW < -imgW * 2 || x > iw + imgW * 2) return;
            drawRoundedImage(ctx, img, x, y, imgW, imgH, config);
          });
        }
      }
      ctx.restore();
      endContentLayer(ctx);
    }
  },

  {
    id: 'perspective-rows',
    name: '3D Perspective',
    description: 'Multi-row marquee with dramatic 3D vanishing point effect',
    direction: 'left',
    perspective: 0,
    speed: 0.8,
    defaultRowCount: 3,
    tags: ['3D', 'Multi-row', 'Medium'],

    seamlessDuration(config, w, h, images) {
      return seamlessRowsDuration(config, w, h, images, BASE_SPEED.h);
    },

    render(ctx, images, config, time) {
      const { width: w, height: h } = ctx.canvas;

      const inset = beginContentLayer(ctx, w, h, config);
      const { iw, ih } = inset;
      const layouts = rowBandLayouts(ih, config.rowCount, config.gap, config);

      ctx.save();
      if (config.perspective !== 0) {
        const angleRad = config.perspective * Math.PI / 180;
        ctx.translate(iw / 2, ih / 2);
        ctx.rotate(angleRad);
        ctx.translate(-iw / 2, -ih / 2);
      }

      const gap = config.gap;
      for (let r = 0; r < config.rowCount; r++) {
        const rowImages = images[r] || [];
        if (rowImages.length === 0) continue;

        const { imgW, imgH, y } = layouts[r];
        const totalW = rowImages.length * (imgW + gap);

        const speed = Array.isArray(config.speed) ? (config.speed[r] || 1) : config.speed;
        const dir = Array.isArray(config.direction) ? (config.direction[r] || 'left') : config.direction;
        const actualDir = dir === 'default' ? 'left' : dir;
        const sign = (actualDir === 'right' || actualDir === 'down') ? 1 : -1;

        const speedMul = 1 + r * 0.15;
        const offset = ((time * speed * BASE_SPEED.h * sign * speedMul) % totalW + totalW) % totalW;

        for (let copy = -2; copy <= 2; copy++) {
          rowImages.forEach((img, i) => {
            const x = i * (imgW + gap) - offset + copy * totalW;
            if (x + imgW < -imgW * 3 || x > iw + imgW * 3) return;
            drawRoundedImage(ctx, img, x, y, imgW, imgH, config);
          });
        }
      }
      ctx.restore();
      endContentLayer(ctx);
    }
  },

  {
    id: 'alternating-bento',
    name: 'Bento Alternating',
    description: 'Signature bento style — rows scroll in alternating directions',
    direction: 'left',
    perspective: 0,
    speed: 1,
    defaultRowCount: 3,
    tags: ['Bento', 'Alternating', 'Classic'],

    seamlessDuration(config, w, h, images) {
      return seamlessRowsDuration(config, w, h, images, BASE_SPEED.d);
    },

    render(ctx, images, config, time) {
      const { width: w, height: h } = ctx.canvas;

      const inset = beginContentLayer(ctx, w, h, config);
      const { iw, ih } = inset;
      const layouts = rowBandLayouts(ih, config.rowCount, config.gap, config);

      ctx.save();
      if (config.perspective !== 0) {
        const angleRad = config.perspective * Math.PI / 180;
        ctx.translate(iw / 2, ih / 2);
        ctx.rotate(angleRad);
        ctx.translate(-iw / 2, -ih / 2);
      }

      const gap = config.gap;
      for (let r = 0; r < config.rowCount; r++) {
        const baseRowImages = images[r] || [];
        if (baseRowImages.length === 0) continue;

        const { imgW, imgH, y } = layouts[r];
        const totalW = baseRowImages.length * (imgW + gap);

        const speed = Array.isArray(config.speed) ? (config.speed[r] || 1) : config.speed;
        const dir = Array.isArray(config.direction) ? (config.direction[r] || 'left') : config.direction;
        const actualDir = dir === 'default' ? 'left' : dir;
        const sign = (actualDir === 'right' || actualDir === 'down') ? 1 : -1;

        const offset = ((time * speed * BASE_SPEED.d * sign) % totalW + totalW) % totalW;
        const startIdx = (r * 2) % baseRowImages.length;
        const rowImages = [...baseRowImages.slice(startIdx), ...baseRowImages.slice(0, startIdx)];

        for (let copy = -2; copy <= 2; copy++) {
          rowImages.forEach((img, i) => {
            const x = i * (imgW + gap) - offset + copy * totalW;
            if (x + imgW < -imgW * 2 || x > iw + imgW * 2) return;
            drawRoundedImage(ctx, img, x, y, imgW, imgH, config);
          });
        }
      }
      ctx.restore();
      endContentLayer(ctx);
    }
  }
];

function drawRoundedImage(ctx, img, x, y, w, h, config) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);

  const r = config.borderRadius;
  const bw = config.borderWidth;

  ctx.save();

  if (bw > 0) {
    ctx.beginPath();
    roundRect(ctx, x - bw, y - bw, w + bw * 2, h + bw * 2, r + bw);
    ctx.fillStyle = config.borderColor;
    ctx.fill();
  }

  ctx.beginPath();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();

  // Scale to fill slot width, anchor at top
  const sh = Math.min(img.height, h * img.width / w);
  ctx.drawImage(img, 0, 0, img.width, sh, x, y, w, h);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
