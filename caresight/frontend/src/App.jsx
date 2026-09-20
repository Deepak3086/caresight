import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://caresight.onrender.com";
const LABELS = {
  age: "Age", bmi: "BMI", glucose: "Fasting glucose", hba1c: "HbA1c",
  systolic_bp: "Systolic BP", smoker: "Smoker", family_history: "Family history",
};
const yesNo = (v) => (v ? "Yes" : "No");
const show = (f, v) => (f === "smoker" || f === "family_history" ? yesNo(v) : v);
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

export default function App() {
  const [auth, setAuth] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [risk, setRisk] = useState(null);
  const [scores, setScores] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = (msg = "") => {
    setAuth(null); setPatients([]); setSelected(null); setRisk(null);
    setScores({}); setQuery(""); setError(msg);
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
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Request failed");
    return res.json();
  };

  const login = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError("");
    try {
      const a = await call("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
      }, null);
      setAuth(a);
      setPatients(await call("/patients", {}, a.token));
    } catch (err) { fail(err); }
    finally { setBusy(false); }
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
          <form onSubmit={login}>
            <h2>Sign in</h2>
            <p className="muted">The demo login is filled in. All patient data is synthetic.</p>
            <label>Username<input name="username" defaultValue="doctor" autoComplete="username" /></label>
            <label>Password<input name="password" type="password" defaultValue="doctor123" autoComplete="current-password" /></label>
            <button className="primary" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
            {busy && <p className="muted">The demo server sleeps when idle, so the first sign-in can take up to a minute.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </form>
        </main>
      </div>
    );
  }

  const list = patients.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="app">
      <header>
        <div className="brand"><Pulse /> CareSight</div>
        <div className="who-am-i">
          <span>{auth.username} <small>({auth.role})</small></span>
          <button className="ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

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

      <main className="detail">
        {error && <p className="error" role="alert">{error}</p>}
        {!selected && <p className="empty">Select a patient to see their risk score and what drives it.</p>}
        {selected && (
          <>
            <h2>{selected.name}</h2>
            <p className="muted">{selected.age} years old</p>
            <dl className="vitals">
              {[["BMI", selected.bmi, ""], ["Fasting glucose", selected.glucose, "mg/dL"], ["HbA1c", selected.hba1c, "%"],
                ["Systolic BP", selected.systolic_bp, "mmHg"], ["Smoker", yesNo(selected.smoker), ""],
                ["Family history", yesNo(selected.family_history), ""]].map(([k, v, u]) => (
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
                    <p className="muted">Estimated from age, BMI, glucose, HbA1c, blood pressure, smoking and family history.</p>
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
