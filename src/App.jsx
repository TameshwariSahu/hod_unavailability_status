import { useEffect, useState } from 'react'
import './app.css'
import { api } from './api'

const starterDepartments = [
  { id: 1, name: 'Information Technology' },
  { id: 2, name: 'Human Resources' },
  { id: 3, name: 'Finance' },
]
const starterHods = [
  { id: 1, sap: '100245', name: 'Ravi Kumar', department: 1 },
  { id: 2, sap: '100389', name: 'Priya Sharma', department: 2 },
  { id: 3, sap: '100476', name: 'Anil Verma', department: 3 },
]
const starterRecords = [
  { id: 1, hod: 1, reason: 'OUT OF STATION', from: '2026-09-04T09:00', to: '2026-09-06T18:00', alternate: 3, status: 'UNAVAILABLE' },
  { id: 2, hod: 2, reason: 'MEDICAL', from: '2026-09-08T09:00', to: '2026-09-09T18:00', alternate: '', status: 'UNAVAILABLE' },
]
const blank = { hod: '', reason: 'MEETING', from: '', to: '', alternate: '', remarks: '' }
const reasonOptions = ['LEAVE', 'MEDICAL', 'MEETING', 'OTHER', 'OUT OF STATION']

export default function App() {
  const [page, setPage] = useState('Dashboard')
  const [departments, setDepartments] = useState(starterDepartments)
  const [hods, setHods] = useState(starterHods)
  const [records, setRecords] = useState(starterRecords)
  const [message, setMessage] = useState('')
  const [dept, setDept] = useState('')
  const [hodForm, setHodForm] = useState({ sap: '', name: '', department: '' })
  const [recordForm, setRecordForm] = useState(blank)
  const [token, setToken] = useState(localStorage.getItem('hod_token'))
  const [users, setUsers] = useState([])
  const [pwForm, setPwForm] = useState({ user: '', password: '', confirm: '' })
  const [theme, setTheme] = useState(localStorage.getItem('hod_theme') || 'light')
  const [filterHod, setFilterHod] = useState('')
  const [filterReason, setFilterReason] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [sortKey, setSortKey] = useState('reason')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('hod_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const hname = id => hods.find(x => x.id === Number(id))?.name || '—'
  const dname = id => departments.find(x => x.id === Number(id))?.name || '—'

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // Dashboard list: apply HOD / reason / department filters, then sort.
  const dashboardRecords = records
    .filter(r => {
      if (filterHod && r.hod !== Number(filterHod)) return false
      if (filterReason && r.reason !== filterReason) return false
      if (filterDept) {
        const h = hods.find(x => x.id === r.hod)
        if (!h || h.department !== Number(filterDept)) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const primary = r =>
        sortKey === 'hod' ? hname(r.hod).toLowerCase()
        : sortKey === 'department' ? (dname(hods.find(x => x.id === r.hod)?.department) || '').toLowerCase()
        : sortKey === 'reason' ? r.reason.toLowerCase()
        : new Date(r.from).getTime()
      // Alphabetical tiebreakers so the list always reads A→Z regardless of column.
      const tie = r => `${r.reason.toLowerCase()}|${(dname(hods.find(x => x.id === r.hod)?.department) || '').toLowerCase()}|${hname(r.hod).toLowerCase()}`
      const av = primary(a), bv = primary(b)
      if (av < bv) return -dir
      if (av > bv) return dir
      const ta = tie(a), tb = tie(b)
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })

  const hasFilter = filterHod || filterReason || filterDept
  const clearFilters = () => { setFilterHod(''); setFilterReason(''); setFilterDept('') }

  const loadData = async () => {
    try {
      const [dbDepts, dbHods, dbRecords] = await Promise.all([
        api.departments(),
        api.hods(),
        api.statuses(),
      ])
      setDepartments(dbDepts.map(x => ({ id: Number(x.id), name: x.department_name })))
      setHods(dbHods.map(x => ({ id: Number(x.id), sap: x.sap_id, name: x.name, department: Number(x.department_id) })))
      setRecords(dbRecords.map(x => ({
        id: Number(x.id),
        hod: Number(x.hod_id),
        reason: x.reason.replace('_', ' '),
        from: x.from_datetime,
        to: x.to_datetime,
        alternate: x.alternate_hod_id ? Number(x.alternate_hod_id) : '',
        status: x.availability_status,
        remarks: x.remarks,
      })))
    } catch (err) {
      setMessage(err.message)
    }
  }

  useEffect(() => { if (token) loadData() }, [token])
  useEffect(() => { if (token && page === 'Users') loadUsers() }, [token, page])

  const addDept = async e => {
    e.preventDefault()
    if (!dept.trim()) return
    try {
      await api.createDepartment(dept.trim())
      setDept('')
      await loadData()
      setMessage('Department saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  const addHod = async e => {
    e.preventDefault()
    if (!hodForm.sap || !hodForm.name || !hodForm.department) return
    try {
      await api.createHod({ sap_id: hodForm.sap, name: hodForm.name, department_id: Number(hodForm.department) })
      setHodForm({ sap: '', name: '', department: '' })
      await loadData()
      setMessage('HOD member saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  const addRecord = async e => {
    e.preventDefault()
    if (!recordForm.hod || !recordForm.from || !recordForm.to) return
    // Date-only inputs: treat the start as 00:00 and the end as 23:59 so a
    // same-day range is still a valid "to > from" span for the backend.
    const fromStr = `${recordForm.from}T00:00:00`
    const toStr = `${recordForm.to}T23:59:59`
    if (new Date(toStr) <= new Date(fromStr)) { setMessage('End date must be on or after the start date.'); return }
    try {
      await api.createStatus({
        hod_id: Number(recordForm.hod),
        availability_status: 'UNAVAILABLE',
        reason: recordForm.reason.replace(' ', '_'),
        from_datetime: fromStr,
        to_datetime: toStr,
        remarks: recordForm.remarks,
        alternate_hod_id: recordForm.alternate ? Number(recordForm.alternate) : null,
      })
      setRecordForm(blank)
      await loadData()
      setMessage('Availability status saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  const loadUsers = async () => {
    try {
      setUsers((await api.users()).map(x => ({
        id: Number(x.id),
        username: x.username,
        role: x.role,
        hodName: x.hod_name || '',
        isActive: x.is_active,
        createdAt: x.created_at,
      })))
    } catch (err) {
      setMessage(err.message)
    }
  }

  const setPassword = async e => {
    e.preventDefault()
    if (!pwForm.user || !pwForm.password || !pwForm.confirm) return
    if (pwForm.password.length < 8) { setMessage('Password must be at least 8 characters.'); return }
    if (pwForm.password !== pwForm.confirm) { setMessage('Passwords do not match.'); return }
    try {
      await api.setPassword(Number(pwForm.user), pwForm.password)
      setPwForm({ user: '', password: '', confirm: '' })
      setMessage('Password updated successfully.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  const nav = ['Dashboard', 'Department Master', 'HOD Master', 'Availability Status', 'Calendar', 'Users', 'Reports']

  if (!token) {
    return <Login onLogin={data => { localStorage.setItem('hod_token', data.token); setToken(data.token) }} />
  }

  return (
    <div className="app">
      <aside>
        <div className="brand"><b>HOD</b> Availability</div>
        <small>Management System</small>
        <nav>
          {nav.map(n => (
            <button key={n} className={page === n ? 'active' : ''} onClick={() => setPage(n)}>
              {n}
            </button>
          ))}
        </nav>
        <div className="admin">
          Administrator
          <br />
          <small>System Admin </small>
          <button className="logout" onClick={() => { localStorage.removeItem('hod_token'); setToken('') }}>
             Log out
          </button>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <h1>{page}</h1>
            <p>Track HOD availability, departments, and alternate contacts.</p>
          </div>
          <div className="head-actions">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="primary" onClick={() => setPage('Availability Status')}>
              + Add status
            </button>
          </div>
        </header>

        {message && (
          <div className="notice">
            {message}
            <button onClick={() => setMessage('')}>×</button>
          </div>
        )}

        {page === 'Dashboard' && (
          <>
            <section className="stats">
              <Card t="Total HODs" v={hods.length} />
              <Card t="Departments" v={departments.length} />
              <Card t="Unavailable records" v={records.filter(x => x.status === 'UNAVAILABLE').length} />
              <Card t="Available records" v={records.filter(x => x.status === 'AVAILABLE').length} />
            </section>
            <section className="grid">
              <Panel title="Current / scheduled unavailability">
                <div className="filterbar">
                  <select value={filterHod} onChange={e => setFilterHod(e.target.value)}>
                    <option value="">All HODs</option>
                    {hods.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                  <select value={filterReason} onChange={e => setFilterReason(e.target.value)}>
                    <option value="">All reasons</option>
                    {reasonOptions.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
                    <option value="">All departments</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {hasFilter && (
                    <button className="clear-btn" onClick={clearFilters}>Clear filters</button>
                  )}
                  <span className="filter-count">{dashboardRecords.length} of {records.length}</span>
                </div>
                <Records
                  records={dashboardRecords}
                  hods={hods}
                  hname={hname}
                  dname={dname}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  showStatus={false}
                />
              </Panel>
            </section>
          </>
        )}

        {page === 'Department Master' && (
          <section className="split">
            <Panel title="Add department">
              <form onSubmit={addDept}>
                <label>
                  Department name
                  <input required value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Operations" />
                </label>
                <button className="primary">Save department</button>
              </form>
            </Panel>
            <Panel title="Departments">
              <table>
                <thead>
                  <tr><th>ID</th><th>Name</th><th>HOD count</th></tr>
                </thead>
                <tbody>
                  {departments.map(x => (
                    <tr key={x.id}>
                      <td>{x.id}</td>
                      <td>{x.name}</td>
                      <td>{hods.filter(h => h.department === x.id).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        )}

        {page === 'HOD Master' && (
          <section className="split">
            <Panel title="Add HOD member">
              <form onSubmit={addHod}>
                <label>
                  SAP ID <small>(exactly 8 digits)</small>
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    maxLength="8"
                    title="SAP ID must contain exactly 8 digits"
                    value={hodForm.sap}
                    onChange={e => setHodForm({ ...hodForm, sap: e.target.value.replace(/\D/g, '') })}
                  />
                </label>
                <label>
                  Full name
                  <input required value={hodForm.name} onChange={e => setHodForm({ ...hodForm, name: e.target.value })} />
                </label>
                <label>
                  Department
                  <select required value={hodForm.department} onChange={e => setHodForm({ ...hodForm, department: e.target.value })}>
                    <option value="">Select department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <button className="primary">Save HOD</button>
              </form>
            </Panel>
            <Panel title="HOD members">
              <table>
                <thead>
                  <tr><th>SAP ID</th><th>Name</th><th>Department</th></tr>
                </thead>
                <tbody>
                  {hods.map(h => (
                    <tr key={h.id}>
                      <td>{h.sap}</td>
                      <td>{h.name}</td>
                      <td>{dname(h.department)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        )}

        {page === 'Availability Status' && (
          <section className="split">
            <Panel title="Record availability status">
              <form onSubmit={addRecord}>
                <label>
                  HOD
                  <select required value={recordForm.hod} onChange={e => setRecordForm({ ...recordForm, hod: e.target.value })}>
                    <option value="">Select HOD</option>
                    {hods.map(h => (
                      <option key={h.id} value={h.id}>{h.name} — {dname(h.department)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason
             <select
  value={recordForm.reason}
  onChange={e => setRecordForm({ ...recordForm, reason: e.target.value })}
>
  {reasonOptions.map(x => (
    <option key={x} value={x}>
      {x}
    </option>
  ))}
</select>
                </label>
                <div className="two">
                  <label>
                    From
                    <input required type="date" value={recordForm.from} onChange={e => setRecordForm({ ...recordForm, from: e.target.value })} />
                  </label>
                  <label>
                    To
                    <input required type="date" value={recordForm.to} onChange={e => setRecordForm({ ...recordForm, to: e.target.value })} />
                  </label>
                </div>
                <label>
                  Alternate HOD
                  <select value={recordForm.alternate} onChange={e => setRecordForm({ ...recordForm, alternate: e.target.value })}>
                    <option value="">None</option>
                    {hods.filter(h => h.id !== Number(recordForm.hod)).map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Remarks
                  <textarea value={recordForm.remarks} onChange={e => setRecordForm({ ...recordForm, remarks: e.target.value })} />
                </label>
                <button className="primary">Save status</button>
              </form>
            </Panel>
            <Panel title="Availability records">
              <p>
                Each saved item is published immediately and includes the HOD, period, reason,
                alternate HOD, remarks, and availability status.
              </p>
            </Panel>
          </section>
        )}

        {page === 'Calendar' && (
          <Calendar records={records} hname={hname} />
        )}

        {page === 'Users' && (
          <section className="split">
            <Panel title="Set user password">
              <form onSubmit={setPassword}>
                <label>
                  Select user
                  <select required value={pwForm.user} onChange={e => setPwForm({ ...pwForm, user: e.target.value })}>
                    <option value="">Choose a user…</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.username}{u.hodName ? ` (${u.hodName})` : ''} — {u.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={pwForm.password}
                    onChange={e => setPwForm({ ...pwForm, password: e.target.value })}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    required
                    value={pwForm.confirm}
                    onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                  />
                </label>
                <button className="primary">Update password</button>
              </form>
            </Panel>
            <Panel title="Users">
              {users.length === 0
                ? <p>No users found.</p>
                : (
                  <table>
                    <thead>
                      <tr><th>Username</th><th>Role</th><th>HOD</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>{u.username}</td>
                          <td><em className={u.role === 'ADMIN' ? 'roleadmin' : 'rolehod'}>{u.role}</em></td>
                          <td>{u.hodName || '—'}</td>
                          <td><em className={u.isActive ? 'approved' : 'pending'}>{u.isActive ? 'Active' : 'Inactive'}</em></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </Panel>
          </section>
        )}

        {page === 'Reports' && (
          <Panel title="Availability history">
            <Records records={records} hods={hods} hname={hname} dname={dname} />
          </Panel>
        )}
      </main>
    </div>
  )
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const submit = async e => {
    e.preventDefault()
    try {
      if (mode === 'setup') {
        await api.setup({ username, password })
        setMessage('Administrator created. Now sign in.')
        setMode('login')
      } else {
        onLogin(await api.login({ username, password }))
      }
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brand"><b>HOD</b> Availability</div>
        <h1>{mode === 'setup' ? 'Create first admin' : 'Admin sign in'}</h1>
        <p>
          {mode === 'setup'
            ? 'This works only once, before any user exists.'
            : 'Use the administrator account created during setup.'}
        </p>
        {message && <div className="notice">{message}</div>}
        <label>
          Username
          <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            type="password"
            minLength="8"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="primary">{mode === 'setup' ? 'Create admin' : 'Sign in'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'setup' ? 'login' : 'setup')}>
          {mode === 'setup' ? 'Already have an account? Sign in' : 'First-time setup? Create admin'}
        </button>
      </form>
    </div>
  )
}

function Card({ t, v }) {
  return (
    <div className="card">
      <span>{t}</span>
      <strong>{v}</strong>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Calendar({ records, hname }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })
  const [selected, setSelected] = useState(null)

  const monthLabel = cursor.m.toLocaleString('en-IN', { month: 'long' })

  // Map each day of the visible month to the unavailability records falling on it
  const dayMap = {}
  records.filter(r => r.status === 'UNAVAILABLE').forEach(r => {
    for (let d = new Date(r.from); d <= new Date(r.to); d.setDate(d.getDate() + 1)) {
      const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
      if (d.getFullYear() === cursor.y && d.getMonth() === cursor.m) {
        ;(dayMap[key] = dayMap[key] || []).push(r)
      }
    }
  })

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const today = new Date()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(<td key={'blank-' + i} />)
  for (let day = 1; day <= daysInMonth; day++) {
    const recs = dayMap[cursor.y + '-' + cursor.m + '-' + day] || []
    const isToday = today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === day
    cells.push(
      <td key={day} className={'calcell' + (recs.length ? ' unavailable' : '') + (isToday ? ' today' : '') + (selected === day ? ' selected' : '')} onClick={() => setSelected(selected === day ? null : day)}>
        <span className="calnum">{day}</span>
        {recs.length > 0 && <span className="calflag">{recs.length} unavailable</span>}
      </td>
    )
  }

  const move = delta => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(null)
  }

  return (
    <section className="panel calendar">
      <div className="calhead">
        <div className="caltabs">
          <button className="calnav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
          <h2>{monthLabel} {cursor.y}</h2>
          <button className="calnav" onClick={() => move(1)} aria-label="Next month">›</button>
          <button className="caltoday" onClick={() => { setCursor({ y: today.getFullYear(), m: today.getMonth() }); setSelected(null) }}>Today</button>
        </div>
        <div className="callegend">
          <span className="calkey unavailable"><i /> Unavailable</span>
          <span className="calkey available"><i /> Available</span>
          <span className="calkey today"><i /> Today</span>
        </div>
      </div>
      <p className="calhint">Red days mark at least one HOD unavailable. Click any red day to see who and why.</p>
      <div className="tablewrap">
        <table className="caltable">
          <thead>
            <tr>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => <th key={w}>{w}</th>)}</tr>
          </thead>
          <tbody>
            <tr>{cells}</tr>
          </tbody>
        </table>
      </div>

      {selected !== null && (() => {
        const recs = dayMap[cursor.y + '-' + cursor.m + '-' + selected] || []
        return (
          <div className="coldetail">
            <div className="coldetail-head">
              <b>{new Date(cursor.y, cursor.m, selected).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>
              <button className="calnav close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </div>
            {recs.length === 0
              ? <p>No unavailability recorded for this day.</p>
              : recs.map(r => (
                <div key={r.id} className="coldetail-item">
                  <div className="coldetail-main">
                    <strong>{hname(r.hod)}</strong>
                    <span>{r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason}</span>
                  </div>
                  <div className="coldetail-meta">
                    {new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}
                    {r.alternate ? <div className="calalt">Alternate: {hname(r.alternate)}</div> : null}
                  </div>
                </div>
              ))}
          </div>
        )
      })()}
    </section>
  )
}

function Records({ records, hods, hname, dname, sortKey, sortDir, onSort, showStatus = true }) {
  const sortable = typeof onSort === 'function'
  const Th = ({ label, k }) => (
    <th
      className={sortable ? 'sortable' : ''}
      onClick={sortable && k ? () => onSort(k) : undefined}
      aria-sort={sortable && sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label}{sortable && k ? <span className="sort-arrow">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span> : null}
    </th>
  )
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <Th label="HOD" k="hod" />
            <Th label="Department" k="department" />
            <Th label="Period" k="from" />
            <Th label="Reason" k="reason" />
            {showStatus && <th>Status</th>}
          </tr>
        </thead>
        <tbody>
          {records.length === 0
            ? <tr><td className="empty" colSpan={showStatus ? 5 : 4}>No records match the current filters.</td></tr>
            : records.map(r => {
                const h = hods.find(x => x.id === r.hod)
                return (
                  <tr key={r.id}>
                    <td>{hname(r.hod)}</td>
                    <td>{dname(h?.department)}</td>
                    <td>{new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}</td>
                    <td>{r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason}</td>
                    {showStatus && <td><em className={r.status.toLowerCase()}>{r.status}</em></td>}
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
