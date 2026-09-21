# CareSight: diabetes screening dashboard

A screening demo. Patients and verified doctors sign in, and each record gets a diabetes-likelihood score with the
inputs that moved it. **Not a diagnostic tool. Do not enter real health information.**

Live app: add your Vercel link here. API docs: add your Render link + `/docs`.

## Stack
FastAPI, SQLAlchemy (SQLite by default, PostgreSQL via `DATABASE_URL`), scikit-learn, PyJWT, React + Vite.

## The model
- **Data:** Kaggle "Diabetes prediction dataset" (`diabetes_prediction_dataset.csv`, about 100,000 records: sex, age, BMI,
  HbA1c, blood glucose, hypertension, heart disease, smoking). Check its license on Kaggle before republishing it.
- **Training (`backend/app/ml.py`):** duplicates removed, stratified 80/20 split, logistic regression vs random forest vs
  gradient boosting compared with 5-fold cross-validation on average precision (the classes are imbalanced),
  probabilities calibrated (isotonic), and the alert threshold picked on out-of-fold predictions with a recall-weighted F2.
- **Evaluation:** ROC AUC, average precision, precision/recall at the threshold, Brier score, confusion matrix and
  permutation importance, all shown in the app under "About the model".
- **Explanations:** per-patient change in score when one input is replaced by a typical value.
- **Limits:** the dataset's origin is undocumented; the label is current diabetes status, not future risk; HbA1c and glucose
  dominate because they define the diagnosis.

## Run it
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
# put diabetes_prediction_dataset.csv in backend/data/
python -m app.ml                                     # trains, prints metrics, writes app/model.joblib
uvicorn app.main:app --reload                        # http://localhost:8000/docs

cd ../frontend && npm install && npm run dev         # http://localhost:5173
```
Commit `backend/app/model.joblib` so the deployed API can load it without the dataset. Train inside the venv
created from `requirements.txt` so the scikit-learn version matches the server.

Demo logins: `doctor / doctor123`, `admin / admin123`. Patients can create an account; doctors need a registry ID
(demo: `DOC-1001`, name Asha Rao, up to `DOC-1005`).

## Security features
JWT auth with PBKDF2-hashed passwords, roles (patient, doctor, admin), doctor registry (one ID per account), audit log,
input validation.

## Resume bullets (fill in the numbers from your own training run)
- Built and deployed a full-stack diabetes screening app (React, FastAPI, scikit-learn) with role-based access and a verified-doctor registry.
- Compared logistic regression, random forest and gradient boosting on ~100k records with cross-validation; calibrated the best model and tuned the alert threshold for recall (ROC AUC X, recall Y).
- Added per-patient explanations, permutation importance and an in-app model card documenting metrics and limitations.
