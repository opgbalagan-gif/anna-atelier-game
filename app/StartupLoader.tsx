"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Game from "./Game";

type CriticalAsset = {
  path: string;
  bytes: number;
  kind: "image" | "video" | "audio";
};

const CRITICAL_ASSETS: CriticalAsset[] = [
  { path: "assets/loading/atelier-anna-splash.png", bytes: 2_491_135, kind: "image" },
  { path: "assets/anna-atelier-scene.png", bytes: 2_325_650, kind: "image" },
  { path: "assets/videos/anna-sewing.mp4", bytes: 4_525_387, kind: "video" },
  { path: "assets/audio/anna-atelier-theme.mp3", bytes: 2_481_549, kind: "audio" },
];

const APP_READY_WEIGHT = 320_000;
const FONT_READY_WEIGHT = 80_000;
const MINIMUM_SPLASH_MS = 280;
const COMPLETE_HOLD_MS = 140;
const FADE_MS = 460;

function assetPath(path: string) {
  const html = typeof globalThis.document === "undefined" ? undefined : globalThis.document.documentElement;
  const prefix = html?.dataset.assetPrefix || "/";
  return `${prefix.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

function waitForMedia(url: string, kind: "video" | "audio", signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const media = kind === "video" ? document.createElement("video") : new Audio();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      media.removeEventListener("loadeddata", finish);
      media.removeEventListener("error", finish);
      media.pause();
      media.removeAttribute("src");
      media.load();
      resolve();
    };
    const timer = window.setTimeout(finish, kind === "video" ? 12_000 : 7_000);
    signal.addEventListener("abort", finish, { once: true });
    media.addEventListener("loadeddata", finish, { once: true });
    media.addEventListener("error", finish, { once: true });
    media.preload = "auto";
    if (kind === "video" && media instanceof HTMLVideoElement) {
      media.muted = true;
      media.playsInline = true;
    }
    media.src = url;
    media.load();
  });
}

async function confirmAssetReady(asset: CriticalAsset, url: string, signal: AbortSignal) {
  if (asset.kind !== "image") return waitForMedia(url, asset.kind, signal);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve) => {
      if (image.complete) return resolve();
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }
}

async function preloadCriticalAsset(
  asset: CriticalAsset,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
) {
  const url = assetPath(asset.path);
  try {
    const response = await fetch(url, { cache: "force-cache", signal });
    if (!response.ok) throw new Error(`Critical asset failed: ${response.status}`);
    const reader = response.body?.getReader();
    if (reader) {
      let loaded = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        loaded += chunk.value.byteLength;
        onProgress(Math.min(0.96, loaded / asset.bytes));
      }
    } else {
      await response.blob();
      onProgress(0.96);
    }
    await confirmAssetReady(asset, url, signal);
  } catch {
    // A failed optional decode or request must never trap the player on the splash.
  } finally {
    onProgress(1);
  }
}

export default function StartupLoader() {
  const [assetProgress, setAssetProgress] = useState(() => CRITICAL_ASSETS.map(() => 0));
  const [assetsSettled, setAssetsSettled] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [splashRemoved, setSplashRemoved] = useState(false);

  const markGameReady = useCallback(() => setAppReady(true), []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const safetyTimer = window.setTimeout(() => controller.abort(), 60_000);

    const tasks = CRITICAL_ASSETS.map((asset, index) => preloadCriticalAsset(asset, (ratio) => {
      if (!active) return;
      setAssetProgress((current) => {
        if (ratio <= current[index]) return current;
        const next = [...current];
        next[index] = ratio;
        return next;
      });
    }, controller.signal));

    void Promise.allSettled(tasks).then(() => {
      if (active) setAssetsSettled(true);
    });

    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (active) setFontsReady(true);
      }, () => {
        if (active) setFontsReady(true);
      });
    } else {
      queueMicrotask(() => {
        if (active) setFontsReady(true);
      });
    }

    return () => {
      active = false;
      window.clearTimeout(safetyTimer);
      controller.abort();
    };
  }, []);

  const progress = useMemo(() => {
    const assetWeight = CRITICAL_ASSETS.reduce((total, asset, index) => total + asset.bytes * assetProgress[index], 0);
    const totalWeight = CRITICAL_ASSETS.reduce((total, asset) => total + asset.bytes, APP_READY_WEIGHT + FONT_READY_WEIGHT);
    const loadedWeight = assetWeight + (appReady ? APP_READY_WEIGHT : 0) + (fontsReady ? FONT_READY_WEIGHT : 0);
    if (assetsSettled && appReady && fontsReady) return 100;
    return Math.min(99, Math.floor((loadedWeight / totalWeight) * 100));
  }, [appReady, assetProgress, assetsSettled, fontsReady]);

  useEffect(() => {
    if (progress !== 100 || splashRemoved) return;
    const minimumWait = Math.max(0, MINIMUM_SPLASH_MS - performance.now());
    const fadeTimer = window.setTimeout(() => setLeaving(true), minimumWait + COMPLETE_HOLD_MS);
    const removeTimer = window.setTimeout(() => setSplashRemoved(true), minimumWait + COMPLETE_HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [progress, splashRemoved]);

  useEffect(() => {
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = splashRemoved ? "#b75f65" : "#3a2116";
  }, [splashRemoved]);

  const splashStyle = {
    "--splash-image": `url("${assetPath("assets/loading/atelier-anna-splash.png")}")`,
    "--splash-progress": `${progress}%`,
  } as CSSProperties;

  return <>
    <div className="startup-game" aria-hidden={!splashRemoved} inert={!splashRemoved}><Game onReady={markGameReady} /></div>
    {!splashRemoved && <main className={`splash-screen${leaving ? " splash-screen-leaving" : ""}`} style={splashStyle} role="status" aria-live="polite" aria-label={`Открываем ателье, загружено ${progress}%`}>
      <div className="splash-loading-card">
        <strong>Открываем ателье…</strong>
        <div className="splash-progress-track" role="progressbar" aria-label="Загрузка игры" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i /></div>
        <span>{progress}%</span>
      </div>
    </main>}
  </>;
}
