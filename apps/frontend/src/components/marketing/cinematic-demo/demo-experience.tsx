"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, Building2, Captions, ChevronLeft, ChevronRight, CircleHelp, Copy, Expand, Eye, EyeOff, Maximize, Pause, Play, RotateCcw, Settings2, ShieldCheck, VolumeX, Wrench } from "lucide-react";
import { DemoStage } from "./demo-stage";
import { scenarios, socialCampaigns, type DemoScenario } from "@/lib/cinematic-demo/content";
import { initialTimeline, parseDemoQuery, ratios, scaleScenes, timelineReducer, type Ratio } from "@/lib/cinematic-demo/timeline";
import styles from "./demo.module.css";

type Mode = "live" | "explore" | "studio";
type Platform = "TikTok" | "Instagram Reels" | "Instagram Stories" | "YouTube Shorts" | "YouTube" | "LinkedIn" | "X" | "Website";
const platforms: readonly Platform[] = ["TikTok", "Instagram Reels", "Instagram Stories", "YouTube Shorts", "YouTube", "LinkedIn", "X", "Website"];
const durations = [6, 10, 15, 20, 30, 45, 60, 90] as const;
const stylesList = ["Cinematic", "Minimal", "Fast-cut", "Executive", "Dark Fort Knox", "Data-driven"] as const;

