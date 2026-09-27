import type { DemoScene } from "./content";

export type Timeline = { index: number; elapsedMs: number; playing: boolean; speed: number; loop: boolean };
export type TimelineAction =
  | { type: "tick"; deltaMs: number; scenes: readonly DemoScene[] }
  | { type: "seek"; index: number; scenes: readonly DemoScene[] }
  | { type: "next" | "previous" | "restart" | "toggle" }
  | { type: "play"; value: boolean }
  | { type: "speed"; value: number }
  | { type: "loop"; value: boolean };

export const initialTimeline: Timeline = { index: 0, elapsedMs: 0, playing: false, speed: 1, loop: false };

export function timelineReducer(state: Timeline, action: TimelineAction): Timeline {
  switch (action.type) {
    case "toggle": return { ...state, playing: !state.playing };
    case "play": return { ...state, playing: action.value };
    case "speed": return { ...state, speed: Math.min(2, Math.max(0.5, action.value)) };
    case "loop": return { ...state, loop: action.value };
    case "restart": return { ...state, index: 0, elapsedMs: 0, playing: true };
    case "next": return { ...state, index: state.index + 1, elapsedMs: 0 };
    case "previous": return { ...state, index: Math.max(0, state.index - 1), elapsedMs: 0 };
    case "seek": return { ...state, index: Math.max(0, Math.min(action.scenes.length - 1, action.index)), elapsedMs: 0 };
    case "tick": {
      if (!state.playing || !action.scenes.length || action.deltaMs <= 0) return state;
      let index = Math.min(state.index, action.scenes.length - 1);
      let elapsedMs = state.elapsedMs + Math.min(action.deltaMs, 250) * state.speed;
      while (elapsedMs >= action.scenes[index]!.durationMs) {
        elapsedMs -= action.scenes[index]!.durationMs;
        if (index === action.scenes.length - 1) {
          if (!state.loop) return { ...state, index, elapsedMs: action.scenes[index]!.durationMs, playing: false };
          index = 0;
        } else index += 1;
      }
      return { ...state, index, elapsedMs };
    }
  }
}

export type Ratio = "vertical" | "landscape" | "square" | "portrait";
export const ratios: Record<Ratio, { label: string; css: string; width: number; height: number }> = {
  vertical: { label: "9:16", css: "9 / 16", width: 1080, height: 1920 },
  landscape: { label: "16:9", css: "16 / 9", width: 1920, height: 1080 },
  square: { label: "1:1", css: "1 / 1", width: 1080, height: 1080 },
  portrait: { label: "4:5", css: "4 / 5", width: 1080, height: 1350 },
};

export type DemoQuery = { scenario: string; campaign?: string | undefined; ratio: Ratio; theme: "dark" | "light"; autoplay: boolean; loop: boolean; controls: boolean; captions: boolean; speed: number; duration: number; style: string; platform: string; safeArea: boolean; deviceFrame: boolean; labels: boolean; pointer: boolean };
export function parseDemoQuery(params: URLSearchParams): DemoQuery {
  const ratio = params.get("ratio");
  const speed = Number(params.get("speed"));
  const duration = Number(params.get("duration"));
  return {
    scenario: params.get("scenario") || "signature",
    campaign: params.get("campaign") || undefined,
    ratio: ratio && ratio in ratios ? ratio as Ratio : "landscape",
    theme: params.get("theme") === "light" ? "light" : "dark",
    autoplay: params.get("autoplay") === "true",
    loop: params.get("loop") === "true",
    controls: params.get("controls") !== "false",
    captions: params.get("captions") !== "false",
    speed: Number.isFinite(speed) && speed > 0 ? Math.min(2, Math.max(0.5, speed)) : 1,
    duration: Number.isFinite(duration) && duration >= 6 && duration <= 90 ? duration : 15,
    style: params.get("style") || "Cinematic",
    platform: params.get("platform") || "Instagram Reels",
    safeArea: params.get("safeArea") !== "false",
    deviceFrame: params.get("deviceFrame") === "true",
    labels: params.get("labels") !== "false",
    pointer: params.get("pointer") === "true",
  };
}

export function scaleScenes(scenes: readonly DemoScene[], targetSeconds: number): readonly DemoScene[] {
  const targetMs = targetSeconds * 1000;
  const originalMs = scenes.reduce((sum, item) => sum + item.durationMs, 0);
  if (!originalMs || targetMs <= 0) return scenes;
  return scenes.map((item) => ({ ...item, durationMs: Math.max(250, Math.round(item.durationMs / originalMs * targetMs)) }));
}
