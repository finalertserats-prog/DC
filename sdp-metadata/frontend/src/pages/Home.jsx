import React, { useState, useEffect } from 'react'
import api from '../utils/api.js'
import { S } from '../utils/styles.js'
import { formatDate } from '../utils/helpers.js'

export default function Home() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/home/stats').then(r => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg className="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    </div>
  )

  const statCards = [
    { label: 'Connections', value: stats?.totals?.connections || 0, accent: '#0ea5e9', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    { label: 'Profiling runs', value: stats?.totals?.profiling_runs || 0, accent: '#10b981', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Quality rules', value: stats?.totals?.quality_rules || 0, accent: '#f59e0b', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { label: 'Schema changes (7d)', value: stats?.totals?.schema_changes_7d || 0, accent: '#ef4444', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  ]

  return (
    <div style={{ ...S.content }} className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <div style={S.title}>Overview</div>
        <div style={S.sub}>Your unified data intelligence hub</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {statCards.map(c => (
          <div key={c.label} style={S.statCard(c.accent)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: c.accent + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon}/></svg>
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Recent metadata updates</div>
          </div>
          <div>
            {!stats?.recent_activity?.length && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No recent activity</div>
            )}
            {stats?.recent_activity?.map((a, i) => (
              <div key={i} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f8f9fa' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1f2937' }}>{a.table_name}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, fontFamily: 'monospace' }}>{a.db_name}</div>
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{formatDate(a.last_updated)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Recent schema changes</div>
          </div>
          <div>
            {!stats?.recent_diffs?.length && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No schema changes detected</div>
            )}
            {stats?.recent_diffs?.map((d, i) => (
              <div key={i} style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f8f9fa' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1f2937', fontFamily: 'monospace' }}>{d.table_name}.<span style={{ color: '#0ea5e9' }}>{d.column_name}</span></div>
                  <div style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: d.diff_type === 'added' ? '#059669' : d.diff_type === 'dropped' ? '#ef4444' : '#f59e0b' }}>
                    {d.diff_type === 'added' ? '+ Added' : d.diff_type === 'dropped' ? '− Dropped' : '~ Type changed'}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{formatDate(d.detected_at)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Quality summary — last 24h</div>
          </div>
          <div style={{ padding: '16px', display: 'flex', gap: 16 }}>
            {stats?.quality_summary?.map(q => (
              <div key={q.status} style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 8, background: q.status === 'pass' ? '#ecfdf5' : '#fef2f2' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: q.status === 'pass' ? '#065f46' : '#991b1b' }}>{q.count}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: q.status === 'pass' ? '#065f46' : '#991b1b', textTransform: 'uppercase', marginTop: 2 }}>{q.status}</div>
              </div>
            ))}
            {!stats?.quality_summary?.length && <div style={{ color: '#9ca3af', fontSize: 12, width: '100%', textAlign: 'center', padding: '20px 0' }}>No quality checks run yet</div>}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f2f5' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Profiling summary — last 24h</div>
          </div>
          <div style={{ padding: '16px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stats?.profiling_summary?.map(p => {
              const colors = { Active: ['#ecfdf5','#065f46'], 'Low activity': ['#fffbeb','#92400e'], Inactive: ['#fef2f2','#991b1b'], 'No data': ['#f8fafc','#64748b'] }
              const [bg, color] = colors[p.status] || ['#f8fafc','#64748b']
              return (
                <div key={p.status} style={{ padding: '8px 14px', borderRadius: 8, background: bg }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{p.count}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', marginTop: 1 }}>{p.status}</div>
                </div>
              )
            })}
            {!stats?.profiling_summary?.length && <div style={{ color: '#9ca3af', fontSize: 12, width: '100%', textAlign: 'center', padding: '20px 0' }}>No profiling runs yet</div>}
          </div>
        </div>
      </div>
    </div>
  )
}