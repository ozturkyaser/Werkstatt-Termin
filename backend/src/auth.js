import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

function jwtSecret() {
  return process.env.JWT_SECRET || 'change-me-in-production';
}
function jwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    jwtSecret(),
    { expiresIn: jwtExpiresIn() }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}
