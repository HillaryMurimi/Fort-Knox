'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle, ArrowDown, Banknote, Building2, Camera, Check, CheckCircle2,
  Droplets, Eye, Gauge, Hammer, LockKeyhole, ReceiptText,
  ShieldCheck, TrendingUp, UserRound, Wrench,
} from 'lucide-react';
import styles from '../landing/landing.module.css';

const money = [
  { label: 'Expected', value: 'KES 2.84M', tone: 'plain' },
  { label: 'Collected', value: 'KES 2.65M', tone: 'good' },
  { label: 'Outstanding', value: 'KES 190K', tone: 'warn' },
];

export function PortfolioCommandCenterDemo({ compact = false }: { compact?: boolean }) {
  return <div className={`${styles.productWindow} ${compact ? styles.productWindowCompact : ''}`} aria-label="Portfolio command center demonstration">
    <div className={styles.windowBar}><div className={styles.windowBrand}><span className={styles.brandMark}>PC</span><span>Portfolio command</span></div><span className={styles.livePill}><i /> Live</span></div>
    <div className={styles.demoBody}>
      <div className={styles.demoRail} aria-hidden="true">{[Gauge, Building2, Banknote, Wrench, ShieldCheck].map((Icon, index) => <span key={index} className={index === 0 ? styles.railActive : ''}><Icon size={15} /></span>)}</div>
      <div className={styles.demoContent}>
        <div className={styles.demoTopline}><div><small>Good evening, David</small><strong>Everything that needs you.</strong></div><span>26 Sep 2026</span></div>
        <div className={styles.metricGrid}>{money.map((item, index) => <motion.div key={item.label} className={styles.demoMetric} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: index * .08 }} viewport={{ once: true }}><span>{item.label}</span><strong data-tone={item.tone}>{item.value}</strong></motion.div>)}<div className={styles.demoMetric}><span>Occupancy</span><strong>92.9%</strong></div></div>
        <div className={styles.demoSplit}>
          <div className={styles.chartPanel}><div className={styles.panelLabel}><span>Collection pulse</span><b>93.3%</b></div><div className={styles.chartBars}>{[42,55,49,68,74,63,82,78,91,87,94,93].map((height,index)=><motion.i key={index} initial={{height:0}} whileInView={{height:`${height}%`}} transition={{duration:.55,delay:index*.035}} viewport={{once:true}} />)}</div><div className={styles.chartAxis}><span>Jan</span><span>Jun</span><span>Dec</span></div></div>
          <div className={styles.healthPanel}><div className={styles.healthDial}><span>87</span><small>/100</small></div><div><strong>Portfolio health</strong><span>4 points above last month</span></div></div>
        </div>
        <div className={styles.alertRow}><span className={styles.alertIcon}><AlertTriangle size={14}/></span><div><strong>3 decisions waiting</strong><span>Repair approval, arrears review, overnight motion</span></div><ArrowDown size={14}/></div>
      </div>
    </div>
  </div>;
}

export function ChaosDemo() {
  const fragments = [
    ['WhatsApp', 'Boss, tenant amesema kuna leak.'],
    ['Spreadsheet', 'Rent_Sept_FINAL_v3.xlsx'],
    ['Phone', 'Caretaker calling...'],
    ['Receipt', 'IMG_4881.jpg'],
    ['Voice note', '0:47 · forwarded'],
    ['CCTV', 'Playback unavailable'],
  ];
  return <div className={styles.chaosStage}>{fragments.map(([label,copy],index)=><motion.div className={styles.chaosFragment} key={label} initial={{opacity:0,scale:.9,y:20}} whileInView={{opacity:1,scale:1,y:0}} transition={{delay:index*.08}} viewport={{once:true}} style={{'--chaos-index':index} as never}><small>{label}</small><strong>{copy}</strong></motion.div>)}<div className={styles.chaosCore}><span className={styles.brandMark}>PC</span><b>One operational truth</b></div></div>;
}

const maintenanceSteps = [
  ['NEW', 'Tenant reports leak', Droplets],
  ['TRIAGED', 'Caretaker confirms unit B-12', UserRound],
  ['ASSIGNED', 'AquaFix contractor assigned', Wrench],
  ['QUOTED', 'Quote · KES 18,500', ReceiptText],
  ['APPROVAL', 'Owner decision required', LockKeyhole],
  ['IN PROGRESS', 'Repair underway', Hammer],
  ['EVIDENCE', 'Before and after attached', Camera],
  ['CLOSED', 'Verified by resident', CheckCircle2],
] as const;

