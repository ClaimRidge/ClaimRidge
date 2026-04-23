from core.config import Config
from supabase import create_client, Client

supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)