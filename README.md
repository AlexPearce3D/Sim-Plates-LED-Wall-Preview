# Sim-Plates LED Wall Preview

Interactive browser preview for equirectangular Sim-Plates content on a curved LED wall with a car stage reference.

## Local Development

```bash
npm install
npm run dev
```

The public build uses the included H.264 preview video for broad browser playback. For local Safari/HEVC testing, set `FIRST_360_MOV_PATH` in `.env.local`; the Vite dev server will expose it at `/media/first-360.mov`.

## Build

```bash
npm run build
```
