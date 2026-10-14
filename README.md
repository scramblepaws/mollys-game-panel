# Molly's Game Panel

A local web panel for installing, running, and managing game servers on your own Windows machine. Built with Svelte 5 on the frontend and a dependency-free Node backend — no external packages on the server side, everything runs through Node's standard library.

It is **not just a Minecraft panel** — Minecraft is simply the deepest integration.

## Supported games

| Game | Install source | Notes |
| --- | --- | --- |
| Minecraft (Paper / Purpur / Vanilla) | Official project APIs | Full management: RCON, files, plugins, datapacks |
| Terraria | SteamCMD | One-click dedicated server |
| Valheim | SteamCMD | Password-protected servers |
| Palworld | SteamCMD | Dedicated server |
| Counter-Strike 2 | SteamCMD | Map/game-mode options, Metamod:Source + CounterStrikeSharp plugin setup |

## Features

- **Server wizard** — pick a game, version, port, memory, world settings, storage location; the panel downloads and installs everything for you
- **Live install progress** — percent, ETA, and download speed right in the server list, with a stop/cancel button
- **Start / stop / kill** — including a "starting up" state while a server boots, and graceful stop commands per game
- **Live console** — streamed output with ANSI parsing, plus a command input that talks to the running process (or falls back to RCON for Minecraft)
- **RCON dashboard** — real online players, TPS, and world counts for Minecraft servers (auto-configures RCON on new servers)
- **File manager** — a VS Code-style file tree and editor for every server folder: browse, edit, save (Ctrl+S), line numbers, binary-file protection
- **Plugin & datapack shop** — search Modrinth from the panel and install straight into a Minecraft server's `plugins/` or `world/datapacks/`
- **CS2 plugin setup** — installs Metamod:Source + CounterStrikeSharp and patches `gameinfo.gi` automatically
- **Customization** — per-server icons (auto-resized to 64×64), a configurable default server location, animated visual toggles

## Requirements

- Windows (the panel uses PowerShell, SteamCMD, and Windows-style paths)
- Node.js 18+ (the panel also auto-detects a bundled JDK in `runtime/` or an installed one for Minecraft)
- Internet access for downloads

## Getting started

```bash
cd panel
npm install
npm run build        # builds the frontend into panel/dist
npm run server       # starts the panel on http://127.0.0.1:8787
```

Or just double-click **`MollyPanel.vbs`** — it starts the backend for you and opens the panel in an Edge app window.

## Development

```bash
cd panel
npm run dev          # Vite dev server on :5173, proxying /api to the backend
npm run server       # backend in another terminal
npm run check        # svelte-check type checking
```

## Layout

- `panel/server/backend.mjs` — the entire backend (HTTP server, installer, process supervision, RCON, file API)
- `panel/src/` — Svelte frontend
- `servers/` — default home for server installations (gitignored, configurable in the panel settings)
- `runtime/` — bundled runtimes like the JDK and SteamCMD (gitignored)

## Notes

- Servers are supervised by the panel process — closing the panel stops its servers. Use each server's generated `start.cmd` if you want to run one outside the panel.
- Custom storage locations are remembered in `panel/server/instances.json` (gitignored).
- The panel binds to `127.0.0.1` only; it is meant for local admin use.
