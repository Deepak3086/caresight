import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://caresight.onrender.com";
const LABELS = {
  age: "Age", bmi: "BMI", glucose: "Fasting glucose", hba1c: "HbA1c",
  systolic_bp: "Systolic BP", smoker: "Smoker", family_history: "Family history",
};

export default function App() {
  const [auth, setAuth] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [risk, setRisk] = useState(null);
  const [error, setError] = useState("");

  const call = async (path, opts = {}, token = auth?.token) => {
    const res = await fetch(API + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Request failed");
    return res.json();
  };

  const login = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const a = await call("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
      }, null);
      setAuth(a);
      setPatients(await call("/patients", {}, a.token));
      setError("");
    } catch (err) { setError(err.message); }
  };

  const assess = async (p) => {
    setSelected(p); setRisk(null);
    try { setRisk(await call(`/patients/${p.id}/risk`)); setError(""); }
    catch (err) { setError(err.message); }
  };

  if (!auth) {
    return (
      <main className="login">
        <h1>CareSight</h1>
        <p>Sign in to review patient risk scores.</p>
        <form onSubmit={login}>
          <label>Username<input name="username" defaultValue="doctor" autoComplete="username" /></label>
          <label>Password<input name="password" type="password" defaultValue="doctor123" autoComplete="current-password" /></label>
          <button>Sign in</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <div className="layout">
      <header>
        <h1>CareSight</h1>
        <span>{auth.username} ({auth.role})</span>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="list">
        <h2>Patients</h2>
        <table>
          <thead><tr><th>Name</th><th>Age</th><th>HbA1c</th><th>BP</th><th></th></tr></thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className={selected?.id === p.id ? "on" : ""}>
                <td>{p.name}</td><td>{p.age}</td><td>{p.hba1c}</td><td>{p.systolic_bp}</td>
                <td><button onClick={() => assess(p)}>Assess risk</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="detail">
        {!selected && <p className="empty">Pick a patient to see their risk score and what drives it.</p>}
        {selected && !risk && !error && <p>Scoring {selected.name}...</p>}
        {risk && (
          <>
            <h2>{selected.name}</h2>
            <div className={`score ${risk.level}`}>
              <strong>{Math.round(risk.score * 100)}%</strong>
              <span>{risk.level} risk</span>
            </div>
            <div className="bar"><i style={{ width: `${risk.score * 100}%` }} /></div>
            <h3>What moved this score</h3>
            <ul className="factors">
              {risk.factors.map((f) => (
                <li key={f.feature}>
                  <span>{LABELS[f.feature]}: {f.value}</span>
                  <b className={f.impact > 0 ? "up" : "down"}>
                    {f.impact > 0 ? "+" : ""}{(f.impact * 100).toFixed(1)} pts
                  </b>
                </li>
              ))}
            </ul>
            <p className="note">{risk.disclaimer}</p>
          </>
        )}
      </section>
    </div>
  );
}
