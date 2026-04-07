import React, { useState, useEffect, useMemo } from 'react'
import api from '../utils/api.js'
import { S } from '../utils/styles.js'
import { formatNumber, formatDateTime } from '../utils/helpers.js'

const STATE_COLOR = {
  success: { bg:'#ecfdf5', color:'#065f46', border:'#a7f3d0', dot:'#10b981' },
  failed:  { bg:'#fef2f2', color:'#991b1b', border:'#fecaca', dot:'#ef4444' },
  running: { bg:'#eff6ff', color:'#1e40af', border:'#bfdbfe', dot:'#3b82f6' },
  queued:  { bg:'#f8fafc', color:'#64748b', border:'#e2e8f0', dot:'#94a3b8' },
}

export default function Audit() {
  const [conns, setConns] = useState([])
  const [selConn, setSelConn] = useState('')
  const [stats, setStats] = useState(null)
  const [dags, setDags] = useState([])
  const [uiUrl, setUiUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('All')
  const [page, setPage] = useState(1)
  const [selRun, setSelRun] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const PER_PAGE = 50

  useEffect(() => {
    api.get('/connections').then(r => {
      const af = r.data.filter(c => c.type === 'airflow')
      setConns(af)
      if (af.length) setSelConn(String(af[0].id))
    })
  }, [])

  useEffect(() => { if (selConn) fetchData() }, [selConn, dateFilter])

  const fetchData = () => {
    setLoading(true); setError('')
    api.post('/audit/fetch', { connection_id: Number(selConn), date_filter: dateFilter || null })
      .then(r => {
        setStats(r.data.stats || {})
        setDags(r.data.dags || [])
        setUiUrl(r.data.airflow_ui_url || '')
        setPage(1)
      })
      .catch(e => setError(e.response?.data?.error || 'Failed to fetch audit data'))
      .finally(() => setLoading(false))
  }

  const fetchTasks = (dag_id, run_id) => {
    if (!run_id) return
    if (selRun?.run_id === run_id) { setSelRun(null); setTasks([]); return }
    setSelRun({ dag_id, run_id })
    setLoadingTasks(true)
    api.post('/audit/tasks', { connection_id: Number(selConn), dag_id, run_id })
      .then(r => setTasks(r.data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false))
  }

  const TABS = ['All', 'Active', 'Paused', 'Running', 'Failed']

  const filtered = useMemo(() => {
    return (dags || []).filter(d => {
      const matchSearch = !search || d.dag_id?.toLowerCase().includes(search.toLowerCase())
      const matchTab = tab === 'All' ? true
        : tab === 'Active' ? !d.is_paused
        : tab === 'Paused' ? d.is_paused
        : tab === 'Running' ? d.last_run_state === 'running'
        : tab === 'Failed' ? d.last_run_state === 'failed'
        : true
      return matchSearch && matchTab
    })
  }, [dags, search, tab])

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const tabCount = (t) => {
    if (t === 'All') return dags.length
    if (t === 'Active') return dags.filter(d => !d.is_paused).length
    if (t === 'Paused') return dags.filter(d => d.is_paused).length
    if (t === 'Running') return dags.filter(d => d.last_run_state === 'running').length
    if (t === 'Failed') return dags.filter(d => d.last_run_state === 'failed').length
    return 0
  }

  return (
    <div style={S.page} className="fade-in">
      <div style={S.header}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={S.title}>Pipeline audit</div>
            <div style={S.sub}>DAG runs, task status and pipeline health from Airflow</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ ...S.input, width:140 }} />
            <select value={selConn} onChange={e => setSelConn(e.target.value)} style={S.select}>
              {conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={fetchData} style={S.btnSecondary} disabled={loading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'spin' : ''}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            {uiUrl && (
              <a href={uiUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...S.btnSecondary, textDecoration:'none', display:'flex', alignItems:'center', gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                Airflow UI
              </a>
            )}
          </div>
        </div>

        {error && <div style={{ marginTop:8, padding:'7px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, fontSize:12, color:'#991b1b' }}>{error}</div>}

        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:10, marginTop:14 }}>
            {[
              { label:'Total runs', value: formatNumber(stats.total_runs || 0) },
              { label:'Today', value: formatNumber(stats.today_runs || 0), accent:'#0ea5e9' },
              { label:'Success', value: formatNumber(stats.success || 0), accent:'#10b981' },
              { label:'Failed', value: formatNumber(stats.failed || 0), accent:'#ef4444' },
              { label:'Running', value: formatNumber(stats.running || 0), accent:'#3b82f6' },
              { label:'Total tasks', value: formatNumber(stats.total_tasks || 0) },
              { label:'Total hrs', value: Number(stats.total_hours || 0).toFixed(2), accent:'#8b5cf6' },
              { label:'Avg min', value: Number(stats.avg_minutes || 0).toFixed(2) },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{ background:'#fff', borderRadius:8, padding:'10px 12px', border:'1px solid #e8ebf0', borderTop: accent ? `2px solid ${accent}` : '1px solid #e8ebf0' }}>
                <div style={{ fontSize:10, fontWeight:600, color:'#6b7280', textTransform:'uppercase', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:700, color: accent || '#111827' }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px 24px', background:'#f5f7fa' }}>
        {loading && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, gap:10 }}>
            <svg className="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span style={{ fontSize:13, color:'#6b7280' }}>Loading DAGs...</span>
          </div>
        )}

        {!loading && dags.length > 0 && (
          <div style={S.card}>
            {/* Search + tabs */}
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f2f5', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search DAGs..." style={{ ...S.input, width:260 }} />
              <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid #e2e8f0' }}>
                {TABS.map(t => (
                  <button key={t} onClick={() => { setTab(t); setPage(1) }}
                    style={{ padding:'5px 12px', border:'none', borderRight:'1px solid #e2e8f0', background: tab===t ? '#0ea5e9' : '#fff', color: tab===t ? '#fff' : '#6b7280', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    {t} ({tabCount(t)})
                  </button>
                ))}
              </div>
              <div style={{ marginLeft:'auto', fontSize:11, color:'#6b7280' }}>
                Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#fafbfc' }}>
                    {['DAG ID','State','Last run status','Last run time','Schedule','Next run','Action'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((d, i) => {
                    const sc = STATE_COLOR[d.last_run_state] || {}
                    const isSelected = selRun?.dag_id === d.dag_id
                    return (
                      <React.Fragment key={i}>
                        <tr
                          style={{ borderBottom:'1px solid #f1f5f9', background: isSelected ? '#f0f9ff' : '#fff', cursor:'pointer' }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background='#f8fafc' }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background='#fff' }}
                          onClick={() => fetchTasks(d.dag_id, d.run_id)}
                        >
                          <td style={{ ...S.td, fontFamily:'monospace', fontWeight:500, color:'#111827', maxWidth:300 }}>
                            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.dag_id}</div>
                          </td>
                          <td style={S.td}>
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:10, background: d.is_paused ? '#f8fafc' : '#ecfdf5', color: d.is_paused ? '#64748b' : '#065f46', border: d.is_paused ? '1px solid #e2e8f0' : '1px solid #a7f3d0' }}>
                              {d.is_paused ? 'Paused' : 'Active'}
                            </span>
                          </td>
                          <td style={S.td}>
                            {d.last_run_state ? (
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <div style={{ width:7, height:7, borderRadius:'50%', background: sc.dot || '#94a3b8' }} />
                                <span style={{ fontWeight:600, color: sc.color || '#6b7280' }}>{d.last_run_state}</span>
                              </div>
                            ) : <span style={{ color:'#9ca3af' }}>—</span>}
                          </td>
                          <td style={{ ...S.td, color:'#6b7280', fontSize:11 }}>
                            {d.last_run_start_date ? formatDateTime(d.last_run_start_date) : '—'}
                          </td>
                          <td style={{ ...S.td, fontFamily:'monospace', fontSize:10, color:'#6b7280' }}>
                            {d.schedule_interval && d.schedule_interval !== 'null' ? d.schedule_interval.replace(/^"|"$/g,'') : '—'}
                          </td>
                          <td style={{ ...S.td, fontSize:11, color:'#6b7280' }}>
                            {d.next_dagrun ? new Date(d.next_dagrun).toLocaleString() : '—'}
                          </td>
                          <td style={S.td}>
                            {d.run_id && (
                              <button onClick={e => { e.stopPropagation(); fetchTasks(d.dag_id, d.run_id) }}
                                style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:'1px solid #e2e8f0', background:'#fff', color:'#374151', cursor:'pointer' }}>
                                Tasks
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Task details row */}
                        {isSelected && (
                          <tr style={{ background:'#f8fafc' }}>
                            <td colSpan={7} style={{ padding:'0 0 8px 32px' }}>
                              {loadingTasks ? (
                                <div style={{ padding:'10px', color:'#6b7280', fontSize:12 }}>Loading tasks...</div>
                              ) : tasks.length > 0 ? (
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                  <thead>
                                    <tr>
                                      {['Task ID','State','Start','End','Duration','Operator'].map(h => (
                                        <th key={h} style={{ padding:'5px 10px', textAlign:'left', fontWeight:600, fontSize:10, color:'#6b7280', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tasks.map((t, ti) => {
                                      const tsc = STATE_COLOR[t.state] || {}
                                      const dur = t.start_date && t.end_date
                                        ? ((new Date(t.end_date) - new Date(t.start_date)) / 1000).toFixed(1) + 's'
                                        : '—'
                                      return (
                                        <tr key={ti} style={{ borderBottom:'1px solid #f1f5f9' }}>
                                          <td style={{ padding:'5px 10px', fontFamily:'monospace', color:'#374151' }}>{t.task_id}</td>
                                          <td style={{ padding:'5px 10px' }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                              <div style={{ width:6, height:6, borderRadius:'50%', background: tsc.dot || '#94a3b8' }} />
                                              <span style={{ fontWeight:600, color: tsc.color || '#6b7280' }}>{t.state}</span>
                                            </div>
                                          </td>
                                          <td style={{ padding:'5px 10px', color:'#6b7280', fontSize:10 }}>{t.start_date ? formatDateTime(t.start_date) : '—'}</td>
                                          <td style={{ padding:'5px 10px', color:'#6b7280', fontSize:10 }}>{t.end_date ? formatDateTime(t.end_date) : '—'}</td>
                                          <td style={{ padding:'5px 10px', color:'#6b7280' }}>{dur}</td>
                                          <td style={{ padding:'5px 10px', fontFamily:'monospace', color:'#6b7280', fontSize:10 }}>{t.operator}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <div style={{ padding:'10px', color:'#9ca3af', fontSize:12 }}>No tasks found</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding:'10px 16px', borderTop:'1px solid #f0f2f5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6b7280' }}>Page {page} of {totalPages}</span>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#fff', fontSize:11, cursor:'pointer', opacity: page===1 ? 0.5 : 1 }}>← Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#fff', fontSize:11, cursor:'pointer', opacity: page===totalPages ? 0.5 : 1 }}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
