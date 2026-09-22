"""Diabetes screening model: training, evaluation, prediction and explanations.

Train once with `python -m app.ml` (needs data/diabetes_prediction_dataset.csv).
The trained model is saved to app/model.joblib and loaded by the API.
"""
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix,
                             precision_recall_curve, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, cross_validate, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

FEATURES = ["sex", "age", "bmi", "hba1c", "glucose", "hypertension", "heart_disease", "smoking"]
NUMERIC = ["age", "bmi", "hba1c", "glucose", "hypertension", "heart_disease"]
CATEGORICAL = ["sex", "smoking"]
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "diabetes_prediction_dataset.csv"
MODEL_PATH = Path(__file__).with_name("model.joblib")
_bundle = None


def load_dataset(path=DATA_PATH):
    df = pd.read_csv(path)
    df = df[df["gender"].isin(["Female", "Male"])].copy()
    df["sex"] = df["gender"].str.lower()
    df["smoking"] = df["smoking_history"].map(
        {"never": "never", "former": "former", "not current": "former", "current": "current"}).fillna("unknown")
    df = df.rename(columns={"HbA1c_level": "hba1c", "blood_glucose_level": "glucose"})
    return df[FEATURES + ["diabetes"]].drop_duplicates().reset_index(drop=True)


def _pipeline(estimator, spline=False):
    cat = ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL)
    if spline:  # smooth curves for each measurement, so scores don't jump between values seen in training
        parts = [cat, ("spl", SplineTransformer(n_knots=6, degree=3, extrapolation="constant"), ["age", "bmi", "hba1c", "glucose"]),
                 ("flags", "passthrough", ["hypertension", "heart_disease"])]
    else:
        parts = [cat, ("num", StandardScaler(), NUMERIC)]
    prep = ColumnTransformer(parts, verbose_feature_names_out=False)
    prep.set_output(transform="pandas")  # keep column names so the boosting model can use per-feature constraints
    return make_pipeline(prep, estimator)


