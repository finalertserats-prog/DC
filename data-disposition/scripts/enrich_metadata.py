# scripts/enrich_metadata.py
"""
Manual script to trigger data-aware metadata enrichment.
Pulls sample data from StarRocks -> Generates descriptions via LLM -> Pushes to OpenMetadata.
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
from gateway_app.services.metadata_enricher import MetadataEnricher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    # 1. Initialize Clients
    om_client = OpenMetadataClient()
    enricher = MetadataEnricher(om_client)

    # 2. Configuration from environment
    table_filter = os.getenv("TABLE_NAME")
    dry_run = os.getenv("DRY_RUN", "true").lower() == "true"
    service_whitelist = os.getenv("SERVICE_WHITELIST")
    if service_whitelist:
        service_whitelist = [s.strip() for s in service_whitelist.split(",")]

    logger.info(f"Starting Manual Data-Aware Enrichment (Dry Run: {dry_run})...")

    try:
        # 3. Fetch Tables from OpenMetadata
        logger.info("Fetching tables from OpenMetadata...")
        tables = om_client.get_tables()
        
        # 4. Apply service filter
        if service_whitelist:
            tables = [t for t in tables if any(w.lower() in t.get("fullyQualifiedName", "").lower() for w in service_whitelist)]
            logger.info(f"Filtered to {len(tables)} tables matching services: {service_whitelist}")

        # 5. Apply table name filter
        if table_filter:
            tables = [t for t in tables if table_filter.lower() in t["name"].lower()]
            logger.info(f"Filtered to {len(tables)} tables matching '{table_filter}'")

        if not tables:
            logger.warning("No tables found to enrich.")
            return

        # 6. Run Enrichment
        if dry_run:
            logger.info("DRY RUN ENABLED: Fetching samples but skipping OpenMetadata PATCH.")
            for table in tables:
                table_name = table.get("name")
                table_fqn = table.get("fullyQualifiedName", "")
                
                # Check if it needs enrichment
                needs_enrichment = not table.get("description") or any(not c.get("description") for c in table.get("columns", []))
                
                if not needs_enrichment:
                    logger.info(f"Table '{table_name}' is already fully documented. Skipping.")
                    continue
                
                logger.info(f"Analyzing Table: {table_name} ({table_fqn})")
                if "starrocks" in table_fqn.lower():
                    sample = enricher._get_table_sample(table_fqn)
                    if sample:
                        logger.info(f"Found StarRocks sample data (100 rows):\n{sample}")
                    else:
                        logger.warning(f"Could not fetch sample data for {table_fqn}")
                else:
                    logger.info("Non-StarRocks table; skipping data sampling.")
        else:
            # Full execution using the service logic (now supports schema/db enrichment)
            enricher.enrich_tables(tables, schema_whitelist=service_whitelist)
            logger.info("\n" + "="*60 + "\n COMPLETED: Manual Expanded Metadata Enrichment \n" + "="*60)

    except Exception as e:
        logger.error(f"Enrichment script failed: {e}", exc_info=True)

if __name__ == "__main__":
    main()
