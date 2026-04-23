# ClaimRidge — AI Insurance Compliance Layer

ClaimRidge is an AI-powered insurance compliance platform that ensures medical claims meet each payer's exact requirements before submission. By reducing claim denials for providers and manual review costs for insurers, ClaimRidge serves as the critical compliance bridge in the healthcare payment ecosystem.

**Current Focus:** MENA region (Jordan, UAE, KSA) | **Status:** Pre-revenue prototype

---

## 🎯 Core Value Proposition

- **For Providers (Hospitals):** Fewer claim rejections, faster reimbursement, reduced manual rework
- **For Insurers:** Cleaner submissions, lower manual review overhead, automated compliance validation
- **For TPAs:** AI-driven claim routing and adjudication

---

## 🏗 Project Structure

```
ClaimRidge/
├── backend/                 # FastAPI-based compliance engine
│   ├── main.py             # Application entry point
│   ├── requirements.txt     # Python dependencies
│   ├── core/               # Core configuration
│   │   ├── config.py       # Settings and environment configuration
│   │   ├── database.py     # Supabase database setup
│   │   └── security.py     # Authentication and authorization
│   ├── routers/            # API endpoints
│   │   ├── claims.py       # Claim compliance validation routes
│   │   ├── insurer.py      # Insurer management routes
│   │   └── pdf.py          # PDF processing routes
│   └── services/           # Business logic
│       └── ai_services.py  # AI/Claude integration for claim analysis
│
├── frontend/               # Next.js 14 compliance dashboard
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   │   ├── claims/    # Claim submission and tracking
│   │   │   ├── dashboard/ # User dashboards
│   │   │   ├── insurer/   # Insurer portal
│   │   │   ├── login/     # Authentication
│   │   │   └── signup/    # User registration
│   │   ├── components/    # Reusable React components
│   │   ├── lib/           # Utilities and services
│   │   └── types/         # TypeScript type definitions
│   ├── supabase/          # Database migrations and seeds
│   └── public/            # Static assets
│
└── README.md              # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Backend:** Python 3.9+, pip
- **Frontend:** Node.js 18+, npm/yarn
- **Services:** Supabase account, Anthropic API key

### Backend Setup

1. **Create and activate virtual environment:**
   ```bash
   cd backend
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On macOS/Linux:
   source .venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

3. **Configure environment:**
   ```bash
   # Create .env file in backend/ with:
   DATABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ANTHROPIC_API_KEY=your_anthropic_key
   ```

4. **Run the server:**
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment:**
   ```bash
   # Create .env.local in frontend/ with:
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser

---

## 🔑 Key Features

### Claims Compliance Validation
- Upload medical claims (CMS-1500, proprietary formats)
- AI-powered analysis against payer-specific rules
- Real-time compliance checking with error flags
- Actionable recommendations for claim correction

### Multi-User Portal
- **Provider Dashboard:** Claim submission, history, analytics
- **Insurer Portal:** Claims review, fraud detection, rule management
- **Admin Panel:** System configuration, user management

### Payer-Specific Rules Engine
- Configurable compliance rules per payer
- Dynamic rule updates for regulatory changes
- Support for complex conditional logic

### Analytics & Reporting
- Denial rate tracking
- Compliance score metrics
- Batch processing analytics

---

## 🛠 Tech Stack

### Backend
- **Framework:** FastAPI (async Python web framework)
- **Database:** Supabase (PostgreSQL + real-time)
- **AI:** Anthropic Claude API (claim analysis and compliance checks)
- **PDF Processing:** PyPDF2, Playwright
- **Validation:** Pydantic
- **Automation:** LangChain

### Frontend
- **Framework:** Next.js 14 (React + App Router)
- **Styling:** Tailwind CSS
- **Authentication:** Supabase Auth
- **Type Safety:** TypeScript
- **Deployment:** Vercel

### Infrastructure
- **Database:** Supabase (PostgreSQL)
- **Authentication:** OAuth + Email/Password (Supabase)
- **Hosting:** Vercel (frontend), Cloud Run/EC2 (backend)

---

## 🎨 Design System

| Element | Value |
|---------|-------|
| Primary Color | Deep Navy `#0A1628` |
| Secondary Color | Clean White `#FFFFFF` |
| Accent Color | Teal `#00B4A6` |
| Typography | Inter font family |
| Aesthetic | Premium B2B SaaS — clinical, clean, trustworthy |

