# CDO Gas Bantay - System Documentation

Community fuel price app for Cagayan de Oro (CDO), built to help motorists compare nearby prices and make better daily decisions.

---

## 1) Project Purpose

`CDO Gas Bantay` is a community-driven map where users can:
- View fuel stations around CDO
- See recent community-submitted fuel prices
- Vote reports as helpful or not accurate
- Submit new price updates with optional photo evidence
- Ask a map assistant for nearby price guidance

The goal is simple: **faster, more transparent fuel price awareness for CDO commuters and families**.

---

## 2) Core Features

### A. Live Map and Station Browser
- Interactive map focused on CDO
- Search stations by name or address
- Station popup with latest trusted prices (Diesel, Regular/Green, Premium/Red)

### B. Community Price Submission
- Users can submit one or more fuel prices per station
- Optional photo upload
- File type guard for uploads: `PNG`, `JPG/JPEG`, `HEIC/HEIF` only
- Input range checks to reduce unrealistic values

### C. Voting and Trust System
- Each report supports **upvote** and **downvote**
- One anonymous vote identity per report (fingerprint-based)
- Vote switching supported (up -> down, down -> up)
- Cooldown applied for new votes to limit abuse
- Reports ranked by **trust score** using Wilson lower bound confidence scoring

### D. AI Map Assistant
- In-app assistant with Bisaya-default multilingual support
- Can answer nearby-price questions using current map context
- Top nearest stations shown when location is enabled
- Structured, cleaner reply format for user readability

### E. Privacy and Transparency
- In-app Privacy Policy modal
- Community-data disclaimer (prices are user-submitted and may change)
- Footer includes Privacy link and developer profile link

---

## 3) Current Vote Logic (High Level)

1. User taps vote button.
2. App checks cooldown and current vote state.
3. If allowed, app updates vote row in Supabase (`upvotes` / `downvotes`).
4. App refreshes vote totals from database for consistency.
5. UI updates counts and active button states.

This keeps the interface responsive while ensuring displayed counts reflect actual DB data.

---

## 4) Data and Backend Overview

### Main Data Tables
- `gas_stations`
- `price_reports`
- `upvotes`
- `downvotes`

### Security Model
- Supabase Row Level Security (RLS) enabled
- Public read for map/report data
- Controlled insert/delete policies for report voting and submissions

---

## 5) Tech Stack

- **Frontend:** React + Vite
- **Map:** Leaflet + OpenStreetMap
- **Backend/DB:** Supabase (Postgres + Storage + RLS)
- **Serverless API:** Vercel `/api/chat` for assistant
- **AI Services:** Groq models for chat and OCR-assisted extraction

---

## 6) User Value for CDO Community

- Helps users check practical fuel options before traveling
- Encourages community participation and local data sharing
- Supports day-to-day savings awareness through frequent updates
- Improves transparency in local fuel price movement

---

## 7) Public Disclaimer (Recommended for Social Media)

> CDO Gas Bantay is a community-powered information app.  
> Fuel prices are user-submitted and may change anytime.  
> Please verify actual pump prices at the station before purchase.

---

## 8) Social Media Post Draft

Use this for your launch/update post:

> **CDO Gas Bantay is now live.**  
> A community app for Cagayan de Oro that helps you check nearby fuel prices, submit updates, and vote which reports are most reliable.  
>  
> Built to support commuters, riders, and families with practical local price visibility.  
>  
> Community data, real-time map, and multilingual assistant support.  
>  
> #CDOGasBantay #CagayanDeOro #CommunityTech #FuelPricePH

---

## 9) Maintenance Notes

- Monitor vote abuse patterns and tune cooldown if needed
- Keep RLS policies reviewed per release
- Periodically review duplicate station names/locations
- Continue improving trust ranking and moderation tools

