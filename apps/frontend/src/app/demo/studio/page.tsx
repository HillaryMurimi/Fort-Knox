import type { Metadata } from "next";
import { DemoExperience } from "@/components/marketing/cinematic-demo/demo-experience";

export const metadata: Metadata = { title: "Demo Content Studio", robots: { index: false, follow: false } };
export default function DemoStudioPage() { return <DemoExperience mode="studio"/>; }
