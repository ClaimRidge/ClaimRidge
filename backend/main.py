import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import pre_auth, dropoff, insurer, user
from core.config import logger

app = FastAPI(title="ClaimRidge Enterprise API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(pre_auth.router)
app.include_router(dropoff.router)
app.include_router(insurer.router)
app.include_router(user.router)

@app.on_event("startup")
async def startup_event():
    logger.info("ClaimRidge API starting up")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ClaimRidge Enterprise Backend"}
