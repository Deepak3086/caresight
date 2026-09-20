"""Synthetic data, model training, prediction and per-patient explanations."""
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

FEATURES = ["age", "bmi", "glucose", "hba1c", "systolic_bp", "smoker", "family_history"]
MODEL_PATH = Path(__file__).with_name("model.joblib")
_bundle = None


def synthetic_patients(n=4000, seed=0):
    """Fully synthetic cardiometabolic cohort. No real patient data."""
    r = np.random.default_rng(seed)
    df = pd.DataFrame({
        "age": r.integers(21, 85, n),
        "bmi": r.normal(28, 5, n).clip(16, 50).round(1),
        "glucose": r.normal(105, 25, n).clip(60, 250).round(),
        "hba1c": r.normal(5.8, 0.9, n).clip(4, 12).round(1),
        "systolic_bp": r.normal(126, 16, n).clip(85, 210).round(),
        "smoker": r.binomial(1, 0.2, n),
        "family_history": r.binomial(1, 0.3, n),
    })
    z = (-10.9 + 0.03 * df.age + 0.06 * df.bmi + 0.02 * df.glucose + 0.45 * df.hba1c
         + 0.015 * df.systolic_bp + 0.5 * df.smoker + 0.6 * df.family_history
         + r.normal(0, 0.5, n))
    df["high_risk"] = (r.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    return df


def train():
    df = synthetic_patients()
    X_tr, X_te, y_tr, y_te = train_test_split(
        df[FEATURES], df.high_risk, test_size=0.2, stratify=df.high_risk, random_state=42)
    model = GradientBoostingClassifier(random_state=42).fit(X_tr, y_tr)
    proba = model.predict_proba(X_te)[:, 1]
    pred = proba >= 0.5
    metrics = {
        "auc": round(roc_auc_score(y_te, proba), 3),
        "precision": round(precision_score(y_te, pred), 3),
        "recall": round(recall_score(y_te, pred), 3),
        "positive_rate": round(float(df.high_risk.mean()), 3),
    }
    joblib.dump({"model": model, "medians": X_tr.median().to_dict(), "metrics": metrics}, MODEL_PATH)
    return metrics


def _load():
    global _bundle
    if _bundle is None:
        if not MODEL_PATH.exists():
            train()
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def predict(patient: dict):
    """Return risk score plus the factors pushing it up or down.

    Explanation = how much the score changes when one feature is replaced by the
    training median (a simple, model-agnostic occlusion method).
    """
    b = _load()
    row = pd.DataFrame([{f: patient[f] for f in FEATURES}])
    score = float(b["model"].predict_proba(row)[0, 1])
    factors = []
    for f in FEATURES:
        base = row.copy()
        base[f] = b["medians"][f]
        delta = score - float(b["model"].predict_proba(base)[0, 1])
        factors.append({"feature": f, "value": patient[f], "impact": round(delta, 3)})
    factors.sort(key=lambda x: abs(x["impact"]), reverse=True)
    level = "high" if score >= 0.6 else "moderate" if score >= 0.3 else "low"
    return {"score": round(score, 3), "level": level, "factors": factors[:4]}


def model_metrics():
    return _load()["metrics"]


if __name__ == "__main__":
    print(train())
