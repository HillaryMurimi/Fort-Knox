import { describe, expect, it } from "vitest";
import { personas, portfolio, portfolioTotals, roleViews, scenarios, signatureScenes, socialCampaigns } from "./content";
import { initialTimeline, parseDemoQuery, ratios, scaleScenes, timelineReducer } from "./timeline";

describe("cinematic demo content", () => {
  it("keeps the fictional portfolio and financial ratios consistent", () => {
    expect(portfolioTotals).toMatchObject({ properties: 5, units: 144, occupied: 134, vacant: 10, outstanding: 308_500, occupancyPercent: 93.1, collectionPercent: 92.9 });
    expect(portfolio.properties.every((item) => item.occupied <= item.units)).toBe(true);
    expect(portfolio.expectedRent - portfolio.collectedRent).toBe(portfolioTotals.outstanding);
  });

  it("defines a full sales arc and twenty distinct short-form campaigns", () => {
    expect(signatureScenes).toHaveLength(24);
    expect(signatureScenes[0]?.kind).toBe("opening");
    expect(signatureScenes.at(-1)?.kind).toBe("closing");
    expect(socialCampaigns).toHaveLength(20);
    expect(new Set(socialCampaigns.map((item) => item.id)).size).toBe(20);
    for (const campaign of socialCampaigns) {
      expect(campaign.scenes[0]?.title).toBe(campaign.hook);
      expect(campaign.scenes.at(-1)?.title).toBe(campaign.cta);
      expect(scenarios.some((item) => item.id === campaign.scenarioId)).toBe(true);
      expect(campaign.scenes.every((item) => item.durationMs > 0 && item.narration.length > 0)).toBe(true);
    }
  });

  it("keeps tenant and contractor demo views scoped", () => {
    expect(personas.tenant.title).toContain("Unit B-12");
    expect(roleViews.tenant).toContain("Unit B-12");
    expect(roleViews.tenant).not.toContain("Collections");
    expect(roleViews.contractor).toContain("Assigned plumbing job");
    expect(roleViews.contractor).not.toContain("Security");
    expect(roleViews.caretaker).not.toContain("Five-property portfolio");
  });
});

describe("deterministic playback", () => {
  const scenes = scaleScenes(signatureScenes.slice(0, 2), 6);
  it("advances, pauses and stops at the final scene", () => {
    const playing = timelineReducer(initialTimeline, { type: "play", value: true });
    const progressed = timelineReducer(playing, { type: "tick", deltaMs: 100, scenes });
    expect(progressed.elapsedMs).toBe(100);
    const paused = timelineReducer(progressed, { type: "play", value: false });
    expect(timelineReducer(paused, { type: "tick", deltaMs: 100, scenes })).toEqual(paused);
    const last = timelineReducer(playing, { type: "seek", index: 1, scenes });
    const almostDone = { ...last, elapsedMs: scenes[1]!.durationMs - 50 };
    expect(timelineReducer(almostDone, { type: "tick", deltaMs: 100, scenes })).toMatchObject({ index: 1, playing: false });
  });

  it("loops and resets deterministically", () => {
    const state = { ...initialTimeline, playing: true, loop: true, index: 1, elapsedMs: scenes[1]!.durationMs - 20 };
    expect(timelineReducer(state, { type: "tick", deltaMs: 50, scenes })).toMatchObject({ index: 0, elapsedMs: 30, playing: true });
    expect(timelineReducer(state, { type: "restart" })).toMatchObject({ index: 0, elapsedMs: 0, playing: true });
  });

  it("bounds seeks, speed and background-frame deltas", () => {
    expect(timelineReducer(initialTimeline, { type: "seek", index: 999, scenes }).index).toBe(1);
    expect(timelineReducer(initialTimeline, { type: "speed", value: 99 }).speed).toBe(2);
    expect(timelineReducer({ ...initialTimeline, playing: true }, { type: "tick", deltaMs: 10_000, scenes }).elapsedMs).toBe(250);
  });
});

describe("capture configuration", () => {
  it("parses deterministic URLs and clamps invalid values", () => {
    expect(parseDemoQuery(new URLSearchParams("scenario=maintenance&campaign=which-house&ratio=vertical&theme=light&autoplay=true&loop=true&controls=false&captions=false&speed=1.5&duration=20&style=Executive&platform=YouTube&safeArea=false&deviceFrame=true&labels=false&pointer=true"))).toEqual({ scenario: "maintenance", campaign: "which-house", ratio: "vertical", theme: "light", autoplay: true, loop: true, controls: false, captions: false, speed: 1.5, duration: 20, style: "Executive", platform: "YouTube", safeArea: false, deviceFrame: true, labels: false, pointer: true });
    expect(parseDemoQuery(new URLSearchParams("ratio=broken&speed=100"))).toMatchObject({ ratio: "landscape", speed: 2 });
  });

  it("defines every export ratio and fits campaign scenes to a requested duration", () => {
    expect(Object.values(ratios).map((item) => item.css)).toEqual(["9 / 16", "16 / 9", "1 / 1", "4 / 5"]);
    for (const [ratio, preset] of Object.entries(ratios)) expect(preset.width / preset.height).toBeCloseTo(ratio === "vertical" ? 9 / 16 : ratio === "landscape" ? 16 / 9 : ratio === "square" ? 1 : 4 / 5);
    const cut = scaleScenes(socialCampaigns[0]!.scenes, 15);
    expect(cut.reduce((sum, item) => sum + item.durationMs, 0)).toBeCloseTo(15_000, -1);
  });
});
