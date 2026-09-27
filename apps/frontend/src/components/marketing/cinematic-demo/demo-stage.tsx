"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, Banknote, Building2, Camera, Check, ClipboardCheck, Clock3, Droplets, Eye, FileText, House, LockKeyhole, ScanEye, ShieldCheck, Sparkles, UserRound, Wrench } from "lucide-react";
import { money, personas, portfolio, portfolioTotals, roleViews, type DemoRole, type DemoScene } from "@/lib/cinematic-demo/content";
import styles from "./demo.module.css";

type Props = { scene: DemoScene; progress: number; captions: boolean; showLabels: boolean; showPointer: boolean; theme: "dark" | "light"; safeArea?: boolean; deviceFrame?: boolean; prospect?: string; stylePreset?: string; platform?: string | undefined };

const queue = [
  { type: "URGENT", title: "Repair approval", meta: "Riverside / Unit B-12", value: "KES 27,500" },
  { type: "FINANCE", title: "5 tenancies overdue >30 days", meta: "Portfolio arrears", value: "KES 184,000" },
  { type: "SECURITY", title: "Overnight motion", meta: "Greenview / rear entrance", value: "03:12 AM" },
  { type: "VACANCY", title: "Unit A-04 vacant 46 days", meta: "Estimated rent not collected", value: "KES 69,000" },
];
const maintenance = ["NEW", "TRIAGED", "ASSIGNED", "QUOTED", "APPROVAL REQUIRED", "APPROVED", "IN PROGRESS", "COMPLETED", "VERIFIED", "CLOSED"];
const audit = [
  ["03:12:18", "James Kamau", "VIEW CAMERA", "Block A Entrance"],
  ["03:13:04", "James Kamau", "PLAYBACK", "Block A Entrance"],
  ["03:15:22", "David Mwangi", "VIEW INCIDENT", "SEC-281"],
];

function Meter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className={styles.meter}><span>{label}</span><div><i style={{ width: `${value}%` }} data-tone={tone} /></div><b>{value}%</b></div>;
}

function Dashboard() {
  return <div className={styles.dashboard}>
    <div className={styles.dashHead}><div><small>ACACIA PROPERTY HOLDINGS / PORTFOLIO</small><strong>Good morning, David.</strong></div><span><span className={styles.statusDot} /> DEMO PORTFOLIO</span></div>
    <div className={styles.metricRow}>
      <div><Building2 size={19}/><small>PROPERTIES</small><strong>{portfolioTotals.properties}</strong></div>
      <div><House size={19}/><small>UNITS</small><strong>{portfolioTotals.units}</strong></div>
      <div><Banknote size={19}/><small>RENT COLLECTED</small><strong>{money(portfolio.collectedRent)}</strong></div>
      <div><ShieldCheck size={19}/><small>HEALTH</small><strong>{portfolio.healthScore}<em> / 100</em></strong></div>
    </div>
    <div className={styles.dashGrid}><div className={styles.dashPanel}><div className={styles.panelTitle}><b>Collection pulse</b><span>{portfolioTotals.collectionPercent}%</span></div><div className={styles.bars}>{[48, 56, 50, 67, 61, 73, 68, 81, 84, 78, 89, 93].map((n, i) => <i key={i} style={{ height: `${n}%` }} />)}</div><div className={styles.axis}><span>JAN</span><span>JUN</span><span>DEC</span></div></div><div className={styles.dashPanel}><div className={styles.panelTitle}><b>Properties</b><span>5 connected</span></div>{portfolio.properties.map((property) => <div className={styles.propertyLine} key={property.name}><span>{property.name}<small>{property.area}</small></span><b>{property.occupied}/{property.units}</b></div>)}</div></div>
  </div>;
}

