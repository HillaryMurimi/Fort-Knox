import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { money, portfolio, portfolioTotals, scenarios } from "@/lib/cinematic-demo/content";
import styles from "@/components/marketing/cinematic-demo/demo.module.css";

export const metadata: Metadata = { title: "Explore Property Command Center", robots: { index: false, follow: false } };

const featured = ["signature", "rent", "maintenance", "vacancy", "passport", "roles", "security", "intelligence"];

export default function DemoHomePage() {
  return <div className={styles.home}><header className={styles.homeTop}><Link href="/">PROPERTY COMMAND CENTER</Link><Link href="/demo/live">Live presentation <ArrowRight size={14}/></Link></header><main className={styles.homeMain}><span>FICTIONAL PORTFOLIO / PRIVATE PRODUCT EXPERIENCE</span><h1>Acacia Property<br/>Holdings.</h1><div className={styles.homeMetrics}><div><strong>{portfolioTotals.properties}</strong><small>PROPERTIES</small></div><div><strong>{portfolioTotals.units}</strong><small>UNITS</small></div><div><strong>{money(portfolio.expectedRent)}</strong><small>MONTHLY EXPECTED RENT</small></div><div><strong>{portfolioTotals.occupancyPercent}%</strong><small>OCCUPIED</small></div></div><div className={styles.homeChoice}><div><span>CHOOSE A VIEW</span><h2>What would you like to understand?</h2><div className={styles.homeLinks}><Link href="/demo/live">Begin presentation <ArrowRight size={15}/></Link><Link href="/demo/studio">Content studio <ArrowRight size={15}/></Link></div></div><div className={styles.homeRows}>{featured.map((id, index) => { const item = scenarios.find((scenario) => scenario.id === id); if (!item) return null; return <Link href={`/demo/explore?scenario=${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><ArrowRight size={16}/></Link>; })}</div></div></main></div>;
}
