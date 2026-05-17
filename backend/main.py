import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import user, insurer, pre_auth, dropoff, fraud, claims, intake, providers, doctors, assistant, audit
from core.config import logger

app = FastAPI(title="ClaimRidge Enterprise API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Insurer-side (pre-auth flow)
app.include_router(pre_auth.router)
app.include_router(dropoff.router)
app.include_router(fraud.router)
app.include_router(insurer.router)

# Provider-side (claim intake & scrubbing)
app.include_router(intake.router)
app.include_router(claims.router)

# Provider/doctor org management
app.include_router(providers.router)
app.include_router(doctors.router)

# Assistant — read-only, tool-using agent (all portals)
app.include_router(assistant.router)

# Audit Trail & Compliance (all portals)
app.include_router(audit.router)

app.include_router(user.router)

@app.on_event("startup")
async def startup_event():
    logger.info("ClaimRidge API starting up")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ClaimRidge Enterprise Backend"}