function Queue() { return <div className={styles.listSurface}><div className={styles.listTitle}><AlertTriangle size={19}/><strong>Action queue</strong><span>4 decisions</span></div>{queue.map((item, index) => <motion.div className={styles.queueItem} key={item.type} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .11 }}><span className={styles.queueIndex}>0{index + 1}</span><div><small>{item.type}</small><b>{item.title}</b><em>{item.meta}</em></div><strong>{item.value}</strong><ArrowRight size={17}/></motion.div>)}</div>; }

function Finance() { return <div className={styles.financeSurface}><div className={styles.moneyHero}><div><small>EXPECTED THIS MONTH</small><strong>{money(portfolio.expectedRent)}</strong></div><ArrowRight size={28}/><div><small>COLLECTED</small><strong>{money(portfolio.collectedRent)}</strong></div></div><div className={styles.financeTrack}><i style={{ width: `${portfolioTotals.collectionPercent}%` }} /></div><div className={styles.financeFooter}><div><small>COLLECTION RATE</small><b>{portfolioTotals.collectionPercent}%</b></div><div><small>OUTSTANDING</small><b>{money(portfolioTotals.outstanding)}</b></div><div><small>30+ DAYS OVERDUE</small><b>KES 184,000</b></div></div><div className={styles.notice}><ReceiptLine />Unit C-08 / KES 62,000 outstanding / 31 days overdue</div></div>; }
function ReceiptLine() { return <FileText size={17} aria-hidden="true"/>; }

function Vacancy() { return <div className={styles.vacancySurface}><div><small>VACANT HOMES</small><strong>{portfolioTotals.vacant}</strong><span>across 5 properties</span></div><ArrowRight size={36}/><div><small>ESTIMATED MONTHLY RENT AT RISK</small><strong>{money(portfolio.estimatedVacancyLoss)}</strong><span>A-04 / 46 days &nbsp; C-11 / 31 days &nbsp; D-06 / 23 days</span></div></div>; }

function PhoneRequest({ progress }: { progress: number }) { return <div className={styles.phone}><div className={styles.phoneTop}><span>10:42</span><span>...</span></div><div className={styles.phoneBody}><div className={styles.phoneGreeting}>Good morning, Jane.<small>Riverside Apartments / Unit B-12</small></div><div className={styles.phoneRequest}><span><Droplets size={18}/></span><b>Report maintenance</b><small>Plumbing / Kitchen sink</small><p>Water leaking below kitchen sink.</p><div className={styles.photoMock}><Droplets size={24}/><span>Photo attached</span></div><div className={styles.phoneSubmit}>{progress > .6 ? "REQUEST SENT" : "SUBMIT REQUEST"}</div></div></div><div className={styles.phoneHome}/></div>; }

