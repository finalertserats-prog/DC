import React, { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import api from '../utils/api.js'
import { S } from '../utils/styles.js'
import { formatNumber, formatDateTime } from '../utils/helpers.js'

const STATUS_COLOR = {
  PASS: { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', dot: '#10b981' },
  WARN: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  FAIL: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', dot: '#ef4444' },
  ERROR: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', dot: '#ef4444' },
}

const LAYER_COLORS = {
  raw_hudi: '#0ea5e9', curated: '#10b981', service: '#f59e0b', bi: '#8b5cf6',
}

function MiniBarChart({ data, color = '#0ea5e9' }) {
  const svgRef = useRef(null)
  useEffect(() => {
    if (!svgRef.current || !data?.length) return
    const W = 120, H = 36
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const x = d3.scaleBand().domain(data.map((_, i) => i)).range([0, W]).padding(0.2)
    const y = d3.scaleLinear().domain([0, Math.max(...data, 1)]).range([H, 0])
    svg.selectAll('rect').data(data).join('rect')
      .attr('x', (_, i) => x(i)).attr('y', d => y(d))
      .attr('width', x.bandwidth()).attr('height', d => H - y(d))
      .attr('fill', color).attr('rx', 2).attr('opacity', 0.8)
  }, [data, color])
  return <svg ref={svgRef} width={120} height={36} />
}

function DonutChart({ pass, warn, fail, size = 90 }) {
  const svgRef = useRef(null)
  const total = pass + warn + fail || 1
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const r = size / 2, ir = r * 0.65
    const data = [
      { value: pass, color: '#10b981' },
      { value: warn, color: '#f59e0b' },
      { value: fail, color: '#ef4444' },
    ].filter(d => d.value > 0)
    if (!data.length) data.push({ value: 1, color: '#e2e8f0' })
    const pie = d3.pie().value(d => d.value).sort(null)
    const arc = d3.arc().innerRadius(ir).outerRadius(r)
    const g = svg.append('g').attr('transform', `translate(${r},${r})`)
    g.selectAll('path').data(pie(data)).join('path').attr('d', arc).attr('fill', d => d.data.color)
    const pct = Math.round((pass / total) * 100)
    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em')
      .attr('font-size', size * 0.2).attr('font-weight', 700).attr('fill', '#111827').text(`${pct}%`)
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1.1em')
      .attr('font-size', size * 0.13).attr('fill', '#6b7280').text('healthy')
  }, [pass, warn, fail, size])
  return <svg ref={svgRef} width={size} height={size} />
}