def train(data_path=DATA_PATH, out=MODEL_PATH, force=None):
    df = load_dataset(data_path)
    X, y = df[FEATURES], df["diabetes"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

    candidates = {  # name: (estimator, use spline features)
        "Logistic regression": (LogisticRegression(max_iter=1000, class_weight="balanced"), False),
        "Smooth logistic": (LogisticRegression(max_iter=2000, class_weight="balanced"), True),
        "Random forest": (RandomForestClassifier(n_estimators=100, max_depth=12, min_samples_leaf=20,
                                                 class_weight="balanced_subsample", n_jobs=-1, random_state=42), False),
        # more risk factor never means less risk, and smaller, smoother trees than the defaults
        "Gradient boosting": (HistGradientBoostingClassifier(
            max_leaf_nodes=15, learning_rate=0.05, max_iter=200, min_samples_leaf=100, l2_regularization=1.0,
            monotonic_cst={f: 1 for f in NUMERIC}, random_state=42), False),
    }
    cv = StratifiedKFold(5, shuffle=True, random_state=42)
    compared = {}
    for name, (est, spl) in candidates.items():
        r = cross_validate(_pipeline(est, spl), X_tr, y_tr, cv=cv, scoring=["roc_auc", "average_precision"], n_jobs=1)
        compared[name] = {"roc_auc": round(float(r["test_roc_auc"].mean()), 4),
                          "avg_precision": round(float(r["test_average_precision"].mean()), 4)}
        print(f"  {name}: {compared[name]}")
    # prefer the smoothest model that is within 0.01 average precision of the best (or the one you force)
    top = max(m["avg_precision"] for m in compared.values())
    best = force or next(n for n in ("Smooth logistic", "Logistic regression", "Gradient boosting", "Random forest")
                         if compared[n]["avg_precision"] >= top - 0.01)
    print(f"Selected: {best}")

    # calibrate so a score of 30% means roughly 30% of similar records are positive
    def calibrated():
        return CalibratedClassifierCV(_pipeline(*candidates[best]), method="sigmoid", cv=3)

    # pick the alert threshold on out-of-fold predictions (recall-weighted F2), never on the test set
    oof = cross_val_predict(calibrated(), X_tr, y_tr, cv=3, method="predict_proba")[:, 1]
    prec, rec, thr = precision_recall_curve(y_tr, oof)
    f2 = 5 * prec[:-1] * rec[:-1] / np.maximum(4 * prec[:-1] + rec[:-1], 1e-9)
    threshold = float(thr[int(np.argmax(f2))])

    model = calibrated().fit(X_tr, y_tr)
    p_te = model.predict_proba(X_te)[:, 1]
    flag = p_te >= threshold
    tn, fp, fn, tp = confusion_matrix(y_te, flag).ravel()
    imp = permutation_importance(model, X_te.sample(min(5000, len(X_te)), random_state=0),
                                 y_te.loc[X_te.sample(min(5000, len(X_te)), random_state=0).index],
                                 scoring="roc_auc", n_repeats=5, random_state=0)
    card = {
        "dataset": {"name": "Kaggle: Diabetes prediction dataset", "rows": int(len(df)),
                    "positive_rate": round(float(y.mean()), 4)},
        "candidates": compared, "selected": best, "threshold": round(threshold, 3),
        "selection": "The smoothest model within 0.01 average precision of the best is used, so scores change gradually as values change.",
        "test": {"n_test": int(len(y_te)), "roc_auc": round(float(roc_auc_score(y_te, p_te)), 4),
                 "avg_precision": round(float(average_precision_score(y_te, p_te)), 4),
                 "precision": round(float(tp / max(tp + fp, 1)), 4), "recall": round(float(tp / max(tp + fn, 1)), 4),
                 "brier": round(float(brier_score_loss(y_te, p_te)), 4),
                 "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "importance": {f: round(max(float(v), 0.0), 4) for f, v in zip(FEATURES, imp.importances_mean)},
    }
    baseline = {**X_tr[NUMERIC].median().to_dict(), "sex": X_tr["sex"].mode()[0], "smoking": "never"}
    joblib.dump({"model": model, "threshold": threshold, "baseline": baseline, "card": card}, out, compress=3)
    print(f"Saved {out} ({Path(out).stat().st_size / 1e6:.1f} MB)")
    return card


def _load():
    global _bundle
    if _bundle is None:
        if not MODEL_PATH.exists():
            raise RuntimeError("Model not found. Run `python -m app.ml` in the backend folder first.")
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def predict(patient: dict):
    """Score plus the factors moving it. Each factor = change in score when that input is
    replaced by a typical value (median, or 'no' / 'never'). Sex is used by the model
    but never shown as a driver."""
    b = _load()
    row = pd.DataFrame([{f: patient[f] for f in FEATURES}])
    score = float(b["model"].predict_proba(row)[0, 1])
    factors = []
    for f in FEATURES:
        if f == "sex":
            continue
        alt = row.copy()
        alt[f] = b["baseline"][f]
        factors.append({"feature": f, "value": patient[f],
                        "impact": round(score - float(b["model"].predict_proba(alt)[0, 1]), 3)})
    factors.sort(key=lambda x: abs(x["impact"]), reverse=True)
    t = b["threshold"]
    level = "high" if score >= t else "moderate" if score >= t / 2 else "low"
    return {"score": round(score, 3), "level": level, "factors": factors[:4]}


def score_many(patients):
    """Score a list of patients in one model call (no explanations)."""
    b = _load()
    df = pd.DataFrame([{f: p[f] for f in FEATURES} for p in patients])
    t = b["threshold"]
    return [{"score": round(float(x), 3), "level": "high" if x >= t else "moderate" if x >= t / 2 else "low"}
            for x in b["model"].predict_proba(df)[:, 1]]


def model_metrics():
    return _load()["card"]


def demo_patients(n=25, seed=7):
    """Made-up patients for the demo roster."""
    r = np.random.default_rng(seed)
    return [{
        "sex": str(r.choice(["female", "male"])), "age": int(r.integers(25, 82)),
        "bmi": round(float(np.clip(r.normal(28, 5), 16, 50)), 1),
        "hba1c": round(float(np.clip(r.normal(5.8, 0.9), 4, 10)), 1),
        "glucose": float(round(np.clip(r.normal(130, 40), 70, 300))),
        "hypertension": int(r.random() < 0.2), "heart_disease": int(r.random() < 0.08),
        "smoking": str(r.choice(["never", "former", "current"], p=[0.6, 0.25, 0.15])),
    } for _ in range(n)]


if __name__ == "__main__":
    if not DATA_PATH.exists():
        sys.exit(f"Dataset not found at {DATA_PATH}\nDownload diabetes_prediction_dataset.csv from Kaggle first.")
    print("Training...")
    print(train(force="Smooth logistic" if "--smooth" in sys.argv else None))
