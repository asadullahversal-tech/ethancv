import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

const app = express()
const corsOptions = {
  origin: ['*'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json())

const port = process.env.PORT || 8080
const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_PATH = path.join(DATA_DIR, 'users.json')

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  try {
    await fs.access(USERS_PATH)
  } catch {
    await fs.writeFile(USERS_PATH, JSON.stringify([]), 'utf8')
  }
}

async function readUsers() {
  await ensureStore()
  const raw = await fs.readFile(USERS_PATH, 'utf8').catch(() => '[]')
  return JSON.parse(raw || '[]')
}

async function writeUsers(users) {
  await ensureStore()
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2), 'utf8')
}

function sanitize(user) {
  const { password, ...rest } = user
  return rest
}

/** Simple health/info routes */
app.get('/:name', (req, res, next) => {
  if (req.params.name === 'api') return next()
  const { name } = req.params
  res.status(200).send(`Name: ${name}`)
})

app.get('/', (_req, res) => {
  res.send('App is working fine')
})

/** Auth: signup */
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  const users = await readUsers()
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'User already exists' })
  }
  const user = {
    id: Date.now().toString(36),
    email,
    name: name || email.split('@')[0],
    password, // plain-text for demo; replace with hashing in production
    createdAt: Date.now(),
  }
  users.push(user)
  await writeUsers(users)
  const token = user.id
  return res.json({ token, user: sanitize(user) })
})

/** Auth: login */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
  const users = await readUsers()
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = user.id
  return res.json({ token, user: sanitize(user) })
})

/** Auth: me */
app.get('/api/auth/me', async (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  const users = await readUsers()
  const user = users.find((u) => u.id === token)
  if (!user) return res.status(404).json({ error: 'User not found' })
  return res.json({ user: sanitize(user) })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).send("Sorry can't find that!")
})

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})

app.listen(port, () => {
  console.log(`App is listening on port ${port}`)
})

