import type { Metadata } from "next";
import { DemoExperience } from "@/components/marketing/cinematic-demo/demo-experience";

export const metadata: Metadata = { title: "Explore the Command Center" };
export default function ExploreDemoPage() { return <DemoExperience mode="explore"/>; }
