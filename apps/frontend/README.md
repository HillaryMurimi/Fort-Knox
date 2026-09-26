# Property Management Command Center — Frontend

Next.js 15 + React 19 + TypeScript + Tailwind CSS frontend for the Phase 19 backend contract.

## Run

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_ORGANIZATION_ID to a real organization id for live command-center data
npm install
npm run dev
```

Backend default: `http://localhost:9000/api/v1`.

The dashboard uses the Phase 19 command-center endpoint when `NEXT_PUBLIC_ORGANIZATION_ID` is present, with an intentional demo state so the UI can be reviewed before authentication/organization context is wired in.
