"""CareSight API: JWT auth, role-based access, audit log, risk prediction."""
import hashlib, hmac, os, secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, create_engine, select, update
from sqlalchemy.exc import IntegrityError
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
    role: Mapped[str] = mapped_column(String)  # doctor | admin | patient
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    sex: Mapped[str] = mapped_column(String)
    age: Mapped[int] = mapped_column(Integer)
    bmi: Mapped[float] = mapped_column(Float)
    hba1c: Mapped[float] = mapped_column(Float)
    glucose: Mapped[float] = mapped_column(Float)
    hypertension: Mapped[int] = mapped_column(Integer)
    heart_disease: Mapped[int] = mapped_column(Integer)
    smoking: Mapped[str] = mapped_column(String)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, unique=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String)
    patient_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class DoctorLicense(Base):
    """Registry of verified doctors. One ID can be claimed by exactly one account."""
    __tablename__ = "doctor_licenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    license_id: Mapped[str] = mapped_column(String, unique=True)
    full_name: Mapped[str] = mapped_column(String)
    claimed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, unique=True)


DEMO_LICENSES = [("DOC-1001", "Asha Rao"), ("DOC-1002", "Vikram Nair"), ("DOC-1003", "Meera Iyer"),
                 ("DOC-1004", "Rahul Menon"), ("DOC-1005", "Priya Sharma")]


def norm_name(x: str) -> str:
    x = " ".join(x.lower().split())
    for prefix in ("dr. ", "dr "):
        if x.startswith(prefix):
            x = x[len(prefix):]
    return x


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
                   allow_origin_regex=r"^https://caresight-[a-z0-9]+-itsdeepak0308-2474s-projects\.vercel\.app$",
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def seed():
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        if not s.scalar(select(DoctorLicense)):
            s.add_all([DoctorLicense(license_id=i, full_name=n) for i, n in DEMO_LICENSES])
            s.commit()
        if s.scalar(select(User)):
            return
        s.add_all([User(username="doctor", password_hash=hash_pw("doctor123"), role="doctor"),
                   User(username="admin", password_hash=hash_pw("admin123"), role="admin")])
        for i, row in enumerate(ml.demo_patients(25, seed=7)):
            s.add(Patient(name=f"Patient {i + 1:03d}", **row))
        s.commit()


class Login(BaseModel):
    username: str
    password: str


class Vitals(BaseModel):
    sex: Literal["female", "male"]
    age: int = Field(ge=0, le=120)
    bmi: float = Field(ge=10, le=80)
    hba1c: float = Field(ge=3, le=18)
    glucose: float = Field(ge=30, le=600)
    hypertension: int = Field(ge=0, le=1)
    heart_disease: int = Field(ge=0, le=1)
    smoking: Literal["never", "former", "current"]


class PatientIn(Vitals):
    name: str


class Register(BaseModel):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    role: Literal["doctor", "patient"]  # admin accounts can never be self-created
    name: str | None = Field(default=None, max_length=80)
    profile: Vitals | None = None
    license_id: str | None = Field(default=None, max_length=30)


def log(s: Session, user: User, action: str, patient_id: int | None = None):
    s.add(AuditLog(user_id=user.id, action=action, patient_id=patient_id))
    s.commit()


def issue(user: User) -> dict:
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, SECRET, algorithm="HS256")
    return {"token": token, "role": user.role, "username": user.username}


@app.post("/auth/login")
def login(body: Login, s: Session = Depends(db)):
    user = s.scalar(select(User).where(User.username == body.username.lower()))
    if not user or not check_pw(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return issue(user)


@app.post("/auth/register", status_code=201)
def register(body: Register, s: Session = Depends(db)):
    if body.role == "patient" and not (body.name and body.name.strip() and body.profile):
        raise HTTPException(422, "Patients must give their name and measurements")
    lic = None
    if body.role == "doctor":
        lic = s.scalar(select(DoctorLicense).where(DoctorLicense.license_id == (body.license_id or "").strip().upper()))
        if not (lic and lic.claimed_by is None and body.name and norm_name(body.name) == norm_name(lic.full_name)):
            # one message for every failure, so IDs can't be probed one by one
            raise HTTPException(403, "We couldn't verify that ID and name, or the ID is already in use.")
    user = User(username=body.username.lower(), password_hash=hash_pw(body.password),
                role=body.role, full_name=body.name)
    s.add(user)
    try:
        s.flush()
        if lic:
            claimed = s.execute(update(DoctorLicense)
                                .where(DoctorLicense.id == lic.id, DoctorLicense.claimed_by.is_(None))
                                .values(claimed_by=user.id))
            if claimed.rowcount != 1:  # someone else claimed it a moment ago
                s.rollback()
                raise HTTPException(403, "We couldn't verify that ID and name, or the ID is already in use.")
        if body.role == "patient":
            s.add(Patient(name=body.name.strip(), user_id=user.id, **body.profile.model_dump()))
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, "That username is taken")
    log(s, user, "register")
    return issue(user)


def risk_payload(p: Patient) -> dict:
    return {"patient_id": p.id, **ml.predict({f: getattr(p, f) for f in ml.FEATURES}),
            "disclaimer": "Screening demo trained on a public dataset. Not a diagnosis."}


def own_record(user: User, s: Session) -> Patient:
    p = s.scalar(select(Patient).where(Patient.user_id == user.id))
    if not p:
        raise HTTPException(404, "No patient record for this account")
    return p


@app.get("/me/patient")
def my_patient(user: User = Depends(require("patient")), s: Session = Depends(db)):
    return own_record(user, s)


@app.get("/me/risk")
def my_risk(user: User = Depends(require("patient")), s: Session = Depends(db)):
    p = own_record(user, s)
    log(s, user, "view_own_risk", p.id)
    return risk_payload(p)


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
    return risk_payload(p)


@app.get("/audit")
def audit(user: User = Depends(require("admin")), s: Session = Depends(db)):
    rows = s.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(100)).all()
    return [{"user_id": r.user_id, "action": r.action, "patient_id": r.patient_id, "at": r.at} for r in rows]


@app.get("/model")
def model_info(user: User = Depends(current_user)):
    return ml.model_metrics()


class LicenseIn(BaseModel):
    license_id: str = Field(pattern=r"^[A-Za-z0-9-]{4,30}$")
    full_name: str = Field(min_length=2, max_length=80)


@app.get("/admin/licenses")
def list_licenses(user: User = Depends(require("admin")), s: Session = Depends(db)):
    rows = s.scalars(select(DoctorLicense).order_by(DoctorLicense.id)).all()
    return [{"license_id": r.license_id, "full_name": r.full_name, "claimed": r.claimed_by is not None} for r in rows]


@app.post("/admin/licenses", status_code=201)
def add_license(body: LicenseIn, user: User = Depends(require("admin")), s: Session = Depends(db)):
    s.add(DoctorLicense(license_id=body.license_id.upper(), full_name=body.full_name.strip()))
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, "That ID is already in the registry")
    log(s, user, "add_license")
    return {"ok": True}


@app.post("/whatif")
def whatif(body: Vitals, user: User = Depends(require("doctor", "patient"))):
    """Score hypothetical values for the what-if sliders. Nothing is saved."""
    return ml.predict(body.model_dump())
