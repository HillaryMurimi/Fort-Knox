# Cinematic Demo System

The public demonstration routes are `/demo`, `/demo/live`, `/demo/explore`, and `/demo/studio`. `/demo` is the portfolio and scenario entrance. Live, Explore, and Studio share deterministic typed scenes and the rebuilt `DemoStage` renderer in `apps/frontend/src/lib/cinematic-demo/` and `apps/frontend/src/components/marketing/cinematic-demo/`. The landing page embeds the same stage as a teaser.

## Safety Boundary

All names, homes, transactions, CCTV feeds, incidents, scores, and audit entries in these routes are fictional client-side content. The engine has no mutation API client and never writes to production collections. The root application providers may still perform ordinary session reads. The role sequence is a visualization of intended scope, not an authorization preview: backend RBAC, ABAC, entitlements, and CCTV access controls remain authoritative. Camera imagery is abstract simulation and never implies a live feed. Personalization changes only the live presentation title, not portfolio figures.

The Acacia example has 5 properties, 144 units, 134 occupied, 10 vacant, 93.1% occupancy, KES 4,320,000 expected rent, KES 4,011,500 collected, KES 308,500 outstanding, and a 92.9% collection rate. Content is centrally defined so the figures stay consistent across scenes.

## Playback And Capture

- Live mode offers a 16-minute signature timeline, presenter controls, prospect title, scene selection, shortcuts, and fullscreen.
- Explore mode offers guided scenario entry points and a mobile portrait canvas.
- Studio supports 9:16, 16:9, 1:1, and 4:5 ratios, platform presets, safe-area overlays, captions, duration scaling, loop, speed, restart, theme switching, and clean capture. Vertical scenes recompose around a single operational idea rather than shrinking a desktop scene.
- `Space` toggles playback, arrow keys move scenes, `R` restarts, `F` enters fullscreen, `C` toggles clean capture, and `Shift+D` toggles the presenter panel. These shortcuts do not intercept input fields.
- A deterministic capture URL can be copied from Studio, for example `/demo/studio?campaign=which-house&ratio=vertical&duration=15&autoplay=true&controls=false&captions=true`. Record the clean browser viewport using OBS or a browser capture tool. `npm --prefix apps/frontend run verify:cinematic-demo -- http://localhost:3000` writes visual QA screenshots under ignored `test-results/cinematic-demo/`.
- The engine contains optional narration text but no bundled music or automatic audio. Any published soundtrack, voiceover, or sound effect requires licensed assets and an editorial review.

The 20 campaign hooks are reusable cuts of the same scenario scenes. They are a content manifest, not pre-rendered video files. For each published asset, a human still needs to select the campaign, record at the target resolution, add licensed audio if desired, review captions and claims, and export through the chosen editing pipeline. A future automated recorder can drive the query parameters and timeline without changing the product UI.

## Remaining Production Work

- Editorial review of every factual product claim, tier entitlement, and simulated outcome before publication.
- Licensed audio, approved logo/brand assets, and final social-platform safe-area templates.
- Device-level review of 9:16 and 16:9 recordings and a capture/export pipeline if fully automated video output is needed.
- The live walkthrough shows fixed Acacia portfolio data; deeper prospect-specific financial simulation requires a separate validated data model.
