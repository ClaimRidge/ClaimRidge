from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer
from core.database import supabase

security = HTTPBearer()

async def get_current_user(credentials = Security(security)):
    token = credentials.credentials
    try:
        # Verify the JWT using Supabase
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))