// R arms the recorder; the next flip is captured from the click until the
// title has settled, then saved as a .webm (video + the synthesised audio).
export class FlipRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.armed = false;
    this.rec = null;
    this.chunks = [];
  }

  get recording() {
    return !!this.rec;
  }

  mime() {
    const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return c.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  start(audioStream) {
    const stream = this.canvas.captureStream(60);
    if (audioStream) for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
    this.chunks = [];
    const mimeType = this.mime();
    this.rec = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 40_000_000,
      audioBitsPerSecond: 256_000,
    });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.armed = false;
  }

  stop(name) {
    const rec = this.rec;
    if (!rec) return Promise.resolve();
    this.rec = null;
    return new Promise((res) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 2000);
        rec.stream.getTracks().forEach((t) => t.kind === 'video' && t.stop());
        res();
      };
      rec.stop();
    });
  }
}
