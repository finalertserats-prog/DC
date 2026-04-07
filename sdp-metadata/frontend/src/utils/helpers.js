export const formatNumber = (n) => {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

export const formatDate = (d) => {
  if (!d) return '—'
  return new Date(d).toISOString().split('T')[0]
}

export const formatDateTime = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
}

export const getStatusColor = (status) => {
  switch(status) {
    case 'Active': return { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' }
    case 'Low activity': return { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }
    case 'Inactive': return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    case 'pass': return { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' }
    case 'fail': return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    default: return { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' }
  }
}

export const getTypeColor = (type) => {
  const t = String(type).toLowerCase()
  if (t.includes('int') || t.includes('float') || t.includes('decimal') || t.includes('double')) return '#059669'
  if (t.includes('char') || t.includes('text') || t.includes('string') || t.includes('varchar')) return '#6366f1'
  if (t.includes('date') || t.includes('time')) return '#d946ef'
  if (t.includes('bool') || t.includes('bit') || t.includes('tinyint')) return '#f59e0b'
  return '#64748b'
}