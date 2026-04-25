import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import claims, insurer
from core.config import logger

app = FastAPI(title="ClaimRidge API")

# Configure CORS so the Next.js frontend can communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Update this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(claims.router)
app.include_router(insurer.router)

@app.on_event("startup")
async def startup_event():
    logger.info("ClaimRidge API starting up")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("ClaimRidge API shutting down")

@app.get("/health")
def health_check():
    logger.debug("Health check endpoint called")
    return {"status": "ok"}