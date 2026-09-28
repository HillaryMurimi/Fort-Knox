"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowRight,
  Banknote,
  Building2,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { DemoRequestDialog } from "./demo-request-dialog";
import { DemoTeaser } from "@/components/marketing/cinematic-demo/demo-teaser";
import { trackMarketingEvent } from "@/lib/marketing/analytics";
import type { SceneFocus } from "./property-scene";
import "./digital-twin.css";

const PropertyScene = dynamic(
  () => import("./property-scene").then((module) => module.PropertyScene),
  { ssr: false },
);
const subscribeToHydration = () => () => {};
const focuses: {
  key: SceneFocus;
  label: string;
  icon: typeof Building2;
  detail: string;
}[] = [
  {
    key: "portfolio",
    label: "Portfolio",
    icon: Building2,
    detail: "Three buildings. One operational view.",
  },
  {
    key: "units",
    label: "Inside units",
    icon: Building2,
    detail: "A closer view into each floor and home.",
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    detail: "A repair underway, with an accountable trail.",
  },
  {
    key: "moves",
    label: "Move-ins",
    icon: ArrowRight,
    detail: "Residents, movers and site staff in motion.",
  },
  {
    key: "security",
    label: "Security",
    icon: Camera,
    detail: "Camera coverage in property context.",
  },
];
const collection = [
  { month: "Jan", actual: 58, target: 62 },
  { month: "Feb", actual: 65, target: 66 },
  { month: "Mar", actual: 62, target: 70 },
  { month: "Apr", actual: 73, target: 72 },
  { month: "May", actual: 78, target: 76 },
  { month: "Jun", actual: 75, target: 80 },
  { month: "Jul", actual: 84, target: 82 },
  { month: "Aug", actual: 87, target: 86 },
  { month: "Sep", actual: 93, target: 90 },
];
const signals = [
  {
    label: "Collection rate",
    value: "93.3%",
    icon: Banknote,
    tone: "mint",
    note: "Rent collection trend",
  },
  {
    label: "Occupancy",
    value: "92.9%",
    icon: Building2,
    tone: "cyan",
    note: "Across the portfolio",
  },
  {
    label: "Open requests",
    value: "14",
    icon: Wrench,
    tone: "amber",
    note: "Three need approval",
  },
  {
    label: "Health score",
    value: "87",
    icon: ShieldCheck,
    tone: "blue",
    note: "Portfolio indicators",
  },
];
const workflows = [
  {
    number: "01",
    icon: Banknote,
    title: "See the money",
    text: "Rent, arrears, expenses and settlement status connect back to the unit and tenancy.",
  },
  {
    number: "02",
    icon: Wrench,
    title: "See the work",
    text: "Follow every repair from a resident request to a verified close, with images and decisions attached.",
  },
  {
    number: "03",
    icon: Camera,
    title: "See the risk",
    text: "Review scoped camera access, incidents and evidence from one secure operational record.",
  },
  {
    number: "04",
    icon: ClipboardCheck,
    title: "Know who acted",
    text: "Staff, contractors and owners work within assigned scopes, with a traceable history of action.",
  },
];

function MarketingNav({ onDemo }: { onDemo: () => void }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="dt-nav">
      <div className="dt-nav-inner">
        <Link
          href="/"
          className="dt-brand"
          aria-label="Property Command Center home"
        >
          <span className="dt-mark">PC</span>
          <span>
            PROPERTY
            <br />
            COMMAND CENTER
          </span>
        </Link>
        <nav className="dt-links" aria-label="Main navigation">
          <a href="#overview">Overview</a>
          <a href="#intelligence">Intelligence</a>
          <a href="#operations">Operations</a>
          <a href="#roles">Access</a>
        </nav>
        <div className="dt-nav-actions">
          <button
            type="button"
            className="dt-theme-toggle"
            aria-label={mounted && resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={mounted && resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
            disabled={!mounted}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {mounted && resolvedTheme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <Link href="/login" className="dt-login">
            Sign in
          </Link>
          <button onClick={onDemo} className="dt-nav-cta">
            Request a demo <ArrowRight size={15} />
          </button>
          <button
            className="dt-menu"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="dt-mobile-nav" aria-label="Mobile navigation">
          {[
            ["Overview", "#overview"],
            ["Intelligence", "#intelligence"],
            ["Operations", "#operations"],
            ["Access", "#roles"],
          ].map(([label, href]) => (
            <a key={label} href={href} onClick={() => setOpen(false)}>
              {label}
              <ChevronRight size={16} />
            </a>
          ))}
          <Link href="/login">
            Sign in <ChevronRight size={16} />
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              onDemo();
            }}
          >
            Request a demo <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </header>
  );
}

function Hero({ onDemo }: { onDemo: () => void }) {
  const [focus, setFocus] = useState<SceneFocus>("portfolio");
  const reducedMotion = Boolean(useReducedMotion());
  const current = focuses.find((item) => item.key === focus) ?? focuses[0]!;
  return (
    <section className="dt-hero" aria-labelledby="dt-title">
      <div className="dt-hero-scene">
        <PropertyScene focus={focus} reducedMotion={reducedMotion} />
      </div>
      <div className="dt-hero-grid" aria-hidden="true" />
      <div className="dt-hero-shade" aria-hidden="true" />
      <div className="dt-hero-content">
        <p className="dt-overline">
          <span className="dt-live-dot" /> CONNECTED PROPERTY OPERATIONS
        </p>
        <h1 id="dt-title">
          Property
          <br />
          Command Center
        </h1>
        <p className="dt-hero-subtitle">
          Every building, payment, repair and security signal in one clear view.
          Stay close to what matters without being everywhere.
        </p>
        <div className="dt-hero-actions">
          <button className="dt-primary" onClick={onDemo}>
            See it in action <ArrowRight size={17} />
          </button>
          <a
            href="#overview"
            onClick={() => trackMarketingEvent("product_exploration")}
          >
            Explore the system <ArrowDown size={16} />
          </a>
        </div>
      </div>
      <div className="dt-hero-readout">
        <span className="dt-readout-label">DIGITAL TWIN / ILLUSTRATIVE</span>
        <span className="dt-readout-index">
          0{focuses.findIndex((item) => item.key === focus) + 1} / 04
        </span>
        <strong>{current.detail}</strong>
      </div>
      <div
        className="dt-hero-controls"
        role="tablist"
        aria-label="Explore property activity"
      >
        {focuses.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={focus === key}
            onClick={() => {
              setFocus(key);
              trackMarketingEvent("product_exploration", { scene: key });
            }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Overview() {
  const reducedMotion = Boolean(useReducedMotion());
  return (
    <section id="overview" className="dt-overview">
      <div className="dt-container">
        <div className="dt-section-heading">
          <div>
            <span className="dt-kicker">01 / LIVE AWARENESS</span>
            <h2>From a portfolio to a decision.</h2>
          </div>
          <p>
            Replace scattered updates with one place to spot the next action.
            The figures below are an illustrative product preview.
          </p>
        </div>
        <div className="dt-signal-grid">
          {signals.map(({ label, value, icon: Icon, tone, note }, index) => (
            <motion.div
              key={label}
              className="dt-signal"
              data-tone={tone}
              initial={{ opacity: 1, y: reducedMotion ? 0 : 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.07 }}
            >
              <div className="dt-signal-top">
                <span>{label}</span>
                <Icon size={18} />
              </div>
              <strong>{value}</strong>
              <small>{note}</small>
              <div className="dt-signal-track">
                <i />
              </div>
            </motion.div>
          ))}
        </div>
        <div id="intelligence" className="dt-intelligence">
          <div className="dt-chart">
            <div className="dt-panel-header">
              <div>
                <span>COLLECTION INTELLIGENCE</span>
                <h3>Clarity, month by month.</h3>
              </div>
              <span className="dt-panel-meta">
                <span className="dt-live-dot" /> Illustrative data
              </span>
            </div>
            <div
              className="dt-chart-frame"
              role="img"
              aria-label="Illustrative rent collection rising from 58 percent to 93 percent from January to September"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={collection}
                  margin={{ top: 16, right: 16, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="collection-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--dt-chart-accent)"
                        stopOpacity={0.32}
                      />
                      <stop offset="100%" stopColor="var(--dt-chart-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--dt-chart-grid)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--dt-chart-tick)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[40, 100]}
                    tick={{ fill: "var(--dt-chart-tick)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--dt-chart-tooltip)",
                      border: "1px solid var(--dt-line)",
                      borderRadius: 3,
                      color: "var(--dt-white)",
                    }}
                    formatter={(value, name) => [
                      `${value}%`,
                      name === "actual" ? "Collected" : "Target",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="target"
                    stroke="var(--dt-chart-target)"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    fill="transparent"
                    isAnimationActive={!reducedMotion}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="var(--dt-chart-accent)"
                    strokeWidth={3}
                    fill="url(#collection-fill)"
                    isAnimationActive={!reducedMotion}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="dt-chart-legend">
              <span>
                <i className="dt-legend-actual" /> Collected
              </span>
              <span>
                <i className="dt-legend-target" /> Target
              </span>
            </div>
          </div>
          <div className="dt-decision">
            <div className="dt-panel-header">
              <div>
                <span>ATTENTION QUEUE</span>
                <h3>Only what needs you.</h3>
              </div>
              <ShieldCheck size={17} />
            </div>
            <div className="dt-queue-item">
              <span className="dt-queue-icon amber">
                <Wrench size={17} />
              </span>
              <div>
                <strong>Repair awaiting approval</strong>
                <small>Block B / Unit 12 / Plumbing</small>
              </div>
              <b>HIGH</b>
            </div>
            <div className="dt-queue-item">
              <span className="dt-queue-icon mint">
                <Banknote size={17} />
              </span>
              <div>
                <strong>Rent review required</strong>
                <small>3 payments need reconciliation</small>
              </div>
              <b>FINANCE</b>
            </div>
            <div className="dt-queue-item">
              <span className="dt-queue-icon blue">
                <Camera size={17} />
              </span>
              <div>
                <strong>Overnight security event</strong>
                <small>Main entrance / Evidence stored</small>
              </div>
              <b>SECURITY</b>
            </div>
            <div className="dt-decision-bottom">
              <span>
                <TrendingUp size={16} /> One operational truth
              </span>
              <Link href="/signup">
                Open your command center <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Operations({ onDemo }: { onDemo: () => void }) {
  return (
    <section id="operations" className="dt-operations">
      <div className="dt-container">
        <div className="dt-section-heading">
          <div>
            <span className="dt-kicker">02 / CONNECTED OPERATIONS</span>
            <h2>Everything matters in context.</h2>
          </div>
          <p>
            One record links the unit, the person, the cost, the work and the
            decision. Each role sees the part they are allowed to act on.
          </p>
        </div>
        <div className="dt-workflow-grid">
          {workflows.map(({ number, icon: Icon, title, text }) => (
            <div key={number} className="dt-workflow">
              <span className="dt-workflow-number">{number}</span>
              <Icon size={25} strokeWidth={1.6} />
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="dt-workflow-line" />
            </div>
          ))}
        </div>
        <div id="roles" className="dt-access-band">
          <div>
            <span className="dt-kicker">03 / CONTROLLED ACCESS</span>
            <h2>Connected teams. Clear boundaries.</h2>
            <p>
              Owners see the portfolio. Managers and caretakers operate in their
              assignments. Tenants see their home. Contractors see their jobs.
            </p>
            <button onClick={onDemo} className="dt-text-button">
              See how it works <ArrowRight size={17} />
            </button>
          </div>
          <div className="dt-role-map" aria-label="Scoped access by role">
            <span className="dt-role-center">
              <ShieldCheck size={24} /> OWNER
            </span>
            {[
              ["MANAGER", "Properties"],
              ["CARETAKER", "Buildings"],
              ["CONTRACTOR", "Jobs"],
              ["TENANT", "Own tenancy"],
            ].map(([role, scope]) => (
              <span key={role}>
                <Check size={14} />
                <b>{role}</b>
                <small>{scope}</small>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => {
    trackMarketingEvent("hero_demo_click");
    setDemoOpen(true);
  };
  return (
    <div className="digital-twin-landing">
      <MarketingNav onDemo={openDemo} />
      <main>
        <Hero onDemo={openDemo} />
        <Overview />
        <Operations onDemo={openDemo} />
        <DemoTeaser />
        <section className="dt-final" id="contact">
          <div className="dt-container">
            <span className="dt-kicker">PROPERTY COMMAND CENTER</span>
            <h2>
              You do not need to be everywhere.
              <br />
              <span>Be connected to everything that matters.</span>
            </h2>
            <div>
              <button onClick={openDemo} className="dt-primary">
                Request a private demo <ArrowRight size={17} />
              </button>
              <Link href="/signup">
                Create your organization <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="dt-footer">
        <div className="dt-container">
          <Link href="/" className="dt-brand">
            <span className="dt-mark">PC</span>
            <span>
              PROPERTY
              <br />
              COMMAND CENTER
            </span>
          </Link>
          <p>Property operations, connected.</p>
          <div>
            <a href="#overview">Product</a>
            <a href="#operations">Operations</a>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
      <DemoRequestDialog
        open={demoOpen}
        onOpenChange={setDemoOpen}
        source="digital-twin"
      />
    </div>
  );
}
