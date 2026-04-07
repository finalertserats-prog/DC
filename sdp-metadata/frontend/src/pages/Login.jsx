import React, { useState } from 'react'
import api from '../utils/api.js'

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', form)
      onLogin(res.data.token)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    }
    setLoading(false)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#0d1117' }}>
      <div style={{ width: 420, margin: 'auto', padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, background: '#0ea5e9', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </div>
          <h1 style={{ color: '#f0f6fc', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>SDP Metadata Platform</h1>
          <p style={{ color: '#484f58', fontSize: 13 }}>Sign in to your workspace</p>
        </div>
        <div style={{ background: '#161b22', borderRadius: 12, padding: 28, border: '1px solid #30363d' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</label>
              <input
                type="text" required value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: '1px solid #30363d', background: '#0d1117', color: '#f0f6fc', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
              <input
                type="password" required value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 7, border: '1px solid #30363d', background: '#0d1117', color: '#f0f6fc', fontSize: 13 }}
              />
            </div>
            {error && <div style={{ background: '#1a0a0a', border: '1px solid #6e1a1a', color: '#f87171', padding: '9px 12px', borderRadius: 7, fontSize: 12, marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: loading ? '#0369a1' : '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: 13 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: '#484f58', fontSize: 11, marginTop: 16 }}>Default: admin / admin123</p>
      </div>
    </div>
  )
}