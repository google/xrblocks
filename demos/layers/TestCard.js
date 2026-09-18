const CARD_WIDTH = 2048;
const CARD_HEIGHT = 1152;

/**
 * Draws a high resolution test card and exposes it as a video stream.
 *
 * A composition layer is sampled once at its own resolution while an in-scene
 * texture goes through the eye buffer first, so the difference only shows up
 * on content with detail finer than the eye buffer can hold. A 480p clip has
 * none, which makes it useless as a comparison. Fine text and high frequency
 * line pairs are the cases the layers spec itself calls out.
 *
 * Generated rather than downloaded so the demo has nothing to fetch and the
 * resolution is known.
 */
export class TestCard {
  constructor(width = CARD_WIDTH, height = CARD_HEIGHT) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.frame = 0;
  }

  /**
   * Starts drawing and returns a video element carrying the result.
   *
   * @returns {HTMLVideoElement} An element playing the test card.
   */
  start() {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);

    this.draw();
    // 30fps is plenty: the point is spatial detail, not motion.
    video.srcObject = this.canvas.captureStream(30);
    video.play().catch(() => {});

    const tick = () => {
      this.draw();
      this.timer = requestAnimationFrame(tick);
    };
    this.timer = requestAnimationFrame(tick);
    return video;
  }

  /** Stops redrawing. */
  stop() {
    if (this.timer) cancelAnimationFrame(this.timer);
    this.timer = undefined;
  }

  /** Paints one frame of the card. */
  draw() {
    const {ctx, canvas} = this;
    const w = canvas.width;
    const h = canvas.height;
    this.frame++;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    // Text at decreasing sizes. The smallest lines are the ones that survive
    // or do not, depending on how many times the content gets resampled.
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    let y = 60;
    for (const size of [96, 64, 44, 30, 22, 16, 12]) {
      ctx.font = `${size}px monospace`;
      ctx.fillText(
        `${size}px  the quick brown fox jumps over the lazy dog 0123456789`,
        60,
        y
      );
      y += size + 22;
    }

    // Line pairs at one, two and three pixel spacing. Aliasing here is a
    // direct read on how much resolution survived.
    let x = 60;
    for (const gap of [1, 2, 3]) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) {
        ctx.fillRect(x + i * gap * 2, y + 20, gap, 220);
      }
      ctx.font = '20px monospace';
      ctx.fillText(`${gap}px pairs`, x, y + 252);
      x += 60 * gap * 2 + 80;
    }

    // A moving element, so it is obvious the video is live rather than frozen.
    const t = (this.frame % 180) / 180;
    ctx.fillStyle = '#4f9cff';
    ctx.fillRect(60 + t * (w - 220), h - 90, 160, 40);

    ctx.strokeStyle = '#4f9cff';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#4f9cff';
    ctx.font = '28px monospace';
    ctx.fillText(`${w}x${h} source`, 60, h - 150);
  }
}
