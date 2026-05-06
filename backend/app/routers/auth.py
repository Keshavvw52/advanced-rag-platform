from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import User, get_db
from app.models.schemas import AuthRequest, AuthResponse, UserResponse
from app.services.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    new_user_id,
    normalize_email,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, name=user.name)


@router.post("/signup", response_model=AuthResponse)
async def signup(request: AuthRequest, db: AsyncSession = Depends(get_db)):
    email = normalize_email(request.email)
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        id=new_user_id(),
        email=email,
        name=request.name.strip() if request.name else None,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return AuthResponse(access_token=create_access_token(user), user=_user_response(user))


@router.post("/login", response_model=AuthResponse)
async def login(request: AuthRequest, db: AsyncSession = Depends(get_db)):
    email = normalize_email(request.email)
    user = await db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return AuthResponse(access_token=create_access_token(user), user=_user_response(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)
