import { createHash, randomBytes } from "crypto";
import { db } from "./db.server";

export async function hashPassword(password: string): Promise<string> {
  return createHash("sha256").update(password).digest("hex");
}

export async function createUserSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // Session expires in 30 days

  await db.userSession.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}

export async function getUserFromSession(token: string) {
  const session = await db.userSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      // Delete expired session
      await db.userSession.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.user;
} 