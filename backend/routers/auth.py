from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime
from backend.database import get_database
from backend.models.user import UserCreate, UserLogin, Token
from backend.services.auth_service import hash_password, verify_password, create_access_token

router = APIRouter()

@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate):
    db = get_database()
    
    # Check if user already exists
    email_clean = user_in.email.strip().lower()
    existing_user = await db.users.find_one({"email": email_clean})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
        
    # Hash password
    hashed_pwd = hash_password(user_in.password)
    
    # Create user dict
    user_dict = {
        "name": user_in.name.strip(),
        "email": email_clean,
        "password": hashed_pwd,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Generate token
    token_data = {"sub": user_id, "email": email_clean}
    access_token = create_access_token(data=token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": user_dict["name"],
            "email": user_dict["email"]
        }
    }

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    db = get_database()
    email_clean = credentials.email.strip().lower()
    
    user = await db.users.find_one({"email": email_clean})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
        
    user_id = str(user["_id"])
    token_data = {"sub": user_id, "email": email_clean}
    access_token = create_access_token(data=token_data)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": user["name"],
            "email": user["email"]
        }
    }
