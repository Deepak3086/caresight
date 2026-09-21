import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://caresight.onrender.com";
const LABELS = {
  sex: "Sex", age: "Age", bmi: "BMI", hba1c: "HbA1c", glucose: "Blood glucose",
  hypertension: "Hypertension", heart_disease: "Heart disease", smoking: "Smoking",
};
const yesNo = (v) => (v ? "Yes" : "No");
const show = (f, v) =>
  ["hypertension", "heart_disease"].includes(f) ? yesNo(v) : typeof v === "string" ? v[0].toUpperCase() + v.slice(1) : v;
const ARC = Math.PI * 50;

function Gauge({ score, level }) {
  const pct = Math.round(score * 100);
  return (
    <svg className={`gauge ${level}`} viewBox="0 0 120 70" role="img" aria-label={`Risk score ${pct} percent, ${level}`}>
      <path className="arc-track" d="M10 60 A50 50 0 0 1 110 60" />
      <path className="arc-fill" d="M10 60 A50 50 0 0 1 110 60"
        style={{ strokeDasharray: ARC, strokeDashoffset: ARC * (1 - score) }} />
      <text x="60" y="57" textAnchor="middle" className="pct">{pct}%</text>
    </svg>
  );
}

function Factors({ factors }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.impact)), 0.01);
  return (
    <ul className="factors">
      {factors.map((f) => {
        const up = f.impact > 0;
        const width = (Math.abs(f.impact) / max) * 50;
        return (
          <li key={f.feature}>
            <span className="fname">{LABELS[f.feature]}: <b>{show(f.feature, f.value)}</b></span>
            <span className="axis" aria-hidden="true">
              <i className={up ? "up" : "down"} style={{ width: `${width}%`, [up ? "left" : "right"]: "50%" }} />
            </span>
            <span className={`fval ${up ? "up" : "down"}`}>{up ? "+" : ""}{(f.impact * 100).toFixed(1)} pts</span>
          </li>
        );
      })}
    </ul>
  );
}

function errText(d) {
  if (Array.isArray(d)) return d.map((e) => `${e.loc?.slice(-1)[0] ?? ""}: ${e.msg}`).join("; ");
  return d || "Request failed";
}

const Num = ({ name, label, min, max }) => (
  <label>{label}<input name={name} type="number" step="any" min={min} max={max} required /></label>
);

function Detail({ selected, risk, error }) {
  return (
    <main className="detail">
      {error && <p className="error" role="alert">{error}</p>}
      {!selected && <p className="empty">Select a patient to see their risk score and what drives it.</p>}
      {selected && (
        <>
          <h2>{selected.name}</h2>
          <p className="muted">{selected.age} years old, {selected.sex}</p>
          <dl className="vitals">
            {[["BMI", selected.bmi, ""], ["Blood glucose", selected.glucose, "mg/dL"], ["HbA1c", selected.hba1c, "%"],
              ["Hypertension", yesNo(selected.hypertension), ""], ["Heart disease", yesNo(selected.heart_disease), ""],
              ["Smoking", show("smoking", selected.smoking), ""]].map(([k, v, u]) => (
              <div key={k}><dt>{k}</dt><dd>{v} <small>{u}</small></dd></div>
            ))}
          </dl>
          {!risk && !error && <p className="muted">Scoring {selected.name}...</p>}
          {risk && (
            <>
              <section className="verdict">
                <Gauge score={risk.score} level={risk.level} />
                <div>
                  <p className={`level ${risk.level}`}>{risk.level[0].toUpperCase() + risk.level.slice(1)} risk</p>
                  <p className="muted">How closely this record resembles diabetes cases in the training data, from age, sex, BMI, blood glucose, HbA1c, hypertension, heart disease and smoking.</p>
                </div>
              </section>
              <h3>What moved this score</h3>
              <p className="muted">Bars to the right raise the score, bars to the left lower it.</p>
              <Factors factors={risk.factors} />
              <p className="note">{risk.disclaimer}</p>
            </>
          )}
        </>
      )}
    </main>
  );
}

function Admin({ data, onAdd, error }) {
  const licenses = data?.licenses ?? [];
  const audit = data?.audit ?? [];
  return (
    <main className="detail">
      <h2>Doctor registry</h2>
      <p className="muted">A doctor can only create an account with an unused ID and the matching name.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="inline" onSubmit={onAdd}>
        <label>Registration ID<input name="license_id" required minLength={4} maxLength={30} /></label>
        <label>Doctor's full name<input name="full_name" required maxLength={80} /></label>
        <button className="primary">Add to registry</button>
      </form>
      <ul className="registry">
        {licenses.map((l) => (
          <li key={l.license_id}>
            <b>{l.license_id}</b><span>{l.full_name}</span>
            <span className={`chip ${l.claimed ? "moderate" : "low"}`}>{l.claimed ? "In use" : "Available"}</span>
          </li>
        ))}
      </ul>
      <h3>Recent activity</h3>
      <ul className="activity">
        {audit.slice(0, 15).map((a, i) => (
          <li key={i}>
            <span>{a.action.replaceAll("_", " ")}{a.patient_id ? ` (patient ${a.patient_id})` : ""}</span>
            <span className="muted">user {a.user_id}, {String(a.at).slice(0, 16).replace("T", " ")} UTC</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function ModelCard({ card }) {
  const t = card.test;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const drivers = Object.entries(card.importance).sort((a, b) => b[1] - a[1]);
  const top = Math.max(...drivers.map(([, v]) => v), 0.0001);
  return (
    <main className="detail mc">
      <h2>About the model</h2>
      <p className="muted">
        Trained on the public Kaggle "Diabetes prediction dataset": {card.dataset.rows.toLocaleString()} records after
        removing duplicates, {pct(card.dataset.positive_rate)} of them with diabetes.
      </p>
      <h3>Models compared (5-fold cross-validation)</h3>
      <table>
        <thead><tr><th>Model</th><th>ROC AUC</th><th>Average precision</th></tr></thead>
        <tbody>
          {Object.entries(card.candidates).map(([name, m]) => (
            <tr key={name} className={name === card.selected ? "sel" : ""}>
              <td>{name}{name === card.selected ? " (selected)" : ""}</td><td>{m.roc_auc}</td><td>{m.avg_precision}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Held-out test results ({t.n_test.toLocaleString()} records)</h3>
      <dl className="vitals">
        {[["ROC AUC", t.roc_auc], ["Average precision", t.avg_precision], ["Recall", pct(t.recall)],
          ["Precision", pct(t.precision)], ["Brier score (lower is better)", t.brier], ["Alert threshold", pct(card.threshold)]]
          .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="cm">
        <div>Correctly cleared<b>{t.tn.toLocaleString()}</b></div>
        <div>False alarms<b>{t.fp.toLocaleString()}</b></div>
        <div>Missed cases<b>{t.fn.toLocaleString()}</b></div>
        <div>Cases caught<b>{t.tp.toLocaleString()}</b></div>
      </div>
      <h3>What the model relies on</h3>
      <p className="muted">Drop in ROC AUC when each input is shuffled on the test set.</p>
      <ul className="factors">
        {drivers.map(([f, v]) => (
          <li key={f}>
            <span className="fname">{LABELS[f]}</span>
            <span className="axis plain" aria-hidden="true"><i className="brand" style={{ width: `${(v / top) * 100}%` }} /></span>
            <span className="fval">{v.toFixed(3)}</span>
          </li>
        ))}
      </ul>
      <h3>Limits</h3>
      <ul className="limits">
        <li>The dataset's origin isn't documented, so this is not clinical validation.</li>
        <li>It estimates whether a record looks like a current diabetes case. It does not forecast who will develop diabetes.</li>
        <li>HbA1c and glucose dominate because they are used to diagnose diabetes, so strong scores are expected.</li>
        <li>Blood pressure, family history and other known risk factors are not in the data.</li>
        <li>Screening demo only. Not for medical decisions.</li>
      </ul>
    </main>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [risk, setRisk] = useState(null);
  const [scores, setScores] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("signin");
  const [role, setRole] = useState("patient");
  const [admin, setAdmin] = useState(null);
  const [view, setView] = useState("app");
  const [card, setCard] = useState(null);

  const signOut = (msg = "") => {
    setAuth(null); setPatients([]); setSelected(null); setRisk(null);
    setScores({}); setQuery(""); setAdmin(null); setView("app"); setError(msg);
  };
  const fail = (err) => { if (err.message !== "expired") setError(err.message); };

  const call = async (path, opts = {}, token = auth?.token) => {
    const res = await fetch(API + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (res.status === 401 && token) {
      signOut("Your session expired. Sign in again.");
      throw new Error("expired");
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(errText(d.detail));
    }
    return res.json();
  };

  const enter = async (a) => {
    setAuth(a);
    if (a.role === "patient") {
      setSelected(await call("/me/patient", {}, a.token));
      setRisk(await call("/me/risk", {}, a.token));
    } else if (a.role === "admin") {
      setAdmin({ licenses: await call("/admin/licenses", {}, a.token), audit: await call("/audit", {}, a.token) });
    } else {
      setPatients(await call("/patients", {}, a.token));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError("");
    try {
      let a;
      if (mode === "signin") {
        a = await call("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
        }, null);
      } else {
        const body = { username: f.get("username"), password: f.get("password"), role };
        if (role === "patient") {
          body.name = f.get("name");
          body.profile = {
            sex: f.get("sex"), age: +f.get("age"), bmi: +f.get("bmi"), glucose: +f.get("glucose"),
            hba1c: +f.get("hba1c"), smoking: f.get("smoking"),
            hypertension: f.get("hypertension") ? 1 : 0, heart_disease: f.get("heart_disease") ? 1 : 0,
          };
        } else {
          body.name = f.get("name");
          body.license_id = f.get("license_id");
        }
        a = await call("/auth/register", { method: "POST", body: JSON.stringify(body) }, null);
      }
      await enter(a);
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };

  const addLicense = async (e) => {
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    setError("");
    try {
      await call("/admin/licenses", {
        method: "POST",
        body: JSON.stringify({ license_id: f.get("license_id"), full_name: f.get("full_name") }),
      });
      setAdmin({ ...admin, licenses: await call("/admin/licenses") });
      form.reset();
    } catch (err) { fail(err); }
  };

  const toggleModel = async () => {
    if (view === "model") return setView("app");
    setError("");
    try {
      if (!card) setCard(await call("/model"));
      setView("model");
    } catch (err) { fail(err); }
  };

  const assess = async (p) => {
    setSelected(p); setRisk(null); setError("");
    try {
      const r = await call(`/patients/${p.id}/risk`);
      setRisk(r);
      setScores((s) => ({ ...s, [p.id]: { score: r.score, level: r.level } }));
    } catch (err) { fail(err); }
  };

  if (!auth) {
    return (
      <div className="login-page">
        <aside>
          <div className="brand"><Pulse /> CareSight</div>
          <h1>Risk scores that show their working.</h1>
          <p>Review a patient, see their estimated cardiometabolic risk, and see which measurements pushed it up or down.</p>
        </aside>
        <main>
          <form key={mode} onSubmit={submit}>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""}
                onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""}
                onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
            </div>
            {mode === "signin" ? (
              <>
                <p className="muted">The demo login is filled in. All patient data is synthetic.</p>
                <label>Username<input name="username" defaultValue="doctor" autoComplete="username" required /></label>
                <label>Password<input name="password" type="password" defaultValue="doctor123" autoComplete="current-password" required /></label>
              </>
            ) : (
              <>
                <div className="roles" role="radiogroup" aria-label="Account type">
                  {[["patient", "I'm a patient"], ["doctor", "I'm a doctor"]].map(([r, text]) => (
                    <label key={r} className={role === r ? "on" : ""}>
                      <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />{text}
                    </label>
                  ))}
                </div>
                <p className="muted">This is a demo. Please don't enter real health information.</p>
                <label>Username<input name="username" minLength={3} maxLength={30} autoComplete="username" required /></label>
                <label>Password (8 characters or more)<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
                {role === "patient" && (
                  <>
                    <label>Full name<input name="name" maxLength={80} required /></label>
                    <div className="grid2">
                      <Num name="age" label="Age" min={0} max={120} />
                      <Num name="bmi" label="BMI" min={10} max={80} />
                      <Num name="glucose" label="Blood glucose (mg/dL)" min={30} max={600} />
                      <Num name="hba1c" label="HbA1c (%)" min={3} max={18} />
                      <label>Sex<select name="sex" defaultValue="female"><option value="female">Female</option><option value="male">Male</option></select></label>
                      <label>Smoking<select name="smoking" defaultValue="never"><option value="never">Never smoked</option><option value="former">Former smoker</option><option value="current">Current smoker</option></select></label>
                    </div>
                    <label className="check"><input type="checkbox" name="hypertension" /> I have high blood pressure (hypertension)</label>
                    <label className="check"><input type="checkbox" name="heart_disease" /> I have heart disease</label>
                  </>
                )}
                {role === "doctor" && (
                  <>
                    <label>Full name (as on your registration)<input name="name" maxLength={80} required /></label>
                    <label>Medical registration ID<input name="license_id" maxLength={30} required /></label>
                    <p className="muted">Demo: use ID DOC-1001 with the name Dr. Asha Rao. Real sign-ups would be checked against an official medical register.</p>
                  </>
                )}
              </>
            )}
            <button className="primary" disabled={busy}>
              {busy ? (mode === "signin" ? "Signing in..." : "Creating account...") : (mode === "signin" ? "Sign in" : "Create account")}
            </button>
            {busy && <p className="muted">The demo server sleeps when idle, so this can take up to a minute.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </form>
        </main>
      </div>
    );
  }

  const list = patients.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={`app ${auth.role !== "doctor" ? "solo" : ""}`}>
      <header>
        <div className="brand"><Pulse /> CareSight</div>
        <div className="who-am-i">
          <span>{auth.username} <small>({auth.role})</small></span>
          <button className="ghost" onClick={toggleModel}>{view === "model" ? "Back" : "About the model"}</button>
          <button className="ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      {auth.role === "doctor" && (
      <nav className="roster" aria-label="Patients">
        <input type="search" placeholder="Search patients" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Search patients" />
        <ul>
          {list.map((p) => {
            const s = scores[p.id];
            return (
              <li key={p.id}>
                <button className={`row ${selected?.id === p.id ? "on" : ""}`} onClick={() => assess(p)}
                  aria-current={selected?.id === p.id}>
                  <span className="who"><b>{p.name}</b><small>{p.age} years, BMI {p.bmi}</small></span>
                  <span className={`chip ${s ? s.level : "none"}`}>{s ? `${Math.round(s.score * 100)}%` : "Not assessed"}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="muted pad">No patients match "{query}".</li>}
        </ul>
      </nav>
      )}

      {view === "model" ? <ModelCard card={card} />
        : auth.role === "admin" ? <Admin data={admin} onAdd={addLicense} error={error} />
        : <Detail selected={selected} risk={risk} error={error} />}
    </div>
  );
}

function Pulse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6 4 12 2.5-6H22" />
    </svg>
  );
}
