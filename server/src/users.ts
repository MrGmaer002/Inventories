import type { Role, User, UserInput } from '../../shared/src/index.ts';
import type { Db } from './db.ts';
import { ApiError, hashPassword, newId, verifyPassword, toIsoDate } from './util.ts';

/** SELECT columns aliased to camelCase so no manual row mapping is needed. */
const USER_COLS = `
  id, username, full_name AS fullName, role, avatar, phone, created_at AS createdAt
`;

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  avatar: string;
  phone: string;
  createdAt: string;
}

function toUser(row: UserRow): User {
  return { ...row };
}

export function listUsers(db: Db): User[] {
  const rows = db
    .prepare(
      `SELECT ${USER_COLS} FROM users
       ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at ASC`
    )
    .all() as UserRow[];
  return rows.map(toUser);
}

export function getUserByUsername(db: Db, username: string): User | null {
  const row = db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE username = ? COLLATE NOCASE`)
    .get(String(username || '').trim()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUserById(db: Db, id: string): User | null {
  const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

export function login(db: Db, username: string, password: string): User {
  const row = db
    .prepare(`SELECT ${USER_COLS}, password FROM users WHERE username = ? COLLATE NOCASE`)
    .get(String(username || '').trim()) as (UserRow & { password: string }) | undefined;

  if (!row) throw new ApiError(401, 'user_not_found', 'اسم المستخدم غير موجود');
  if (!verifyPassword(String(password || ''), row.password)) {
    throw new ApiError(401, 'wrong_password', 'كلمة المرور غير صحيحة');
  }
  const { password: _pw, ...user } = row;
  return toUser(user);
}

export function createUser(db: Db, input: UserInput): User {
  const username = String(input.username || '').trim().toLowerCase();
  const fullName = String(input.fullName || '').trim();
  const password = String(input.password || '');

  if (!username || !fullName || !password) {
    throw new ApiError(400, 'missing_fields', 'يرجى ملء جميع الحقول المطلوبة');
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    throw new ApiError(409, 'username_taken', 'اسم المستخدم مسجل مسبقاً');
  }

  const role: Role = input.role === 'cashier' ? 'cashier' : 'admin';
  const user: User = {
    id: newId('usr'),
    username,
    fullName,
    role,
    avatar: input.avatar || '👤',
    phone: input.phone || '',
    createdAt: toIsoDate(new Date())
  };
  db.prepare(
    `INSERT INTO users (id, username, password, full_name, role, avatar, phone, created_at)
     VALUES (@id, @username, @password, @fullName, @role, @avatar, @phone, @createdAt)`
  ).run({ ...user, password: hashPassword(password) });
  return user;
}

export function updateUser(db: Db, id: string, patch: Partial<UserInput>): User {
  const existing = getUserById(db, id);
  if (!existing) throw new ApiError(404, 'user_not_found', 'المستخدم غير موجود');

  const next: User = {
    ...existing,
    username: patch.username !== undefined ? String(patch.username).trim().toLowerCase() : existing.username,
    fullName: patch.fullName !== undefined ? String(patch.fullName).trim() : existing.fullName,
    role: patch.role === 'cashier' ? 'cashier' : patch.role === 'admin' ? 'admin' : existing.role,
    avatar: patch.avatar !== undefined ? patch.avatar || '👤' : existing.avatar,
    phone: patch.phone !== undefined ? patch.phone : existing.phone
  };
  if (!next.username || !next.fullName) {
    throw new ApiError(400, 'missing_fields', 'اسم المستخدم والاسم الكامل مطلوبان');
  }
  const taken = db
    .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
    .get(next.username, id);
  if (taken) throw new ApiError(409, 'username_taken', 'اسم المستخدم مسجل مسبقاً');

  db.prepare(
    `UPDATE users SET username = @username, full_name = @fullName, role = @role,
       avatar = @avatar, phone = @phone WHERE id = @id`
  ).run(next);
  return next;
}

export function changePassword(
  db: Db,
  targetUserId: string,
  newPassword: string,
  actorPassword: string
): User {
  const actor = db
    .prepare(`SELECT id, password FROM users WHERE id = ?`)
    .get(targetUserId) as { id: string; password: string } | undefined;
  if (!actor) throw new ApiError(404, 'user_not_found', 'المستخدم غير موجود');
  if (!verifyPassword(String(actorPassword || ''), actor.password)) {
    throw new ApiError(401, 'wrong_password', 'كلمة مرور المدير غير صحيحة');
  }
  if (!newPassword || !String(newPassword).trim()) {
    throw new ApiError(400, 'missing_fields', 'يرجى كتابة كلمة المرور الجديدة');
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), targetUserId);
  return getUserById(db, targetUserId)!;
}

export function deleteUser(db: Db, id: string): void {
  const existing = getUserById(db, id);
  if (!existing) throw new ApiError(404, 'user_not_found', 'المستخدم غير موجود');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
