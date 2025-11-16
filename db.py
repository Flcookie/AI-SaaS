# db.py

import os
from datetime import datetime

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# ---------- Database URL ----------
# Railway 上你可以在 Variables 里设置 DATABASE_URL 为 Postgres，
# 如果不设置，就默认用本地 SQLite 文件 patients.db。

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./patients.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

# ---------- ORM Models ----------

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    mrn = Column(String(255), nullable=True)  # Medical Record Number
    internal_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    summaries = relationship(
        "VisitSummary",
        back_populates="patient",
        cascade="all, delete-orphan",
    )


class VisitSummary(Base):
    __tablename__ = "visit_summaries"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    date_of_visit = Column(String(32), nullable=False)
    summary_markdown = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="summaries")
