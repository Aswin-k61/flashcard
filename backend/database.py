from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

client = None

def get_database():
    global client
    if client is None:
        client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
    # We want to connect to whatever DB name is specified in connection string or default to flashcard_db
    # MongoDB Atlas connection strings can contain the DB name, but if not we can extract it or default
    db_name = "flashcard_db"
    # Let's inspect the connection string to see if there's a DB specified
    # Format: mongodb+srv://username:password@cluster/dbname?options
    parsed_url = settings.MONGODB_URL.split("/")
    if len(parsed_url) > 3:
        last_part = parsed_url[3].split("?")[0]
        if last_part:
            db_name = last_part
    return client[db_name]

async def ping_database():
    db = get_database()
    # Ping
    await db.command("ping")

def close_database():
    global client
    if client is not None:
        client.close()
        client = None
