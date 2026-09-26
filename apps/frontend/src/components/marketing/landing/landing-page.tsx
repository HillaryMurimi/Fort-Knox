'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowDown, ArrowRight, Building2, Menu, ShieldCheck, X } from 'lucide-react';
import { PortfolioCommandCenterDemo } from '../demos/product-demos';
import { DemoRequestDialog } from './demo-request-dialog';
import {
  ApprovalAndPassport, AttentionAndHealth, ChaosToControl, CommandCenterShowcase,
  ConnectedSystem, EvidenceAndContractors, FinancialVisibility, MaintenanceStory,
  ProductComparison, RemoteAndIntelligence, SecurityStory, TenantAndRoleControl,
  WhoItIsFor,
} from './story-sections';
import { trackMarketingEvent } from '@/lib/marketing/analytics';
import styles from './landing.module.css';

const navItems=[['Product','#product'],['Command Center','#command-center'],['Maintenance','#maintenance'],['Finance','#finance'],['Security','#security'],['Intelligence','#intelligence'],['Pricing','#pricing']] as const;

function MarketingNav({onDemo}:{onDemo:(source:string)=>void}) {
  const [open,setOpen]=useState(false); const [scrolled,setScrolled]=useState(false); const {scrollY}=useScroll();
  useMotionValueEvent(scrollY,'change',value=>setScrolled(value>24));
  useEffect(()=>{ if(!open)return; const close=()=>setOpen(false); window.addEventListener('resize',close); return()=>window.removeEventListener('resize',close); },[open]);
  return <header className={`${styles.nav} ${scrolled?styles.navScrolled:''}`}><div className={styles.navInner}><Link href="/" className={styles.wordmark} aria-label="Property Command Center home"><span>PC</span><b>Property<br/>Command Center</b></Link><nav className={styles.desktopNav} aria-label="Main navigation">{navItems.map(([label,href])=><a key={label} href={href}>{label}</a>)}<Link href="/login">Sign in</Link></nav><div className={styles.navActions}><button className={styles.navCta} onClick={()=>onDemo('navigation')}>Request a demo</button><button className={styles.menuButton} onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open?'Close menu':'Open menu'}>{open?<X/>:<Menu/>}</button></div></div>{open&&<motion.nav id="mobile-menu" className={styles.mobileNav} initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}>{navItems.map(([label,href])=><a key={label} href={href} onClick={()=>setOpen(false)}>{label}<ArrowRight size={16}/></a>)}<Link href="/login" onClick={()=>setOpen(false)}>Sign in <ArrowRight size={16}/></Link><button onClick={()=>{setOpen(false);onDemo('mobile-navigation');}}>Request a demo</button></motion.nav>}</header>;
}

function Hero({onDemo}:{onDemo:(source:string)=>void}) {
  return <section className={styles.hero}><Image src="/marketing/portfolio-blue-hour.png" alt="A connected residential property portfolio at blue hour" fill priority sizes="100vw" className={styles.heroImage}/><div className={styles.heroShade}/><div className={styles.heroGrid}/><div className={styles.heroInner}><motion.div className={styles.heroCopy} initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{duration:.8}}><span className={styles.heroEyebrow}><i/> Property operations. Under control.</span><h1>Your entire property portfolio.<br/><em>One command center.</em></h1><p>Know what is happening. Know what it costs. Know who did it. Rent, tenants, maintenance, staff, contractors, security and evidence become one live operational system.</p><div className={styles.heroActions}><button onClick={()=>onDemo('hero')} data-analytics="hero_demo_click">Request a demo <ArrowRight size={17}/></button><a href="#command-center" onClick={()=>trackMarketingEvent('product_exploration')}>Explore the command center <ArrowDown size={16}/></a></div></motion.div><motion.div className={styles.heroDemo} initial={{opacity:0,y:30,rotateX:4}} animate={{opacity:1,y:0,rotateX:0}} transition={{duration:1,delay:.2}}><PortfolioCommandCenterDemo compact/></motion.div></div><div className={styles.heroProof}><span><ShieldCheck size={15}/> Scoped access by role and property</span><span><Building2 size={15}/> One history across every building</span><span>Built for remote oversight</span></div></section>;
}

function FinalClose({onDemo}:{onDemo:(source:string)=>void}) {
  return <section className={styles.finalClose}><div className={styles.finalGrid}/><div className={styles.container}><motion.div initial={{opacity:0,y:30}} whileInView={{opacity:1,y:0}} viewport={{once:true}}><span className={styles.eyebrow}>Your property is too valuable to manage blind.</span><p>You should not need five phone calls to know what happened in your own building. You should not need to search WhatsApp to prove whether a repair was completed. You should not have to visit every property to know whether it is performing.</p><h2>You do not need to be everywhere.<br/><em>You just need to be connected to everything that matters.</em></h2><div><button onClick={()=>onDemo('final')} data-analytics="final_demo_click">Request a private demo <ArrowRight size={17}/></button><a href="#product">See how it works</a></div></motion.div></div></section>;
}

function Footer(){return <footer className={styles.footer}><div className={styles.container}><div className={styles.footerMain}><div className={styles.footerBrand}><span>PC</span><div><b>Property Command Center</b><p>A command center for your bricks and mortar.</p></div></div><nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#command-center">Features</a><a href="#security">Security</a><a href="#pricing">Pricing</a><a href="mailto:hello@propertycommandcenter.com">Contact</a><Link href="/login">Sign in</Link></nav></div><div className={styles.footerBottom}><span>© 2026 Property Command Center</span><span>Built for accountable property operations.</span></div></div></footer>}

export function LandingPage() {
  const [demoOpen,setDemoOpen]=useState(false); const [demoSource,setDemoSource]=useState('unknown');
  function openDemo(source:string){setDemoSource(source);setDemoOpen(true);trackMarketingEvent(source==='hero'?'hero_demo_click':source==='final'?'final_demo_click':source==='control'?'control_interest':source==='fort-knox'?'fort_knox_interest':'pricing_interaction',{source});}
  return <div className={styles.marketing}><MarketingNav onDemo={openDemo}/><main><Hero onDemo={openDemo}/><ChaosToControl/><CommandCenterShowcase/><FinancialVisibility/><MaintenanceStory/><ApprovalAndPassport/><TenantAndRoleControl/><SecurityStory/><EvidenceAndContractors/><RemoteAndIntelligence/><AttentionAndHealth/><ConnectedSystem/><ProductComparison onDemo={openDemo}/><WhoItIsFor/><FinalClose onDemo={openDemo}/></main><Footer/><DemoRequestDialog open={demoOpen} onOpenChange={setDemoOpen} source={demoSource}/></div>;
}
