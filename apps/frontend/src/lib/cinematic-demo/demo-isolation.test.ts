import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const demoModules = [
  "../../components/marketing/cinematic-demo/demo-experience.tsx",
  "../../components/marketing/cinematic-demo/demo-stage.tsx",
  "../../components/marketing/cinematic-demo/demo-teaser.tsx",
  "./content.ts",
  "./timeline.ts",
];

describe("public demo boundary", () => {
  it("does not import production data clients or issue network mutations", () => {
    for (const modulePath of demoModules) {
      const source = readFileSync(new URL(modulePath, import.meta.url), "utf8");
      expect(source, modulePath).not.toMatch(/@\/lib\/data\/|useMutation|\bfetch\s*\(|\baxios\b|@\/context\/auth-context/);
    }
  });
});
