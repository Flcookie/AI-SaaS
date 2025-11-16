# api/index.py

import os
from typing import List, Optional, Generator

from fastapi import FastAPI, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from openai import OpenAI

from db import (
    Base,
    engine,
    SessionLocal,
    Patient,
    VisitSummary,
)

# ---------- FastAPI app & CORS ----------

app = FastAPI()

# 允许前端域名访问（这里把你的 Vercel 域名改进去）
origins = [
    "http://localhost:3000",
    "https://your-frontend-domain.vercel.app",  # TODO: 替换成你自己的 Vercel 地址
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建表（简单粗暴版，在启动时确保表存在）
Base.metadata.create_all(bind=engine)


# ---------- DB Session 依赖 ----------

from sqlalchemy.orm import Session  # 放在这里避免循环引用


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Pydantic Models ----------

class Visit(BaseModel):
    patient_name: str
    date_of_visit: str
    notes: str


class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    mrn: Optional[str] = None
    internal_notes: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    mrn: Optional[str] = None
    internal_notes: Optional[str] = None

    class Config:
        from_attributes = True  # pydantic v2 风格


class SaveSummaryRequest(BaseModel):
    date_of_visit: str
    summary_markdown: str


class VisitSummaryOut(BaseModel):
    id: int
    patient_id: int
    date_of_visit: str
    summary_markdown: str

    class Config:
        from_attributes = True


# ---------- LLM Prompt ----------

system_prompt = """
You are provided with notes written by a doctor from a patient's visit.
Your job is to summarize the visit for the doctor and provide an email.
Reply with exactly three sections with the headings:
### Summary of visit for the doctor's records
### Next steps for the doctor
### Draft of email to patient in patient-friendly language
"""


def user_prompt_for(visit: Visit) -> str:
    return f"""Create the summary, next steps and draft email for:
Patient Name: {visit.patient_name}
Date of Visit: {visit.date_of_visit}
Notes:
{visit.notes}"""


# ---------- SSE: Consultation Summary ----------

@app.post("/api")
def consultation_summary(
    visit: Visit,
    authorization: str | None = Header(default=None),
):
    """
    这里暂时不真正校验 Clerk 的 JWT，
    只是演示从前端拿到 Authorization 头。
    """
    if authorization is None:
        # 前端现在会在没有 token 时直接拦截，这里只是兜底
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    client = OpenAI()
    user_prompt = user_prompt_for(visit)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    stream = client.chat.completions.create(
        model="gpt-5-nano",  # 保持你原来的模型
        messages=messages,
        stream=True,
    )

    def event_stream() -> Generator[str, None, None]:
        for chunk in stream:
            text = chunk.choices[0].delta.content
            if text:
                lines = text.split("\n")
                for line in lines[:-1]:
                    yield f"data: {line}\n\n"
                    # 空行用于换行
                    yield "data:  \n\n"
                yield f"data: {lines[-1]}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------- Patients CRUD ----------

@app.post("/patients", response_model=PatientOut)
def create_patient(
    patient_in: PatientCreate,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    # 简单防重复：同 email 返回已有患者
    existing = (
        db.query(Patient)
        .filter(Patient.email == patient_in.email)
        .first()
    )
    if existing:
        return existing

    patient = Patient(
        name=patient_in.name,
        email=patient_in.email,
        mrn=patient_in.mrn,
        internal_notes=patient_in.internal_notes,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/patients", response_model=List[PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    patients = db.query(Patient).order_by(Patient.created_at.desc()).all()
    return patients


# ---------- Visit Summaries per Patient ----------

@app.post(
    "/patients/{patient_id}/summaries",
    response_model=VisitSummaryOut,
)
def save_summary_for_patient(
    patient_id: int,
    payload: SaveSummaryRequest,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )

    summary = VisitSummary(
        patient_id=patient_id,
        date_of_visit=payload.date_of_visit,
        summary_markdown=payload.summary_markdown,
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


@app.get(
    "/patients/{patient_id}/summaries",
    response_model=List[VisitSummaryOut],
)
def list_summaries_for_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    summaries = (
        db.query(VisitSummary)
        .filter(VisitSummary.patient_id == patient_id)
        .order_by(VisitSummary.created_at.desc())
        .all()
    )
    return summaries
