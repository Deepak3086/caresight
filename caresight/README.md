# CareSight: patient risk dashboard

A clinical decision-support demo. Doctors sign in, review a patient list, and get a
cardiometabolic risk score with the factors that moved it. **Synthetic data only. Not a diagnostic tool.**

## Stack
FastAPI, SQLAlchemy (SQLite by default, PostgreSQL via `DATABASE_URL`), scikit-learn, PyJWT, React + Vite.

## Run it
```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.ml                      # trains the model, prints AUC / precision / recall
uvicorn app.main:app --reload         # http://localhost:8000/docs

# frontend (new terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Demo logins: `doctor / doctor123` and `admin / admin123`. Set `JWT_SECRET` outside local dev.

## What it demonstrates
- JWT auth with PBKDF2-hashed passwords and role-based access (doctor vs admin)
- Audit log of every patient list, create and risk view (`GET /audit`, admin only)
- Gradient-boosted model with a per-patient explanation (feature occlusion against training medians)
- Input validation on all patient fields with Pydantic

## Next steps that would make it stronger
1. Swap the generated cohort for Synthea (FHIR) or the UCI Heart Disease dataset and re-report metrics
2. Add pytest tests for auth, RBAC and prediction; add Dockerfile + docker-compose with PostgreSQL
3. Replace the occlusion explanation with SHAP; add calibration and a threshold tuned for recall
4. Deploy (Render/Railway + Vercel) and add screenshots here

## Resume bullets (fill in your real numbers)
- Built a role-based clinical dashboard (FastAPI, React, SQLAlchemy) serving patient risk scores with per-patient explanations.
- Trained and evaluated a gradient-boosted classifier (AUC 0.73 on a held-out synthetic set) behind a REST inference API.
- Implemented JWT authentication, RBAC and audit logging to mirror healthcare data-access requirements.

## Doctor verification
Doctor accounts can't be created freely. Sign-up needs a registration ID from the doctor registry plus the matching
name, and each ID can be claimed by one account only. Admins manage the registry in the app. The seeded demo IDs are
`DOC-1001` (Asha Rao) to `DOC-1005`. A production version would check an official medical register instead.
