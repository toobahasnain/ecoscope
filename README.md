# 🔬 EcoScope — ZEISS Energy Smart AI

> AI-powered energy optimization assistant for ZEISS microscope workflows — Re_Make Hackathon 2026 Winner 🏆

**[→ Live Demo](https://ecoscope-five.vercel.app/)** | Built at Das Habitat Augsburg | April 20–21, 2026

---

## What is EcoScope?

EcoScope is a smart assistant that learns efficient workflow patterns from training data and helps scientists reduce energy waste in ZEISS microscope workflows — without reducing performance.

Instead of a black-box ML model, we use a **Rule-Based + LLM hybrid approach**:
- Training data (S1–S10) teaches the system what "efficient" looks like per phase
- New test scenarios are compared phase-by-phase against those learned boundaries
- Google Gemini explains deviations in plain language with R-strategy mapping

---

## Features

- **Pre-trained** on 10 real ZEISS workflow scenarios — no setup needed
- **Phase-by-phase analysis** — tile scan, live view, processing, idle
- **AI Insights** — Gemini-powered recommendations with skip/optimize actions
- **Baseline vs Improved** — side-by-side energy comparison before/after optimization
- **Accuracy scoring** — validates predictions against ground truth labels
- **Scenario 11** — AI-generated optimal workflow assembled from best phases
- **What-If Simulator** — live energy saving calculator with sliders
- **Energy Labels** — A++ to G rating system (like EU appliance labels)
- **AI Chatbot** — ask questions about the workflow data in natural language
- **Pre-loaded test scenarios** — S13 and S15 ready to analyze instantly

---

## How It Works

### Step 1 — Learn from Training Data
Reference profiles are pre-calculated from S1–S10 scenarios. For each phase, we extract the most efficient 50% of scenarios and calculate average power, GPU usage, interaction patterns, and energy consumption.

### Step 2 — Compare Test Scenario
When a new scenario is uploaded, each phase is compared against the learned reference. Deviations above 20% are flagged as wasteful.

### Step 3 — Generate Recommendations
Flagged deviations are sent to Gemini API (as anonymized metrics only — no raw data) which generates human-readable recommendations mapped to circular economy R-strategies.

### Learned Reference Profiles (from S1–S10)

| Phase | Efficient Avg Power | Efficient Avg Energy |
|-------|-------------------|---------------------|
| tile_scan_acquisition | 211.51W | 491.41 Wh |
| live_view_monitoring | 181.97W | 239.52 Wh |
| processing | 194.34W | 200.0 Wh |
| idle | 159.85W | 271.14 Wh |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 + TypeScript | Frontend + API routes in one project |
| Data Parsing | PapaParse | Browser-side CSV parsing |
| Visualization | Recharts | Interactive charts and radar diagrams |
| Analysis Engine | Custom TypeScript (analyze.ts) | Rule-based learning — no external ML library |
| LLM | Google Gemini 2.5 Flash | Natural language recommendations only |
| Deployment | Vercel | Free, fast, no configuration |

---

## Data Privacy

Raw microscope data **never leaves the local system**. Gemini API only receives anonymized metrics:
- Phase name
- Average power numbers
- Deviation percentages

This makes EcoScope safe for real ZEISS lab deployment with sensitive research data.

---

## Run Locally

```bash
# 1. Clone
git clone https://github.com/toobahasnain/ecoscope.git
cd ecoscope

# 2. Install
npm install

# 3. Add API key
# Create .env.local:
GEMINI_API_KEY=your_gemini_api_key

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

S13 and S15 test scenarios load automatically — no upload needed.

---

## R-Strategy Mapping

Every recommendation is mapped to the circular economy 9R framework:

| Strategy | Applied To |
|----------|-----------|
| R1 — Rethink | Idle phase — redesign auto-standby behavior |
| R2 — Reduce | Live view, tile scan — reduce unnecessary energy consumption |
| R3 — Reuse | Processing — reuse cached results instead of reprocessing |

---

## Project Structure

| File | Purpose |
|------|---------|
| `app/api/analyze/route.ts` | Phase analysis + Gemini integration |
| `app/api/chat-eco/route.ts` | Chatbot API route |
| `app/lib/analyze.ts` | Core analysis engine + accuracy calculation |
| `app/lib/trainingProfiles.ts` | Pre-trained reference profiles from S1–S10 |
| `app/page.tsx` | Full dashboard UI |
| `public/data/` | Pre-loaded test scenarios (S13, S15) |

---

## Author

**Syeda Tooba Hasnain** — Software Developer, TH Augsburg

- Portfolio: [tooba-ai-beta.vercel.app](https://tooba-ai-beta.vercel.app/)
- LinkedIn: [syeda-tooba-hasnain](https://www.linkedin.com/in/syeda-tooba-hasnain-a9a17119a/)
- GitHub: [toobahasnain](https://github.com/toobahasnain)

---

*Built with Next.js · TypeScript · Gemini API · Deployed on Vercel*
*Re_Make Hackathon 2026 — ZEISS Energy Smart AI Challenge — 🏆 Winner*