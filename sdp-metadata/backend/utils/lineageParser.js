const DAG_LAYER_PATTERNS = [
  { pattern: /^get_(csv|yaml|json)_/i,                                               layer: 'source',    transformation: 'extraction' },
  { pattern: /^put_(csv|yaml)_source_to_staging_|^push_(csv|yaml)_staging_(?!to)/i,  layer: 'staging',   transformation: 'staging_push' },
  { pattern: /^push_(csv|yaml)_staging_to_hdfs_/i,                                   layer: 'raw_hdfs',  transformation: 'hdfs_push' },
  { pattern: /^ingest_(csv_)?hdfs_to_hudi_/i,                                        layer: 'raw_hudi',  transformation: 'hudi_ingestion' },
  { pattern: /^create_(techsophy_|medunited_)?.*_curate[d]?$/i,                      layer: 'curated',   transformation: 'curation' },
  { pattern: /^create_(star_schema_|table_.*_service|.*_service(_delta)?$)/i,        layer: 'service',   transformation: 'service_load' },
  { pattern: /^(upload_|create_(daily|monthly)_)/i,                                  layer: 'reporting', transformation: 'reporting_upload' },
  { pattern: /^master_/i,                                                             layer: 'orchestrator', transformation: 'orchestration' },
];

const LAYER_ORDER = ['source', 'staging', 'raw_hdfs', 'raw_hudi', 'curated', 'service', 'reporting'];

// Strip all action/layer/format words and return the core pipeline identifier
const extractPipelineKey = (dagId) => {
  let s = dagId.toLowerCase();

  // Remove action prefixes
  s = s.replace(/^(get|put|push|ingest|create|upload|master)_/, '');
  // Remove format words
  s = s.replace(/^(csv|yaml|json)_/, '');
  // Remove known layer transition phrases
  s = s
    .replace(/^source_to_staging_/, '')
    .replace(/^staging_to_hdfs_/, '')
    .replace(/^hdfs_to_hudi_/, '')
    .replace(/^staging_/, '');
  // Remove known org prefixes
  // Remove org prefix dynamically — strip leading word(s) if what follows contains a layer keyword
  s = s.replace(/^[^_]+_(?=[^_]+_(curated|service|raw|staging|bi|report))/, '');
  // Remove trailing layer words
  s = s
    .replace(/_curated?$/, '')
    .replace(/_service(_delta)?$/, '')
    .replace(/_hdfs$/, '')
    .replace(/_hudi$/, '')
    .replace(/_staging$/, '');

  return s.trim() || dagId;
};

// Extract application name: the core entity name without generic source system suffixes
const extractApplication = (dagId) => {
  const key = extractPipelineKey(dagId);
  const parts = key.split('_');

  // Known generic source system suffixes to strip
  const genericSuffixes = ['postgres', 'postgresql', 'mongodb', 'mongo', 'mysql', 'mssql', 'oracle', 'archive', 'raw', 'dump'];

  if (parts.length > 1 && genericSuffixes.includes(parts[parts.length - 1])) {
    return parts.slice(0, -1).join('_');
  }
  return key;
};

// Extract the specific table/entity name within the pipeline (including source system)
const extractTableName = (dagId) => {
  return extractPipelineKey(dagId);
};

const detectLayer = (dagId) => {
  for (const { pattern, layer, transformation } of DAG_LAYER_PATTERNS) {
    if (pattern.test(dagId)) return { layer, transformation };
  }
  return { layer: 'unknown', transformation: 'unknown' };
};

const parseDagToLineage = (dags) => {
  const nodes = new Map();

  // Pass 1: create all nodes
  for (const dag of dags) {
    const dagId = dag.dag_id;
    const { layer, transformation } = detectLayer(dagId);
    if (layer === 'orchestrator' || layer === 'unknown') continue;

    const application = extractApplication(dagId);
    const tableName = extractTableName(dagId);
    const nodeId = `${layer}__${application}__${tableName}`;

    if (!nodes.has(nodeId)) {
      nodes.set(nodeId, {
        node_id: nodeId,
        layer,
        application,
        table_name: tableName,
        dag_id: dagId,
        transformation,
        last_run_state: dag.last_run_state,
        last_run_date: dag.last_run_start_date,
      });
    }
  }

  // Pass 2: group nodes by application → layer → [nodeIds]
  // Key insight: edges connect layers within the SAME APPLICATION,
  // regardless of the specific table name at each layer
  const appLayerMap = new Map();
  for (const [nodeId, node] of nodes) {
    if (!appLayerMap.has(node.application)) appLayerMap.set(node.application, new Map());
    const layerMap = appLayerMap.get(node.application);
    if (!layerMap.has(node.layer)) layerMap.set(node.layer, []);
    layerMap.get(node.layer).push(nodeId);
  }

  // Pass 3: create edges — connect consecutive layers within each application
  const edges = [];
  const edgeSet = new Set();

  for (const [, layerMap] of appLayerMap) {
    const presentLayers = LAYER_ORDER.filter(l => layerMap.has(l));

    for (let i = 0; i < presentLayers.length - 1; i++) {
      const srcLayer = presentLayers[i];
      const tgtLayer = presentLayers[i + 1];
      const srcNodes = layerMap.get(srcLayer);
      const tgtNodes = layerMap.get(tgtLayer);

      for (const srcId of srcNodes) {
        for (const tgtId of tgtNodes) {
          const edgeKey = `${srcId}||${tgtId}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              source_node_id: srcId,
              target_node_id: tgtId,
              dag_id: nodes.get(tgtId)?.dag_id || null,
              transformation_type: nodes.get(tgtId)?.transformation || 'pipeline',
            });
          }
        }
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
};

const LAYER_LABELS = {
  source:    { label: 'Source',    color: '#3b82f6' },
  staging:   { label: 'Staging',   color: '#8b5cf6' },
  raw_hdfs:  { label: 'Raw HDFS',  color: '#0ea5e9' },
  raw_hudi:  { label: 'Raw Hudi',  color: '#06b6d4' },
  curated:   { label: 'Curated',   color: '#10b981' },
  service:   { label: 'Service',   color: '#f59e0b' },
  reporting: { label: 'Reporting', color: '#ef4444' },
};

module.exports = { parseDagToLineage, detectLayer, extractApplication, LAYER_LABELS, LAYER_ORDER };