function Context() { return <div className={styles.contextSurface}><div className={styles.contextCenter}><Wrench size={31}/><b>MR-1082</b><span>Plumbing / kitchen leak</span></div><div className={styles.contextDetails}>{[["TENANT", "Jane Wambui"], ["PROPERTY", "Riverside Apartments"], ["BUILDING", "Block B"], ["FLOOR", "3"], ["UNIT", "B-12"], ["REPORTED", "10:42 AM"]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div></div>; }

function WorkSurface({ kind, progress }: { kind: "caretaker" | "contractor" | "approval" | "progress"; progress: number }) {
  const who = kind === "caretaker" ? personas.caretaker : kind === "contractor" || kind === "progress" ? personas.contractor : personas.owner;
  const step = kind === "caretaker" ? 2 : kind === "contractor" ? 3 : kind === "approval" ? (progress > .55 ? 5 : 4) : 7;
  return <div className={styles.workSurface}><div className={styles.workHeader}><div className={styles.avatar}><UserRound size={22}/></div><div><small>{who.title}</small><strong>{who.name}</strong></div><span>{kind === "approval" ? "OWNER DECISION" : "ASSIGNED WORK"}</span></div><div className={styles.jobHeading}><div><small>RIVERSIDE / BLOCK B / UNIT B-12</small><h3>Kitchen sink leak</h3><p>Jane Wambui reported water leaking below the kitchen sink at 10:42 AM.</p></div><Droplets size={30}/></div><div className={styles.steps}>{maintenance.map((item, index) => <span key={item} data-active={index <= step}>{item}</span>)}</div><div className={styles.workBottom}><div><small>{kind === "progress" ? "INVOICE / BEFORE + AFTER EVIDENCE" : "CONTRACTOR QUOTE"}</small><strong>{kind === "progress" ? "KES 26,800" : "KES 27,500"}</strong><span>{kind === "progress" ? "Caretaker verified / tenant confirmed" : "Approval threshold KES 5,000"}</span></div><div className={styles.decision} data-done={progress > .55 && kind === "approval"}><ClipboardCheck size={18}/>{kind === "approval" ? progress > .55 ? "APPROVED / RECORDED" : "OWNER APPROVAL REQUIRED" : kind === "progress" ? "WORK VERIFIED" : kind === "contractor" ? "QUOTE SUBMITTED" : "CONTRACTOR ASSIGNED"}</div></div></div>;
}

function Evidence() { return <div className={styles.listSurface}><div className={styles.listTitle}><Clock3 size={19}/><strong>One accountable timeline</strong><span>Unit B-12</span></div>{[["10:42", "Tenant report", "Jane Wambui"], ["10:51", "Request triaged", "James Kamau"], ["11:04", "Contractor assigned", "Peter Otieno"], ["11:18", "Quote submitted", "KES 27,500"], ["11:24", "Owner approval", "David Mwangi"], ["15:47", "After photo attached", "Peter Otieno"], ["16:09", "Work verified", "James Kamau"], ["16:22", "Issue closed", "Resident confirmed"]].map(([time, event, actor]) => <div className={styles.timelineItem} key={time}><time>{time}</time><i/><b>{event}</b><span>{actor}</span></div>)}</div>; }

function Passport() { return <div className={styles.passportSurface}><div className={styles.passportIcon}><House size={36}/></div><div><small>PROPERTY PASSPORT</small><h3>Unit B-12</h3><p>Riverside Apartments / Block B / Floor 3</p></div><div className={styles.passportTiles}>{[["TENANT", "Jane Wambui"], ["RENT", "KES 69,000"], ["TENANCY", "Active"], ["REPAIRS", "7 recorded"], ["DOCUMENTS", "14 linked"], ["INSPECTIONS", "4 completed"]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div></div>; }

function Performance() { return <div className={styles.listSurface}><div className={styles.listTitle}><Wrench size={19}/><strong>Contractor performance</strong><span>Recorded work</span></div><div className={styles.performanceName}>Peter Otieno <small>Otieno Plumbing Services</small></div><div className={styles.performanceMetrics}>{[["48", "JOBS COMPLETED"], ["36 min", "AVG RESPONSE"], ["5.7 hrs", "AVG RESOLUTION"], ["2.1%", "REWORK RATE"], ["4.8/5", "RATING"]].map(([value, label]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div></div>; }

function Roles({ progress }: { progress: number }) { const roles: DemoRole[] = ["owner", "manager", "caretaker", "tenant", "contractor", "admin"]; const role = roles[Math.min(roles.length - 1, Math.floor(progress * roles.length))]!; return <div className={styles.rolesSurface}><div className={styles.rolePills}>{roles.map((item) => <span key={item} data-active={role === item}>{item.toUpperCase()}</span>)}</div><div className={styles.roleIdentity}><div className={styles.avatar}><UserRound size={24}/></div><div><small>VIEWING AS / FICTIONAL DEMO</small><strong>{personas[role].name}</strong><span>{personas[role].title}</span></div><LockKeyhole size={21}/></div><div className={styles.roleScope}>{roleViews[role].map((item) => <div key={item}><Check size={15}/>{item}</div>)}</div><div className={styles.notice}><ShieldCheck size={16}/> Production access is enforced by backend RBAC, ABAC and entitlement checks.</div></div>; }

function Security({ kind }: { kind: "security" | "motion" | "incident" | "audit" }) {
  if (kind === "audit") return <div className={styles.listSurface}><div className={styles.listTitle}><ScanEye size={19}/><strong>Surveillance access audit</strong><span>Fort Knox</span></div>{audit.map(([time, actor, action, target]) => <div className={styles.auditItem} key={time}><time>{time}</time><Eye size={17}/><b>{actor}</b><span>{action}<small>{target}</small></span><em>SUCCESS</em></div>)}</div>;
  if (kind === "incident") return <div className={styles.listSurface}><div className={styles.listTitle}><AlertTriangle size={19}/><strong>Incident SEC-281</strong><span>RESOLVED</span></div>{[["03:12", "Motion event detected"], ["03:13", "Investigation opened"], ["03:15", "Evidence attached"], ["03:18", "Manager notified"], ["04:02", "Incident resolved"], ["04:15", "Incident closed"]].map(([time, label]) => <div className={styles.timelineItem} key={time}><time>{time}</time><i/><b>{label}</b></div>)}</div>;
  return <div className={styles.cameraWall}><div className={styles.cameraTitle}><Camera size={18}/><strong>FORT KNOX / SECURITY COMMAND</strong><span>SIMULATED FEEDS</span></div><div className={styles.feedGrid}>{["MAIN GATE", "PARKING", "BLOCK A ENTRANCE", "GREENVIEW REAR"].map((feed, index) => <div className={styles.feed} data-alert={kind === "motion" && index === 3} key={feed}><div className={styles.feedArchitecture}><i/><i/><i/></div><span>CAM 0{index + 1} / {feed}</span>{kind === "motion" && index === 3 && <b>MOTION / 03:12 AM</b>}</div>)}</div></div>;
}

function Intelligence() { return <div className={styles.listSurface}><div className={styles.listTitle}><Sparkles size={19}/><strong>Operational signals</strong><span>Explainable insights</span></div>{[["MAINTENANCE", "Four plumbing incidents in Block B over 60 days.", "Inspect the main water line"], ["ARREARS", "Five tenancies represent 71% of overdue rent.", "Prioritize follow-up"], ["VACANCY", "Unit A-04 has been vacant for 46 days.", "Review listing and pricing"], ["EXPENSE", "Electrical maintenance is 24% above portfolio average.", "Compare contractor costs"]].map(([tag, text, action]) => <div className={styles.signal} key={tag}><small>{tag}</small><b>{text}</b><span>{action} <ArrowRight size={14}/></span></div>)}</div>; }

function Health({ progress }: { progress: number }) { return <div className={styles.healthSurface}><div className={styles.healthNumber}><small>PORTFOLIO HEALTH</small><strong>{progress > .7 ? 91 : 87}<span>/100</span></strong><em>{progress > .7 ? "IMPROVING" : "HEALTHY"}</em></div><div className={styles.healthMeters}><Meter label="Occupancy" value={93}/><Meter label="Collections" value={93}/><Meter label="Maintenance" value={78} tone="warn"/><Meter label="Expenses" value={84}/><Meter label="Security" value={86}/><Meter label="Tenant service" value={90}/></div></div>; }

function Network() { return <div className={styles.networkSurface}><div className={styles.networkCore}>PROPERTY<br/>COMMAND CENTER</div>{["TENANT", "UNIT", "PROPERTY", "PAYMENT", "MAINTENANCE", "CONTRACTOR", "CAMERA", "INCIDENT", "EVIDENCE", "AUDIT", "INTELLIGENCE", "ACTION"].map((item, index) => <span key={item} style={{ top: `${10 + Math.floor(index / 4) * 36 + (index % 2) * 8}%`, left: `${4 + (index % 4) * 29}%` }}>{item}</span>)}</div>; }

function Tiers() { return <div className={styles.tiers}><div><small>CONTROL</small><h3>Operate with clarity.</h3><p>Rent / tenancies / maintenance / contractors / expenses / documents / reporting</p><Building2 size={35}/></div><ArrowRight size={29}/><div><small>FORT KNOX</small><h3>Protect with evidence.</h3><p>Scoped CCTV / security events / incidents / surveillance audit / advanced intelligence</p><ShieldCheck size={35}/></div></div>; }

function SceneVisual({ scene, progress }: { scene: DemoScene; progress: number }) {
  switch (scene.kind) {
    case "dashboard": return <Dashboard/>;
    case "queue": return <Queue/>;
    case "finance": return <Finance/>;
    case "vacancy": return <Vacancy/>;
    case "tenant": return <PhoneRequest progress={progress}/>;
    case "context": return <Context/>;
    case "caretaker": case "contractor": case "approval": case "progress": return <WorkSurface kind={scene.kind} progress={progress}/>;
    case "evidence": return <Evidence/>;
    case "passport": return <Passport/>;
    case "performance": return <Performance/>;
    case "roles": return <Roles progress={progress}/>;
    case "security": case "motion": case "incident": case "audit": return <Security kind={scene.kind}/>;
    case "intelligence": return <Intelligence/>;
    case "health": return <Health progress={progress}/>;
    case "network": return <Network/>;
    case "tiers": return <Tiers/>;
    case "opening": { const figures = [["05", "PROPERTIES"], ["144", "UNITS"], ["134", "OCCUPIED"]]; const selected = figures[Math.min(2, Math.floor(progress * 3))]!; return <div className={styles.openingFigures}><motion.span key={selected[1]} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .35 }}>{selected[0]} <small>{selected[1]}</small></motion.span></div>; }
    case "closing": return <div className={styles.closingBrand}><span className={styles.logoMark}>PC</span><strong>PROPERTY<br/>COMMAND CENTER</strong><small>REMOTE CONTROL FOR YOUR BRICKS AND MORTAR</small><Link href="/#contact">REQUEST A PRIVATE DEMO <ArrowRight size={15}/></Link></div>;
  }
}

export function DemoStage({ scene, progress, captions, showLabels, showPointer, theme, safeArea, deviceFrame, prospect, stylePreset, platform }: Props) {
  const reduceMotion = useReducedMotion();
  return <div className={styles.stage} data-theme={theme} data-kind={scene.kind} data-device={deviceFrame} data-style={stylePreset} data-platform={platform}>
    <div className={styles.stageGrid} aria-hidden="true"/>
    <div className={styles.stageTop}><div className={styles.stageBrand}><span className={styles.logoMark}>PC</span><span>PROPERTY COMMAND CENTER</span></div><span className={styles.demoFlag}>FICTIONAL PRODUCT DEMO</span></div>
    <AnimatePresence mode="wait"><motion.div className={styles.scene} key={scene.id + scene.title} initial={reduceMotion ? false : { opacity: 0, y: 14, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 1.01 }} transition={{ duration: reduceMotion ? 0 : .46 }}>
      <div className={styles.sceneHeader}>{showLabels && <small>{prospect ? `PREPARED FOR ${prospect.toUpperCase()}` : "ACACIA PROPERTY HOLDINGS"} / {scene.kind.toUpperCase()}</small>}<h2>{scene.title}</h2><p>{scene.subtitle}</p></div>
      <div className={styles.sceneVisual}><SceneVisual scene={scene} progress={progress}/></div>
    </motion.div></AnimatePresence>
    {captions && <div className={styles.caption}>{scene.narration}</div>}
    {safeArea && <div className={styles.safeArea} aria-hidden="true"><span>{platform ? `${platform.toUpperCase()} SAFE AREA` : "SAFE AREA"}</span></div>}
    {showPointer && <div className={styles.pointer} aria-hidden="true"><Eye size={15}/></div>}
    <div className={styles.stageFooter}><span>ACACIA / SIMULATED DATA</span><span>PROPERTY COMMAND CENTER</span></div>
  </div>;
}
