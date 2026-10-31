export function onboardingProgress(
  expected: number | undefined | null,
  actual: number,
) {
  return {
    expectedUnits: expected ?? null,
    registeredUnits: actual,
    remainingUnits: expected ? Math.max(0, expected - actual) : null,
    completionPercent: expected
      ? Math.min(100, Math.floor((actual * 100) / expected))
      : null,
  };
}
