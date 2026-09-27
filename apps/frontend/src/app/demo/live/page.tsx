import type { Metadata } from "next";
import { DemoExperience } from "@/components/marketing/cinematic-demo/demo-experience";

export const metadata: Metadata = { title: "Live Product Demonstration", robots: { index: false, follow: false } };
export default function LiveDemoPage() { return <DemoExperience mode="live"/>; }
