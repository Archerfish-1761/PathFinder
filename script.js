// server.js — secure proxy (no key leaks)
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const app = express();

/* -------- CORS (simple + safe) -------- */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* Small helper: stream an upstream HTTP response to the client */
async function streamProxy(res, url, init = {}) {
  const upstream = await fetch(url, init);
  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("Content-Type", ct);
  const cc = upstream.headers.get("cache-control");
  if (cc) res.setHeader("Cache-Control", cc);
  upstream.body.pipe(res);
}

/* =======================
   MapTiler (SAFE)
   ======================= */

/**
 * 1) Style endpoint:
 *    Fetch style.json from MapTiler, then rewrite any URLs (sprite, glyphs, tiles, sources.url)
 *    to hit our own /api/maptiler/asset/* proxy instead of api.maptiler.com?key=...
 */
app.get("/api/maptiler/:style", async (req, res) => {
  try {
    const style = req.params.style; // streets | hybrid | darkmatter | topo
    const url = `https://api.maptiler.com/maps/${style}/style.json?key=${process.env.MAPTILER_KEY}`;

    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `MapTiler style fetch failed (${r.status})` });
    const styleJson = await r.json();

    const origin = `${req.protocol}://${req.get("host")}`;
    const toProxy = (u) =>
      u
        .replace(/^https:\/\/api\.maptiler\.com\//, `${origin}/api/maptiler/asset/`)
        .replace(/(\?|&)key=[^&]*/g, "") // strip any key in the style
        .replace(/\?$/, ""); // clean trailing ?

    if (styleJson.sprite) styleJson.sprite = toProxy(styleJson.sprite);
    if (styleJson.glyphs) styleJson.glyphs = toProxy(styleJson.glyphs);

    if (styleJson.sources) {
      for (const src of Object.values(styleJson.sources)) {
        if (src.url) src.url = toProxy(src.url);
        if (Array.isArray(src.tiles)) src.tiles = src.tiles.map(toProxy);
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(styleJson));
  } catch (e) {
    console.error("MapTiler style proxy error:", e);
    res.status(500).json({ error: "Failed to proxy MapTiler style" });
  }
});

/**
 * 2) Asset endpoint:
 *    Handles ALL MapTiler assets referenced by the rewritten style:
 *    - tiles.json / vector tiles (.pbf)
 *    - raster tiles (.png/.jpg)
 *    - sprites (.json/.png)
 *    - glyphs (fonts .pbf)
 */
app.get("/api/maptiler/asset/*", async (req, res) => {
  try {
    const path = req.params[0]; // everything after /asset/
    const joiner = path.includes("?") ? "&" : "?";
    const url = `https://api.maptiler.com/${path}${joiner}key=${process.env.MAPTILER_KEY}`;
    await streamProxy(res, url);
  } catch (e) {
    console.error("MapTiler asset proxy error:", e);
    res.status(500).json({ error: "Failed to proxy MapTiler asset" });
  }
});

/* =======================
   Thunderforest (SAFE)
   ======================= */

app.get("/api/thunderforest/:type/:z/:x/:y.png", async (req, res) => {
  try {
    const { type, z, x, y } = req.params;
    const retina = req.query.retina === "true" ? "@2x" : "";
    const url = `https://tile.thunderforest.com/${type}/${z}/${x}/${y}${retina}.png?apikey=${process.env.THUNDERFOREST_KEY}`;
    await streamProxy(res, url);
  } catch (e) {
    console.error("Thunderforest proxy error:", e);
    res.status(500).json({ error: "Failed to proxy Thunderforest tile" });
  }
});

/* =======================
   OpenRouteService (SAFE)
   ======================= */

app.get("/api/route", async (req, res) => {
  try {
    const { start, end } = req.query; // "lon,lat"
    if (!start || !end) return res.status(400).json({ error: "start and end are required" });

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_KEY}&start=${start}&end=${end}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    console.error("ORS proxy error:", e);
    res.status(500).json({ error: "Failed to fetch route" });
  }
});

/* ---------- Boot ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
