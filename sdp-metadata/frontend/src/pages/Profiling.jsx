import React, { useState, useEffect } from 'react'
import api from '../utils/api.js'
import { S, STATUS_BADGE, CAT_BADGE } from '../utils/styles.js'
import { formatNumber, formatDate } from '../utils/helpers.js'

const TABS = ['All', 'Core entity', 'Custom fields', 'Relationship', 'Audit', 'Workflow', 'System']

export default function Profiling() {
  const [conns, setConns] = useState([])
  const [selConn, setSelConn] = useState('')
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [catFilter, setCatFilter] = useState("All")
  const [error, setError] = useState("")

  useEffect(() => {
    api.get('/connections').then(r => {
      const f = r.data.filter(c => c.type !== 'airflow')
      setConns(f)
      if (f.length) { setSelConn(f[0].id); load(f[0].id) }
    })
  }, [])

  const load = (id) => api.get(`/profiling/history/${id}`).then(r => setResults(r.data))

  const run = async () => {
    if (!selConn) return
    setRunning(true)
    try {
      const res = await api.post('/profiling/run', { connection_id: selConn })
      setResults(res.data.results)
    } catch (err) { setError(err.response?.data?.error || "Profiling failed") }
    setRunning(false)
  }

  const filtered = results.filter(r => {
    const s = r.table_name?.toLowerCase().includes(search.toLowerCase())
    const st = statusFilter === 'All' || r.status === statusFilter
    const ct = catFilter === 'All' || r.category === catFilter
    return s && st && ct
  })

  const counts = {
    total: results.length,
    Active: results.filter(r => r.status === 'Active').length,
    'Low activity': results.filter(r => r.status === 'Low activity').length,
    Inactive: results.filter(r => r.status === 'Inactive').length,
    'No data': results.filter(r => r.status === 'No data').length,
  }

  return (
    <div style={S.page} className="fade-in">
      <div style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={S.title}>Data profiling</div>
            <div style={S.sub}>{results.length} tables · select a connection and run profiling</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={selConn}
              onChange={e => { setSelConn(e.target.value); load(e.target.value) }}
              style={S.select}
            >
              {conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => window.open(`/api/profiling/report/html/${selConn}`, '_blank')} style={S.btnGhost}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              HTML
            </button>
            <button onClick={() => window.open(`/api/profiling/report/pdf/${selConn}`, '_blank')} style={S.btnGhost}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              PDF
            </button>
            <button onClick={run} disabled={running || !selConn} style={{ ...S.btnPrimary, opacity: running ? 0.7 : 1 }}>
              {running
                ? <><svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>Running...</>
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Run Profiling</>
              }
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginTop: 16 }}>
            {[
              { label: 'Total tables', value: counts.total, accent: '#0ea5e9' },
              { label: 'Active', value: counts.Active, accent: '#10b981' },
              { label: 'Low activity', value: counts['Low activity'], accent: '#f59e0b' },
              { label: 'Inactive', value: counts.Inactive, accent: '#ef4444' },
              { label: 'No data', value: counts['No data'], accent: '#94a3b8' },
            ].map(c => (
              <div key={c.label} onClick={() => setStatusFilter(statusFilter === c.label ? 'All' : c.label)}
                style={{ ...S.statCard(c.accent), cursor: 'pointer', transition: 'all 0.1s', opacity: statusFilter !== 'All' && statusFilter !== c.label ? 0.5 : 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.accent }}>{c.value}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...S.content, padding: '16px 24px' }}>
        {results.length === 0 && !running && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9ca3af' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', display: 'block' }}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Select a connection and run profiling</div>
          </div>
        )}

        {results.length > 0 && (
          <div style={S.card}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f2f5', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter tables..."
                style={{ ...S.input, width: 200 }} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['All', ...new Set(results.map(r => r.category).filter(Boolean))].map(t => (
                  <button key={t} onClick={() => setCatFilter(t)} style={{
                    height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid',
                    borderColor: catFilter === t ? '#0ea5e9' : '#e2e8f0',
                    background: catFilter === t ? '#f0f9ff' : '#fff',
                    color: catFilter === t ? '#0369a1' : '#6b7280',
                    fontSize: 11, fontWeight: catFilter === t ? 600 : 400, cursor: 'pointer',
                  }}>{t}</button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>{filtered.length} tables</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Table','Category','PK','Total rows','Active','Deleted','Data since','Last modified','Incr. col','Load','Δ Change','Status'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <td style={{ ...S.td, ...S.mono, fontWeight: 500, color: '#111827' }}>{r.table_name}</td>
                      <td style={S.td}><span style={CAT_BADGE[r.category] || S.badge('#f8fafc','#475569','#e2e8f0')}>{r.category || '—'}</span></td>
                      <td style={{ ...S.td, ...S.mono }}>{r.pk_column || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{formatNumber(r.total_rows)}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: '#059669', fontWeight: 500 }}>{formatNumber(r.active_rows)}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: r.deleted_rows > 1000 ? '#ef4444' : '#6b7280' }}>{formatNumber(r.deleted_rows)}</td>
                      <td style={{ ...S.td, ...S.mono, color: '#6b7280' }}>{formatDate(r.data_since)}</td>
                      <td style={{ ...S.td, ...S.mono, color: '#6b7280' }}>{formatDate(r.last_modified)}</td>
                      <td style={{ ...S.td, ...S.mono, color: '#0369a1' }}>{r.incremental_col || '—'}</td>
                      <td style={S.td}>
                        <span style={r.load_type === 'incremental' ? S.badge('#f0fdf4','#166534','#bbf7d0') : S.badge('#f8fafc','#64748b','#e2e8f0')}>
                          {r.load_type || '—'}
                        </span>
                      </td>
                      <td style={S.td}>
                        {r.row_count_change != null
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: r.row_count_change > 0 ? '#059669' : r.row_count_change < 0 ? '#ef4444' : '#9ca3af' }}>
                              {r.row_count_change > 0 ? '+' : ''}{r.row_count_change}
                            </span>
                          : <span style={{ color: '#d1d5db' }}>—</span>
                        }
                      </td>
                      <td style={S.td}><span style={STATUS_BADGE[r.status] || S.badge('#f8fafc','#64748b','#e2e8f0')}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}