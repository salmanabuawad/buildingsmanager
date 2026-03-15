"""
Auth router: /api/auth/*
Handles login, OTP login, task-token login.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    p_user_name: str
    p_password: str


class OtpRequest(BaseModel):
    p_otp: str


class TokenRequest(BaseModel):
    p_token: str


@router.post("/login")
async def login(req: LoginRequest):
    from app.services import auth_service
    try:
        result = await auth_service.login(req.p_user_name, req.p_password)
        return {"data": result, "error": None}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/login-otp")
async def login_otp(req: OtpRequest):
    from app.services import auth_service
    try:
        result = await auth_service.login_otp(req.p_otp)
        return {"data": result, "error": None}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/login-token")
async def login_token(req: TokenRequest):
    from app.services import auth_service
    try:
        result = await auth_service.login_task_token(req.p_token)
        return {"data": result, "error": None}
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
