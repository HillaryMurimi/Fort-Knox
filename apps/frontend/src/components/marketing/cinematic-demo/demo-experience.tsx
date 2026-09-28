"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Captions, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Maximize, Moon, Pause, Play, RotateCcw, Settings2, Sun } from "lucide-react";
import { DemoStage } from "./demo-stage";
import { scenarios, socialCampaigns } from "@/lib/cinematic-demo/content";
import { initialTimeline, parseDemoQuery, ratios, scaleScenes, timelineReducer, type Ratio } from "@/lib/cinematic-demo/timeline";
import styles from "./demo.module.css";

type Mode = "live" | "explore" | "studio";
const platforms = ["Instagram Reels", "TikTok", "YouTube Shorts", "Instagram Stories", "YouTube", "LinkedIn", "X", "Website"] as const;
const durations = [6, 10, 15, 20, 30, 45, 60, 90] as const;

export function DemoExperience({ mode }: { mode: Mode }) {
  const [scenarioId, setScenarioId] = useState("signature");
  const [campaignId, setCampaignId] = useState("");
  const [timeline, dispatch] = useReducer(timelineReducer, initialTimeline);
  const [ratio, setRatio] = useState<Ratio>(mode === "studio" ? "vertical" : "landscape");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [platform, setPlatform] = useState<(typeof platforms)[number]>("Instagram Reels");
  const [duration, setDuration] = useState<number>(15);
  const [captions, setCaptions] = useState(true);
  const [safeArea, setSafeArea] = useState(mode === "studio");
  const [clean, setClean] = useState(false);
  const [presenterOpen, setPresenterOpen] = useState(mode === "studio");
  const [intro, setIntro] = useState(mode === "live");
  const [prospect, setProspect] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const query = parseDemoQuery(new URLSearchParams(window.location.search));
      if (scenarios.some((item) => item.id === query.scenario)) setScenarioId(query.scenario);
      if (query.campaign && socialCampaigns.some((item) => item.id === query.campaign)) setCampaignId(query.campaign);
      if (window.location.search.includes("ratio=")) setRatio(query.ratio);
      else if (mode === "explore" && window.matchMedia("(max-width: 650px)").matches) setRatio("vertical");
      setTheme(query.theme);
      setCaptions(query.captions);
      setSafeArea(query.safeArea);
      setDuration(query.duration);
      setClean(!query.controls);
      if (platforms.some((item) => item === query.platform)) setPlatform(query.platform as (typeof platforms)[number]);
      dispatch({ type: "speed", value: query.speed });
      dispatch({ type: "loop", value: query.loop });
      if (query.autoplay) { setIntro(false); dispatch({ type: "play", value: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]!;
  const campaign = socialCampaigns.find((item) => item.id === campaignId);
  const scenes = useMemo(() => mode === "studio" ? scaleScenes(campaign?.scenes ?? scenario.scenes, duration) : mode === "live" && scenario.id === "signature" ? scaleScenes(scenario.scenes, 16 * 60) : scenario.scenes, [mode, campaign, scenario, duration]);
  const index = Math.min(timeline.index, scenes.length - 1);
  const current = scenes[index]!;
  const progress = Math.min(1, timeline.elapsedMs / current.durationMs);

  useEffect(() => {
    if (!timeline.playing || intro) return;
    let frame = 0;
    const tick = (now: number) => {
      if (lastTick.current !== null) dispatch({ type: "tick", deltaMs: now - lastTick.current, scenes });
      lastTick.current = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); lastTick.current = null; };
  }, [timeline.playing, intro, scenes]);

  const next = useCallback(() => dispatch({ type: "seek", index: Math.min(index + 1, scenes.length - 1), scenes }), [index, scenes]);
  const previous = useCallback(() => dispatch({ type: "seek", index: Math.max(index - 1, 0), scenes }), [index, scenes]);
  const selectScenario = (id: string) => { setScenarioId(id); setCampaignId(""); dispatch({ type: "seek", index: 0, scenes }); dispatch({ type: "play", value: false }); setIntro(false); };
  const restart = () => { setIntro(false); dispatch({ type: "restart" }); };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.shiftKey && event.key.toLowerCase() === "d") { event.preventDefault(); setPresenterOpen((value) => !value); return; }
      if (event.key === " ") { event.preventDefault(); setIntro(false); dispatch({ type: "toggle" }); }
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
      if (event.key.toLowerCase() === "r") { event.preventDefault(); restart(); }
      if (event.key.toLowerCase() === "c") { event.preventDefault(); setClean((value) => !value); }
      if (event.key.toLowerCase() === "f") { event.preventDefault(); void frameRef.current?.requestFullscreen?.(); }
      if (event.key === "Escape") setClean(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [next, previous]);

  const copyCaptureUrl = async () => {
    const url = new URL(window.location.href);
    url.pathname = "/demo/studio";
    url.search = new URLSearchParams({ scenario: scenarioId, ...(campaignId ? { campaign: campaignId } : {}), ratio, theme, duration: String(duration), platform, safeArea: String(safeArea), autoplay: "true", loop: String(timeline.loop), controls: "false", captions: String(captions), speed: String(timeline.speed) }).toString();
    try { await navigator.clipboard.writeText(url.toString()); setCopyStatus("Capture link copied"); }
    catch { setCopyStatus("Clipboard unavailable in this browser"); }
  };

  const title = mode === "live" ? "Executive presentation" : mode === "explore" ? "Explore the portfolio" : "Content studio";

  return <div className={`${styles.shell} ${clean ? styles.clean : ""}`} data-theme={theme}>
    <header className={styles.topbar}><Link className={styles.brand} href="/demo"><span className={styles.brandMark}>PC</span>PROPERTY COMMAND CENTER</Link><span className={styles.chapterName}>{current.title}</span><div className={styles.topActions}><Link href="/demo">Scenarios</Link><Link href={mode === "studio" ? "/demo/live" : "/demo/studio"}>{mode === "studio" ? "Live" : "Studio"}</Link><button className={styles.iconButton} type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Switch theme" aria-label="Switch theme">{theme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}</button></div></header>
    <div className={styles.layout}>
      {presenterOpen && <aside className={styles.rail} aria-label={mode === "studio" ? "Studio controls" : "Presenter controls"}><h2>{mode === "studio" ? "Capture settings" : "Presenter desk"}</h2><div className={styles.railGroup}><h3>Scenario</h3>{scenarios.map((item) => <button key={item.id} type="button" data-active={item.id === scenarioId && !campaignId} onClick={() => selectScenario(item.id)}>{item.title}</button>)}</div>{mode === "studio" && <div className={`${styles.railGroup} ${styles.captureGroup}`}><h3>Capture</h3><label htmlFor="campaign">Campaign</label><select id="campaign" value={campaignId} onChange={(event) => { setCampaignId(event.target.value); dispatch({ type: "seek", index: 0, scenes }); }}><option value="">Custom scenario</option>{socialCampaigns.map((item) => <option value={item.id} key={item.id}>{item.hook}</option>)}</select><label htmlFor="platform">Platform</label><select id="platform" value={platform} onChange={(event) => { const value = event.target.value as (typeof platforms)[number]; setPlatform(value); setRatio(value === "YouTube" || value === "Website" ? "landscape" : value === "LinkedIn" ? "portrait" : value === "X" ? "square" : "vertical"); }}>{platforms.map((item) => <option key={item}>{item}</option>)}</select><label htmlFor="ratio">Aspect ratio</label><select id="ratio" value={ratio} onChange={(event) => setRatio(event.target.value as Ratio)}>{Object.entries(ratios).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select><label htmlFor="duration">Duration</label><select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{durations.map((value) => <option value={value} key={value}>{value} seconds</option>)}</select><label className={styles.check}><input type="checkbox" checked={safeArea} onChange={(event) => setSafeArea(event.target.checked)}/> Safe area</label><button className={styles.controlButton} type="button" onClick={() => void copyCaptureUrl()}><Copy size={14}/> Copy capture URL</button><p role="status">{copyStatus}</p></div>}
      <div className={styles.railGroup}><h3>Playback</h3><label htmlFor="speed">Speed</label><select id="speed" value={timeline.speed} onChange={(event) => dispatch({ type: "speed", value: Number(event.target.value) })}>{[.5, .75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select><label className={styles.check}><input type="checkbox" checked={timeline.loop} onChange={(event) => dispatch({ type: "loop", value: event.target.checked })}/> Loop</label><label className={styles.check}><input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)}/> Captions</label><label htmlFor="rail-theme">Theme</label><select id="rail-theme" value={theme} onChange={(event) => setTheme(event.target.value as "light" | "dark")}><option value="dark">Executive graphite</option><option value="light">Executive ivory</option></select></div>{mode === "live" && <div className={styles.railGroup}><h3>Presentation</h3><label htmlFor="prospect">Prepared for</label><input id="prospect" maxLength={60} value={prospect} onChange={(event) => setProspect(event.target.value)} placeholder="Organization name"/><p>Fictional Acacia figures remain unchanged.</p></div>}<div className={styles.railGroup}><h3>Chapters</h3>{scenes.map((item, sceneIndex) => <button type="button" key={`${item.id}-${sceneIndex}`} data-active={index === sceneIndex} onClick={() => dispatch({ type: "seek", index: sceneIndex, scenes })}>{String(sceneIndex + 1).padStart(2, "0")} / {item.title}</button>)}</div></aside>}
      <main className={styles.content} id="main-content"><div className={styles.contentHead}><div><small>ACACIA PROPERTY HOLDINGS / FICTIONAL DEMO</small><h1>{title}</h1><p>One portfolio. Every decision in context.</p></div><div className={styles.contentActions}><button type="button" className={styles.controlButton} onClick={() => setPresenterOpen((value) => !value)} aria-expanded={presenterOpen} title="Presenter controls (Shift+D)"><Settings2 size={15}/> Controls</button><button type="button" className={styles.controlButton} onClick={() => setClean(true)} title="Clean view (C)"><EyeOff size={15}/> Clean view</button></div></div>
        <div className={styles.player}><div className={styles.frame} data-ratio={ratio} ref={frameRef} style={{ aspectRatio: ratios[ratio].css }}><DemoStage scene={current} progress={progress} captions={captions} showLabels={!clean} theme={theme} safeArea={safeArea && mode === "studio" && !clean} prospect={prospect.trim()} platform={mode === "studio" ? platform : undefined}/></div></div>
        {!clean && <div className={styles.playback} aria-label="Playback controls"><button className={styles.iconButton} type="button" onClick={previous} aria-label="Previous scene" title="Previous scene"><ChevronLeft/></button><button className={`${styles.controlButton} ${styles.primary}`} type="button" onClick={() => { setIntro(false); dispatch({ type: "toggle" }); }} aria-label={timeline.playing ? "Pause" : "Play"}>{timeline.playing ? <Pause size={15}/> : <Play size={15}/>} {timeline.playing ? "Pause" : "Play"}</button><button className={styles.iconButton} type="button" onClick={next} aria-label="Next scene" title="Next scene"><ChevronRight/></button><button className={styles.iconButton} type="button" onClick={restart} aria-label="Restart" title="Restart"><RotateCcw/></button><input type="range" min={0} max={scenes.length - 1} value={index} onChange={(event) => dispatch({ type: "seek", index: Number(event.target.value), scenes })} aria-label="Scene"/><span>{index + 1} / {scenes.length}</span><button className={styles.iconButton} type="button" onClick={() => setCaptions((value) => !value)} aria-label={captions ? "Hide captions" : "Show captions"} title="Captions"><Captions/></button><button className={styles.iconButton} type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} aria-label="Fullscreen" title="Fullscreen"><Maximize/></button></div>}
        {mode === "live" && intro && <button className={`${styles.controlButton} ${styles.primary}`} type="button" onClick={restart} style={{ marginTop: 15 }}><Play size={15}/> Begin demo</button>}
        {mode === "explore" && <div className={styles.exploreList}>{[["signature", "The Command Center"], ["rent", "See rent clearly"], ["maintenance", "Follow a repair"], ["vacancy", "Understand vacancy"], ["security", "Fort Knox"], ["roles", "Access by role"]].map(([id, label]) => <button key={id} type="button" onClick={() => { selectScenario(id ?? "signature"); dispatch({ type: "play", value: true }); }}>{label} <ChevronRight size={14}/></button>)}</div>}
        {clean && <button className={`${styles.iconButton} ${styles.cleanExit}`} type="button" onClick={() => setClean(false)} aria-label="Exit clean view" title="Exit clean view"><Eye/></button>}
      </main>
    </div>
  </div>;
}
