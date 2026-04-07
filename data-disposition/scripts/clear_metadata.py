# scripts/clear_metadata.py
"""
Utility script to clear business descriptions for all tables in OpenMetadata.
Useful for re-running enrichment from scratch.
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

from gateway_app.services.openmetadata_client import OpenMetadataClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    om_client = OpenMetadataClient()
    table_filter = os.getenv("TABLE_NAME")
    service_whitelist = os.getenv("SERVICE_WHITELIST")
    if service_whitelist:
        service_whitelist = [s.strip() for s in service_whitelist.split(",")]
    
    logger.info("Starting Metadata Clearing Process...")

    try:
        # 1. Fetch Tables
        tables = om_client.get_tables()
        
        # Filter by service if provided
        if service_whitelist:
            tables = [t for t in tables if any(w.lower() in t.get("fullyQualifiedName", "").lower() for w in service_whitelist)]
            logger.info(f"Filtered to {len(tables)} tables matching services: {service_whitelist}")

        # Filter by table name if provided
        if table_filter:
            tables = [t for t in tables if table_filter.lower() in t["name"].lower()]
            logger.info(f"Filtered to {len(tables)} tables matching '{table_filter}'")

        if not tables:
            logger.warning("No tables found to clear.")
            return

        # 2. Clear Schema Descriptions (if targeted)
        if service_whitelist:
            # Collect unique schema IDs from targeted tables
            schema_ids = {t.get("databaseSchema", {}).get("id") for t in tables if t.get("databaseSchema")}
            for schema_id in schema_ids:
                if not schema_id: continue
                logger.info(f"Clearing description for schema {schema_id}...")
                try:
                    om_client.patch_schema(schema_id, [{"op": "remove", "path": "/description"}])
                except Exception:
                    # Might fail if already empty
                    pass

        # 3. Iterate and Clear Tables/Columns
        for table in tables:
            table_id = table.get("id")
            table_name = table.get("name")
            patches = []

            # Clear table description
            if table.get("description"):
                patches.append({"op": "remove", "path": "/description"})
            
            # Clear column descriptions
            columns = table.get("columns", [])
            for i, col in enumerate(columns):
                if col.get("description"):
                    patches.append({"op": "remove", "path": f"/columns/{i}/description"})

            if patches:
                logger.info(f"Clearing descriptions for table '{table_name}'...")
                om_client.patch_table(table_id, patches)

        logger.info("Metadata clearing completed.")

    except Exception as e:
        logger.error(f"Clearing script failed: {e}", exc_info=True)

if __name__ == "__main__":
    main()
