import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";

export type JwtUser = { sub: string; email: string; role: Role };

export function signAccessToken(user: JwtUser, secret: string, expiresInSeconds = 8 * 60 * 60): string {
  const options: SignOptions = { expiresIn: expiresInSeconds };
  return jwt.sign({ sub: user.sub, email: user.email, role: user.role }, secret, options);
}

export function verifyAccessToken(token: string, secret: string): JwtUser {
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload & { email: string; role: Role };
  if (!decoded.sub) throw new Error("Invalid token subject");
  return { sub: decoded.sub, email: decoded.email, role: decoded.role };
}
