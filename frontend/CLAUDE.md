# ClaimRidge — AI Insurance Compliance Layer

## Project Overview
ClaimRidge is an AI-powered insurance compliance layer that ensures medical claims meet each payer's exact requirements before submission — reducing denials for providers and manual review costs for insurers. Targeting the MENA healthcare market, starting with Jordan, expanding to UAE and KSA.

## Core MVP Feature
Claims compliance validation — take a raw medical claim, run it through AI trained on payer-specific rules, return a compliant submission-ready claim with error flags and actionable fixes. Benefits both sides: hospitals get fewer rejections, insurers get cleaner submissions.

## Tech Stack
- Next.js 14 (App Router)
- Tailwind CSS
- Supabase (auth + database)
- Anthropic Claude API (scrubbing intelligence)
- Vercel (deployment)

## Code Style
- Always use TypeScript
- Always use async/await never .then()
- Components in /components folder
- API routes in /app/api
- Keep components small and single responsibility
- Always handle loading and error states
- Mobile responsive always

## Design System
- Primary color: Deep Navy #0A1628
- Secondary: Clean White #FFFFFF
- Accent: Teal #00B4A6
- Font: Inter
- Feels like premium B2B SaaS — clinical, clean, trustworthy

## Business Context
- Target users: Hospital billing teams, insurance claims reviewers, TPAs
- Market: MENA — Jordan first, UAE + KSA next
- Pricing model: Outcome-based / SaaS subscription
- Key differentiator: AI compliance layer trained on MENA payer-specific rules — serves both providers and insurers

## Current Stage
- Pre-revenue prototype
- Domain: claimridge.com
- Trademark: Clear

## Important Rules
- Never break existing working features
- Always test before saying something is done
- Keep the codebase clean and well commented
- When in doubt ask don't assume