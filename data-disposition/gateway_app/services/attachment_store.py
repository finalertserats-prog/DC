import os
import shutil
import uuid
import time
from pathlib import Path
from typing import Optional, Tuple

class AttachmentStore:
    """
    A persistent store for binary attachments (charts, CSVs).
    Files are saved to a local cache directory to survive server restarts.
    """
    def __init__(self, cache_dir: str = ".attachments_cache", ttl_secs: int = 86400 * 7):  # 7 days
        self.cache_dir = Path(cache_dir)
        self.ttl = ttl_secs
        self._ensure_cache()

    def _ensure_cache(self):
        if not self.cache_dir.exists():
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, filename: str, content_type: str) -> str:
        """
        Saves binary data and returns a unique file_id.
        """
        file_id = uuid.uuid4().hex
        target_dir = self.cache_dir / file_id
        target_dir.mkdir(parents=True, exist_ok=True)
        
        # Save data
        with open(target_dir / filename, "wb") as f:
            f.write(data)
            
        # Save content-type in a small metadata file
        with open(target_dir / ".content_type", "w") as f:
            f.write(content_type)
            
        return file_id

    def get(self, file_id: str) -> Optional[Tuple[bytes, str]]:
        """
        Retrieves the binary data and content_type for a given file_id.
        """
        target_dir = self.cache_dir / file_id
        if not target_dir.is_dir():
            return None
            
        # Find the actual data file (non-hidden)
        data_files = [f for f in target_dir.iterdir() if not f.name.startswith(".")]
        if not data_files:
            return None
            
        data_file = data_files[0]
        # Check TTL
        if time.time() - data_file.stat().st_mtime > self.ttl:
            shutil.rmtree(target_dir)
            return None

        with open(data_file, "rb") as f:
            data = f.read()
            
        content_type = "application/octet-stream"
        ct_file = target_dir / ".content_type"
        if ct_file.exists():
            with open(ct_file, "r") as f:
                content_type = f.read().strip()
                
        return data, content_type

    def clear(self):
        """Clears the cache."""
        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
        self._ensure_cache()

# Global singleton
attachment_store = AttachmentStore()
