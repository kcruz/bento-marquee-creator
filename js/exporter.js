class Exporter {
  constructor(renderer) {
    this.renderer = renderer;
  }

  estimateSize(format, quality, duration, width, height) {
    const pixels = width * height;
    const fps = this.getFPS(quality);
    const frames = Math.ceil(duration * fps);

    let bytesPerFrame;
    if (format === 'gif') {
      const qualMul = { low: 0.3, mid: 0.55, high: 0.95 }[quality];
      bytesPerFrame = pixels * 0.08 * qualMul;
    } else {
      const qualMul = { low: 0.04, mid: 0.15, high: 0.30 }[quality];
      bytesPerFrame = pixels * 0.04 * qualMul;
    }

    return {
      size: Math.round(bytesPerFrame * frames),
      frames,
      fps
    };
  }

  getFPS(quality) {
    return { low: 12, mid: 20, high: 30 }[quality];
  }

  getScale(quality) {
    return { low: 0.5, mid: 1.0, high: 1.0 }[quality];
  }

  async exportGIF(options, onProgress) {
    const { quality, duration, loop } = options;
    const fps = this.getFPS(quality);
    const scale = this.getScale(quality);
    const totalFrames = Math.ceil(duration * fps);

    const srcW = this.renderer.canvas.width;
    const srcH = this.renderer.canvas.height;
    const outW = Math.round(srcW * scale);
    const outH = Math.round(srcH * scale);

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const offCtx = offscreen.getContext('2d');

    const gifQuality = { low: 20, mid: 5, high: 2 }[quality];

    const gif = new GIF({
      workers: navigator.hardwareConcurrency || 2,
      quality: gifQuality,
      width: outW,
      height: outH,
      workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
      repeat: loop ? 0 : -1
    });

    const wasPlaying = this.renderer.playing;
    this.renderer.pause();

    for (let f = 0; f < totalFrames; f++) {
      const time = (f / totalFrames) * duration;
      this.renderer.renderFrameAt(time);

      offCtx.clearRect(0, 0, outW, outH);
      offCtx.drawImage(this.renderer.canvas, 0, 0, outW, outH);

      gif.addFrame(offCtx, { copy: true, delay: Math.round(1000 / fps) });
      onProgress(f / totalFrames * 0.7);
      await new Promise(r => setTimeout(r, 0));
    }

    return new Promise((resolve, reject) => {
      gif.on('progress', p => onProgress(0.7 + p * 0.3));
      gif.on('finished', blob => {
        if (wasPlaying) this.renderer.play();
        resolve(blob);
      });
      gif.on('error', err => {
        if (wasPlaying) this.renderer.play();
        reject(err);
      });
      gif.render();
    });
  }

  async exportVideo(options, onProgress) {
    const { quality, duration } = options;
    const fps = this.getFPS(quality);
    const scale = this.getScale(quality);
    const totalFrames = Math.ceil(duration * fps);

    const srcW = this.renderer.canvas.width;
    const srcH = this.renderer.canvas.height;
    const outW = Math.round(srcW * scale);
    const outH = Math.round(srcH * scale);

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const offCtx = offscreen.getContext('2d');

    const bitrate = { low: 800_000, mid: 3_000_000, high: 6_000_000 }[quality];

    const rawStream = offscreen.captureStream(0);
    const videoTrack = rawStream.getVideoTracks()[0];
    const stream = new MediaStream([videoTrack]);

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate
    });

    const chunks = [];
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const wasPlaying = this.renderer.playing;
    this.renderer.pause();

    recorder.start();

    for (let f = 0; f < totalFrames; f++) {
      const time = (f / totalFrames) * duration;
      this.renderer.renderFrameAt(time);

      offCtx.clearRect(0, 0, outW, outH);
      offCtx.drawImage(this.renderer.canvas, 0, 0, outW, outH);

      if (videoTrack.requestFrame) {
        videoTrack.requestFrame();
      }

      onProgress(f / totalFrames * 0.9);
      await new Promise(r => setTimeout(r, Math.round(1000 / fps)));
    }

    return new Promise(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (wasPlaying) this.renderer.play();
        resolve(blob);
      };
      recorder.stop();
      onProgress(1);
    });
  }
}