export function MaintenanceWorkflowDemo() {
  return <div className={styles.workflow} aria-label="Maintenance workflow demonstration">{maintenanceSteps.map(([status,label,Icon],index)=><motion.div className={styles.workflowStep} key={status} initial={{opacity:.35}} whileInView={{opacity:1}} viewport={{amount:.8}}><span className={styles.workflowNumber}>{String(index+1).padStart(2,'0')}</span><span className={styles.workflowIcon}><Icon size={17}/></span><div><small>{status}</small><strong>{label}</strong></div>{index<maintenanceSteps.length-1&&<i />}</motion.div>)}</div>;
}

export function FinancialFlowDemo() {
  return <div className={styles.financeDemo}><div className={styles.financeUnits}>{['A-02','A-04','B-12','C-03','C-08'].map((unit,index)=><motion.div key={unit} initial={{opacity:0,x:-12}} whileInView={{opacity:1,x:0}} transition={{delay:index*.08}} viewport={{once:true}}><Building2 size={14}/><span>Unit {unit}</span><b>{index===1?'OVERDUE':'PAID'}</b></motion.div>)}</div><div className={styles.flowTrack}>{[0,1,2,3].map(i=><motion.i key={i} animate={{x:['0%','420%'],opacity:[0,1,1,0]}} transition={{duration:2.4,repeat:Infinity,delay:i*.5,ease:'linear'}} />)}</div><div className={styles.financeTotal}><small>PORTFOLIO COLLECTION</small><strong>KES 2,650,000</strong><span><TrendingUp size={14}/> 93.3% collected</span></div></div>;
}

const roles = {
  Owner: ['All properties','Portfolio financials','Approvals','Security and CCTV','Reports'],
  Manager: ['Assigned properties','Tenant operations','Maintenance','Contractors','Scoped reports'],
  Caretaker: ['Assigned buildings','Work orders','Residents','Site updates','Permitted cameras'],
  Tenant: ['Own unit','Rent and receipts','Maintenance','Documents','Announcements'],
  Contractor: ['Assigned jobs','Quotes','Evidence','Invoices','Job messages'],
  Admin: ['Organizations','Entitlements','Audit oversight','Platform operations','Support'],
} as const;

export function RoleAccessDemo() {
  const [role,setRole] = useState<keyof typeof roles>('Owner');
  return <div className={styles.roleDemo}><div className={styles.roleTabs} role="tablist" aria-label="Preview role access">{Object.keys(roles).map(item=><button key={item} role="tab" aria-selected={role===item} onClick={()=>setRole(item as keyof typeof roles)}>{item}</button>)}</div><AnimatePresence mode="wait"><motion.div key={role} className={styles.roleSurface} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}><div className={styles.roleIdentity}><span><UserRound size={19}/></span><div><small>VIEWING AS</small><strong>{role}</strong></div><ShieldCheck size={18}/></div><div className={styles.permissionList}>{roles[role].map((permission,index)=><motion.div initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:index*.055}} key={permission}><Check size={14}/><span>{permission}</span></motion.div>)}</div><div className={styles.deniedRow}><LockKeyhole size={14}/><span>Everything outside this scope stays hidden and blocked.</span></div></motion.div></AnimatePresence></div>;
}

export function CameraWallDemo() {
  const feeds = ['MAIN GATE','PARKING','BLOCK A ENTRANCE','PERIMETER EAST'];
  return <div className={styles.cameraShell}><div className={styles.cameraHeader}><span><i/> Security command</span><small>4 feeds · all systems online</small></div><div className={styles.cameraGrid}>{feeds.map((feed,index)=><div key={feed} className={`${styles.cameraFeed} ${index===2?styles.motionFeed:''}`}><div className={styles.cameraScene}><span/><span/><span/></div><div className={styles.cameraLabel}><b>{feed}</b><span>03:12:{String(4+index).padStart(2,'0')} AM</span></div>{index===2&&<motion.div className={styles.motionBox} animate={{opacity:[.35,1,.35]}} transition={{duration:1.5,repeat:Infinity}}><span>MOTION</span></motion.div>}</div>)}</div><div className={styles.securityEvent}><AlertTriangle size={18}/><div><small>SECURITY EVENT · HIGH</small><strong>Motion after access hours</strong><span>Block A entrance · Camera 03 · Evidence preserved</span></div><button type="button">Review</button></div></div>;
}

export function PropertyPassportDemo() {
  const events = [['2023','Tenant moved in','Tenancy'],['2024','Kitchen tap repaired','KES 4,200'],['2025','Bathroom leak repaired','KES 18,500'],['2026','Move-out inspection','Evidence']];
  return <div className={styles.passport}><div className={styles.passportHeader}><div><small>DIGITAL PROPERTY PASSPORT</small><strong>Riverside · Block B · Unit 12</strong></div><span>ACTIVE</span></div><div className={styles.passportStats}><span><b>3</b> tenancies</span><span><b>7</b> repairs</span><span><b>14</b> documents</span></div><div className={styles.passportTimeline}>{events.map(([year,event,meta],index)=><motion.div key={year} initial={{opacity:0,x:12}} whileInView={{opacity:1,x:0}} transition={{delay:index*.1}} viewport={{once:true}}><time>{year}</time><i/><div><strong>{event}</strong><span>{meta}</span></div></motion.div>)}</div></div>;
}

