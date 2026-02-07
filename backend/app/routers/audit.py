from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import AuditLog, User
from app.schemas import AuditLogResponse
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[AuditLogResponse])
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(AuditLog)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)

    audit_logs = query.order_by(AuditLog.changed_at.desc()).offset(skip).limit(limit).all()
    return audit_logs


@router.get("/{audit_id}", response_model=AuditLogResponse)
def get_audit_log(
    audit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    audit_log = db.query(AuditLog).filter(AuditLog.id == audit_id).first()
    if not audit_log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return audit_log
