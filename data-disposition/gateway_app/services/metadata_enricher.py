# gateway_app/services/metadata_enricher.py
import logging
import json
import httpx
from typing import List, Dict, Any, Optional
from ..config.settings import settings
from .starrocks_executor import StarRocksExecutor

logger = logging.getLogger(__name__)

class MetadataEnricher:
    """
    Service to automatically generate and apply business descriptions to 
    metadata in OpenMetadata using an LLM. 
    Enhanced with data-sampling from StarRocks for better accuracy.
    """

    def __init__(self, om_client):
        """
        :param om_client: An instance of OpenMetadataClient to reuse for API calls.
        """
        self.om_client = om_client
        self.sr_executor = StarRocksExecutor()
        self.llm_url = (settings.LLM_BASE_URL or "").rstrip("/")
        self.llm_key = settings.LLM_API_KEY
        self.llm_model = settings.LLM_MODEL

    def _get_table_sample(self, table_fqn: str) -> Optional[str]:
        """Fetch a few sample rows from StarRocks to provide context to the LLM."""
        # OpenMetadata FQN structure for these services is typically:
        # service.database.schema.table (4 parts) OR service.database.table (3 parts)
        parts = table_fqn.split(".")
        
        if len(parts) == 4:
            # Structure: datalake-starrocks.default.db_name.table_name
            db_name = parts[2]
            table_name = parts[3]
        elif len(parts) == 3:
            # Structure: datalake-starrocks.db_name.table_name
            db_name = parts[1]
            table_name = parts[2]
        else:
            logger.warning(f"Unexpected FQN structure for sampling: {table_fqn}")
            return None
        
        # Increased limit to 100 as requested
        query = f"SELECT * FROM `{db_name}`.`{table_name}` LIMIT 100"
        try:
            result = self.sr_executor.execute_query(query)
            if result.get("is_error"):
                logger.warning(f"Failed to get sample for {table_fqn}: {result.get('text')}")
                return None
            
            # Use the executor's built-in formatting for a clean table view
            return result.get("text")
        except Exception as e:
            logger.error(f"Error fetching sample for {table_fqn}: {e}")
            return None

    def generate_batch_descriptions(
        self, 
        table_fqn: str, 
        items: List[Dict[str, str]], 
        sample_data: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Calls the LLM to generate descriptions for multiple items (schema/table/columns) in one go.
        Returns a mapping of name to description.
        """
        if not self.llm_url or not self.llm_key:
            return {}

        # Build a concise list of what needs descriptions
        items_list = "\n".join([f"- {item['type'].capitalize()}: {item['name']}" for item in items])
        
        prompt = (
            f"You are a data architect documenting the database elements associated with '{table_fqn}'.\n"
            f"Provide concise, professional business descriptions (max 2 sentences each) for the following items:\n"
            f"{items_list}\n"
        )
        
        if sample_data:
            prompt += f"\nUse this sample data from the table for context:\n{sample_data}\n"
            
        prompt += (
            "\nReturn your response as a valid JSON object where keys are the names exactly as listed above "
            "and values are the generated descriptions. Example: {\"name\": \"description\"}"
        )
        
        try:
            with httpx.Client(timeout=90.0) as client:
                resp = client.post(
                    f"{self.llm_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.llm_key}"},
                    json={
                        "model": self.llm_model,
                        "messages": [
                            {
                                "role": "system", 
                                "content": "You are a data documentation assistant. Always return valid JSON mapping names to descriptions."
                            },
                            {"role": "user", "content": prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "max_tokens": 3000
                    }
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"Error in batch generation for {table_fqn}: {e}")
            return {}

    def enrich_tables(self, tables: List[Dict[str, Any]], schema_whitelist: Optional[List[str]] = None):
        """
        Scans provided tables and generates descriptions for missing fields in batches.
        """
        processed_schemas = set()

        for table in tables:
            table_id = table.get("id")
            table_name = table.get("name")
            table_fqn = table.get("fullyQualifiedName", "")
            schema_info = table.get("databaseSchema")
            
            if not table_id or not table_name:
                continue

            # Filter by whitelist if provided
            if schema_whitelist is not None:
                if not any(w.lower() in table_fqn.lower() for w in schema_whitelist):
                    continue

            # Identify missing metadata
            to_enrich: List[Dict[str, Any]] = []
            
            # 1. Schema Level (Check if we need to enrich the database/schema)
            schema_id = None
            if schema_info and schema_info.get("id") not in processed_schemas:
                schema_id = schema_info.get("id")
                schema_name = schema_info.get("name")
                # OpenMetadata doesn't always provide schema description in table list
                # We'll include it in the batch if we find it's the first time we see this schema
                to_enrich.append({"name": schema_name, "type": "database/schema", "id": schema_id})
                processed_schemas.add(schema_id)

            # 2. Table Level
            if not table.get("description"):
                to_enrich.append({"name": table_name, "type": "table", "path": "/description"})
            
            # 3. Column Level
            columns = table.get("columns", [])
            for i, col in enumerate(columns):
                if not col.get("description"):
                    col_name = col.get("name")
                    if col_name:
                        to_enrich.append({"name": col_name, "type": "column", "path": f"/columns/{i}/description"})

            if not to_enrich:
                continue

            # Fetch sample data (100 rows)
            is_starrocks = "starrocks" in table_fqn.lower()
            sample_data = self._get_table_sample(table_fqn) if is_starrocks else None

            # Chunk the enrichment tasks if there are many (e.g., > 20 columns)
            # This avoids hitting output token limits with large JSON responses.
            chunk_size = 20
            all_results = {}
            
            logger.info(f"Enriching {len(to_enrich)} items for table '{table_name}' and its schema (100-row sampling)...")
            
            for i in range(0, len(to_enrich), chunk_size):
                chunk = to_enrich[i:i + chunk_size]
                if len(to_enrich) > chunk_size:
                    logger.info(f"Processing batch {i//chunk_size + 1} for '{table_name}'...")
                
                raw_results = self.generate_batch_descriptions(table_fqn, chunk, sample_data)
                
                try:
                    results = json.loads(raw_results) if isinstance(raw_results, str) else raw_results
                    if isinstance(results, dict):
                        # Normalize and add to master list
                        all_results.update({str(k).lower().strip(): v for k, v in results.items()})
                except Exception:
                    logger.error(f"Failed to parse LLM response batch for {table_name}")
                    continue

            table_patches = []
            for item in to_enrich:
                item_name = item["name"]
                desc = all_results.get(item_name.lower().strip())
                
                if not desc:
                    # Only warn if it's not a common system column
                    if not item_name.startswith("_"):
                        logger.warning(f"LLM omitted description for {item['type']} '{item_name}' in {table_name}")
                    continue

                if item["type"] == "database/schema":
                    # Patch schema separately
                    try:
                        self.om_client.patch_schema(item["id"], [{"op": "add", "path": "/description", "value": desc}])
                    except Exception as e:
                        logger.error(f"Failed to patch schema {item['name']}: {e}")
                else:
                    # Collect table/column patches
                    table_patches.append({"op": "add", "path": item["path"], "value": desc})

            if table_patches:
                try:
                    self.om_client.patch_table(table_id, table_patches)
                except Exception as e:
                    logger.error(f"Failed to patch table {table_name}: {e}")
        
        logger.info("\n" + "="*60 + "\n COMPLETED: Expanded Metadata Enrichment \n" + "="*60)

    def run_full_scan(self):
        """Fetches all tables and runs enrichment with targeted services if configured."""
        logger.info("Starting background data-aware metadata enrichment scan (100 rows)...")
        
        # Use whitelist from settings (already parsed as a Set[str])
        whitelist = list(settings.OPENMETADATA_SCHEMA_WHITELIST)
        
        try:
            all_tables = self.om_client.get_tables()
            if all_tables:
                # If whitelist is empty, it will process all tables (default behavior)
                # If whitelist has items, it will filter accordingly
                self.enrich_tables(all_tables, schema_whitelist=whitelist if whitelist else None)
                logger.info("Metadata enrichment scan completed.")
            else:
                logger.info("No tables found for enrichment.")
        except Exception as e:
            logger.error(f"Metadata enrichment scan failed: {e}")