export function ActionQueueDemo() {
  const actions=[['URGENT','Approve repair','KES 27,500','Riverside · Unit B-12'],['SECURITY','Review overnight motion','03:12 AM','Block C rear entrance'],['FINANCE','Overdue more than 30 days','KES 184,000','5 active tenancies'],['VACANCY','Unit A-04 vacant 46 days','KES 69,000','estimated loss']];
  return <div className={styles.actionQueue}>{actions.map(([type,title,value,meta],index)=><motion.div key={type} initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} transition={{delay:index*.08}} viewport={{once:true}}><span>{String(index+1).padStart(2,'0')}</span><div><small data-type={type}>{type}</small><strong>{title}</strong><em>{meta}</em></div><b>{value}</b></motion.div>)}</div>;
}

export function HealthScoreDemo() {
  const reduce=useReducedMotion();
  return <div className={styles.scoreDemo}><div className={styles.bigScore}><motion.strong initial={{opacity:0,scale:.8}} whileInView={{opacity:1,scale:1}} transition={{duration:reduce?0:.8}} viewport={{once:true}}>87</motion.strong><span>/100</span><small>HEALTHY</small></div><div className={styles.scoreSignals}>{[['Occupancy',93],['Collections',91],['Maintenance',78],['Security',86],['Expenses',84],['Tenant service',90]].map(([label,value],index)=><div key={String(label)}><span>{label}</span><i><motion.b initial={{width:0}} whileInView={{width:`${value}%`}} transition={{duration:reduce?0:.7,delay:index*.06}} viewport={{once:true}}/></i><strong>{value}</strong></div>)}</div></div>;
}

export function AuditTrailDemo() {
  return <div className={styles.auditDemo}>{[['03:12:18','James N.','VIEW CAMERA','Block A Entrance'],['03:13:01','James N.','PLAYBACK','Block A Entrance'],['03:15:22','Owner','VIEW INCIDENT','Incident #SEC-281']].map(([time,actor,action,target])=><div key={time}><time>{time}</time><span><Eye size={14}/></span><div><strong>{actor}</strong><small>{action} · {target}</small></div><b>SUCCESS</b></div>)}</div>;
}

export function ContractorDemo() {
  const contractors = [['AquaFix Plumbing','28 jobs','34 min','4.9'],['VoltPro Electrical','19 jobs','51 min','4.7'],['SecureGate Systems','14 jobs','42 min','4.8']] as const;
  return <div className={styles.contractors}>{contractors.map(([name,jobs,response,rating],index)=><motion.div key={name} initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} transition={{delay:index*.08}} viewport={{once:true}}><span>{name.split(' ').map(v=>v[0]).join('')}</span><div><strong>{name}</strong><small>{jobs} completed · {response} response</small></div><b>{rating}</b></motion.div>)}</div>;
}

export function OnboardingDemo() {
  return <div className={styles.onboarding}><div><small>ASSIGNMENT CREATED</small><strong>+254 7XX XXX 218</strong><span>Riverside · Block B · Unit 12</span></div><ArrowDown size={18}/><div className={styles.otp}><span>4</span><span>8</span><span>1</span><span>2</span><span>0</span><span>6</span></div><ArrowDown size={18}/><div className={styles.verified}><CheckCircle2 size={19}/><div><strong>Identity verified</strong><span>Unit B-12 loaded automatically</span></div></div></div>;
}

export function ApprovalDemo() {
  const [approved,setApproved]=useState(false);
  return <div className={styles.approvalDemo}><div className={styles.quoteTop}><span><Hammer size={18}/></span><div><small>REPAIR QUOTE · UNIT B-12</small><strong>KES 27,500</strong></div></div><dl><div><dt>Contractor</dt><dd>AquaFix Plumbing</dd></div><div><dt>Threshold</dt><dd>KES 5,000</dd></div><div><dt>Evidence</dt><dd>3 images attached</dd></div><div><dt>Similar repair</dt><dd>KES 18,500</dd></div></dl><button type="button" onClick={()=>setApproved(true)} disabled={approved}>{approved?<><Check size={16}/> Approved and recorded</>:<><LockKeyhole size={16}/> Approve repair</>}</button></div>;
}

export function VacancyDemo() {
  return <div className={styles.vacancyDemo}><div><small>VACANT UNITS</small><strong>9</strong><span>across 3 properties</span></div><motion.span initial={{scaleX:0}} whileInView={{scaleX:1}} viewport={{once:true}}/><div><small>ESTIMATED MONTHLY LOSS</small><strong>KES 247,500</strong><span>money standing still</span></div></div>;
}
