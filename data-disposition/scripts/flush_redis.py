# scripts/flush_redis.py
"""
Utility script to flush all keys in the local Redis database.
"""
import os
import sys
import logging
from pathlib import Path

# Add project root to path so we can import gateway_app
project_root = str(Path(__file__).parent.parent)
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv
load_dotenv()

try:
    import redis
except ImportError:
    print("Redis library not found. Please install it with: pip install redis")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    logger.info(f"Connecting to Redis at {redis_url}...")
    
    try:
        r = redis.from_url(redis_url)
        r.flushdb()
        logger.info("Redis cache flushed successfully (current DB).")
    except Exception as e:
        logger.error(f"Failed to flush Redis: {e}")

if __name__ == "__main__":
    main()
