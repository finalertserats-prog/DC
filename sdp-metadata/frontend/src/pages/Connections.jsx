import React, { useState, useEffect } from 'react'
import api from '../utils/api.js'

const TYPES = ['suitecrm', 'mysql', 'postgres', 'postgresql', 'starrocks', 'hive', 'airflow', 'mongodb']

const TYPE_COLORS = {
  suitecrm: '#6366f1', mysql: '#f59e0b', postgres: '#0ea5e9', postgresql: '#0ea5e9',
  starrocks: '#10b981', hive: '#f97316', airflow: '#8b5cf6', mongodb: '#22c55e',
}

const initForm = {
  name: '', type: 'mysql', host: '', port: '', username: '', password: '',
  database_name: '', sr_username: '', sr_password: '', ui_url: '',
  connection_string: '', description: ''
}

const Field = ({ label, field, type, placeholder, required, value, onChange }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase' }}>{label}</label>
    <input type={type || 'text'} required={required} value={value || ''} placeholder={placeholder || ''}
      onChange={onChange}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
  </div>
)

export default function Connections() {
  const [conns, setConns] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(initForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/connections').then(r => setConns(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const openAdd = () => { setEditId(null); setForm(initForm); setTestResult(null); setShowModal(true) }
  const openEdit = (c) => {
    setEditId(c.id)
    setForm({ ...initForm, ...c, password: '***', sr_password: c.sr_password ? '***' : '' })
    setTestResult(null); setShowModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      if (editId) await api.put(`/connections/${editId}`, form)
      else await api.post('/connections', form)
      setShowModal(false); load()
    } catch (err) { alert(err.response?.data?.error || 'Failed to save') }
    setSaving(false)
  }

  const del = async (id) => {
    if (!confirm('Delete this connection?')) return
    await api.delete(`/connections/${id}`); load()
  }

  const testConn = async () => {
    setTesting(true); setTestResult(null)
    try {
      await api.post('/connections/test', form)
      setTestResult({ ok: true, msg: 'Connection successful!' })
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.message || 'Connection failed' })
    }
    setTesting(false)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32 }} className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Connections</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Manage your data source connections</p>
        </div>
        <button onClick={openAdd} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          + Add Connection
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <i className="fas fa-circle-notch spin" style={{ fontSize: 28, color: '#6366f1' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {conns.map(c => (
            <div key={c.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px', transition: 'box-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: (TYPE_COLORS[c.type] || '#64748b') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-database" style={{ color: TYPE_COLORS[c.type] || '#64748b', fontSize: 16 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{c.masked_host}:{c.port}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                    <i className="fas fa-pen" />
                  </button>
                  <button onClick={() => del(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TYPE_COLORS[c.type] || '#64748b', background: (TYPE_COLORS[c.type] || '#64748b') + '15', padding: '3px 10px', borderRadius: 20 }}>
                  {c.type}
                </span>
                {c.description && <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.description.substring(0, 30)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 500, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editId ? 'Edit' : 'Add'} Connection</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <form onSubmit={save}>

              <Field label="Name" field="name" required value={form.name} onChange={set('name')} />

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase' }}>Type</label>
                <select value={form.type} onChange={set('type')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 13 }}>
                  {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>

              {form.type === 'mongodb' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase' }}>Connection String</label>
                    <input value={form.connection_string || ''} onChange={set('connection_string')}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      placeholder="mongodb://user:pass@host:27017/db?authSource=admin" />
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Paste full connection string — or fill fields below</div>
                  </div>
                  <Field label="Database name" field="database_name" value={form.database_name} onChange={set('database_name')} />
                  <Field label="Host" field="host" value={form.host} onChange={set('host')} />
                  <Field label="Port" field="port" type="number" value={form.port} onChange={set('port')} />
                  <Field label="Username" field="username" value={form.username} onChange={set('username')} />
                  <Field label="Password" field="password" type="password" value={form.password} onChange={set('password')} />
                </>
              )}

              {form.type !== 'mongodb' && (
                <>
                  <Field label="Host" field="host" required value={form.host} onChange={set('host')} />
                  <Field label="Port" field="port" type="number" required value={form.port} onChange={set('port')} />
                  <Field label="Username" field="username" value={form.username} onChange={set('username')} />
                  <Field label="Password" field="password" type="password" value={form.password} onChange={set('password')} />
                  <Field label="Database name" field="database_name" value={form.database_name} onChange={set('database_name')} />
                </>
              )}

              {form.type === 'airflow' && (
                <Field label="Airflow UI URL" field="ui_url" value={form.ui_url} onChange={set('ui_url')} placeholder="https://host:8080" />
              )}

              {form.type === 'hive' && (
                <>
                  <Field label="StarRocks username (for schema)" field="sr_username" value={form.sr_username} onChange={set('sr_username')} placeholder="root" />
                  <Field label="StarRocks password" field="sr_password" type="password" value={form.sr_password} onChange={set('sr_password')} />
                </>
              )}

              <Field label="Description" field="description" value={form.description} onChange={set('description')} />

              {testResult && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: testResult.ok ? '#d1fae5' : '#fee2e2', color: testResult.ok ? '#065f46' : '#991b1b', fontSize: 13 }}>
                  {testResult.msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={testConn} disabled={testing}
                  style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
