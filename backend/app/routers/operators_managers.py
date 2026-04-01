from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers.data import require_jwt

router = APIRouter()


# ---- Operators ----

@router.post("/operators")
def create_operator(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            'INSERT INTO "operators" (name, mail, phone) '
            'VALUES (:name, :mail, :phone) '
            'RETURNING *'
        ),
        {
            "name": body.get("name"),
            "mail": body.get("mail"),
            "phone": body.get("phone"),
        },
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to create operator")
    db.commit()
    return dict(row)


@router.patch("/operators/{operator_id}")
def update_operator(
    operator_id: int,
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    allowed = {"name", "mail", "phone"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    params = {**updates, "operator_id": operator_id}
    row = db.execute(
        text(f'UPDATE "operators" SET {set_clause} WHERE "operator_id" = :operator_id RETURNING *'),
        params,
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Operator not found")
    db.commit()
    return dict(row)


@router.delete("/operators/{operator_id}")
def delete_operator(
    operator_id: int,
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    result = db.execute(
        text('DELETE FROM "operators" WHERE "operator_id" = :operator_id'),
        {"operator_id": operator_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Operator not found")
    return {"success": True}


# ---- Managers ----

@router.post("/managers")
def create_manager(
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            'INSERT INTO "managers" (name, tax_regions, mail, phone) '
            'VALUES (:name, :tax_regions, :mail, :phone) '
            'RETURNING *'
        ),
        {
            "name": body.get("name"),
            "tax_regions": body.get("tax_regions"),
            "mail": body.get("mail"),
            "phone": body.get("phone"),
        },
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to create manager")
    db.commit()
    return dict(row)


@router.patch("/managers/{manager_id}")
def update_manager(
    manager_id: int,
    body: dict = Body(...),
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    allowed = {"name", "tax_regions", "mail", "phone"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    params = {**updates, "manager_id": manager_id}
    row = db.execute(
        text(f'UPDATE "managers" SET {set_clause} WHERE "manager_id" = :manager_id RETURNING *'),
        params,
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    db.commit()
    return dict(row)


@router.delete("/managers/{manager_id}")
def delete_manager(
    manager_id: int,
    _payload: dict = Depends(require_jwt),
    db: Session = Depends(get_db),
):
    result = db.execute(
        text('DELETE FROM "managers" WHERE "manager_id" = :manager_id'),
        {"manager_id": manager_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Manager not found")
    return {"success": True}
