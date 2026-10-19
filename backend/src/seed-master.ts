import bcrypt from 'bcrypt'
import dotenv from 'dotenv'
import { PrismaClient, UserRole, UserStatus } from '@prisma/client'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const password = process.env.MASTER_PASSWORD

  if (!password) {
    throw new Error('MASTER_PASSWORD is not set')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const existingUser = await prisma.user.findUnique({
    where: {
      callsign: 'MASTER',
    },
  })

  if (existingUser) {
    console.log('Master account already exists')
    return
  }

  const user = await prisma.user.create({
    data: {
      firstName: 'Master',
      lastName: 'Administrator',
      callsign: 'MASTER',
      password: passwordHash,
      role: UserRole.MASTER,
      status: UserStatus.ACTIVE,
    },
  })

  console.log(`Master account created: ${user.callsign}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })