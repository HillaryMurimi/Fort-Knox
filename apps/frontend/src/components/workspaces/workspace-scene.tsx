"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import type { SceneFocus } from "@/components/marketing/landing/property-scene";
import styles from "./workspace-scene.module.css";

export type WorkspaceSceneRole = "tenant" | "landlord" | "manager" | "caretaker" | "contractor";

const HouseScene = dynamic(() => import("./house-scene").then((module) => module.HouseScene), { ssr: false });
const PropertyScene = dynamic(() => import("@/components/marketing/landing/property-scene").then((module) => module.PropertyScene), { ssr: false });

export const workspaceSceneDetails: Record<WorkspaceSceneRole, { focus?: SceneFocus; label: string; note: string }> = {
  tenant: { label: "Your home", note: "A place for everyday life" },
  landlord: { focus: "portfolio", label: "Portfolio view", note: "Properties in context" },
  manager: { focus: "units", label: "Property operations", note: "Homes and people in motion" },
  caretaker: { focus: "security", label: "On-site view", note: "Buildings, safety and service" },
  contractor: { focus: "maintenance", label: "Service view", note: "Work where it happens" },
};

export function WorkspaceScene({ role }: { role: WorkspaceSceneRole }) {
  const reducedMotion = Boolean(useReducedMotion());
  const details = workspaceSceneDetails[role];
  return <section className={`${styles.scene} ${role === "tenant" ? styles.tenant : styles.operational}`} aria-label={`${details.label} illustration`}>
    <div className={styles.canvas}>
      {role === "tenant" ? <HouseScene reducedMotion={reducedMotion} /> : <PropertyScene focus={details.focus!} reducedMotion={reducedMotion} />}
    </div>
    <div className={styles.caption} aria-hidden="true"><span>{details.label}</span><small>{details.note}</small></div>
  </section>;
}
