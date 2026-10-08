"""
Customer authentication — OTP-based phone login for the storefront.

Flow:
  1. POST /api/auth/send-otp  → generates 6-digit OTP, sends via WhatsApp
  2. POST /api/auth/verify-otp → verifies OTP, creates/finds customer, returns JWT
  3. GET  /api/auth/me          → returns customer profile (requires JWT)
"""
import secrets
import datetime
import os

from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from . import models

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"
OTP_EXPIRE_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
CUSTOMER_TOKEN_EXPIRE_DAYS = 7

# Separate OAuth2 scheme for customer tokens (points at our verify-otp endpoint)
customer_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/verify-otp", auto_error=False)


def generate_otp() -> str:
    """Generate a 6-digit numeric OTP."""
    return f"{secrets.randbelow(10**6):06d}"


def create_customer_token(phone: str) -> str:
    """Create a JWT for customer auth. Payload: sub=phone, exp=7 days."""
    to_encode = {"sub": phone, "role": "customer"}
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=CUSTOMER_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_customer(
    token: str = Depends(customer_oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Customer | None:
    """
    Decode customer JWT and return the Customer row.
    Returns None if token is missing/invalid — does NOT raise.
    Use this for optional auth (checkout, order creation).
    """
    if token is None:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        phone: str = payload.get("sub")
        role: str = payload.get("role")
        if phone is None or role != "customer":
            return None
    except JWTError:
        return None

    return db.query(models.Customer).filter(models.Customer.phone == phone).first()


def require_customer(
    token: str = Depends(customer_oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Customer:
    """
    Require a valid customer JWT. Raises 401 if not authenticated.
    Use this for protected endpoints (order history, addresses).
    """
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        phone: str = payload.get("sub")
        role: str = payload.get("role")
        if phone is None or role != "customer":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    customer = db.query(models.Customer).filter(models.Customer.phone == phone).first()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer not found")
    return customer


def create_or_get_customer(db: Session, phone: str, name: str = "", email: str = "") -> models.Customer:
    """Find existing customer by phone or create a new one."""
    customer = db.query(models.Customer).filter(models.Customer.phone == phone).first()
    if customer:
        # Update name/email if provided and empty on existing record
        if name and not customer.name:
            customer.name = name
        if email and not customer.email:
            customer.email = email
        db.commit()
        db.refresh(customer)
        return customer

    customer = models.Customer(
        phone=phone,
        name=name or "",
        email=email or "",
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer
