from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=True)
    phone = Column(String(32), nullable=True)
    organization = Column(String(200), nullable=True)
    country = Column(String(100), nullable=True)
    date_of_birth = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tests = relationship("ECGTest", back_populates="user", cascade="all, delete-orphan")
    patients = relationship("Patient", back_populates="doctor", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("doctor_user_id", "patient_code", name="uq_doctor_patient_code"),)

    id = Column(Integer, primary_key=True, index=True)
    doctor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_code = Column(String(64), nullable=False)
    full_name = Column(String(200), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(32), nullable=True)
    blood_group = Column(String(16), nullable=True)
    bp_systolic = Column(Integer, nullable=True)
    bp_diastolic = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    doctor = relationship("User", back_populates="patients")
    ecg_tests = relationship("ECGTest", back_populates="patient")
    clinical_notes = relationship(
        "PatientClinicalNote", back_populates="patient", cascade="all, delete-orphan"
    )


class PatientClinicalNote(Base):
    __tablename__ = "patient_clinical_notes"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    category = Column(String(64), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="clinical_notes")


class ECGTest(Base):
    __tablename__ = "ecg_tests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True, index=True)
    file_name = Column(String(512), nullable=False)
    fs = Column(Integer, nullable=False)
    sample_count = Column(Integer, nullable=False)
    result_json = Column(Text, nullable=False)
    signal_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="tests")
    patient = relationship("Patient", back_populates="ecg_tests")
