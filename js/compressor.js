class ImageCompressor {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 2400;
    this.maxHeight = options.maxHeight || 1800;
    this.quality = options.quality || 0.82;
    this.format = 'image/webp';
  }

  async compress(file) {
    const img = await this.loadImage(file);
    const { width, height } = this.fitDimensions(img.width, img.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    let format = this.format;
    if (!canvas.toDataURL(format).startsWith(`data:${format}`)) {
      format = 'image/jpeg';
    }

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, format, this.quality)
    );

    const compressedImg = await this.loadImage(blob);

    return {
      image: compressedImg,
      originalSize: file.size,
      compressedSize: blob.size,
      width,
      height
    };
  }

  loadImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = reject;
      if (source instanceof Blob || source instanceof File) {
        img.src = URL.createObjectURL(source);
      } else {
        img.src = source;
      }
    });
  }

  fitDimensions(w, h) {
    if (w <= this.maxWidth && h <= this.maxHeight) return { width: w, height: h };
    const ratio = Math.min(this.maxWidth / w, this.maxHeight / h);
    return {
      width: Math.round(w * ratio),
      height: Math.round(h * ratio)
    };
  }
}
