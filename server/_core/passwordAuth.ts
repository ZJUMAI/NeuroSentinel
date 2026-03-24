/**
 * 邮箱 + 密码登录：使用 Node crypto.scrypt 进行密码哈希
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT_LEN = 16;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1,
  }).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  try {
    const computed = scryptSync(password, salt, KEY_LEN, {
      N: 16384,
      r: 8,
      p: 1,
    });
    const hashBuf = Buffer.from(hash, "hex");
    return hashBuf.length === computed.length && timingSafeEqual(hashBuf, computed);
  } catch {
    return false;
  }
}

export function toEmailOpenId(email: string): string {
  return `email:${email.toLowerCase().trim()}`;
}