export function DemoExperience({ mode }: { mode: Mode }) {
  const [scenarioId, setScenarioId] = useState("signature");
  const [campaignId, setCampaignId] = useState("");
  const [timeline, dispatch] = useReducer(timelineReducer, initialTimeline);
  const [ratio, setRatio] = useState<Ratio>(mode === "studio" ? "vertical" : "landscape");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [platform, setPlatform] = useState<Platform>("Instagram Reels");
  const [duration, setDuration] = useState<number>(15);
  const [style, setStyle] = useState<(typeof stylesList)[number]>("Cinematic");
  const [captions, setCaptions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPointer, setShowPointer] = useState(false);
  const [safeArea, setSafeArea] = useState(mode === "studio");
  const [deviceFrame, setDeviceFrame] = useState(false);
  const [clean, setClean] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [presenterOpen, setPresenterOpen] = useState(mode === "studio");
  const [prospect, setProspect] = useState("");
  const [properties, setProperties] = useState("");
  const [units, setUnits] = useState("");
  const [intro, setIntro] = useState(mode === "live");
  const [copyStatus, setCopyStatus] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const query = parseDemoQuery(new URLSearchParams(window.location.search));
      if (scenarios.some((item) => item.id === query.scenario)) setScenarioId(query.scenario);
      if (query.campaign && socialCampaigns.some((item) => item.id === query.campaign)) setCampaignId(query.campaign);
      if (window.location.search.includes("ratio=")) setRatio(query.ratio);
      else if (mode === "explore" && window.matchMedia("(max-width: 650px)").matches) setRatio("vertical");
      setTheme(query.theme); setCaptions(query.captions); setShowControls(query.controls); setClean(!query.controls); setDuration(query.duration);
      if (stylesList.some((item) => item === query.style)) setStyle(query.style as (typeof stylesList)[number]);
      if (window.location.search.includes("platform=") && platforms.some((item) => item === query.platform)) setPlatform(query.platform as Platform);
      else if (window.location.search.includes("ratio=")) setPlatform(query.ratio === "square" ? "X" : query.ratio === "portrait" ? "LinkedIn" : query.ratio === "landscape" ? "YouTube" : "Instagram Reels");
      setSafeArea(query.safeArea); setDeviceFrame(query.deviceFrame); setShowLabels(query.labels); setShowPointer(query.pointer);
      dispatch({ type: "speed", value: query.speed }); dispatch({ type: "loop", value: query.loop });
      if (query.autoplay) { setIntro(false); dispatch({ type: "play", value: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const selectedScenario: DemoScenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0]!;
  const selectedCampaign = socialCampaigns.find((item) => item.id === campaignId);
  const scenes = useMemo(() => mode === "studio" ? scaleScenes(selectedCampaign?.scenes ?? selectedScenario.scenes, duration) : mode === "live" && selectedScenario.id === "signature" ? scaleScenes(selectedScenario.scenes, 16 * 60) : selectedScenario.scenes, [mode, selectedCampaign, duration, selectedScenario]);
  const index = Math.min(timeline.index, scenes.length - 1);
  const current = scenes[index]!;
  const progress = Math.min(1, timeline.elapsedMs / current.durationMs);

  useEffect(() => {
    if (!timeline.playing || intro) return;
    let frame = 0;
    const tick = (now: number) => { if (lastTickRef.current !== null) dispatch({ type: "tick", deltaMs: now - lastTickRef.current, scenes }); lastTickRef.current = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); lastTickRef.current = null; };
  }, [timeline.playing, intro, scenes]);

  const selectScenario = (id: string) => { setScenarioId(id); setCampaignId(""); dispatch({ type: "seek", index: 0, scenes: scenarios.find((item) => item.id === id)?.scenes ?? scenes }); dispatch({ type: "play", value: false }); setIntro(false); };
  const selectCampaign = (id: string) => { setCampaignId(id); dispatch({ type: "seek", index: 0, scenes }); dispatch({ type: "play", value: false }); };
  const resetDemo = () => { setScenarioId("signature"); setCampaignId(""); setRatio(mode === "studio" ? "vertical" : "landscape"); setTheme("dark"); setCaptions(true); setShowLabels(true); setShowPointer(false); setSafeArea(mode === "studio"); setDeviceFrame(false); setDuration(15); setStyle("Cinematic"); setPlatform("Instagram Reels"); setProspect(""); setProperties(""); setUnits(""); setClean(false); setShowControls(true); setIntro(mode === "live"); dispatch({ type: "seek", index: 0, scenes: scenarios[0]!.scenes }); dispatch({ type: "play", value: false }); dispatch({ type: "speed", value: 1 }); dispatch({ type: "loop", value: false }); };
  const next = useCallback(() => dispatch({ type: "seek", index: Math.min(index + 1, scenes.length - 1), scenes }), [index, scenes]);
  const previous = useCallback(() => dispatch({ type: "seek", index: Math.max(index - 1, 0), scenes }), [index, scenes]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.shiftKey && event.key.toLowerCase() === "d") { event.preventDefault(); setPresenterOpen((value) => !value); return; }
      if (event.key === " ") { event.preventDefault(); dispatch({ type: "toggle" }); }
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); previous(); }
      if (event.key.toLowerCase() === "r") { event.preventDefault(); dispatch({ type: "restart" }); setIntro(false); }
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
    url.search = new URLSearchParams({ scenario: scenarioId, ...(campaignId ? { campaign: campaignId } : {}), ratio, theme, duration: String(duration), style, platform, safeArea: String(safeArea), deviceFrame: String(deviceFrame), labels: String(showLabels), pointer: String(showPointer), autoplay: "true", loop: String(timeline.loop), controls: "false", captions: String(captions), speed: String(timeline.speed) }).toString();
    await navigator.clipboard.writeText(url.toString());
    setCopyStatus("Capture link copied");
    window.setTimeout(() => setCopyStatus(""), 2500);
  };

  const title = mode === "live" ? "Live presentation" : mode === "explore" ? "Explore the command center" : "Content studio";
  const introDescription = prospect.trim() ? `Prepared for ${prospect.trim()}${properties || units ? ` / your portfolio: ${properties || "-"} properties, ${units || "-"} units` : ""}. Story data: fictional Acacia portfolio, 5 properties and 144 units.` : "Acacia Property Holdings / fictional portfolio";

  return <div className={`${styles.shell} ${clean ? styles.clean : ""}`}>
    <header className={styles.topbar}><Link className={styles.brand} href="/"><mark>PC</mark> PROPERTY COMMAND CENTER</Link><nav className={styles.topLinks} aria-label="Demo experiences"><Link data-active={mode === "live"} href="/demo/live">Live</Link><Link data-active={mode === "explore"} href="/demo/explore">Explore</Link><Link data-active={mode === "studio"} href="/demo/studio">Studio</Link><Link href="/">Website</Link></nav></header>
    <div className={styles.workspace}><main className={styles.main} id="main-content"><div className={styles.heading}><div><small>SALES / PRODUCT DEMONSTRATION</small><h1>{title}</h1><p>Simulated portfolio. Real product workflows. No live account data.</p></div><div className={styles.headingActions}><button className={styles.button} type="button" onClick={() => setPresenterOpen((value) => !value)} aria-expanded={presenterOpen} title="Presenter controls (Shift+D)"><Settings2 size={15}/> Controls</button><button className={styles.button} type="button" onClick={() => setClean(true)} title="Clean capture (C)"><EyeOff size={15}/> Clean view</button></div></div>
      {mode === "live" && intro && <div className={styles.salesIntro}><div><small>PROPERTY COMMAND CENTER / PRIVATE PRESENTATION</small><h2>{prospect.trim() || "Your portfolio"}</h2><p>{introDescription}</p></div><button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => { setIntro(false); dispatch({ type: "restart" }); }}><Play size={16}/> Begin demo</button></div>}
      {mode === "explore" && <div className={styles.exploreCards}>{[["signature", "Start the tour", Building2], ["rent", "See rent clearly", Banknote], ["maintenance", "Follow a repair", Wrench], ["security", "Explore Fort Knox", ShieldCheck], ["roles", "See scoped access", Eye], ["health", "See intelligence", CircleHelp]].map(([id, label, Icon]) => { const IconComponent = Icon as typeof Building2; return <button key={id as string} type="button" onClick={() => { selectScenario(id as string); dispatch({ type: "play", value: true }); }}><IconComponent size={18}/><b>{label as string}</b><small>Open interactive sequence</small></button>; })}</div>}
      {mode === "studio" && <div className={styles.studioBar}><label className={styles.eyebrow} htmlFor="campaign-select">CAMPAIGN</label><select id="campaign-select" className={styles.select} value={campaignId} onChange={(event) => selectCampaign(event.target.value)}><option value="">Custom scenario</option>{socialCampaigns.map((item) => <option key={item.id} value={item.id}>{item.hook}</option>)}</select><button className={styles.button} type="button" onClick={() => void copyCaptureUrl()}><Copy size={15}/> Capture URL</button><span className={styles.copyStatus} role="status">{copyStatus}</span></div>}
      <div className={styles.playerArea}><div className={styles.frame} data-ratio={ratio} ref={frameRef} style={{ aspectRatio: ratios[ratio].css }}><DemoStage scene={current} progress={progress} captions={captions} showLabels={showLabels} showPointer={showPointer && !clean} theme={theme} safeArea={safeArea && !clean} deviceFrame={deviceFrame} prospect={prospect.trim()} stylePreset={style} platform={mode === "studio" ? platform : undefined}/></div></div>
      {showControls && <div className={styles.controls} aria-label="Playback controls"><button className={styles.iconButton} type="button" onClick={previous} aria-label="Previous scene" title="Previous scene (Left arrow)"><ChevronLeft/></button><button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => { setIntro(false); dispatch({ type: "toggle" }); }} aria-label={timeline.playing ? "Pause" : "Play"}>{timeline.playing ? <Pause size={16}/> : <Play size={16}/>} {timeline.playing ? "Pause" : "Play"}</button><button className={styles.iconButton} type="button" onClick={next} aria-label="Next scene" title="Next scene (Right arrow)"><ChevronRight/></button><button className={styles.iconButton} type="button" onClick={() => { setIntro(false); dispatch({ type: "restart" }); }} aria-label="Restart" title="Restart (R)"><RotateCcw/></button><div className={styles.progress}><input type="range" min={0} max={scenes.length - 1} value={index} onChange={(event) => dispatch({ type: "seek", index: Number(event.target.value), scenes })} aria-label="Scene"/><span>{index + 1} / {scenes.length}</span></div><button className={styles.iconButton} type="button" onClick={() => void frameRef.current?.requestFullscreen?.()} aria-label="Fullscreen" title="Fullscreen (F)"><Maximize/></button><button className={styles.iconButton} type="button" onClick={() => setCaptions((value) => !value)} aria-label={captions ? "Hide captions" : "Show captions"} title="Toggle captions"><Captions/></button><button className={styles.iconButton} type="button" onClick={() => setClean(true)} aria-label="Clean capture" title="Clean capture (C)"><Expand/></button></div>}
      {clean && <button className={`${styles.iconButton} ${styles.cleanExit}`} type="button" onClick={() => setClean(false)} aria-label="Exit clean capture" title="Exit clean capture (Escape)"><Eye/></button>}
    </main>{presenterOpen && <aside className={styles.sidebar} aria-label="Presenter controls"><section className={styles.sidebarSection}><h2>Scenario</h2><div className={styles.scenarioList}>{scenarios.map((item) => <button key={item.id} type="button" data-active={scenarioId === item.id && !campaignId} onClick={() => selectScenario(item.id)}>{item.title}</button>)}</div></section><section className={styles.sidebarSection}><h2>Scenes</h2><div className={styles.sceneList}>{scenes.map((item, sceneIndex) => <button key={`${item.id}-${sceneIndex}`} type="button" data-active={index === sceneIndex} onClick={() => dispatch({ type: "seek", index: sceneIndex, scenes })}>{String(sceneIndex + 1).padStart(2, "0")} / {item.title}</button>)}</div></section>
      <section className={styles.sidebarSection}><h2>Presentation tools</h2>{mode !== "studio" && <><label htmlFor="presenter-ratio">Viewport</label><select className={styles.select} id="presenter-ratio" value={ratio} onChange={(event) => setRatio(event.target.value as Ratio)}>{Object.entries(ratios).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></>}<button className={styles.button} type="button" onClick={resetDemo} style={{ marginTop: 10, width: "100%" }}><RotateCcw size={15}/> Reset demo</button></section>
      {mode === "live" && <section className={styles.sidebarSection}><h2>Presentation</h2><label htmlFor="prospect">Prospect company</label><input className={styles.field} id="prospect" value={prospect} maxLength={60} onChange={(event) => setProspect(event.target.value)} placeholder="Mwangi Estates"/><div className={styles.studioSettings}><div><label htmlFor="properties">Properties</label><input className={styles.field} id="properties" type="number" min="1" max="9999" value={properties} onChange={(event) => setProperties(event.target.value)}/></div><div><label htmlFor="units">Units</label><input className={styles.field} id="units" type="number" min="1" max="999999" value={units} onChange={(event) => setUnits(event.target.value)}/></div></div><p className={styles.captureNote}>Presentation title only. The fictional Acacia figures below stay unchanged.</p></section>}
      {mode === "studio" && <section className={styles.sidebarSection}><h2>Capture format</h2><div className={styles.studioSettings}><div><label htmlFor="platform">Platform</label><select className={styles.select} id="platform" value={platform} onChange={(event) => { const value = event.target.value as Platform; setPlatform(value); setRatio(value === "YouTube" || value === "Website" ? "landscape" : value === "LinkedIn" ? "portrait" : "vertical"); }}>{platforms.map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="ratio">Aspect</label><select className={styles.select} id="ratio" value={ratio} onChange={(event) => { const selected = event.target.value as Ratio; setRatio(selected); setPlatform(selected === "square" ? "X" : selected === "portrait" ? "LinkedIn" : selected === "landscape" ? "YouTube" : "Instagram Reels"); }}>{Object.entries(ratios).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></div><div><label htmlFor="duration">Duration</label><select className={styles.select} id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{durations.map((item) => <option value={item} key={item}>{item} sec</option>)}</select></div><div><label htmlFor="style">Style</label><select className={styles.select} id="style" value={style} onChange={(event) => setStyle(event.target.value as typeof style)}>{stylesList.map((item) => <option key={item}>{item}</option>)}</select></div></div><p className={styles.captureNote}>{ratios[ratio].width} x {ratios[ratio].height} conceptual canvas. Record the clean view with OBS or browser capture. Style preset: {style}.</p></section>}
      <section className={styles.sidebarSection}><h2>Playback</h2><label htmlFor="speed">Speed</label><select id="speed" className={styles.select} value={timeline.speed} onChange={(event) => dispatch({ type: "speed", value: Number(event.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <option value={value} key={value}>{value}x</option>)}</select><label className={styles.toggleLine}><input type="checkbox" checked={timeline.loop} onChange={(event) => dispatch({ type: "loop", value: event.target.checked })}/> Loop</label><label className={styles.toggleLine}><input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)}/> Narration captions</label><label className={styles.toggleLine}><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)}/> Scene labels</label><label className={styles.toggleLine}><input type="checkbox" checked={showPointer} onChange={(event) => setShowPointer(event.target.checked)}/> Pointer emphasis</label><label className={styles.toggleLine}><input type="checkbox" checked={safeArea} onChange={(event) => setSafeArea(event.target.checked)}/> Safe areas</label><label className={styles.toggleLine}><input type="checkbox" checked={deviceFrame} onChange={(event) => setDeviceFrame(event.target.checked)}/> Device silhouette</label><label htmlFor="theme">Theme</label><select id="theme" className={styles.select} value={theme} onChange={(event) => setTheme(event.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></section><section className={styles.sidebarSection}><h2>Shortcuts</h2><p className={styles.captureNote}>Space play/pause / arrows scenes / R restart / F fullscreen / C clean capture / Shift+D presenter controls.</p><p className={styles.captureNote}><VolumeX size={13}/> Audio is not included. Use licensed narration or sound in your recording workflow.</p></section></aside>}</div>
  </div>;
}
