import { useEffect, useState } from 'react'
import './app.css'
import { api } from './api'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  const [editingDept, setEditingDept] = useState(null)
  const [hodForm, setHodForm] = useState({ sap: '', name: '', department: '' })
  const [editingHod, setEditingHod] = useState(null)
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
  const [reportDept, setReportDept] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportPage, setReportPage] = useState(1)
  const REPORT_PAGE_SIZE = 10

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

  // Reports: filter by department + period, newest first, paginated 10/page.
  const reportRecords = records
    .filter(r => {
      if (reportDept) {
        const h = hods.find(x => x.id === r.hod)
        if (!h || h.department !== Number(reportDept)) return false
      }
      // Period filter: keep any record whose range overlaps the selected window.
      if (reportFrom && new Date(r.to) < new Date(`${reportFrom}T00:00:00`)) return false
      if (reportTo && new Date(r.from) > new Date(`${reportTo}T23:59:59`)) return false
      return true
    })
    .sort((a, b) => new Date(b.from) - new Date(a.from))

  const hasReportFilter = reportDept || reportFrom || reportTo
  const clearReportFilters = () => { setReportDept(''); setReportFrom(''); setReportTo(''); setReportPage(1) }

  const reportTotalPages = Math.max(1, Math.ceil(reportRecords.length / REPORT_PAGE_SIZE))
  const reportPageSafe = Math.min(reportPage, reportTotalPages)
  const reportPageRecords = reportRecords.slice(
    (reportPageSafe - 1) * REPORT_PAGE_SIZE,
    reportPageSafe * REPORT_PAGE_SIZE
  )

  // Exports always cover the full filtered set, not just the current page.
  const reportExportRows = () => reportRecords.map(r => {
    const h = hods.find(x => x.id === r.hod)
    return {
      hod: hname(r.hod),
      department: dname(h?.department),
      reason: r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason,
      from: new Date(r.from).toLocaleDateString('en-IN'),
      to: new Date(r.to).toLocaleDateString('en-IN'),
      status: r.status,
      alternate: r.alternate ? hname(r.alternate) : '',
      remarks: r.remarks || '',
    }
  })

  const exportReportExcel = () => {
    const rows = reportExportRows().map(x => ({
      'HOD': x.hod,
      'Department': x.department,
      'Reason': x.reason,
      'From': x.from,
      'To': x.to,
      'Status': x.status,
      'Alternate HOD': x.alternate,
      'Remarks': x.remarks,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Availability Report')
    XLSX.writeFile(wb, `hod-availability-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportReportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('HOD Availability Report', 14, 16)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['HOD', 'Department', 'Reason', 'From', 'To', 'Status']],
      body: reportExportRows().map(x => [x.hod, x.department, x.reason, x.from, x.to, x.status]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 105, 170] },
    })
    doc.save(`hod-availability-report-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

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
        reason: x.reason.replace(/_/g, ' '),
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

  const saveDept = async e => {
    e.preventDefault()
    if (!dept.trim()) return
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept, dept.trim())
        setMessage('Department updated.')
      } else {
        await api.createDepartment(dept.trim())
        setMessage('Department saved.')
      }
      setDept('')
      setEditingDept(null)
      await loadData()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const startEditDept = x => { setEditingDept(x.id); setDept(x.name) }
  const cancelEditDept = () => { setEditingDept(null); setDept('') }

  const saveHod = async e => {
    e.preventDefault()
    if (!hodForm.sap || !hodForm.name || !hodForm.department) return
    try {
      const payload = { sap_id: hodForm.sap, name: hodForm.name, department_id: Number(hodForm.department) }
      if (editingHod) {
        await api.updateHod(editingHod, payload)
        setMessage('HOD member updated.')
      } else {
        await api.createHod(payload)
        setMessage('HOD member saved.')
      }
      setHodForm({ sap: '', name: '', department: '' })
      setEditingHod(null)
      await loadData()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const startEditHod = h => { setEditingHod(h.id); setHodForm({ sap: h.sap, name: h.name, department: String(h.department) }) }
  const cancelEditHod = () => { setEditingHod(null); setHodForm({ sap: '', name: '', department: '' }) }

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
        reason: recordForm.reason.replace(/ /g, '_'),
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
          <span className="admin-label">
            Administrator
            <br />
            <small>System Admin </small>
          </span>
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
              <span className="btn-label-full">+ Add status</span>
              <span className="btn-label-short">+ Add</span>
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
            <Panel title={editingDept ? 'Edit department' : 'Add department'}>
              <form onSubmit={saveDept}>
                <label>
                  Department name
                  <input required value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Operations" />
                </label>
                <div className="form-actions">
                  <button className="primary">{editingDept ? 'Update department' : 'Save department'}</button>
                  {editingDept && (
                    <button type="button" className="clear-btn" onClick={cancelEditDept}>Cancel</button>
                  )}
                </div>
              </form>
            </Panel>
            <Panel title="Departments">
              <table className="responsive-table">
                <thead>
                  <tr><th>Name</th><th>HOD count</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {departments.map(x => (
                    <tr key={x.id}>
                      <td data-label="Name">{x.name}</td>
                      <td data-label="HOD count">{hods.filter(h => h.department === x.id).length}</td>
                      <td data-label="Actions">
                        <button type="button" className="edit-btn" onClick={() => startEditDept(x)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        )}

        {page === 'HOD Master' && (
          <section className="split">
            <Panel title={editingHod ? 'Edit HOD member' : 'Add HOD member'}>
              <form onSubmit={saveHod}>
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
                <div className="form-actions">
                  <button className="primary">{editingHod ? 'Update HOD' : 'Save HOD'}</button>
                  {editingHod && (
                    <button type="button" className="clear-btn" onClick={cancelEditHod}>Cancel</button>
                  )}
                </div>
              </form>
            </Panel>
            <Panel title="HOD members">
              <table className="responsive-table">
                <thead>
                  <tr><th>SAP ID</th><th>Name</th><th>Department</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {hods.map(h => (
                    <tr key={h.id}>
                      <td data-label="SAP ID">{h.sap}</td>
                      <td data-label="Name">{h.name}</td>
                      <td data-label="Department">{dname(h.department)}</td>
                      <td data-label="Actions">
                        <button type="button" className="edit-btn" onClick={() => startEditHod(h)}>Edit</button>
                      </td>
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
          <Calendar records={records} hods={hods} hname={hname} dname={dname} />
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
                  <table className="responsive-table">
                    <thead>
                      <tr><th>Username</th><th>Role</th><th>HOD</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td data-label="Username">{u.username}</td>
                          <td data-label="Role"><em className={u.role === 'ADMIN' ? 'roleadmin' : 'rolehod'}>{u.role}</em></td>
                          <td data-label="HOD">{u.hodName || '—'}</td>
                          <td data-label="Status"><em className={u.isActive ? 'approved' : 'pending'}>{u.isActive ? 'Active' : 'Inactive'}</em></td>
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
            <div className="filterbar">
              <select value={reportDept} onChange={e => { setReportDept(e.target.value); setReportPage(1) }}>
                <option value="">All departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div className="date-field">
                <span>From</span>
                <input type="date" value={reportFrom} onChange={e => { setReportFrom(e.target.value); setReportPage(1) }} />
              </div>
              <div className="date-field">
                <span>To</span>
                <input type="date" value={reportTo} onChange={e => { setReportTo(e.target.value); setReportPage(1) }} />
              </div>
              {hasReportFilter && (
                <button className="clear-btn" onClick={clearReportFilters}>Clear filters</button>
              )}
              <div className="filterbar-actions">
                <span className="filter-count">{reportRecords.length} record{reportRecords.length === 1 ? '' : 's'}</span>
                <button className="primary small" onClick={exportReportExcel} disabled={reportRecords.length === 0}>
                  Download Excel
                </button>
                <button className="primary small" onClick={exportReportPDF} disabled={reportRecords.length === 0}>
                  Download PDF
                </button>
              </div>
            </div>

            <Records records={reportPageRecords} hods={hods} hname={hname} dname={dname} />

            {reportRecords.length > 0 && (
              <div className="pagination">
                <button
                  className="calnav"
                  onClick={() => setReportPage(p => Math.max(1, p - 1))}
                  disabled={reportPageSafe === 1}
                  aria-label="Previous page"
                >‹</button>
                <span className="page-info">
                  Page {reportPageSafe} of {reportTotalPages} · showing {reportPageRecords.length} of {reportRecords.length}
                </span>
                <button
                  className="calnav"
                  onClick={() => setReportPage(p => Math.min(reportTotalPages, p + 1))}
                  disabled={reportPageSafe === reportTotalPages}
                  aria-label="Next page"
                >›</button>
              </div>
            )}
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

function Calendar({ records, hods, hname, dname }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })
  const [hovered, setHovered] = useState(null)
  // Separate from `hovered` (mouse-only): this drives a persistent detail
  // panel so touch and keyboard users — who can't trigger :hover — can still
  // see who's unavailable on a given day.
  const [selectedDay, setSelectedDay] = useState(null)

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

  // Build weeks: each week is an array of 7 slots, null = empty cell before/after month
  const weeks = []
  let week = []
  for (let i = 0; i < firstWeekday; i++) week.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const recs = dayMap[cursor.y + '-' + cursor.m + '-' + day] || []
    const isToday = today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === day
    week.push({ day, recs, isToday })
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  const move = delta => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setHovered(null)
    setSelectedDay(null)
  }

  const jumpTo = (y, m) => { setCursor({ y, m }); setHovered(null); setSelectedDay(null) }

  const toggleSelectedDay = day => setSelectedDay(d => (d === day ? null : day))

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
  }))
  const baseYear = today.getFullYear()
  const yearOptions = Array.from({ length: 7 }, (_, i) => baseYear - 3 + i)

  const isCurrentMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth()

  return (
    <section className="panel calendar">
      <div className="calhead">
        <div className="caltabs">
          <button className="calnav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
          <div className="calselects">
            <select
              className="calmonth"
              value={String(cursor.m)}
              onChange={e => jumpTo(cursor.y, Number(e.target.value))}
              aria-label="Select month"
            >
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              className="calyear"
              value={String(cursor.y)}
              onChange={e => jumpTo(Number(e.target.value), cursor.m)}
              aria-label="Select year"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="calnav" onClick={() => move(1)} aria-label="Next month">›</button>
          <button className="caltoday" disabled={isCurrentMonth} onClick={() => jumpTo(today.getFullYear(), today.getMonth())}>Today</button>
        </div>
        <div className="callegend">
          <span className="calkey unavailable"><i /> Unavailable</span>
          <span className="calkey available"><i /> Available</span>
          <span className="calkey today"><i /> Today</span>
        </div>
      </div>
      <p className="calhint">Red days mark at least one HOD unavailable. Hover, tap, or focus and press Enter on a red day to see who and why.</p>
      <div className="tablewrap">
        <table className="caltable">
          <thead>
            <tr>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => <th key={w}>{w}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((cell, ci) => {
                  // Tooltip opens upward by default so it's never clipped by the
                  // bottom of the page. Only the first row has no room above it
                  // (it would cover the calendar header), so that row flips down.
                  const flipBelow = wi === 0
                  const isInteractive = cell && cell.recs.length > 0
                  const isActive = cell && (hovered === cell.day || selectedDay === cell.day)
                  return (
                    <td
                      key={ci}
                      className={cell ? 'calcell' + (cell.recs.length ? ' unavailable' : '') + (cell.isToday ? ' today' : '') + (isActive ? ' selected' : '') : 'calblank'}
                      onMouseEnter={cell ? () => setHovered(cell.day) : undefined}
                      onMouseLeave={() => setHovered(null)}
                      onClick={isInteractive ? () => toggleSelectedDay(cell.day) : undefined}
                      onKeyDown={isInteractive ? e => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelectedDay(cell.day) }
                      } : undefined}
                      tabIndex={isInteractive ? 0 : undefined}
                      role={isInteractive ? 'button' : undefined}
                      aria-pressed={isInteractive ? selectedDay === cell.day : undefined}
                      aria-label={isInteractive ? `${cell.recs.length} HOD${cell.recs.length > 1 ? 's' : ''} unavailable on day ${cell.day}` : undefined}
                    >
                      {cell && <span className="calnum">{cell.day}</span>}
                      {cell && cell.recs.length > 0 && <span className="calflag">{cell.recs.length} unavailable</span>}
                      {cell && cell.recs.length > 0 && hovered === cell.day && (() => {
                        const recs = cell.recs
                        return (
                          <div className={'caltooltip' + (flipBelow ? ' below' : '')}>
                            <div className="caltooltip-head">
                              <b>{new Date(cursor.y, cursor.m, cell.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                            </div>
                            {recs.map(r => {
                              const h = hods.find(x => x.id === r.hod)
                              return (
                                <div key={r.id} className="caltooltip-item">
                                  <strong>{hname(r.hod)} <span className="caldept">({dname(h?.department)})</span></strong>
                                  <span className="caltooltip-reason">{r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason}</span>
                                  <span className="caltooltip-dates">{new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}</span>
                                  {r.alternate ? <span className="caltooltip-alt">Alt: {hname(r.alternate)} ({dname(hods.find(x => x.id === r.alternate)?.department)})</span> : null}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDay && (() => {
        const recs = dayMap[cursor.y + '-' + cursor.m + '-' + selectedDay] || []
        if (recs.length === 0) return null
        const label = new Date(cursor.y, cursor.m, selectedDay).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <div className="coldetail">
            <div className="coldetail-head">
              <b>{label} — {recs.length} unavailable</b>
              <button type="button" className="close" onClick={() => setSelectedDay(null)} aria-label="Close">×</button>
            </div>
            {recs.map(r => {
              const h = hods.find(x => x.id === r.hod)
              return (
                <div key={r.id} className="coldetail-item">
                  <div className="coldetail-main">
                    <strong>{hname(r.hod)} <span className="caldept">({dname(h?.department)})</span></strong>
                    <span>{r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason}</span>
                    {r.alternate ? <div className="calalt">Alt: {hname(r.alternate)} ({dname(hods.find(x => x.id === r.alternate)?.department)})</div> : null}
                  </div>
                  <div className="coldetail-meta">
                    {new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}
                  </div>
                </div>
              )
            })}
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
      <table className="responsive-table">
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
                    <td data-label="HOD">{hname(r.hod)}</td>
                    <td data-label="Department">{dname(h?.department)}</td>
                    <td data-label="Period">{new Date(r.from).toLocaleDateString('en-IN')} – {new Date(r.to).toLocaleDateString('en-IN')}</td>
                    <td data-label="Reason">{r.reason === 'OTHER' && r.remarks ? r.remarks : r.reason}</td>
                    {showStatus && <td data-label="Status"><em className={r.status.toLowerCase()}>{r.status}</em></td>}
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}