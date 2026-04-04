import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_DIR, "medicrew.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_sqlite_users():
    """Add profile columns to existing SQLite DBs (create_all does not alter tables)."""
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        existing = {r[1] for r in rows}
        for col_name, col_type in (
            ("full_name", "VARCHAR(200)"),
            ("phone", "VARCHAR(32)"),
            ("organization", "VARCHAR(200)"),
            ("country", "VARCHAR(100)"),
            ("date_of_birth", "VARCHAR(32)"),
        ):
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))


def migrate_schema_v2():
    """Patients, clinical notes, ecg_tests.patient_id for existing SQLite DBs."""
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        r = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'")
        ).fetchone()
        if not r:
            conn.execute(
                text(
                    """
                CREATE TABLE patients (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    doctor_user_id INTEGER NOT NULL,
                    patient_code VARCHAR(64) NOT NULL,
                    full_name VARCHAR(200) NOT NULL,
                    age INTEGER,
                    gender VARCHAR(32),
                    blood_group VARCHAR(16),
                    bp_systolic INTEGER,
                    bp_diastolic INTEGER,
                    notes TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(doctor_user_id) REFERENCES users (id),
                    CONSTRAINT uq_doctor_patient_code UNIQUE (doctor_user_id, patient_code)
                )
                """
                )
            )
            conn.execute(text("CREATE INDEX ix_patients_doctor ON patients (doctor_user_id)"))

        r2 = conn.execute(
            text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='patient_clinical_notes'"
            )
        ).fetchone()
        if not r2:
            conn.execute(
                text(
                    """
                CREATE TABLE patient_clinical_notes (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    patient_id INTEGER NOT NULL,
                    title VARCHAR(300) NOT NULL,
                    category VARCHAR(64),
                    content TEXT NOT NULL,
                    created_at DATETIME,
                    FOREIGN KEY(patient_id) REFERENCES patients (id)
                )
                """
                )
            )
            conn.execute(text("CREATE INDEX ix_notes_patient ON patient_clinical_notes (patient_id)"))

        rows = conn.execute(text("PRAGMA table_info(ecg_tests)")).fetchall()
        ecg_cols = {row[1] for row in rows}
        if "patient_id" not in ecg_cols:
            conn.execute(text("ALTER TABLE ecg_tests ADD COLUMN patient_id INTEGER"))
            conn.execute(text("CREATE INDEX ix_ecg_tests_patient ON ecg_tests (patient_id)"))
