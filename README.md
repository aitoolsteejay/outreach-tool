# Myntmore Outreach Tool

A client-facing portal for submitting lead lists and messaging strategy, then tracking outreach campaigns managed by Myntmore.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm start
```

## Deploy to Vercel

Import `aitoolsteejay/outreach-tool` in Vercel and keep the detected framework as Next.js. Configure the variables listed in `.env.example`; keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## Current scope

- Responsive campaign dashboard
- Campaign creation wizard
- Downloadable lead CSV template
- Messaging strategy intake
- Login, one-time admin bootstrap, and sign-out interface
- Admin-only client account creation
- Campaign status presentation
- Supabase persistence and private CSV storage
