import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Railway injeta DATABASE_URL automaticamente
    # Localmente usa as variáveis individuais
    DATABASE_URL = os.getenv("DATABASE_URL", "")

    DB_HOST     = os.getenv("DB_HOST", "localhost")
    DB_NAME     = os.getenv("DB_NAME", "brunoalmeida")
    DB_USER     = os.getenv("DB_USER", "brunoalmeida")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_PORT     = int(os.getenv("DB_PORT", "5432"))

    SECRET_KEY  = os.getenv("SECRET_KEY", "tractian-lead-miner-dev-key")
    DEBUG       = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    PORT        = int(os.getenv("PORT", 5000))
    MAX_RESULTS = int(os.getenv("MAX_RESULTS", "10000"))
