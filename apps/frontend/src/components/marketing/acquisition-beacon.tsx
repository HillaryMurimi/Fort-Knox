"use client";
import { useEffect } from "react";
import { trackAcquisition } from "@/lib/acquisition";
export function AcquisitionBeacon({
  event,
}: {
  event:
    "landing_viewed" | "demo_started" | "demo_completed" | "signup_started";
}) {
  useEffect(() => {
    void trackAcquisition(event, {
      source: event.startsWith("demo_") ? "PUBLIC_DEMO" : "WEBSITE",
    });
  }, [event]);
  return null;
}
