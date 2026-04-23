from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import claims, insurer, pdf

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
app.include_router(pdf.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}