---

## 📱 API Endpoints

### Claims Routes (`/api/claims`)
- `POST /claims/validate` — Validate claim compliance
- `GET /claims/history` — Get claim submission history
- `POST /claims/submit` — Submit compliant claim
- `GET /claims/{id}/results` — Get compliance analysis results

### Insurer Routes (`/api/insurer`)
- `GET /insurer/dashboard` — Insurer analytics dashboard
- `GET /insurer/claims` — View submitted claims
- `POST /insurer/rules` — Configure payer rules

### PDF Routes (`/api/pdf`)
- `POST /pdf/extract` — Extract data from PDF claims
- `POST /pdf/generate` — Generate corrected claim PDFs

---

## 🔐 Security & Authentication

- **Two-sided authentication:** Providers and insurers authenticate separately
- **Role-based access control:** Different permissions for providers/insurers/admins
- **API key management:** Secure supabase integration
- **Environment variables:** Sensitive data in .env files (never committed)

---

## 📊 Database Schema

Key tables:
- `users` — User accounts and authentication
- `claims` — Medical claim records
- `compliance_results` — AI analysis results per claim
- `payer_rules` — Payer-specific compliance rules
- `insurer_config` — Insurer organization settings

Database migrations are in `frontend/supabase/migrations/`

---

## 🚦 Development Guidelines

### Code Style
- ✅ Always use TypeScript (frontend) and type hints (backend)
- ✅ Use async/await (never .then())
- ✅ Keep components small and single responsibility
- ✅ Always handle loading and error states
- ✅ Mobile responsive design always

### Git Workflow
- Create feature branches from `main`
- Write clear commit messages
- Test locally before pushing
- Keep PR changes focused

### Testing & QA
- ✅ Test new features locally before marking complete
- ✅ Verify both provider and insurer flows
- ✅ Check mobile responsiveness
- ⚠️ Never break existing working features

---

## 📚 Important Files

| File | Purpose |
|------|---------|
| `frontend/CLAUDE.md` | Frontend code guidelines and business context |
| `frontend/supabase/migrations/` | Database schema definitions |
| `backend/routers/` | API endpoint definitions |
| `backend/services/ai_services.py` | Claude API integration |

---

## 🌍 Market Context

- **Target Market:** MENA region (Middle East & North Africa)
- **Initial Focus:** Jordan
- **Expansion:** UAE, KSA
- **Target Users:** Hospital billing teams, insurance claims reviewers, TPAs
- **Pricing Model:** Outcome-based / SaaS subscription
- **Domain:** claimridge.com
- **Trademark Status:** Clear

---

## ✅ Deployment

### Frontend
- Automatically deployed to Vercel on push to `main`
- Environment variables configured in Vercel dashboard

### Backend
- Deploy to Cloud Run, EC2, or preferred cloud provider
- Environment variables via `.env` file or cloud provider secrets manager

---

## 🤝 Contributing

1. Review `frontend/CLAUDE.md` for coding guidelines
2. Follow the code style outlined in Development Guidelines
3. Test locally before pushing
4. Create descriptive PR titles and descriptions

---

## 📞 Support & Questions

When in doubt:
- Check existing code patterns in the project
- Review `frontend/CLAUDE.md` for guidance
- Ask questions clearly rather than assuming
- Keep the codebase clean and well commented

---

## 📝 License

[Add your license here]

---

**Last Updated:** April 2026 | **Status:** Pre-revenue Prototype
