import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Connections from './pages/Connections.jsx'
import Profiling from './pages/Profiling.jsx'
import Lineage from './pages/Lineage.jsx'
import Quality from './pages/Quality.jsx'
import Schema from './pages/Schema.jsx'
import Explore from './pages/Explore.jsx'
import Audit from './pages/Audit.jsx'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('sdp_token'))

  const handleLogin = (t, user) => {
    localStorage.setItem('sdp_token', t)
    localStorage.setItem('sdp_user', JSON.stringify(user || {}))
    setToken(t)
  }

  const handleLogout = () => {
    localStorage.removeItem('sdp_token')
    localStorage.removeItem('sdp_user')
    setToken(null)
  }

  if (!token) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f7fa' }}>
        <Sidebar onLogout={handleLogout} />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/profiling" element={<Profiling />} />
              <Route path="/lineage" element={<Lineage />} />
              <Route path="/quality" element={<Quality />} />
              <Route path="/schema" element={<Schema />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  )
}