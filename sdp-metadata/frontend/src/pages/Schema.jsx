import React, { useState, useEffect } from 'react'
import api from '../utils/api.js'
import { formatDateTime } from '../utils/helpers.js'

const DIFF_COLORS = { added: '#059669', dropped: '#ef4444', type_changed: '#f59e0b' }
const DIFF_ICONS = { added: 'fa-plus', dropped: 'fa-minus', type_changed: 'fa-arrows-rotate' }

export default function Schema() {
  const [conns, setConns] = useState([])
  const [selConn, setSelConn] = useState('')
  const [diffs, setDiffs] = useState([])
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    api.get('/connections').then(r => {
      const filtered = r.data.filter(c => c.type !== 'airflow')
      setConns(filtered)
      if (filtered.length) { setSelConn(filtered[0].id); loadDiffs(filtered[0].id) }
    })
  }, [])

  const loadDiffs = (id) => api.get(`/schema/diffs/${id}`).then(r => setDiffs(r.data))

  const runSnapshot = async () => {
    if (!selConn) return
    setRunning(true)
    try {
      const res = await api.post(`/schema/snapshot/${selConn}`)
      alert(`Snapshot complete — ${res.data.tables_snapshotted} tables, ${res.data.diffs_detected} changes detected`)
      loadDiffs(selConn)
    } catch (err) {
      alert(err.response?.data?.error || 'Snapshot failed')
    }
    setRunning(false)
  }

  const filtered = diffs.filter(d => {
    const matchSearch = d.table_name?.toLowerCase().includes(filter.toLowerCase()) || d.column_name?.toLowerCase().includes(filter.toLowerCase())
    const matchType = typeFilter === 'all' || d.diff_type === typeFilter
    return matchSearch && matchType
  })

  const counts = {
    all: diffs.length,
    added: diffs.filter(d => d.diff_type === 'added').length,
    dropped: diffs.filter(d => d.diff_type === 'dropped').length,
    type_changed: diffs.filter(d => d.diff_type === 'type_changed').length,
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fade-in">
      <div style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Schema Monitor</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Track column changes across your database tables</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={selConn} onChange={e => { setSelConn(e.target.value); loadDiffs(e.target.value) }}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13 }}>
              {conns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={runSnapshot} disabled={running} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              {running ? <><i className="fas fa-circle-notch spin" style={{ marginRight: 6 }} />Running...</> : <><i className="fas fa-camera" style={{ marginRight: 6 }} />Take Snapshot</>}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search table or column..."
            style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, width: 260, outline: 'none' }} />
          {Object.entries(counts).map(([type, count]) => (
            <button key={type} onClick={() => setTypeFilter(type)} style={{
              padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${typeFilter === type ? (DIFF_COLORS[type] || '#6366f1') : '#e2e8f0'}`,
              background: typeFilter === type ? (DIFF_COLORS[type] || '#6366f1') + '15' : '#fff',
              color: typeFilter === type ? (DIFF_COLORS[type] || '#6366f1') : '#64748b',
              cursor: 'pointer', fontSize: 12, fontWeight: 600
            }}>
              {type === 'all' ? 'All' : type.replace('_', ' ')} ({count})
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px' }}>
        {diffs.length === 0 && !running && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
            <i className="fas fa-code-branch" style={{ fontSize: 40, marginBottom: 16, display: 'block' }} />
            <p style={{ fontSize: 15, fontWeight: 500 }}>No schema changes detected yet</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Take a snapshot to start tracking changes</p>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Change','Table','Column','Old type','New type','Detected at'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: DIFF_COLORS[d.diff_type], fontWeight: 600, fontSize: 11 }}>
                        <i className={`fas ${DIFF_ICONS[d.diff_type]}`} style={{ fontSize: 10 }} />
                        {d.diff_type?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, fontWeight: 500 }}>{d.table_name}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, color: '#6366f1' }}>{d.column_name}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{d.old_value || '—'}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11 }}>{d.new_value || '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#64748b' }}>{formatDateTime(d.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}