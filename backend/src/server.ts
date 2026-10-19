import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import { CaseStatus, PrismaClient, Priority, TaskStatus } from '@prisma/client'

dotenv.config()
const prisma = new PrismaClient()
const app = Fastify({ logger: true })
const SESSION_COOKIE = 'detective_session'
const SESSION_DAYS = 30

type AuthUser = { id: string; callsign: string; firstName: string; lastName: string; role: string }
type AuthedRequest = { authUser?: AuthUser }
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
const publicUser = (u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, callsign: u.callsign, role: u.role, photoUrl: u.photoUrl })

async function issueSession(userId: string, reply: any) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } })
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', path: '/', expires: expiresAt })
}

async function authenticate(request: any, reply: any) {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return reply.code(401).send({ error: 'Требуется авторизация' })
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.code(401).send({ error: 'Сессия недействительна' })
  }
  ;(request as AuthedRequest).authUser = publicUser(session.user)
}

const strings = (value: unknown) => Array.isArray(value) ? value.filter(x => typeof x === 'string') as string[] : []
const caseInclude = { lead: { select: { id: true, callsign: true, firstName: true, lastName: true } } }

async function start() {
  await app.register(cors, { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true })
  await app.register(cookie)

  app.get('/api/health', async () => { await prisma.$queryRaw`SELECT 1`; return { status: 'ok', database: 'connected' } })

  app.post('/api/auth/register', async (request, reply) => {
    const body = request.body as any
    if (!body?.name?.trim() || !body?.callsign?.trim() || !body?.secretCode) return reply.code(400).send({ error: 'Заполните имя, позывной и секретный код' })
    if (!process.env.INVITE_CODE || body.secretCode !== process.env.INVITE_CODE) return reply.code(403).send({ error: 'Секретный код не принят' })
    const [firstName, ...rest] = body.name.trim().split(/\s+/)
    try {
      const user = await prisma.user.create({ data: { firstName, lastName: rest.join(' ') || '—', callsign: body.callsign.trim(), password: await bcrypt.hash(body.secretCode, 12) } })
      await issueSession(user.id, reply)
      return reply.code(201).send(publicUser(user))
    } catch (error: any) {
      if (error?.code === 'P2002') return reply.code(409).send({ error: 'Такой позывной уже занят' })
      throw error
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as any
    const user = await prisma.user.findUnique({ where: { callsign: String(body?.callsign || '') } })
    if (!user || user.status !== 'ACTIVE' || !await bcrypt.compare(String(body?.secretCode || ''), user.password)) return reply.code(401).send({ error: 'Неверный позывной или код' })
    await issueSession(user.id, reply)
    return publicUser(user)
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
    reply.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true }
  })
  app.get('/api/auth/me', { preHandler: authenticate }, async request => (request as AuthedRequest).authUser)
  app.get('/api/users', { preHandler: authenticate }, async () => (await prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })).map(publicUser))

  app.get('/api/cases', { preHandler: authenticate }, async () => prisma.case.findMany({ include: caseInclude, orderBy: { createdAt: 'desc' } }))
  app.post('/api/cases', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as any; const auth = (request as AuthedRequest).authUser!
    if (!body?.title?.trim() || !body?.summary?.trim() || !body?.leadId) return reply.code(400).send({ error: 'Название, сводка и ведущий обязательны' })
    const item = await prisma.case.create({ data: { title: body.title.trim(), summary: body.summary.trim(), location: body.location?.trim() || null, priority: (body.priority || 'MEDIUM') as Priority, leadId: body.leadId, createdById: auth.id, memberIds: strings(body.memberIds), suspects: strings(body.suspects), victims: strings(body.victims), witnesses: strings(body.witnesses), evidence: strings(body.evidence), theories: strings(body.theories) }, include: caseInclude })
    return reply.code(201).send(item)
  })
  app.get('/api/cases/:id', { preHandler: authenticate }, async (request, reply) => {
    const item = await prisma.case.findUnique({ where: { id: (request.params as any).id }, include: caseInclude })
    return item || reply.code(404).send({ error: 'Дело не найдено' })
  })
  app.patch('/api/cases/:id', { preHandler: authenticate }, async (request, reply) => {
    const b = request.body as any; const data: any = {}
    for (const key of ['title','summary','location','report','reportUrl']) if (typeof b[key] === 'string') data[key] = b[key]
    for (const key of ['memberIds','suspects','victims','witnesses','evidence','theories','folders']) if (Array.isArray(b[key])) data[key] = b[key]
    if (b.boardLayout && typeof b.boardLayout === 'object' && !Array.isArray(b.boardLayout)) data.boardLayout = b.boardLayout
    if (b.status && Object.values(CaseStatus).includes(b.status)) data.status = b.status
    if (b.priority && Object.values(Priority).includes(b.priority)) data.priority = b.priority
    if (b.leadId) data.leadId = b.leadId
    try { return await prisma.case.update({ where: { id: (request.params as any).id }, data, include: caseInclude }) }
    catch (e: any) { if (e?.code === 'P2025') return reply.code(404).send({ error: 'Дело не найдено' }); throw e }
  })

  app.get('/api/tasks', { preHandler: authenticate }, async () => prisma.task.findMany({ include: { assignee: { select: { id: true, callsign: true } } }, orderBy: { createdAt: 'desc' } }))
  app.post('/api/tasks', { preHandler: authenticate }, async (request, reply) => {
    const b = request.body as any; const auth = (request as AuthedRequest).authUser!
    if (!b?.title?.trim()) return reply.code(400).send({ error: 'Описание задачи обязательно' })
    return reply.code(201).send(await prisma.task.create({ data: { title: b.title.trim(), tag: b.tag?.trim() || 'ОБЩЕЕ', dueLabel: b.dueLabel?.trim() || null, createdById: auth.id } }))
  })
  app.patch('/api/tasks/:id', { preHandler: authenticate }, async (request, reply) => {
    const b = request.body as any; const data: any = {}
    for (const key of ['title','tag','dueLabel','report']) if (typeof b[key] === 'string') data[key] = b[key]
    if (b.status && Object.values(TaskStatus).includes(b.status)) data.status = b.status
    if (b.assigneeId === null || typeof b.assigneeId === 'string') data.assigneeId = b.assigneeId
    try { return await prisma.task.update({ where: { id: (request.params as any).id }, data, include: { assignee: true } }) }
    catch (e: any) { if (e?.code === 'P2025') return reply.code(404).send({ error: 'Задача не найдена' }); throw e }
  })

  app.get('/api/informants', { preHandler: authenticate }, async () => prisma.informant.findMany({ orderBy: { alias: 'asc' } }))
  app.post('/api/informants', { preHandler: authenticate }, async (request, reply) => {
    const b = request.body as any
    if (!b?.alias || !b?.area || !b?.specialties) return reply.code(400).send({ error: 'Позывной, район и специализация обязательны' })
    return reply.code(201).send(await prisma.informant.create({ data: { alias: b.alias, realName: b.realName || null, area: b.area, specialties: b.specialties, reliability: Math.max(0, Math.min(100, Number(b.reliability) || 50)), notes: b.notes || '' } }))
  })
  app.get('/api/organizations', { preHandler: authenticate }, async () => prisma.organization.findMany({ orderBy: { name: 'asc' } }))
  app.post('/api/organizations', { preHandler: authenticate }, async (request, reply) => {
    const b = request.body as any
    if (!b?.name || !b?.zone || !b?.threat) return reply.code(400).send({ error: 'Название, территория и уровень угрозы обязательны' })
    return reply.code(201).send(await prisma.organization.create({ data: { name: b.name, zone: b.zone, threat: b.threat, members: Number(b.members) || 0, color: b.color || '#8e2f27', notes: b.notes || '', people: strings(b.people) } }))
  })

  app.addHook('onClose', async () => prisma.$disconnect())
  await prisma.$connect()
  await app.listen({ port: Number(process.env.PORT) || 3000, host: process.env.HOST || '127.0.0.1' })
}

start().catch(async error => { app.log.error(error); await prisma.$disconnect(); process.exit(1) })
