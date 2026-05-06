class MarqueeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.images = [];
    this.template = null;
    this.config = this.defaultConfig();
    this.playing = false;
    this.startTime = 0;
    this.animId = null;
  }

  defaultConfig() {
    return {
      bgColor: '#0a0a0a',
      borderRadius: 12,
      borderWidth: 0,
      borderColor: '#333333',
      speed: [1, 1, 1],
      direction: ['default', 'default', 'default'],
      perspective: 0,
      gap: 16,
      margin: 0,
      visibleCount: [4, 4, 4],
      imageScale: [100, 100, 100],
      rowCount: 3,
      rowTypes: ['desktop', 'desktop', 'desktop']
    };
  }

  setTemplate(template) {
    this.template = template;
    const count = this.config.rowCount || 3;
    this.config.perspective = template.perspective;
    
    const getDir = (baseDir, index) => {
      if (template.id === 'vertical-cascade') return baseDir;
      if (baseDir === 'left') return index % 2 === 0 ? 'left' : 'right';
      if (baseDir === 'right') return index % 2 === 0 ? 'right' : 'left';
      if (baseDir === 'up') return index % 2 === 0 ? 'up' : 'down';
      if (baseDir === 'down') return index % 2 === 0 ? 'down' : 'up';
      return baseDir;
    };
    
    this.config.direction = Array.from({length: count}, (_, i) => getDir(template.direction || 'left', i));
    this.config.speed = Array(count).fill(template.speed);
  }

  setImages(images) {
    this.images = images;
  }

  updateConfig(key, value) {
    this.config[key] = value;
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  drawFrame(time) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.template || this.images.flat().length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No images loaded', canvas.width / 2, canvas.height / 2);
      return;
    }

    this.template.render(ctx, this.images, this.config, time);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.startTime = performance.now() / 1000;
    this._animate();
  }

  pause() {
    this.playing = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  _animate() {
    if (!this.playing) return;
    const elapsed = performance.now() / 1000 - this.startTime;
    this.drawFrame(elapsed);
    this.animId = requestAnimationFrame(() => this._animate());
  }

  renderFrameAt(time) {
    this.drawFrame(time);
  }
}
