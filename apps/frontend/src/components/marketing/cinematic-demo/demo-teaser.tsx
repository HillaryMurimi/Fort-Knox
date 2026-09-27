"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { DemoStage } from "./demo-stage";
import { signatureScenes } from "@/lib/cinematic-demo/content";
import styles from "./demo.module.css";

export function DemoTeaser() {
  return <section className={styles.landingTeaser} aria-labelledby="demo-teaser-title"><div className={styles.landingTeaserInner}><div><span className={styles.eyebrow}>INTERACTIVE PRODUCT DEMO</span><h2 id="demo-teaser-title">See the whole operation come together.</h2><p>Follow a tenant report through contractor quote, owner approval, evidence and closure. The fictional portfolio stays separate from live accounts.</p><div className={styles.landingTeaserLinks}><Link href="/demo/explore"><Play/> Explore the demo</Link><Link href="/demo/live">Presenter view <ArrowRight/></Link></div></div><div className={styles.frame} data-ratio="landscape" style={{ aspectRatio: "16 / 9" }}><DemoStage scene={signatureScenes[1]!} progress={.7} captions={false} showLabels={true} showPointer={false} theme="dark"/></div></div></section>;
}
