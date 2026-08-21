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

Import `aitoolsteejay/outreach-tool` in Vercel and keep the detected framework as Next.js. No environment variables are required for the current frontend preview.

Before inviting clients, connect production authentication, database persistence, and private CSV storage. Supabase is the recommended all-in-one option for those capabilities.

## Current scope

- Responsive campaign dashboard
- Campaign creation wizard
- Downloadable lead CSV template
- Messaging strategy intake
- Login and sign-out interface
- Campaign status presentation

Campaigns and uploaded files are currently held only in browser memory and are not persisted.
