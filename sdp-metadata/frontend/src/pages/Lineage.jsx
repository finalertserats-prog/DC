import React, { useState, useEffect, useCallback } from 'react'
import api from '../utils/api.js'
import { S } from '../utils/styles.js'

const APP_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
  '#a855f7','#eab308','#6366f1','#22c55e','#fb923c',
  '#0891b2','#dc2626','#059669','#7c3aed','#db2777',
]

const LAYER_ORDER = ['raw_hudi','curated','service','bi']
const LAYER_LABELS = { raw_hudi:'Raw (Hudi)', curated:'Curated', service:'Service', bi:'BI / Reports' }

export default function Lineage() {
  const [conns, setConns] = useState([])
  const [hiveConn, setHiveConn] = useState('')
  const [srConn, setSrConn] = useState('')
  const [apps, setApps] = useState([])
  const [appColors, setAppColors] = useState({})
  const [selApp, setSelApp] = useState('')
  const [allNodes, setAllNodes] = useState([])
  const [allEdges, setAllEdges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [view, setView] = useState('table')

  // Table lineage state
  const [selNode, setSelNode] = useState(null)
  const [expandedLayers, setExpandedLayers] = useState({})

  // Column lineage state
  const [nodeColumns, setNodeColumns] = useState({})
  const [loadingCols, setLoadingCols] = useState(false)
  const [selColumn, setSelColumn] = useState(null)

  useEffect(() => {
    api.get('/connections').then(r => {
      setConns(r.data)
      const hive = r.data.find(c => c.type === 'hive')
      const sr = r.data.find(c => c.type === 'starrocks')
      if (hive) setHiveConn(String(hive.id))
      if (sr) setSrConn(String(sr.id))
    })
  }, [])

  const loadLineage = async () => {
    if (!hiveConn || !srConn) return setError('Select both connections')
    setLoading(true); setError(''); setMsg('')
    setSelApp(''); setSelNode(null); setSelColumn(null)
    setNodeColumns({}); setExpandedLayers({})
    try {
      const res = await api.post('/catalog/real-lineage', {
        hive_connection_id: Number(hiveConn),
        sr_connection_id: Number(srConn),
      })
      const nodes = res.data.nodes || []
      const edges = res.data.edges || []
      setAllNodes(nodes)
      setAllEdges(edges)
      const uniqueApps = [...new Set(nodes.map(n => n.application))].sort()
      const colors = {}
      uniqueApps.forEach((a, i) => { colors[a] = APP_COLORS[i % APP_COLORS.length] })
      setApps(uniqueApps)
      setAppColors(colors)
      setMsg(`${nodes.length} nodes · ${edges.length} edges · ${uniqueApps.length} applications`)
    } catch (e) { setError(e.response?.data?.error || 'Failed') }
    setLoading(false)
  }

  // Load ALL columns for ALL tables in selected app upfront
  const loadAllColumns = useCallback(async (app, nodes) => {
    const appNodes = nodes.filter(n => n.application === app)
    setLoadingCols(true)
    const results = {}
    await Promise.all(appNodes.map(async (node) => {
      const connId = node.source === 'starrocks' ? srConn : hiveConn
      try {
        const res = await api.post('/catalog/node/columns', {
          connection_id: Number(connId),
          db_name: node.db_name,
          table_name: node.table_name,
          source: node.source,
        })
        results[node.node_id] = res.data
      } catch(e) {
        results[node.node_id] = []
      }
    }))
    setNodeColumns(results)
    setLoadingCols(false)
  }, [hiveConn, srConn])

  const selectApp = (app) => {
    const newApp = app === selApp ? '' : app
    setSelApp(newApp)
    setSelNode(null); setSelColumn(null); setNodeColumns({})
    const expanded = {}
    LAYER_ORDER.forEach(l => { expanded[l] = true })
    setExpandedLayers(expanded)
    if (newApp) loadAllColumns(newApp, allNodes)
  }

  const appColor = appColors[selApp] || '#3b82f6'
  const appNodes = allNodes.filter(n => n.application === selApp)
  const byLayer = {}
  LAYER_ORDER.forEach(l => { byLayer[l] = [] })
  appNodes.forEach(n => {
    if (!byLayer[n.layer]) byLayer[n.layer] = []
    byLayer[n.layer].push(n)
  })
  const activeLayers = LAYER_ORDER.filter(l => byLayer[l]?.length > 0)

  const connectedNodeIds = new Set()
  if (selNode) {
    allEdges.forEach(e => {
      if (e.source_node_id === selNode.node_id) connectedNodeIds.add(e.target_node_id)
      if (e.target_node_id === selNode.node_id) connectedNodeIds.add(e.source_node_id)
    })
  }

  const getConnType = (node) => {
    if (!selNode) return null
    if (allEdges.some(e => e.source_node_id === selNode.node_id && e.target_node_id === node.node_id)) return 'downstream'
    if (allEdges.some(e => e.target_node_id === selNode.node_id && e.source_node_id === node.node_id)) return 'upstream'
    return null
  }

  // Column match — check across ALL app nodes
  const getColStatus = (nodeId, colName) => {
    if (!selColumn) return 'normal'
    const name = colName.toLowerCase()
    const sel = selColumn.toLowerCase()
    if (name === sel) return 'match'
    return 'normal'
  }

  // Get unique column name across all tables in app for highlighting
  const colExistsInLayer = (layer, colName) => {
    const layerNodes = byLayer[layer] || []
    return layerNodes.some(node => {
      const cols = nodeColumns[node.node_id] || []
      return cols.some(c => (c.name || c.Field || '').toLowerCase() === colName.toLowerCase())
    })
  }

  return (
    <div style={S.page} className="fade-in">
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={S.title}>Data lineage</div>
            <div style={S.sub}>{msg || 'Real metadata from Hive + StarRocks'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={hiveConn} onChange={e => setHiveConn(e.target.value)} style={S.select}>
              <option value="">Hive connection</option>
              {conns.filter(c => c.type === 'hive').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={srConn} onChange={e => setSrConn(e.target.value)} style={S.select}>
              <option value="">StarRocks connection</option>
              {conns.filter(c => c.type === 'starrocks').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={loadLineage} disabled={loading || !hiveConn || !srConn}
              style={{ ...S.btnPrimary, opacity: loading || !hiveConn || !srConn ? 0.7 : 1 }}>
              {loading
                ? <><svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>Loading...</>
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Load Lineage</>
              }
            </button>
          </div>
        </div>

        {error && <div style={{ marginTop: 8, padding: '7px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{error}</div>}

        {apps.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>App:</span>
            {apps.map(app => (
              <button key={app} onClick={() => selectApp(app)}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  border: `1.5px solid ${appColors[app]}`,
                  background: selApp === app ? appColors[app] : appColors[app] + '15',
                  color: selApp === app ? '#fff' : appColors[app],
                  cursor: 'pointer',
                }}>
                {app}
              </button>
            ))}
          </div>
        )}

        {selApp && (
          <div style={{ display: 'flex', gap: 0, marginTop: 12, borderBottom: '2px solid #f0f2f5' }}>
            {[{ id: 'table', label: 'Table lineage' }, { id: 'column', label: 'Column lineage' }].map(tab => (
              <button key={tab.id} onClick={() => { setView(tab.id); setSelColumn(null); setSelNode(null) }}
                style={{
                  padding: '7px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: view === tab.id ? 700 : 400,
                  color: view === tab.id ? appColor : '#64748b',
                  borderBottom: view === tab.id ? `2px solid ${appColor}` : '2px solid transparent',
                  marginBottom: -2,
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f5f7fa' }}>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 12 }}>
            <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Reading Hive and StarRocks metadata...</div>
          </div>
        )}

        {!loading && !selApp && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 8, color: '#9ca3af' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3 }}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#6b7280' }}>{apps.length > 0 ? 'Select an application above' : 'Load lineage to get started'}</div>
          </div>
        )}

        {/* TABLE LINEAGE */}
        {!loading && selApp && view === 'table' && (
          <>
            {selNode && (
              <div style={{ marginBottom: 12, padding: '8px 14px', background: appColor + '10', border: `1px solid ${appColor}30`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: appColor, fontWeight: 600, fontFamily: 'monospace' }}>{selNode.table_name}</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>· {connectedNodeIds.size} connected · blue=upstream · green=downstream</span>
                <button onClick={() => setSelNode(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', overflowX: 'auto' }}>
              {activeLayers.map((layer, li) => {
                const layerNodes = byLayer[layer]
                const isExpanded = expandedLayers[layer] !== false
                const hasHighlight = selNode && layerNodes.some(n => n.node_id === selNode.node_id || connectedNodeIds.has(n.node_id))
                return (
                  <React.Fragment key={layer}>
                    <div style={{ flexShrink: 0, width: 220 }}>
                      <div onClick={() => setExpandedLayers(prev => ({ ...prev, [layer]: !isExpanded }))}
                        style={{ background: hasHighlight ? appColor : appColor + 'cc', borderRadius: '10px 10px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <div style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>{LAYER_LABELS[layer]}</div>
                        <div style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{layerNodes.length}</div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                      <div style={{ background: '#fff', border: `1.5px solid ${appColor}40`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                        {isExpanded ? layerNodes.map((node, ni) => {
                          const selected = selNode?.node_id === node.node_id
                          const connType = getConnType(node)
                          const dimmed = selNode && !selected && !connType
                          return (
                            <div key={ni} onClick={() => setSelNode(selected ? null : node)}
                              style={{
                                padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: selected ? appColor : connType === 'downstream' ? '#ecfdf5' : connType === 'upstream' ? '#eff6ff' : 'transparent',
                                opacity: dimmed ? 0.35 : 1, transition: 'all 0.15s',
                                borderLeft: selected ? `3px solid ${appColor}` : connType === 'downstream' ? '3px solid #10b981' : connType === 'upstream' ? '3px solid #3b82f6' : '3px solid transparent',
                              }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: selected ? '#fff' : connType === 'downstream' ? '#10b981' : connType === 'upstream' ? '#3b82f6' : appColor + '40' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: selected || connType ? 600 : 400, color: selected ? '#fff' : '#1f2937', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.table_name}</div>
                                {connType && <div style={{ fontSize: 9, color: connType === 'downstream' ? '#059669' : '#2563eb', fontWeight: 600, marginTop: 1 }}>{connType === 'downstream' ? '↓ downstream' : '↑ upstream'}</div>}
                              </div>
                            </div>
                          )
                        }) : <div style={{ padding: '10px 14px', color: '#6b7280', fontSize: 11 }}>{layerNodes.length} tables — click to expand</div>}
                      </div>
                    </div>
                    {li < activeLayers.length - 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18, flexShrink: 0 }}>
                        <div style={{ width: 24, height: 2, background: appColor + '50' }} />
                        <svg width="8" height="12" viewBox="0 0 8 12" fill={appColor + '80'}><path d="M0,0 L8,6 L0,12 Z"/></svg>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </>
        )}

        {/* COLUMN LINEAGE */}
        {!loading && selApp && view === 'column' && (
          <>
            {/* Column search bar */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              {loadingCols ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
                  <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                  Loading all columns...
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {selColumn
                    ? <>Tracing <span style={{ fontFamily: 'monospace', fontWeight: 700, color: appColor, background: appColor + '15', padding: '2px 8px', borderRadius: 6 }}>{selColumn}</span> across all layers — highlighted in yellow</>
                    : 'Click any column to trace it across all layers'
                  }
                  {selColumn && <button onClick={() => setSelColumn(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>× clear</button>}
                </div>
              )}

              {/* Layer summary pills showing if selected column exists */}
              {selColumn && !loadingCols && (
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  {activeLayers.map(layer => {
                    const exists = colExistsInLayer(layer, selColumn)
                    return (
                      <span key={layer} style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                        background: exists ? appColor : '#f1f5f9',
                        color: exists ? '#fff' : '#9ca3af',
                        border: `1px solid ${exists ? appColor : '#e2e8f0'}`,
                      }}>
                        {exists ? '✓' : '✗'} {LAYER_LABELS[layer]}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* All layers side by side with all columns visible */}
            <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', overflowX: 'auto' }}>
              {activeLayers.map((layer, li) => {
                const layerNodes = byLayer[layer]
                return (
                  <React.Fragment key={layer}>
                    <div style={{ flexShrink: 0, width: 240 }}>
                      {/* Layer header */}
                      <div style={{ background: appColor, borderRadius: '10px 10px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>{LAYER_LABELS[layer]}</div>
                        <div style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{layerNodes.length}</div>
                      </div>

                      {/* All tables with all columns expanded */}
                      <div style={{ background: '#fff', border: `1.5px solid ${appColor}40`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                        {loadingCols ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                            <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" style={{ display: 'block', margin: '0 auto 6px' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                            Loading columns...
                          </div>
                        ) : layerNodes.map((node, ni) => {
                          const cols = nodeColumns[node.node_id] || []
                          const hasMatch = selColumn && cols.some(c => (c.name || c.Field || '').toLowerCase() === selColumn.toLowerCase())
                          return (
                            <div key={ni}>
                              {/* Table name header */}
                              <div style={{
                                padding: '7px 12px',
                                background: hasMatch ? appColor + '15' : '#fafbfc',
                                borderBottom: '1px solid #f1f5f9',
                                borderLeft: hasMatch ? `3px solid ${appColor}` : '3px solid transparent',
                                display: 'flex', alignItems: 'center', gap: 6,
                              }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasMatch ? appColor : appColor + '40', flexShrink: 0 }} />
                                <div style={{ fontSize: 11, fontWeight: 600, color: hasMatch ? appColor : '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {node.table_name}
                                </div>
                                <div style={{ marginLeft: 'auto', fontSize: 9, color: '#9ca3af' }}>{cols.length} cols</div>
                              </div>

                              {/* All columns */}
                              {cols.length === 0 ? (
                                <div style={{ padding: '6px 12px 6px 20px', fontSize: 10, color: '#d1d5db', fontStyle: 'italic' }}>No schema data</div>
                              ) : cols.map((col, ci) => {
                                const colName = col.name || col.Field || ''
                                const colType = (col.type || col.Type || '').split('(')[0].substring(0, 12)
                                const isMatch = selColumn && colName.toLowerCase() === selColumn.toLowerCase()
                                return (
                                  <div key={ci}
                                    onClick={() => setSelColumn(isMatch ? null : colName)}
                                    style={{
                                      padding: '5px 12px 5px 22px',
                                      borderBottom: '1px solid #f8f9fa',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      cursor: 'pointer',
                                      background: isMatch ? '#fef9c3' : 'transparent',
                                      borderLeft: isMatch ? '3px solid #f59e0b' : '3px solid transparent',
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isMatch) e.currentTarget.style.background = '#f8fafc' }}
                                    onMouseLeave={e => { if (!isMatch) e.currentTarget.style.background = 'transparent' }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{
                                        fontSize: 10, fontFamily: 'monospace',
                                        fontWeight: isMatch ? 700 : 400,
                                        color: isMatch ? '#92400e' : '#374151',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                                      }}>
                                        {colName}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace', flexShrink: 0 }}>{colType}</span>
                                    {isMatch && <span style={{ fontSize: 11, flexShrink: 0 }}>●</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {li < activeLayers.length - 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18, flexShrink: 0 }}>
                        <div style={{ width: 24, height: 2, background: appColor + '50' }} />
                        <svg width="8" height="12" viewBox="0 0 8 12" fill={appColor + '80'}><path d="M0,0 L8,6 L0,12 Z"/></svg>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}