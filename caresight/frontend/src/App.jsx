import { useEffect, useRef, useState } from "react";

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
      <text x="60" y="57" textAnchor="middle" className="pct">{score < 0.01 || score > 0.99 ? pctText(score) : <><CountUp value={pct} />%</>}</text>
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

function useCountUp(target, decimals, ms = 700) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { cur.current = target; setV(target); return; }
    const from = cur.current;
    let raf, t0;
    const step = (t) => {
      t0 ??= t;
      const k = Math.min((t - t0) / ms, 1);
      cur.current = from + (target - from) * (1 - Math.pow(1 - k, 3));
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v.toFixed(decimals);
}
function CountUp({ value, decimals = 0 }) { return useCountUp(value, decimals); }

const RANK = { ok: 0, warn: 1, bad: 2 };
const zone = (v, [a, b]) => (v < a ? "ok" : v < b ? "warn" : "bad");
const worst = (...z) => z.reduce((m, x) => (RANK[x] > RANK[m] ? x : m), "ok");

function Ecg() {
  return (
    <svg className="ecg" viewBox="0 0 120 32" aria-hidden="true">
      <path pathLength="100" d="M0 16h28l5-10 7 22 6-18 5 6h69" />
    </svg>
  );
}

function BodyPanel({ p }) {
  const [active, setActive] = useState("glucose");
  const spots = [
    { id: "heart", x: 112, y: 108, label: "Heart and blood pressure",
      text: `Hypertension: ${yesNo(p.hypertension)}. Heart disease: ${yesNo(p.heart_disease)}.`,
      z: p.hypertension || p.heart_disease ? "bad" : "ok" },
    { id: "glucose", x: 100, y: 152, label: "Blood sugar",
      text: `HbA1c ${p.hba1c}%, glucose ${p.glucose} mg/dL.`,
      z: worst(zone(p.hba1c, RANGES.hba1c.cuts), zone(p.glucose, RANGES.glucose.cuts)) },
    { id: "bmi", x: 100, y: 198, label: "Body weight", text: `BMI ${p.bmi} kg/m².`, z: zone(p.bmi, RANGES.bmi.cuts) },
  ];
  const on = spots.find((x) => x.id === active);
  return (
    <aside className="bodypanel" style={{ "--i": 1 }}>
      <svg viewBox="0 0 200 420" role="group" aria-label="Body diagram. Select a marker for details.">
        <defs>
          <linearGradient id="skin" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="170" y2="0">
            <stop offset="0" stopColor="#d3dbe8" /><stop offset=".5" stopColor="#f8fafd" /><stop offset="1" stopColor="#c9d3e3" />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="406" rx="62" ry="8" fill="rgba(40,60,110,.12)" />
        <g fill="url(#skin)">
          <ellipse cx="100" cy="34" rx="19" ry="24" />
          <rect x="91" y="54" width="18" height="18" rx="7" />
          <path d="M56 86 Q56 72 76 70 L124 70 Q144 72 144 86 L138 152 Q136 182 130 206 L70 206 Q64 182 62 152 Z" />
        </g>
        <g fill="none" stroke="url(#skin)" strokeLinecap="round">
          <path d="M56 90 Q38 120 34 174" strokeWidth="17" /><path d="M144 90 Q162 120 166 174" strokeWidth="17" />
          <path d="M84 208 L78 300 L76 390" strokeWidth="28" /><path d="M116 208 L122 300 L124 390" strokeWidth="28" />
        </g>
        {spots.map((x) => (
          <g key={x.id} className={`spot ${x.z} ${active === x.id ? "on" : ""}`} role="button" tabIndex={0} aria-label={x.label}
            onClick={() => setActive(x.id)} onMouseEnter={() => setActive(x.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(x.id)}>
            <circle className="hit" cx={x.x} cy={x.y} r="15" />
            <circle className="ring" cx={x.x} cy={x.y} r="7" />
            <circle className="dot" cx={x.x} cy={x.y} r="6" />
          </g>
        ))}
      </svg>
      <div className={`spotcard ${on.z}`} key={on.id}>
        <b>{on.label}</b><span>{on.text}</span><Ecg />
      </div>
    </aside>
  );
}

const RANGES = {
  hba1c: { label: "HbA1c", unit: "%", min: 4, max: 10, cuts: [5.7, 6.5] },
  glucose: { label: "Blood glucose", unit: "mg/dL", min: 60, max: 300, cuts: [140, 200] },
  bmi: { label: "BMI", unit: "kg/m²", min: 15, max: 45, cuts: [25, 30] },
};

function Range({ value, min, max, cuts }) {
  const at = (v) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const [x, y] = cuts.map(at);
  return (
    <div className="strip" aria-hidden="true">
      <i style={{ width: `${x}%` }} /><i style={{ width: `${y - x}%` }} /><i style={{ width: `${100 - y}%` }} />
      <b style={{ left: `${at(value)}%` }} />
    </div>
  );
}

const pickProfile = (p) => ({
  sex: p.sex, age: p.age, bmi: p.bmi, hba1c: p.hba1c, glucose: p.glucose,
  hypertension: p.hypertension, heart_disease: p.heart_disease, smoking: p.smoking,
});

function WhatIf({ base, sim, delta, onChange, onReset, style }) {
  const v = sim ?? base;
  const sliders = [["hba1c", "HbA1c", "%", 4, 10, 0.1], ["glucose", "Blood glucose", "mg/dL", 60, 300, 1], ["bmi", "BMI", "kg/m²", 15, 45, 0.1]];
  return (
    <section className="card whatif" style={style}>
      <div className="whatif-head">
        <div>
          <h3>What if?</h3>
          <p className="muted">Move the sliders to see how the score would change. The saved record is never changed.</p>
        </div>
        {sim && <button className="ghost" onClick={onReset}>Reset</button>}
      </div>
      {delta !== null && (
        <p className={`delta ${delta < 0 ? "down" : delta > 0 ? "up" : ""}`} aria-live="polite">
          {delta === 0 ? "Same as now" : `${Math.abs(delta)} points ${delta < 0 ? "lower" : "higher"} than now`}
        </p>
      )}
      <div className="sliders">
        {sliders.map(([k, label, unit, min, max, step]) => (
          <label key={k}>
            <span>{label} <output>{Number(v[k]).toFixed(step < 1 ? 1 : 0)} {unit}</output></span>
            <input type="range" min={min} max={max} step={step} value={v[k]} onChange={(e) => onChange(k, +e.target.value)} />
          </label>
        ))}
      </div>
      <div className="toggles">
        {[["hypertension", "Hypertension"], ["heart_disease", "Heart disease"]].map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!!v[k]} onChange={(e) => onChange(k, e.target.checked ? 1 : 0)} /> {label}
          </label>
        ))}
        <label>Smoking
          <select value={v.smoking} onChange={(e) => onChange("smoking", e.target.value)}>
            <option value="never">Never smoked</option><option value="former">Former smoker</option><option value="current">Current smoker</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function Detail({ selected, risk, error, mode, onWhatIf, whatIfHref, resultsHref, backHref, backLabel }) {
  const [sim, setSim] = useState(null);
  const [simRisk, setSimRisk] = useState(null);
  useEffect(() => {
    if (!sim) return;
    let live = true;
    const t = setTimeout(async () => {
      try { const r = await onWhatIf(sim); if (live) setSimRisk(r); } catch { /* keep the last result */ }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [sim]);

  const view = selected && sim ? { ...selected, ...sim } : selected;
  const shown = sim && simRisk ? simRisk : risk;
  const delta = sim && simRisk && risk ? Math.round((simRisk.score - risk.score) * 100) : null;
  const change = (k, val) => setSim((prev) => ({ ...(prev ?? pickProfile(selected)), [k]: val }));
  const reset = () => { setSim(null); setSimRisk(null); };

  return (
    <div className="detail">
      {error && <p className="error" role="alert">{error}</p>}
      {!selected && <p className="empty">Select a patient from the list to see their screening result and what drives it.</p>}
      {selected && (
        <>
          {backLabel && <a className="back" href={backHref}>{backLabel}</a>}
          <h2>{selected.name}</h2>
          <p className="muted">{selected.age} years old, {selected.sex}</p>
          <div className="workspace">
            <div className="center">
              {mode === "whatif" && risk && <WhatIf base={pickProfile(selected)} sim={sim} delta={delta} onChange={change} onReset={reset} style={{ "--i": 0 }} />}
              <section className="tiles">
                {Object.entries(RANGES).map(([k, r], i) => (
                  <div className="tile" key={k} style={{ "--i": i + 1 }}>
                    <div><b>{r.label}</b><small>{r.unit}</small></div>
                    <span className="val"><CountUp value={view[k]} decimals={k === "glucose" ? 0 : 1} /></span>
                    <div className="inset"><Range value={view[k]} {...r} /></div>
                  </div>
                ))}
              </section>
              <section className="facts">
                {[["Hypertension", yesNo(view.hypertension)], ["Heart disease", yesNo(view.heart_disease)],
                  ["Smoking", show("smoking", view.smoking)]].map(([k, v], i) => (
                  <div key={k} style={{ "--i": i + 4 }}><small>{k}</small><b>{v}</b></div>
                ))}
              </section>
              {shown ? (
                <section className="cards">
                  <div className="card verdict" style={{ "--i": 5 }}>
                    <h3>Screening result{sim && <span className="tag">Simulated</span>}</h3>
                    <Gauge score={shown.score} level={shown.level} />
                    <p className={`level ${shown.level}`}>{shown.level[0].toUpperCase() + shown.level.slice(1)} risk</p>
                    <p className="muted">How closely this record resembles diabetes cases in the training data.</p>
                  </div>
                  <div className="card" style={{ "--i": 6 }}>
                    <h3>What moved this score</h3>
                    <p className="muted">Bars to the right raise the score, bars to the left lower it.</p>
                    <Factors factors={shown.factors} />
                  </div>
                </section>
              ) : !error && (
                <section className="cards" aria-busy="true" aria-label="Scoring">
                  <div className="card skel" /><div className="card skel" />
                </section>
              )}
              <section className="cta" style={{ "--i": 8 }}>
                {mode === "whatif" ? (
                  <><div><h3>Back to the saved result</h3><p>See the full record and its explanation.</p></div><a href={resultsHref}>View result</a></>
                ) : (
                  <><div><h3>Try the what-if simulator</h3><p>See how the score changes if HbA1c, glucose or BMI improve.</p></div><a href={whatIfHref}>Open simulator</a></>
                )}
              </section>
              {risk && <p className="note">{risk.disclaimer}</p>}
            </div>
            <BodyPanel p={view} />
          </div>
        </>
      )}
    </div>
  );
}

const cap = (t) => t[0].toUpperCase() + t.slice(1);
const pctText = (x) => (x < 0.01 ? "<1%" : x > 0.99 ? ">99%" : `${Math.round(x * 100)}%`);
const go = (to) => { window.location.hash = to; };

function useRoute() {
  const read = () => window.location.hash.replace(/^#/, "") || "/";
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

function Overview({ patients }) {
  const n = (l) => patients.filter((p) => p.level === l).length;
  const total = patients.length || 1;
  const top = [...patients].sort((a, b) => b.score - a.score).slice(0, 5);
  const kpis = [["Patients", patients.length, "", "all"], ["High risk", n("high"), "high", "high"],
    ["Moderate", n("moderate"), "moderate", "moderate"], ["Low", n("low"), "low", "low"]];
  return (
    <div className="detail">
      <section className="tiles kpis">
        {kpis.map(([label, count, cls, f], i) => (
          <a className={`tile kpi ${cls}`} key={label} style={{ "--i": i }} href={f === "all" ? "#/patients" : `#/patients?risk=${f}`}>
            <div><b>{label}</b><small>{Math.round((count / total) * 100)}% of patients</small></div>
            <span className="val"><CountUp value={count} /></span>
            <div className="inset"><div className="share"><i style={{ width: `${(count / total) * 100}%` }} /></div></div>
          </a>
        ))}
      </section>
      <section className="cards two">
        <div className="card" style={{ "--i": 4 }}>
          <h3>Risk mix</h3>
          <p className="muted">How the current patient list splits across screening levels.</p>
          <div className="mix" role="img" aria-label={`${n("high")} high, ${n("moderate")} moderate, ${n("low")} low`}>
            {["high", "moderate", "low"].map((l) => <i key={l} className={l} style={{ width: `${(n(l) / total) * 100}%` }} />)}
          </div>
          <p className="legend"><span className="high">High {n("high")}</span><span className="moderate">Moderate {n("moderate")}</span><span className="low">Low {n("low")}</span></p>
        </div>
        <div className="card" style={{ "--i": 5 }}>
          <h3>Needs attention</h3>
          <p className="muted">Highest screening scores first.</p>
          <ul className="attention">
            {top.map((p) => (
              <li key={p.id}>
                <a href={`#/patients/${p.id}`}><span className="who"><b>{p.name}</b><small>{p.age} years, HbA1c {p.hba1c}%</small></span>
                  <span className={`chip ${p.level}`}>{pctText(p.score)}</span></a>
              </li>
            ))}
            {top.length === 0 && <li className="muted">No patients yet.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

function PatientsPage({ patients, filter }) {
  const [q, setQ] = useState("");
  const rows = patients.filter((p) => (filter === "all" || p.level === filter) && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.score - a.score);
  return (
    <div className="detail">
      <div className="toolbar">
        <input type="search" placeholder="Search patients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
        <div className="segs" role="group" aria-label="Filter by risk">
          {["all", "high", "moderate", "low"].map((f) => (
            <a key={f} href={f === "all" ? "#/patients" : `#/patients?risk=${f}`} className={filter === f ? "on" : ""}>{cap(f)}</a>
          ))}
        </div>
      </div>
      <div className="panel table-wrap">
        <table className="plist">
          <thead><tr><th>Patient</th><th>Age</th><th>Sex</th><th>HbA1c</th><th>Glucose</th><th>BMI</th><th>Screening</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => go(`/patients/${p.id}`)}>
                <td><a href={`#/patients/${p.id}`}>{p.name}</a></td><td>{p.age}</td><td>{cap(p.sex)}</td>
                <td>{p.hba1c}%</td><td>{p.glucose}</td><td>{p.bmi}</td>
                <td><span className={`chip ${p.level}`}>{pctText(p.score)} {p.level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">No patients match.</p>}
      </div>
    </div>
  );
}

function Registry({ data, onAdd, error }) {
  const licenses = data?.licenses ?? [];
  return (
    <div className="detail panel">
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
    </div>
  );
}

function Activity({ data }) {
  return (
    <div className="detail panel">
      <ul className="activity">
        {(data?.audit ?? []).slice(0, 40).map((a, i) => (
          <li key={i}>
            <span>{a.action.replaceAll("_", " ")}{a.patient_id ? ` (patient ${a.patient_id})` : ""}</span>
            <span className="muted">user {a.user_id}, {String(a.at).slice(0, 16).replace("T", " ")} UTC</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelCard({ card }) {
  const t = card.test;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const drivers = Object.entries(card.importance).sort((a, b) => b[1] - a[1]);
  const top = Math.max(...drivers.map(([, v]) => v), 0.0001);
  return (
    <div className="detail mc panel">
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
      {card.selection && <p className="muted">{card.selection}</p>}
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
        <li>Blood glucose takes only a few distinct values in the training data, so a score can change in steps as glucose moves, not smoothly.</li>
        <li>Screening demo only. Not for medical decisions.</li>
      </ul>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [risk, setRisk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("signin");
  const [role, setRole] = useState("patient");
  const [admin, setAdmin] = useState(null);
  const [card, setCard] = useState(null);

  const signOut = (msg = "") => {
    setAuth(null); setPatients([]); setSelected(null); setRisk(null); setAdmin(null); setError(msg);
    window.location.hash = "";
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
    window.location.hash = a.role === "admin" ? "/registry" : "/";
    if (a.role === "patient") {
      setSelected(await call("/me/patient", {}, a.token));
      setRisk(await call("/me/risk", {}, a.token));
    } else if (a.role === "admin") {
      setAdmin({ licenses: await call("/admin/licenses", {}, a.token), audit: await call("/audit", {}, a.token) });
    } else {
      setPatients(await call("/patients/summary", {}, a.token));
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

  const whatIf = (profile) => call("/whatif", { method: "POST", body: JSON.stringify(profile) });

  const path = useRoute();
  const [route, qs = ""] = path.split("?");
  const [seg, rid] = route.split("/").filter(Boolean);
  const pid = auth?.role === "doctor" && (seg === "patients" || seg === "whatif")
    ? (rid ? +rid : seg === "whatif" ? patients[0]?.id : null) : null;

  useEffect(() => {
    if (!pid) return;
    let live = true;
    setRisk(null); setError("");
    call(`/patients/${pid}/risk`).then((r) => live && setRisk(r)).catch(fail);
    return () => { live = false; };
  }, [pid]);
  useEffect(() => {
    if (seg === "model" && auth && !card) call("/model").then(setCard).catch(fail);
  }, [seg, auth]);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);

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

  const who = auth.role;
  const patient = who === "patient" ? selected : who === "doctor" ? patients.find((p) => p.id === pid) : null;
  const riskNow = risk && (who !== "doctor" || risk.patient_id === pid) ? risk : null;
  const cur = seg ?? (who === "admin" ? "registry" : "");
  const filter = new URLSearchParams(qs).get("risk") ?? "all";
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name = auth.username[0].toUpperCase() + auth.username.slice(1);
  const glow = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const NAV = {
    doctor: [["/", "Overview", Grid], ["/patients", "Patients", Users], ["/whatif", "What-if", Sliders], ["/model", "Model", Chart]],
    patient: [["/", "Results", Grid], ["/whatif", "What-if", Sliders], ["/model", "Model", Chart]],
    admin: [["/registry", "Registry", Badge], ["/activity", "Activity", List], ["/model", "Model", Chart]],
  }[who];

  let page, title, sub;
  if (seg === "model") {
    title = "About the model"; sub = "How the screening model was built and tested.";
    page = card ? <ModelCard card={card} /> : <p className="muted">{error || "Loading..."}</p>;
  } else if (who === "admin") {
    if (seg === "activity") { title = "Activity"; sub = "Recent sign-ups, sign-ins and record views."; page = <Activity data={admin} />; }
    else { title = "Doctor registry"; sub = "Manage which doctors are allowed to sign up."; page = <Registry data={admin} onAdd={addLicense} error={error} />; }
  } else if (seg === "whatif") {
    title = "What-if simulator"; sub = "Change a value and watch the score respond.";
    page = (
      <>
        {who === "doctor" && (
          <label className="picker">Patient
            <select value={pid ?? ""} onChange={(e) => go(`/whatif/${e.target.value}`)}>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <Detail key={`w-${patient?.id}`} mode="whatif" selected={patient} risk={riskNow} error={error} onWhatIf={whatIf}
          resultsHref={who === "doctor" ? `#/patients/${patient?.id}` : "#/"} />
      </>
    );
  } else if (who === "doctor" && seg === "patients" && rid) {
    title = "Patient record"; sub = "Screening result for this patient.";
    page = <Detail key={`v-${patient?.id}`} mode="view" selected={patient} risk={riskNow} error={error}
      whatIfHref={`#/whatif/${patient?.id}`} backHref="#/patients" backLabel="Back to patients" />;
  } else if (who === "doctor" && seg === "patients") {
    title = "Patients"; sub = "Everyone on the list, highest screening score first.";
    page = <PatientsPage patients={patients} filter={filter} />;
  } else if (who === "doctor") {
    title = `Good ${part}, ${name}`; sub = "Here is how your patients look today.";
    page = <Overview patients={patients} />;
  } else {
    title = `Good ${part}, ${name}`; sub = "Here is your latest screening result.";
    page = <Detail key="mine" mode="view" selected={patient} risk={riskNow} error={error} whatIfHref="#/whatif" />;
  }

  return (
    <div className="stage">
      <div className="glass" onMouseMove={glow}>
        <nav className="rail" aria-label="Main">
          <span className="logo"><Pulse /></span>
          {NAV.map(([to, label, Icon]) => (
            <a key={to} href={`#${to}`} className={`rail-link ${to.slice(1) === cur ? "on" : ""}`} aria-current={to.slice(1) === cur ? "page" : undefined}>
              <Icon /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="body">
          <header className="topbar">
            <div><h1>{title}</h1><p className="muted">{sub}</p></div>
            <div className="me">
              <span className="avatar" aria-hidden="true">{name[0]}</span>
              <span>{auth.username} <small>({who})</small></span>
              <button className="ghost" onClick={() => signOut()}>Sign out</button>
            </div>
          </header>
          <div className="content"><main className="main" key={route}>{page}</main></div>
        </div>
      </div>
    </div>
  );
}

const Svg = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Grid = () => (
  <Svg><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></Svg>
);
const Users = () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .8 3.5 2.6 3.5 5.6" /></Svg>;
const Sliders = () => <Svg><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></Svg>;
const Badge = () => <Svg><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.5-1.4 1.6-2 3-2s2.5.6 3 2M14.5 10h4M14.5 13h3" /></Svg>;
const List = () => <Svg><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></Svg>;
const Chart = () => <Svg><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></Svg>;

function Pulse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6 4 12 2.5-6H22" />
    </svg>
  );
}
