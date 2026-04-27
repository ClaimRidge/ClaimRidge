import os
import logging
from dotenv import load_dotenv
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=ENV_PATH)

class Config:
    # Supabase configuration
    SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    # AI Configuration
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY")
    
    LLM_MODEL: str = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    OCR_MODEL: str = os.getenv("OCR_MODEL", "baidu/qianfan-ocr-fast:free")
    

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)