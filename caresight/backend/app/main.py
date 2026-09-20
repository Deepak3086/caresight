"""CareSight API: JWT auth, role-based access, audit log, risk prediction."""
import hashlib, hmac, os, secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from . import ml

SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///caresight.db"),
                       connect_args={"check_same_thread": False} if "sqlite" in os.getenv("DATABASE_URL", "sqlite") else {})


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)  # doctor | admin


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    age: Mapped[int] = mapped_column(Integer)
    bmi: Mapped[float] = mapped_column(Float)
    glucose: Mapped[float] = mapped_column(Float)
    hba1c: Mapped[float] = mapped_column(Float)
    systolic_bp: Mapped[float] = mapped_column(Float)
    smoker: Mapped[int] = mapped_column(Integer)
    family_history: Mapped[int] = mapped_column(Integer)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String)
    patient_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


def hash_pw(pw: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    return salt.hex() + "$" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()


def check_pw(pw: str, stored: str) -> bool:
    salt, _ = stored.split("$")
    return hmac.compare_digest(hash_pw(pw, bytes.fromhex(salt)), stored)


def db():
    with Session(engine) as s:
        yield s


bearer = HTTPBearer()


def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), s: Session = Depends(db)) -> User:
    try:
        uid = int(jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = s.get(User, uid)
    if not user:
        raise HTTPException(401, "Unknown user")
    return user


def require(*roles):
    def check(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Your role cannot do this")
        return user
    return check


app = FastAPI(title="CareSight")
app.add_middleware(CORSMiddleware,
                   allow_origins=[o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def seed():
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        if s.scalar(select(User)):
            return
        s.add_all([User(username="doctor", password_hash=hash_pw("doctor123"), role="doctor"),
                   User(username="admin", password_hash=hash_pw("admin123"), role="admin")])
        for i, row in ml.synthetic_patients(25, seed=7).iterrows():
            s.add(Patient(name=f"Patient {i + 1:03d}", **{k: float(row[k]) if k in ("bmi", "glucose", "hba1c", "systolic_bp") else int(row[k]) for k in ml.FEATURES}))
        s.commit()


class Login(BaseModel):
    username: str
    password: str


class PatientIn(BaseModel):
    name: str
    age: int = Field(ge=0, le=120)
    bmi: float = Field(ge=10, le=80)
    glucose: float = Field(ge=30, le=600)
    hba1c: float = Field(ge=3, le=18)
    systolic_bp: float = Field(ge=60, le=260)
    smoker: int = Field(ge=0, le=1)
    family_history: int = Field(ge=0, le=1)


def log(s: Session, user: User, action: str, patient_id: int | None = None):
    s.add(AuditLog(user_id=user.id, action=action, patient_id=patient_id))
    s.commit()


@app.post("/auth/login")
def login(body: Login, s: Session = Depends(db)):
    user = s.scalar(select(User).where(User.username == body.username))
    if not user or not check_pw(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, SECRET, algorithm="HS256")
    return {"token": token, "role": user.role, "username": user.username}


@app.get("/patients")
def list_patients(user: User = Depends(require("doctor", "admin")), s: Session = Depends(db)):
    log(s, user, "list_patients")
    return s.scalars(select(Patient).order_by(Patient.id)).all()


@app.post("/patients", status_code=201)
def add_patient(body: PatientIn, user: User = Depends(require("doctor")), s: Session = Depends(db)):
    p = Patient(**body.model_dump())
    s.add(p)
    s.commit()
    log(s, user, "create_patient", p.id)
    return p


@app.get("/patients/{pid}/risk")
def patient_risk(pid: int, user: User = Depends(require("doctor")), s: Session = Depends(db)):
    p = s.get(Patient, pid)
    if not p:
        raise HTTPException(404, "Patient not found")
    log(s, user, "view_risk", pid)
    return {"patient_id": pid, **ml.predict({f: getattr(p, f) for f in ml.FEATURES}),
            "disclaimer": "Decision support demo on synthetic data. Not a diagnosis."}


@app.get("/audit")
def audit(user: User = Depends(require("admin")), s: Session = Depends(db)):
    rows = s.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(100)).all()
    return [{"user_id": r.user_id, "action": r.action, "patient_id": r.patient_id, "at": r.at} for r in rows]


@app.get("/model")
def model_info(user: User = Depends(current_user)):
    return ml.model_metrics()
