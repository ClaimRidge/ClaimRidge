import os
from dotenv import load_dotenv
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=ENV_PATH)

class Config:
    # Supabase configuration
    SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    # OpenRouter configuration
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "openai/gpt-oss-120b:free")