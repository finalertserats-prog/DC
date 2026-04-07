import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const NAV = [
  { path: '/home',        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Home' },
  { path: '/connections',  icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', label: 'Connections' },
  { path: '/profiling',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Profiling', sep: true },
  { path: '/lineage',      icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4', label: 'Lineage' },
  { path: '/quality',      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Quality' },
  { path: '/schema',       icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Schema', sep: true },
  { path: '/explore',      icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', label: 'Explore' },
  { path: '/audit',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', label: 'Audit' },
]

export default function Sidebar({ onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width: expanded ? 200 : 56,
        background: '#0d1117',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #161b22',
        flexShrink: 0,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      <div style={{ padding: '14px 10px 10px', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          <div style={{ width: 36, height: 36, background: '#0ea5e9', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </div>
          {expanded && <div>
            <div style={{ color: '#f0f6fc', fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>SDP Metadata</div>
            <div style={{ color: '#484f58', fontSize: 10, fontWeight: 500 }}>Platform v2</div>
          </div>}
        </div>
      </div>

      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(item => {
          const active = location.pathname === item.path
          return (
            <React.Fragment key={item.path}>
              {item.sep && <div style={{ height: 1, background: '#21262d', margin: '6px 0' }} />}
              <button
                onClick={() => navigate(item.path)}
                title={!expanded ? item.label : ''}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: active ? '#0ea5e915' : 'transparent',
                  color: active ? '#0ea5e9' : '#8b949e',
                  fontWeight: active ? 600 : 400, fontSize: 12,
                  marginBottom: 1, transition: 'all 0.12s',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.color = '#e6edf3' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8b949e' } }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d={item.icon} />
                </svg>
                {expanded && <span style={{ fontSize: 12 }}>{item.label}</span>}
                {active && <div style={{ width: 3, height: 16, background: '#0ea5e9', borderRadius: 2, marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            </React.Fragment>
          )
        })}
      </nav>

      <div style={{ padding: '8px', borderTop: '1px solid #21262d' }}>
        <button
          onClick={onLogout}
          title={!expanded ? 'Logout' : ''}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 7, border: 'none',
            background: 'transparent', color: '#f87171',
            fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
            textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {expanded && <span>Logout</span>}
        </button>
      </div>
    </div>
  )
}