# CareSight: diabetes screening dashboard

A screening demo. Patients and verified doctors sign in, and each record gets a diabetes-likelihood score with the
inputs that moved it. **Not a diagnostic tool. Do not enter real health information.**

**Live app:** https://caresight-sigma.vercel.app · **API docs:** https://caresight.onrender.com/docs

## Stack
FastAPI, SQLAlchemy (SQLite by default, PostgreSQL via `DATABASE_URL`), scikit-learn, PyJWT, React + Vite.

## The model
- **Data:** Kaggle "Diabetes prediction dataset" (`diabetes_prediction_dataset.csv`, 95,803 records after removing
  duplicates: sex, age, BMI, HbA1c, blood glucose, hypertension, heart disease, smoking; 8.8% positive for diabetes).
  Check its license on Kaggle before republishing it.
- **Training (`backend/app/ml.py`):** stratified 80/20 split. Four models are compared with 5-fold cross-validation
  on average precision (the classes are imbalanced): logistic regression, a smooth logistic model (spline
  features), random forest and a constrained gradient-boosting model. The smoothest model within 0.01 average
  precision of the best is used, because tree models can only change at values seen in the training data, which
  makes scores jump in steps; gradient boosting won this run (0.885 vs random forest's 0.883, logistic regression's
  0.821). Probabilities are calibrated with a sigmoid (isotonic calibration produced hard 0% and 100% scores), and
  the alert threshold is picked on out-of-fold predictions with a recall-weighted F2.
- **Evaluation (19,161 held-out records):** ROC AUC 0.9776, average precision 0.8787, recall 85.7%, precision
  61.1%, Brier score 0.0247, alert threshold 15.4%. Confusion matrix: 16,540 correctly cleared, 925 false alarms,
  242 missed cases, 1,454 cases caught. Full comparison table, confusion matrix and permutation importance are
  shown in the app under "About the model".
- **Explanations:** Shapley-style per-patient explanations. Each input's contribution is its average effect on the
  score across many random orders of revealing the patient's real values starting from a typical patient. This
  replaced swap-one-input-at-a-time, which under-credited overlapping signals (e.g. it could show glucose as
  contributing 0 points when HbA1c alone already explained a maxed-out score).
- **Limits:** the dataset's origin is undocumented; the label is current diabetes status, not future risk; HbA1c and
  glucose dominate because they define the diagnosis; gradient boosting was selected this run, so scores can still
  jump in steps between glucose values not seen in training.

## Run it
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
# put diabetes_prediction_dataset.csv in backend/data/
python -m app.ml --smooth                            # trains, prints metrics, writes app/model.joblib
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

## Design decisions
- **Calibration:** isotonic calibration produced hard 0% and 100% scores once HbA1c or glucose alone nearly
  determined the label, which also made per-patient explanations misleading (a maxed-out score can't move, so
  every input looked like it contributed nothing). Switched to sigmoid calibration, which stays smooth at the
  extremes.
- **Model selection:** picks the smoothest model within 0.01 average precision of the best cross-validated model,
  not just the single best score. A gradient-boosted tree can only split between values seen in training, so with
  a small set of distinct glucose readings in the data, its score could jump in steps between two adjacent
  patients (e.g. glucose 112 vs 113). A smoother candidate (spline-featured logistic regression) is preferred when
  the accuracy trade-off is small enough not to matter; on the current training run gradient boosting was far
  enough ahead (0.885 vs 0.821 average precision) that it was selected anyway.
- **Monotonic constraints:** the boosted model is constrained so that increasing any risk factor (age, BMI, HbA1c,
  glucose) never lowers the predicted risk, which a plain tree model doesn't guarantee on its own and which matters
  for a screening tool's outputs to make clinical sense.
- **Explanations:** replaced "swap one feature back to typical, see how much the score drops" with Shapley-value
  sampling (average the effect of revealing each input, across many random orders). The simpler method
  under-credited overlapping risk factors — when HbA1c alone was enough to explain a maxed-out score, glucose could
  show 0.0 points of impact even though it's also diabetic-range, which reads as "glucose doesn't matter" to a
  clinician when it does.
- **Doctor sign-up:** rather than an open sign-up for medical accounts, doctors must supply a registration ID that
  matches an entry in a maintained registry, and each ID can only be claimed once (guarded against a race between
  two simultaneous sign-ups). This is a stand-in for checking a real medical register, which a production version
  would need to call instead.
- **Batch scoring:** the patient list and overview pages score every patient in one model call rather than one
  request per patient, so the dashboard loads quickly even as the roster grows.

## Resume bullets
- Built and deployed a full-stack diabetes screening app (React, FastAPI, scikit-learn) with role-based access, a
  verified-doctor registry, and a live what-if simulator.
- Compared logistic regression, a spline-featured logistic model, random forest and constrained gradient boosting
  on ~96k records with 5-fold cross-validation; calibrated the selected model and tuned the alert threshold for
  recall (ROC AUC 0.978, recall 85.7%).
- Replaced a naive per-patient explanation method with Shapley-value sampling after finding it under-credited
  overlapping risk factors; added permutation importance and an in-app model card documenting metrics and limits.
