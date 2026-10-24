# VLC Redesign Skin

A working **VLC 3 (skins2)** skin based on [Juxtopposed's "VLC Redesign"](https://www.figma.com/community/file/1691465999134370980/vlc-redesign) (Figma Community, licensed **CC BY 4.0**). Dark charcoal surfaces, VLC-orange accent, rounded corners, quiet minimal controls.

![accent](https://img.shields.io/badge/accent-%23FF8800-FF8800) ![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue)

## Features

- **Main player window** (960×560, resizable video area): orange circular play/pause, prev/next, live `time / duration` display, animated orange seek bar, volume slider + mute, playlist / equalizer / fullscreen buttons, drag anywhere to move
- **Playlist window**: real draggable playtree, orange selection & playing highlight, resizable
- **Equalizer window**: preamp + 10-band sliders with enable toggle

All ~57 assets (icons, slider thumbs, animation frames) and `theme.xml` are generated from a single dependency-free Node script (`build.mjs`) — no binary files committed.

## Download

Grab **`VLC-Redesign.vlt`** from [Releases](../../releases).

## Install

1. Open VLC → **Tools → Preferences → Interface**
2. Choose **Use custom skin**, browse to the downloaded `VLC-Redesign.vlt`
3. Save and restart VLC

Optionally drop the file in your skins folder to pick it from the dropdown:
- **Windows:** `C:\Program Files\VideoLAN\VLC\skins`
- **Linux:** `~/.local/share/vlc/skins2`

> Note: VLC's skin engine (skins2) is not available in macOS builds.

## Build from source

```bash
node build.mjs   # -> skin/ (theme.xml + PNGs) and dist/VLC-Redesign.vlt
```

A GitHub Actions workflow (`.github/workflows/release.yml`) rebuilds and publishes the `.vlt` on every push to `main`.

## Credits

- Design concept: **"VLC Redesign" by Juxtopposed** — [Figma Community file](https://www.figma.com/community/file/1691465999134370980/vlc-redesign), CC BY 4.0
- Skin implementation: Miguel Garcia

This is an adaptation within VLC's skins2 engine, so it covers the player, playlist, and equalizer; the concept's library/settings screens are outside what VLC skins can replace.
