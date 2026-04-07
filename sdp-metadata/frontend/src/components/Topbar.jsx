import React from 'react'
import { useLocation } from 'react-router-dom'

const PAGE_LABELS = {
  '/home': 'Home',
  '/connections': 'Connections',
  '/profiling': 'Profiling',
  '/lineage': 'Lineage',
  '/quality': 'Quality',
  '/schema': 'Schema monitor',
  '/explore': 'Explore',
  '/audit': 'Pipeline audit',
}

export default function Topbar({ connName = '' }) {
  const location = useLocation()
  const label = PAGE_LABELS[location.pathname] || ''
  const user = JSON.parse(localStorage.getItem('sdp_user') || '{}')

  return (
    <div style={{
      height: 48, background: '#fff', borderBottom: '1px solid #e8ebf0',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#6b7280' }}>SDP Metadata</span>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {connName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: 11, color: '#065f46', fontWeight: 500 }}>{connName}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#0ea5e9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700 }}>
            {(user.username || 'A')[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{user.username || 'Admin'}</span>
        </div>
      </div>
    </div>
  )
}