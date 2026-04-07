import React, { useState, useEffect } from 'react'
import api from '../utils/api.js'
import { formatNumber, getTypeColor } from '../utils/helpers.js'

export default function Explore() {
  const [conns, setConns] = useState([])
  const [selConn, setSelConn] = useState('')
  const [dbs, setDbs] = useState([])
  const [selDb, setSelDb] = useState('')
  const [tables, setTables] = useState([])
  const [selTable, setSelTable] = useState('')
  const [schema, setSchema] = useState(null)
  const [preview, setPreview] = useState(null)
  const [columnProfile, setColumnProfile] = useState({})
  const [profilingCol, setProfilingCol] = useState(null)
  const [tab, setTab] = useState('schema')
  const [query, setQuery] = useState('')
  const [queryResults, setQueryResults] = useState(null)
  const [queryError, setQueryError] = useState('')
  const [loading, setLoading] = useState({})
  const [colSearch, setColSearch] = useState('')

  useEffect(() => {
    api.get('/connections').then(r => {
      const filtered = r.data.filter(c => c.type !== 'airflow')
      setConns(filtered)
    })
  }, [])

  const setLoad = (key, val) => setLoading(prev => ({ ...prev, [key]: val }))

  const loadDbs = async (connId) => {
    setSelConn(connId); setSelDb(''); setTables([]); setSelTable(''); setSchema(null); setPreview(null)
    setLoad('dbs', true)
    try { const r = await api.post('/explore/databases', { connection_id: connId }); setDbs(r.data) }
    catch (e) { alert(e.response?.data?.error || 'Failed to load databases') }
    setLoad('dbs', false)
  }

  const loadTables = async (db) => {
    setSelDb(db); setSelTable(''); setSchema(null); setPreview(null)
    setLoad('tables', true)
    try { const r = await api.post('/explore/tables', { connection_id: selConn, db_name: db }); setTables(r.data) }
    catch (e) { alert(e.response?.data?.error || 'Failed to load tables') }
    setLoad('tables', false)
  }

  const loadSchema = async (table) => {
    setSelTable(table); setPreview(null); setColumnProfile({}); setTab('schema')
    setQuery(`SELECT * FROM \`${selDb}\`.\`${table}\` LIMIT 10`)
    setLoad('schema', true)
    try { const r = await api.post('/explore/schema', { connection_id: selConn, db_name: selDb, table_name: table }); setSchema(r.data) }
    catch (e) { alert(e.response?.data?.error || 'Failed to load schema') }
    setLoad('schema', false)
  }

  const loadPreview = async () => {
    if (preview) return
    setLoad('preview', true)
    try { const r = await api.post('/explore/preview', { connection_id: selConn, db_name: selDb, table_name: selTable }); setPreview(r.data) }
    catch (e) { alert(e.response?.data?.error || 'Failed to load preview') }
    setLoad('preview', false)
  }

  const profileColumn = async (col) => {
    setProfilingCol(col)
    try { const r = await api.post('/explore/profile-column', { connection_id: selConn, db_name: selDb, table_name: selTable, column_name: col }); setColumnProfile(prev => ({ ...prev, [col]: r.data })) }
    catch (e) { alert('Column profiling failed') }
    setProfilingCol(null)
  }

  const runQuery = async () => {
    setQueryError(''); setQueryResults(null)
    setLoad('query', true)
    try { const r = await api.post('/explore/query', { connection_id: selConn, db_name: selDb, query }); setQueryResults(r.data) }
    catch (e) { setQueryError(e.response?.data?.error || 'Query failed') }
    setLoad('query', false)
  }

  const filteredSchema = schema?.schema?.filter(r => {
    const fieldName = r.Field || r.col_name || Object.values(r)[0]
    return !colSearch || fieldName?.toLowerCase().includes(colSearch.toLowerCase())
  })

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} className="fade-in">
      <div style={{ width: 240, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 14px', borderBottom: '1px solid #f1f5f9' }}>
          <select value={selConn} onChange={e => loadDbs(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12 }}>
            <option value="">Select connection</option>
            {conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {loading.dbs && <div style={{ textAlign: 'center', padding: 20 }}><i className="fas fa-circle-notch spin" style={{ color: '#6366f1' }} /></div>}
          {dbs.map(db => (
            <div key={db}>
              <button onClick={() => loadTables(db)} style={{
                width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: selDb === db ? '#eef2ff' : 'transparent', color: selDb === db ? '#4f46e5' : '#374151',
                fontWeight: selDb === db ? 600 : 400, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
              }}>
                <i className="fas fa-database" style={{ fontSize: 11, opacity: 0.6 }} />{db}
              </button>
              {selDb === db && (
                <div style={{ paddingLeft: 16 }}>
                  {loading.tables && <div style={{ padding: 8, fontSize: 11, color: '#94a3b8' }}>Loading...</div>}
                  {tables.map(t => (
                    <button key={t} onClick={() => loadSchema(t)} style={{
                      width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      background: selTable === t ? '#6366f1' : 'transparent', color: selTable === t ? '#fff' : '#64748b',
                      fontSize: 11, marginBottom: 1
                    }}>
                      <i className="fas fa-table" style={{ marginRight: 6, fontSize: 10 }} />{t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selTable ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8' }}>
            <i className="fas fa-compass" style={{ fontSize: 48, marginBottom: 16 }} />
            <p style={{ fontSize: 15, fontWeight: 500 }}>Select a table to explore</p>
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{selDb}.{selTable}</span>
                  {schema?.total_rows !== undefined && <span style={{ marginLeft: 10, fontSize: 12, color: '#94a3b8' }}>{formatNumber(schema.total_rows)} rows</span>}
                </div>
                {schema?.recent_diffs?.length > 0 && (
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    <i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />{schema.recent_diffs.length} schema change{schema.recent_diffs.length > 1 ? 's' : ''} detected
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', padding: '0 20px', gap: 0 }}>
                {['schema', 'preview', 'profiling', 'workbench'].map(t => (
                  <button key={t} onClick={() => { setTab(t); if (t === 'preview') loadPreview() }} style={{
                    padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontWeight: tab === t ? 600 : 400, fontSize: 13,
                    color: tab === t ? '#6366f1' : '#64748b',
                    borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
                    textTransform: 'capitalize'
                  }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {tab === 'schema' && (
                <>
                  <input value={colSearch} onChange={e => setColSearch(e.target.value)} placeholder="Filter columns..."
                    style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, width: 220, marginBottom: 12, outline: 'none' }} />
                  {loading.schema ? <div style={{ textAlign: 'center', padding: 40 }}><i className="fas fa-circle-notch spin" style={{ color: '#6366f1', fontSize: 24 }} /></div> : (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['Column', 'Type', 'Null', 'Key', 'Default', 'Description'].map(h => (
                              <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSchema?.map((col, i) => {
                            const fieldName = col.Field || col.col_name || Object.values(col)[0]
                            const dataType = col.Type || col.data_type || ''
                            const comment = schema?.metadata?.column_comments?.[fieldName]
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 500, color: '#1e293b' }}>{fieldName}</td>
                                <td style={{ padding: '8px 14px' }}>
                                  <span style={{ color: getTypeColor(dataType), background: getTypeColor(dataType) + '15', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, fontFamily: 'monospace' }}>{dataType}</span>
                                </td>
                                <td style={{ padding: '8px 14px', fontSize: 11, color: '#94a3b8' }}>{col.Null || '—'}</td>
                                <td style={{ padding: '8px 14px', fontSize: 11, color: '#94a3b8' }}>{col.Key || '—'}</td>
                                <td style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{col.Default !== undefined ? String(col.Default) : '—'}</td>
                                <td style={{ padding: '8px 14px', fontSize: 11, color: comment ? '#1e293b' : '#cbd5e1', fontStyle: comment ? 'normal' : 'italic' }}>{comment || 'No description'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {tab === 'preview' && (
                <>
                  {loading.preview ? <div style={{ textAlign: 'center', padding: 40 }}><i className="fas fa-circle-notch spin" style={{ color: '#6366f1', fontSize: 24 }} /></div> : preview?.length > 0 ? (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {Object.keys(preview[0]).map(k => (
                              <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontFamily: 'monospace', textTransform: 'uppercase' }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} style={{ padding: '7px 12px', fontSize: 11, fontFamily: 'monospace', color: v === null ? '#cbd5e1' : '#374151', whiteSpace: 'nowrap' }}>
                                  {v === null ? 'NULL' : String(v).substring(0, 60)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No data available</div>}
                </>
              )}

              {tab === 'profiling' && (
                <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Column', 'Type', 'Nulls %', 'Distinct', 'Min', 'Max', 'Top values', 'Action'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schema?.schema?.map((col, i) => {
                        const fieldName = col.Field || col.col_name || Object.values(col)[0]
                        const dataType = col.Type || col.data_type || ''
                        const profile = columnProfile[fieldName]
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 500 }}>{fieldName}</td>
                            <td style={{ padding: '8px 14px' }}><span style={{ color: getTypeColor(dataType), fontSize: 10, fontFamily: 'monospace' }}>{dataType}</span></td>
                            <td style={{ padding: '8px 14px', fontSize: 11 }}>{profile ? `${profile.total_rows > 0 ? ((profile.null_count / profile.total_rows) * 100).toFixed(1) : 0}%` : '—'}</td>
                            <td style={{ padding: '8px 14px', fontSize: 11 }}>{profile ? formatNumber(profile.distinct_count) : '—'}</td>
                            <td style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.min_val ?? '—'}</td>
                            <td style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.max_val ?? '—'}</td>
                            <td style={{ padding: '8px 14px', fontSize: 10, color: '#64748b' }}>
                              {profile?.top_values?.map((v, vi) => (
                                <span key={vi} style={{ marginRight: 4, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{String(v.value).substring(0, 12)}</span>
                              ))}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <button onClick={() => profileColumn(fieldName)} disabled={profilingCol === fieldName} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 500, color: '#6366f1' }}>
                                {profilingCol === fieldName ? <i className="fas fa-circle-notch spin" /> : 'Profile'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'workbench' && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <textarea value={query} onChange={e => setQuery(e.target.value)} rows={6}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <button onClick={runQuery} disabled={loading.query} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      {loading.query ? <><i className="fas fa-circle-notch spin" style={{ marginRight: 6 }} />Running...</> : <><i className="fas fa-play" style={{ marginRight: 6 }} />Run Query</>}
                    </button>
                    <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>Read-only · max 100 rows · values are masked</span>
                  </div>
                  {queryError && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}>{queryError}</div>}
                  {queryResults && queryResults.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {Object.keys(queryResults[0]).map(k => (
                              <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontFamily: 'monospace', textTransform: 'uppercase' }}>{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResults.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} style={{ padding: '7px 12px', fontSize: 11, fontFamily: 'monospace', color: v === null ? '#cbd5e1' : '#374151' }}>
                                  {v === null ? 'NULL' : String(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}