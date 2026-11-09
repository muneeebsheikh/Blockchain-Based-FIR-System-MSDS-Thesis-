import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("ChangeMe123!", 10);
  const users = [
    { email: "citizen@local.test", role: Role.CITIZEN },
    { email: "officer@local.test", role: Role.OFFICER },
    { email: "admin@local.test", role: Role.ADMIN },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash: password, role: u.role },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
