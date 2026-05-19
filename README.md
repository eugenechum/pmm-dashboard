# Ninja FieldSight PMM Dashboard

**A field intelligence terminal for retail outlet surveys.**

Built for Ninja Van + Philip Morris Malaysia to track store-level brand penetration, capture interested leads, and manage PMM sales outreach.

---

## What It Does

- **Upload FieldSight ZIPs** — drag & drop survey data
- **Auto-parse** — extracts outcomes (Already Selling / Interested / Not Interested), brands stocked, owner contact info
- **Live dashboard** — real-time KPIs, lead segmentation, brand sell-through analysis
- **Cumulative pool** — new uploads merge automatically, no data loss
- **Photo viewing** — see captured shop photos + dispenser photos inline
- **Exports** — CSV download for Excel/Salesforce

---

## Tech Stack

**Frontend:**
- React 18 + React DOM
- Dark editorial UI (Fraunces serif + JetBrains Mono)
- Client-side ZIP parsing (JSZip)
- Zero external dependencies at runtime

**Backend:**
- Node.js + Express
- Google Sheets API for data storage
- CSV parsing + AI message classification
- Password-protected upload endpoint

**Data:**
- Google Sheets (human-readable, shareable, free)
- JSON serialization for batch merging

---

## Files

```
.
├── ninja_fieldsight_pmm_dashboard.html  ← Frontend (single file)
├── backend.js                            ← Server (Node.js)
├── package.json                          ← Dependencies
├── dashboard_v4.css                      ← Styling
├── dashboard_v4_template.html            ← React JSX template (for building)
├── parser.js                             ← ZIP parser (shared with backend)
├── DEPLOYMENT.md                         ← Step-by-step hosting guide
└── .env.example                          ← Environment variables template
```

---

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start backend (localhost:3000)
npm start

# Frontend: open ninja_fieldsight_pmm_dashboard.html in a browser
open ninja_fieldsight_pmm_dashboard.html
```

Uploads will POST to `http://localhost:3000/upload`.

---

## Deployment

See `DEPLOYMENT.md` for full step-by-step instructions.

**TL;DR:**
1. Set up Google Sheets + Service Account (free)
2. Deploy backend to Railway (~$5/month)
3. Host frontend on Vercel (free)
4. Share URL with your team

---

## Data Flow

```
User uploads ZIP
         ↓
Backend parses (jobs, messages, photos)
         ↓
Backend writes to Google Sheet
         ↓
All users see updated data
```

---

## Team Access

**Frontend:** All team members get a shared URL. They see:
- Live KPI dashboard
- Lead list with owner contact info
- Brand sell-through breakdown
- Photo viewer

**Upload:** Password-protected. Only you (Eugene) can upload ZIPs. Everyone else sees the merged results.

---

## Uploader Attribution

When you upload a ZIP, the backend logs:
- Your name
- Timestamp
- Number of jobs uploaded
- (In Sheets → Uploads tab)

---

## Phase Roadmap

**Now (v4):**
- Single-file HTML + Node backend
- Google Sheets storage
- Cumulative batch merging
- Dark editorial UI

**Phase 1-full:**
- Proper auth (per-user, not shared password)
- Persistent storage (not just Sheets)
- Better audit trail
- Address data join via TID

**Phase 2:**
- FieldSight API integration
- Real-time data sync
- Multi-client support

---

## Questions?

Ask Claude or check `DEPLOYMENT.md` for setup help.

---

**Built for PMM Store Exploration — Malaysia, 2026**
