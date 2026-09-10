import express from 'express'
import cors from 'cors'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { pool } from './db.js'
import { requireAuth, requireAdmin } from './middleware.js'

const app = express()
// app.use(cors({ origin: `${process.env.FRONTEND_URL}` }))
 app.use(cors({ origin: ['http://localhost:5173', `${process.env.FRONTEND_URL}`] }))
app.use(express.json())
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)
const allowedReasons = [
  'MEETING',
  'OUT_OF_STATION',
  'MEDICAL',
  'LEAVE',
  'OTHER'
];
const clean = value => typeof value === 'string' ? value.trim() : ''
const validDateRange = (from, to) => !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to)) && new Date(to) > new Date(from)

app.get('/api/health', asyncRoute(async (_,res) => { await pool.query('SELECT 1'); res.json({ status: 'ok' }) }))

// Run once to create the first administrator. It is disabled as soon as a user exists.
app.post('/api/auth/setup', asyncRoute(async (req,res) => {
  const { username, password } = req.body
  const existing = await pool.query('SELECT id FROM users LIMIT 1')
  if (existing.rowCount) return res.status(409).json({ message: 'An administrator already exists.' })
  if (!username || !password || password.length < 8) return res.status(400).json({ message: 'Username and an 8-character password are required.' })
  const hash = await bcrypt.hash(password, 12)
  await pool.query('INSERT INTO users (username,password_hash,role) VALUES ($1,$2,$3)', [username,hash,'ADMIN'])
  res.status(201).json({ message: 'Administrator created.' })
}))
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const { username,password } = req.body
  const result = await pool.query('SELECT id,username,password_hash,role,hod_id,is_active FROM users WHERE username=$1', [username])
  const user=result.rows[0]
  if (!user || !user.is_active || !(await bcrypt.compare(password||'',user.password_hash))) return res.status(401).json({ message:'Invalid username or password.' })
  const token=jwt.sign({ id:user.id,role:user.role,hod_id:user.hod_id },process.env.JWT_SECRET,{expiresIn:'8h'})
  res.json({ token, user:{ id:user.id,username:user.username,role:user.role } })
}))

app.get('/api/departments', requireAuth, asyncRoute(async (_,res) => res.json((await pool.query('SELECT * FROM departments ORDER BY department_name')).rows)))
app.post('/api/departments', requireAuth, requireAdmin, asyncRoute(async (req,res) => { const name=clean(req.body.department_name); if(!name || name.length>150)return res.status(400).json({message:'Department name is required and must be 150 characters or fewer.'}); const r=await pool.query('INSERT INTO departments (department_name) VALUES ($1) RETURNING *',[name]);res.status(201).json(r.rows[0]) }))
app.get('/api/hods', requireAuth, asyncRoute(async (_,res) => res.json((await pool.query('SELECT h.*,d.department_name FROM hod_members h JOIN departments d ON d.id=h.department_id ORDER BY h.name')).rows)))
app.post('/api/hods', requireAuth, requireAdmin, asyncRoute(async (req,res) => { const sapId=clean(req.body.sap_id), name=clean(req.body.name), {department_id}=req.body, email=clean(req.body.email), phone=clean(req.body.phone); if(!/^\d{8}$/.test(sapId))return res.status(400).json({message:'SAP ID must contain exactly 8 digits.'}); if(!name||!Number.isInteger(Number(department_id)))return res.status(400).json({message:'HOD name and a valid department are required.'}); if(name.length>150||email.length>150||phone.length>20)return res.status(400).json({message:'One or more fields are too long.'}); if(email&&!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({message:'Enter a valid email address.'}); const r=await pool.query('INSERT INTO hod_members (sap_id,name,department_id,email,phone) VALUES ($1,$2,$3,$4,$5) RETURNING *',[sapId,name,department_id,email||null,phone||null]);res.status(201).json(r.rows[0]) }))
app.get('/api/availability-status', requireAuth, asyncRoute(async (_,res) => res.json((await pool.query(`SELECT s.*,h.name AS hod_name,d.department_name,a.name AS alternate_hod_name FROM hod_availability_status s JOIN hod_members h ON h.id=s.hod_id JOIN departments d ON d.id=h.department_id LEFT JOIN hod_members a ON a.id=s.alternate_hod_id ORDER BY s.from_datetime DESC`)).rows)))
app.post('/api/availability-status', requireAuth, asyncRoute(async (req,res) => { const {hod_id,availability_status='UNAVAILABLE',reason,from_datetime,to_datetime,alternate_hod_id}=req.body, remarks=clean(req.body.remarks); if(!Number.isInteger(Number(hod_id))||!['AVAILABLE','UNAVAILABLE'].includes(availability_status)||!allowedReasons.includes(reason)||!validDateRange(from_datetime,to_datetime))return res.status(400).json({message:'Enter a valid HOD, availability status, reason, and date/time range.'}); if(alternate_hod_id&&(!Number.isInteger(Number(alternate_hod_id))||Number(alternate_hod_id)===Number(hod_id)))return res.status(400).json({message:'Alternate HOD must be another HOD.'}); const overlap=await pool.query(`SELECT id FROM hod_availability_status WHERE hod_id=$1 AND approval_status <> 'CANCELLED' AND tstzrange(from_datetime,to_datetime,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1`,[hod_id,from_datetime,to_datetime]); if(overlap.rowCount)return res.status(409).json({message:'This HOD already has an availability status record during the selected date and time.'}); const r=await pool.query('INSERT INTO hod_availability_status (hod_id,availability_status,reason,from_datetime,to_datetime,remarks,alternate_hod_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[hod_id,availability_status,reason,from_datetime,to_datetime,remarks||null,alternate_hod_id||null,req.user.id]);res.status(201).json(r.rows[0]) }))

// List all users so an administrator can pick one to manage.
app.get('/api/users', requireAuth, requireAdmin, asyncRoute(async (_,res) => {
  const rows = (await pool.query(`
    SELECT u.id, u.username, u.role, u.is_active, u.created_at, h.name AS hod_name
    FROM users u
    LEFT JOIN hod_members h ON h.id = u.hod_id
    ORDER BY u.id
  `)).rows
  res.json(rows)
}))

// Let an administrator set a new password for any user. No email trigger.
app.post('/api/users/:id/password', requireAuth, requireAdmin, asyncRoute(async (req,res) => {
  const id = Number(req.params.id)
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid user.' })
  if (!password || password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' })
  if (password.length > 200) return res.status(400).json({ message: 'Password must be 200 characters or fewer.' })
  const hash = await bcrypt.hash(password, 12)
  const r = await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id', [hash, id])
  if (r.rowCount === 0) return res.status(404).json({ message: 'User not found.' })
  res.json({ message: 'Password updated.' })
}))

app.use((err,_,res,__)=>(console.error(err),res.status(err.code==='23505'||err.code==='23P01'?409:err.code==='23503'?400:500).json({message:err.code==='23505'?'A record with this value already exists.':err.code==='23P01'?'This HOD already has an overlapping availability record.':err.code==='23503'?'The selected related record does not exist.':'Server error.'})))
app.listen(process.env.PORT||4000,()=>console.log(`API running on port ${process.env.PORT||4000}`))
