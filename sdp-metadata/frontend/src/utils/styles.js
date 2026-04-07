export const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  content: { flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f5f7fa' },
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e8ebf0', overflow: 'hidden' },
  cardPad: { background: '#fff', borderRadius: 10, border: '1px solid #e8ebf0', padding: '16px 20px' },
  header: { padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e8ebf0', flexShrink: 0 },
  title: { fontSize: 15, fontWeight: 700, color: '#111827' },
  sub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  badge: (bg, color, border) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 20, fontSize: 9, fontWeight: 700, background: bg, color, border: `1px solid ${border}` }),
  btnPrimary: { height: 30, padding: '0 14px', borderRadius: 7, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 },
  btnGhost: { height: 30, padding: '0 14px', borderRadius: 7, border: '1px solid #e8ebf0', background: '#fff', color: '#374151', fontWeight: 500, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 },
  btnDanger: { height: 30, padding: '0 14px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 12 },
  input: { height: 32, padding: '0 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, background: '#fafbfc', outline: 'none', fontFamily: 'inherit' },
  select: { height: 32, padding: '0 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, background: '#fafbfc', outline: 'none', fontFamily: 'inherit' },
  th: { padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: '#6b7280', borderBottom: '1px solid #f0f2f5', background: '#fafbfc', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { padding: '7px 14px', borderBottom: '1px solid #f8f9fa', verticalAlign: 'middle', fontSize: 12 },
  mono: { fontFamily: "'SF Mono',Consolas,monospace", fontSize: 11, color: '#4b5563' },
  statCard: (accent) => ({ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e8ebf0', borderLeft: `3px solid ${accent}` }),
}

export const STATUS_BADGE = {
  'Active':       S.badge('#ecfdf5','#065f46','#a7f3d0'),
  'Low activity': S.badge('#fffbeb','#92400e','#fde68a'),
  'Inactive':     S.badge('#fef2f2','#991b1b','#fecaca'),
  'No data':      S.badge('#f8fafc','#64748b','#e2e8f0'),
  'Inherited':    S.badge('#f0f9ff','#0369a1','#bae6fd'),
  'pass':         S.badge('#ecfdf5','#065f46','#a7f3d0'),
  'fail':         S.badge('#fef2f2','#991b1b','#fecaca'),
}

export const CAT_BADGE = {
  'Core entity':   S.badge('#eff6ff','#1e40af','#bfdbfe'),
  'Custom fields': S.badge('#fefce8','#854d0e','#fef08a'),
  'Relationship':  S.badge('#f0fdf4','#166534','#bbf7d0'),
  'Audit':         S.badge('#fdf4ff','#6b21a8','#e9d5ff'),
  'Workflow':      S.badge('#fff7ed','#9a3412','#fed7aa'),
  'System':        S.badge('#f8fafc','#475569','#e2e8f0'),
  'Reporting':     S.badge('#f0f9ff','#0369a1','#bae6fd'),
}