export default function Quality() {
  const [conns, setConns] = useState([])
  const [airflowConn, setAirflowConn] = useState('')
  const [hiveConn, setHiveConn] = useState('')
  const [srConn, setSrConn] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [layerFilter, setLayerFilter] = useState('ALL')
  const [expandedDag, setExpandedDag] = useState(null)

  useEffect(() => {
    api.get('/connections').then(r => {
      setConns(r.data)
      const af = r.data.find(c => c.type === 'airflow')
      const hive = r.data.find(c => c.type === 'hive')
      const sr = r.data.find(c => c.type === 'starrocks')
      if (af) setAirflowConn(String(af.id))
      if (hive) setHiveConn(String(hive.id))
      if (sr) setSrConn(String(sr.id))
    })
  }, [])

  const runValidation = async () => {
    if (!airflowConn) return setError('Select Airflow connection')
    setRunning(true); setError(''); setMsg('')
    try {
      const res = await api.post('/validation/run-dag', {
        airflow_connection_id: Number(airflowConn),
        hive_connection_id: hiveConn ? Number(hiveConn) : null,
        sr_connection_id: srConn ? Number(srConn) : null,
        date_filter: dateFilter,
      })
      setResults(res.data.results || [])
      setSummary(res.data.summary)
      setMsg(`Validated ${res.data.summary.total_dags} DAG runs for ${dateFilter}`)
    } catch(e) {
      setError(e.response?.data?.error || 'Validation failed')
    }
    setRunning(false)
  }

  const activeLayers = ['ALL', ...new Set(results.map(r => r.layer).filter(Boolean))]

  const filtered = results.filter(r => {
    const matchSearch = !search ||
      r.dag_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.application?.toLowerCase().includes(search.toLowerCase()) ||
      r.db_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || r.overall_status === statusFilter
    const matchLayer = layerFilter === 'ALL' || r.layer === layerFilter
    return matchSearch && matchStatus && matchLayer
  })

  const pass = summary?.pass || 0
  const warn = summary?.warn || 0
  const fail = summary?.fail || 0
  const total = summary?.total_dags || 0

  // Compute table-level summary across all results
  const allTables = results.flatMap(r => (r.validations?.tables || []))
  const tablePass = allTables.filter(t => t.overall_status === 'PASS').length
  const tableWarn = allTables.filter(t => t.overall_status === 'WARN').length
  const tableFail = allTables.filter(t => t.overall_status === 'FAIL').length
  const totalRows = allTables.reduce((a, t) => a + (Number(t.row_count) || 0), 0)
  const pkIssues = allTables.filter(t => t.null_pk_count > 0 || t.duplicate_pk_count > 0).length

  return (
    <div style={S.page} className="fade-in">
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={S.title}>Data quality</div>
            <div style={S.sub}>DAG-aware validation — row counts, PK integrity, volume anomalies per pipeline</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ ...S.input, width: 140 }} />
            <select value={airflowConn} onChange={e => setAirflowConn(e.target.value)} style={S.select}>
              <option value="">Airflow</option>
              {conns.filter(c => c.type === 'airflow').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={hiveConn} onChange={e => setHiveConn(e.target.value)} style={S.select}>
              <option value="">Hive</option>
              {conns.filter(c => c.type === 'hive').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={srConn} onChange={e => setSrConn(e.target.value)} style={S.select}>
              <option value="">StarRocks</option>
              {conns.filter(c => c.type === 'starrocks').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={runValidation} disabled={running || !airflowConn}
              style={{ ...S.btnPrimary, opacity: running || !airflowConn ? 0.7 : 1, minWidth: 130 }}>
              {running
                ? <><svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>Validating...</>
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Run Validation</>
              }
            </button>
          </div>
        </div>
        {msg && <div style={{ marginTop: 8, padding: '7px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, color: '#065f46', fontWeight: 500 }}>✓ {msg}</div>}
        {error && <div style={{ marginTop: 8, padding: '7px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>{error}</div>}
        {running && <div style={{ marginTop: 8, padding: '7px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7, fontSize: 12, color: '#0369a1' }}>
          Fetching DAG runs and validating tables — may take a few minutes...
        </div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f5f7fa' }}>

        {/* Summary row */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
            <div style={{ ...S.cardPad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 130 }}>
              <DonutChart pass={pass} warn={warn} fail={fail} size={90} />
              <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', lineHeight: 1.6 }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>● {pass}</span> pass &nbsp;
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>● {warn}</span> warn &nbsp;
                <span style={{ color: '#ef4444', fontWeight: 700 }}>● {fail}</span> fail
              </div>
            </div>

            {[
              { label: 'DAGs validated', value: total, sub: dateFilter, accent: '#0ea5e9' },
              { label: 'Tables checked', value: allTables.length, sub: `${formatNumber(totalRows)} total rows`, accent: '#10b981' },
              { label: 'Table failures', value: tableFail, sub: `${tableWarn} warnings`, accent: '#ef4444' },
              { label: 'PK issues', value: pkIssues, sub: 'null or duplicate PKs', accent: '#f59e0b' },
              { label: 'Data health', value: allTables.length > 0 ? `${Math.round(tablePass/allTables.length*100)}%` : '—', sub: `${tablePass} of ${allTables.length} tables OK`, accent: '#8b5cf6' },
            ].map(({ label, value, sub, accent }) => (
              <div key={label} style={{ ...S.cardPad, borderLeft: `3px solid ${accent}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#111827' }}>{typeof value === 'number' ? formatNumber(value) : value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        )}

        {!summary && !running && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9ca3af' }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.4 }}>
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>Select connections and run validation</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Fetches today's DAG runs and validates the data they produced</div>
          </div>
        )}

        {results.length > 0 && (
          <div style={S.card}>
            {/* Filters */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search DAG, app or database..."
                style={{ ...S.input, width: 260 }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {['ALL','PASS','WARN','FAIL','ERROR'].map(s => {
                  const sc = STATUS_COLOR[s] || {}
                  const count = s === 'ALL' ? results.length : results.filter(r => r.overall_status === s).length
                  return (
                    <button key={s} onClick={() => setStatusFilter(s)} style={{
                      height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid',
                      borderColor: statusFilter === s ? (sc.dot || '#0ea5e9') : '#e2e8f0',
                      background: statusFilter === s ? (sc.bg || '#f0f9ff') : '#fff',
                      color: statusFilter === s ? (sc.color || '#0369a1') : '#6b7280',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>{s} ({count})</button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {activeLayers.map(l => (
                  <button key={l} onClick={() => setLayerFilter(l)} style={{
                    height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid',
                    borderColor: layerFilter === l ? (LAYER_COLORS[l] || '#0ea5e9') : '#e2e8f0',
                    background: layerFilter === l ? (LAYER_COLORS[l] || '#0ea5e9') + '20' : '#fff',
                    color: layerFilter === l ? (LAYER_COLORS[l] || '#0369a1') : '#6b7280',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>{l === 'ALL' ? 'All layers' : l.replace('_',' ')}</button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>{filtered.length} pipelines</div>
            </div>

            {/* DAG rows */}
            {filtered.map((r, i) => {
              const sc = STATUS_COLOR[r.overall_status] || STATUS_COLOR.PASS
              const tables = r.validations?.tables || []
              const isExpanded = expandedDag === r.dag_id
              const tPass = tables.filter(t => t.overall_status === 'PASS').length
              const tFail = tables.filter(t => t.overall_status === 'FAIL').length
              const tWarn = tables.filter(t => t.overall_status === 'WARN').length
              const totalTableRows = tables.reduce((a, t) => a + (Number(t.row_count) || 0), 0)

              return (
                <div key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <div onClick={() => setExpandedDag(isExpanded ? null : r.dag_id)}
                    style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isExpanded ? '#f8fafc' : '#fff', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#111827', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.dag_id}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                        {r.layer && <span style={{ fontSize: 9, fontWeight: 700, color: LAYER_COLORS[r.layer] || '#6b7280', background: (LAYER_COLORS[r.layer] || '#6b7280') + '15', padding: '1px 7px', borderRadius: 10, border: `1px solid ${LAYER_COLORS[r.layer] || '#e2e8f0'}40` }}>{r.layer?.replace('_',' ')}</span>}
                        {r.application && <span style={{ fontSize: 10, color: '#374151', fontWeight: 500 }}>{r.application}</span>}
                        {r.db_name && <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{r.db_name}</span>}
                        {tables.length > 0 && (
                          <span style={{ fontSize: 10, color: '#6b7280' }}>
                            {tables.length} table{tables.length !== 1 ? 's' : ''} · {formatNumber(totalTableRows)} rows
                            {tFail > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}> · {tFail} failed</span>}
                            {tWarn > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}> · {tWarn} warned</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    {r.duration_minutes && <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{r.duration_minutes}m</span>}
                    {r.start_date && <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{new Date(r.start_date).toLocaleTimeString()}</span>}

                    <span style={{ ...S.badge(sc.bg, sc.color, sc.border), flexShrink: 0 }}>{r.overall_status}</span>

                    {tables.length > 0 && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    )}
                  </div>

                  {/* Expanded table details */}
                  {isExpanded && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #e8ebf0', padding: '0 0 8px 0' }}>
                      {r.error && r.overall_status === 'ERROR' && (
                        <div style={{ padding: '8px 16px', fontSize: 11, color: '#991b1b', fontFamily: 'monospace', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          ⚠ {r.error}
                        </div>
                      )}

                      {tables.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              {['Table','Current rows','Previous rows','Δ%','PK column','Null PKs','Dup PKs','Volume','PK health','Status'].map(h => (
                                <th key={h} style={{ padding: '7px 14px', textAlign: h.includes('rows') || h.includes('Δ') || h.includes('PKs') ? 'right' : 'left', fontWeight: 600, fontSize: 10, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tables.map((t, ti) => {
                              const tsc = STATUS_COLOR[t.overall_status] || STATUS_COLOR.PASS
                              const vsc = STATUS_COLOR[t.volume_status] || STATUS_COLOR.PASS
                              const psc = STATUS_COLOR[t.pk_status] || STATUS_COLOR.PASS
                              const delta = t.previous_count != null && t.previous_count > 0
                                ? ((t.row_count - t.previous_count) / t.previous_count * 100).toFixed(1)
                                : null
                              const hasNullPk = t.null_pk_count > 0
                              const hasDupPk = t.duplicate_pk_count > 0

                              return (
                                <tr key={ti} style={{ borderBottom: '1px solid #f1f5f9', background: ti % 2 === 0 ? '#fff' : '#fafbfc' }}>
                                  <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{t.table_name}</td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatNumber(t.row_count)}</td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#6b7280' }}>{t.previous_count != null ? formatNumber(t.previous_count) : <span style={{ color: '#9ca3af' }}>first run</span>}</td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                    {delta != null
                                      ? <span style={{ fontWeight: 700, color: Number(delta) < -20 ? '#ef4444' : Number(delta) > 0 ? '#10b981' : '#6b7280' }}>{delta > 0 ? `+${delta}` : delta}%</span>
                                      : <span style={{ color: '#9ca3af' }}>—</span>
                                    }
                                  </td>
                                  <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: '#0369a1', fontSize: 10 }}>{t.pk_column || <span style={{ color: '#9ca3af' }}>not found</span>}</td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                    <span style={{ fontWeight: 700, color: hasNullPk ? '#ef4444' : '#10b981' }}>{t.null_pk_count != null ? t.null_pk_count : '—'}</span>
                                  </td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                    <span style={{ fontWeight: 700, color: hasDupPk ? '#ef4444' : '#10b981' }}>{t.duplicate_pk_count != null ? t.duplicate_pk_count : '—'}</span>
                                  </td>
                                  <td style={{ padding: '8px 14px' }}><span style={S.badge(vsc.bg, vsc.color, vsc.border)}>{t.volume_status}</span></td>
                                  <td style={{ padding: '8px 14px' }}><span style={S.badge(psc.bg, psc.color, psc.border)}>{t.pk_status}</span></td>
                                  <td style={{ padding: '8px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: tsc.dot }} />
                                      <span style={{ fontWeight: 700, color: tsc.color }}>{t.overall_status}</span>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}

                      {tables.length === 0 && r.dag_state === 'failed' && (
                        <div style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                          DAG failed — no table validation performed
                        </div>
                      )}

                      {tables.length === 0 && r.dag_state === 'success' && (
                        <div style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                          Could not find target tables for this DAG
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
