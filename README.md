# IPTV Player

A web-based IPTV player that runs entirely in your browser. No account, no server, no installation required — just open the page and add your M3U playlist.

> 🇧🇷 Leia em [Português (Brasil)](README.pt-br.md)

---

## Requirements

Before you start, make sure you have **Node.js** installed on your computer. You can download it at [nodejs.org](https://nodejs.org).

---

## Getting Started

**1. Install dependencies**

Open a terminal in the project folder and run:

```
npm install
```

**2. Start the development server**

```
npm run dev
```

Then open the address shown in your terminal (usually `http://localhost:5173`) in your browser.

---

## Building for Production

To generate a production-ready version of the app:

```
npm run build
```

The output will be placed in the `dist/` folder. You can host those files on any static web server (GitHub Pages, Netlify, a simple nginx, etc.) or just open `index.html` directly in your browser — no server needed.

To preview the production build locally before deploying:

```
npm run preview
```

---

## How to Use

1. Go to **Settings** and add a playlist (M3U file or URL).
2. Come back to the **Player** screen.
3. Select a playlist from the dropdown at the top of the channel list.
4. Click any channel to start watching.

---

## Features

### Player

- **HLS streaming** — plays live TV channels using the HLS protocol (the most common format for IPTV).
- **Channel list sidebar** — browse channels organized by group. You can search, expand/collapse groups, and resize the sidebar by dragging.
- **Favorites** — click the heart icon next to any channel to save it. Access your favorites quickly from the Favorites tab in the sidebar.
- **Watch history** — the last 50 channels you watched are saved automatically. Access them from the Recents tab in the sidebar.
- **EPG (Electronic Program Guide)** — see what is playing right now and the full schedule for the day, directly in the player. Requires an EPG source to be configured in Settings.
- **Picture-in-Picture (PiP)** — pop the video out into a floating window so you can keep watching while browsing other tabs.
- **Manual quality selection** — if the stream has multiple quality levels, you can pick one manually instead of relying on automatic selection.
- **Stream stats** — toggle a stats panel to see real-time information: bitrate, resolution, buffer length, and dropped frames.

---

## Settings

### Language

Choose the interface language. Currently supported: **Portuguese (Brazil)** and **English (US)**.

---

### General

- **Channel grouping** — when enabled, channels in the player are organized into groups (categories) from your M3U file. When disabled, all channels appear in a flat list.
- **Force HTTPS on streams** — replaces `http://` with `https://` in all channel URLs before playing. Useful when the app is hosted on HTTPS (e.g. GitHub Pages) and streams use HTTP. Only works if the IPTV server also accepts HTTPS connections.
- **CORS Proxy** — some streams block direct browser requests due to CORS restrictions. You can enable a proxy and provide the URL of a CORS proxy service to work around this. The proxy is applied to both stream playback and M3U URL fetching.

---

### Playing HTTP streams from an HTTPS page (Mixed Content)

When the app is hosted on HTTPS (e.g. GitHub Pages), browsers block requests to HTTP stream URLs by default. This is called **Mixed Content**. There are a few ways to work around it:

**Option 1 — Force HTTPS (simplest, may not work)**

Enable **Force HTTPS on streams** in Settings → General. This upgrades `http://` to `https://` automatically. Works only if the IPTV server supports HTTPS.

**Option 2 — Allow insecure content in Chrome/Edge (recommended for personal use)**

Chrome and Edge let you allow insecure content for a specific site without affecting anything else:

1. Open the app in your browser.
2. Click the **lock / info icon** in the address bar.
3. Click **Site settings**.
4. Scroll down to **Insecure content**.
5. Change it from **Block** to **Allow**.
6. Reload the page.

This setting is saved permanently for that domain and does not affect other sites.

**Option 3 — CORS Proxy (works for all users, no browser changes needed)**

Deploy a proxy server that fetches HTTP streams on behalf of the browser and returns them over HTTPS. The `proxy/worker.js` file in this repository is a ready-to-deploy [Cloudflare Worker](https://workers.cloudflare.com/) (free tier: 100,000 requests/day, no credit card required):

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create**.
2. Paste the contents of `proxy/worker.js` and click **Deploy**.
3. Copy the generated URL (e.g. `https://iptv-proxy.YOUR_USER.workers.dev`).
4. In the app → Settings → **CORS Proxy**, paste: `https://iptv-proxy.YOUR_USER.workers.dev/?url=`
5. Enable the **CORS Proxy** toggle.

---

### My Playlists

Manage all your M3U playlists in one place.

**Importing a playlist**

- **From URL** — paste the URL of an M3U playlist hosted online. The app will download and parse it.
- **From file** — upload a `.m3u` or `.m3u8` file from your computer.

**Managing a playlist**

Click on a playlist to expand its management panel:

- **General tab** — rename or delete the playlist.
- **Groups tab** — see all channel groups in that playlist. From here you can:
  - Rename a group.
  - Delete a group (this removes all channels in that group from the playlist).
  - Create a new group by copying channels from an existing group.
  - **Move channels between groups** — expand a group to see its channels, then drag and drop a channel onto another group's header to move it.

---

### EPG (Program Guide)

Add one or more XMLTV-format EPG sources to see TV schedules in the player.

- **Add a source** — give it a name and paste the URL of a `.xml` or `.xmltv` file.
- **Refresh** — click the refresh button next to a source to fetch the latest schedule data. This needs to be done manually whenever you want updated data.
- **Delete** — remove an EPG source and all its program data.

After loading an EPG source, open any channel in the player and click the **EPG** button to see what is on now and the schedule for the rest of the day.

> For EPG to match channels, the channel in your M3U file must have a `tvg-id` that matches the channel ID in the XMLTV file.

---

## TODOs

The following features are not yet implemented or are only partially implemented.

### Not implemented

| Feature | Notes |
|---|---|
| User accounts | Different channel lists and settings for different users on the same device. |
| Auto-refresh of URL playlists | Automatically re-fetch URL playlists at a configurable interval. |
| Export playlist as M3U | Export a filtered or customized channel list back as an M3U file. |
| Xtream Codes API | Import playlists using Xtream server credentials (username, password, host) instead of a plain M3U URL. |
| Dark / light theme toggle | Currently the app is dark-only. |
| Import progress bar | Show a progress indicator while loading large playlists. |
| Dynamic `<html lang>` | Update the page's language attribute when the user changes the language setting. |

### Partially implemented

| Feature | Current state |
|---|---|
| Channel reordering | Drag & drop exists in Settings to move channels *between groups*, but there is no way to reorder channels *within* a group or reorder the groups themselves in the sidebar. |
| Group state persistence | Groups are auto-expanded when a playlist loads. The user's manual expand/collapse choices are not saved between sessions. |

---

## Open Source

This project is open source. Contributions are welcome!

- Found a bug? [Open an issue](../../issues).
- Have an idea or want to implement something from the TODO list? [Submit a pull request](../../pulls).
- Not sure where to start? Check the TODO table above — all items there are up for grabs.

When submitting a PR, please keep changes focused and describe what problem you are solving.
