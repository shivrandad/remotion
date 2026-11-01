# Cinematic coin flip

Vite + Three.js opener: a gold coin flips through space and lands on a random body.

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: **Left click / Space** flip · **F** full screen · **R** record the next flip to `.webm`
(1920×1080, 60 fps, with sound; the red ring shows it is armed).

The result is one bit from `crypto.getRandomValues`. The body is picked with the same
generator (never the same twice in a row) and preloaded before the next click.

Debug: `?body=mars&face=heads&auto=1&t=2.5` starts a flip and freezes it at 2.5 s.

Texture credits are in [CREDITS.md](CREDITS.md).
