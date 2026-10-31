import { vi } from 'vitest'
import { createApp } from '../src/app.js'
import * as accessRepository from '../src/repositories/access.repository.js'
import * as auditRepository from '../src/repositories/audit.repository.js'
import * as authRepository from '../src/repositories/auth.repository.js'
import * as profileRepository from '../src/repositories/profile.repository.js'
import * as storage from '../src/repositories/storage.repository.js'
import type { Profile, Role } from '../src/types/domain.js'

export const COURSE_ID = '20000000-0000-4000-8000-000000000001'
export const OTHER_COURSE_ID = '20000000-0000-4000-8000-000000000002'
export const ARCHIVED_COURSE_ID = '20000000-0000-4000-8000-000000000003'
export const MISSING_ID = '99999999-0000-4000-8000-000000000000'

function profile(id: string, role: Role, fullName: string, extra: Partial<Profile> = {}): Profile {
  return {
    id,
    fullName,
    email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@gutech.example`,
    role,
    rollNo: role === 'student' ? `S-${id.slice(-3)}` : null,
    phone: null,
    bio: null,
    avatarPath: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

export const USERS = {
  admin: profile('10000000-0000-4000-8000-000000000001', 'admin', 'Amina Admin'),
  teacher: profile('10000000-0000-4000-8000-000000000002', 'teacher', 'Tariq Teacher'),
  otherTeacher: profile('10000000-0000-4000-8000-000000000003', 'teacher', 'Other Teacher'),
  student: profile('10000000-0000-4000-8000-000000000004', 'student', 'Sara Student'),
  otherStudent: profile('10000000-0000-4000-8000-000000000005', 'student', 'Other Student'),
  inactive: profile('10000000-0000-4000-8000-000000000006', 'student', 'Inactive Student', { isActive: false }),
  newUser: profile('10000000-0000-4000-8000-000000000007', 'student', 'New User', { mustChangePassword: true }),
} as const

export type Who = keyof typeof USERS

/** COURSE_ID: taught by `teacher`, `student` enrolled. OTHER_COURSE_ID: `otherTeacher` / `otherStudent`. */
const TEACHES: Record<string, string[]> = {
  [COURSE_ID]: [USERS.teacher.id],
  [OTHER_COURSE_ID]: [USERS.otherTeacher.id],
  [ARCHIVED_COURSE_ID]: [USERS.teacher.id],
}
const ENROLLED: Record<string, string[]> = {
  [COURSE_ID]: [USERS.student.id],
  [OTHER_COURSE_ID]: [USERS.otherStudent.id],
  [ARCHIVED_COURSE_ID]: [USERS.student.id],
}

export function bearer(who: Who) {
  return { Authorization: `Bearer ${who}-token` }
}

export function installAuthFixtures() {
  vi.mocked(authRepository.verifyAccessToken).mockImplementation(async (token: string) => {
    const who = token.replace(/-token$/, '') as Who
    return USERS[who]?.id ?? null
  })
  vi.mocked(profileRepository.findById).mockImplementation(async (id: string) => Object.values(USERS).find((u) => u.id === id) ?? null)

  vi.mocked(accessRepository.findCourse).mockImplementation(async (id: string) => {
    if (id === COURSE_ID) return { id, code: 'CS101', title: 'Intro to CS', isArchived: false }
    if (id === OTHER_COURSE_ID) return { id, code: 'MG204', title: 'Innovation', isArchived: false }
    if (id === ARCHIVED_COURSE_ID) return { id, code: 'OLD100', title: 'Archived', isArchived: true }
    return null
  })
  vi.mocked(accessRepository.isTeacher).mockImplementation(async (courseId, userId) => (TEACHES[courseId] ?? []).includes(userId))
  vi.mocked(accessRepository.isEnrolled).mockImplementation(async (courseId, userId) => (ENROLLED[courseId] ?? []).includes(userId))
  vi.mocked(accessRepository.courseIdsFor).mockImplementation(async (userId, role) =>
    Object.entries(role === 'teacher' ? TEACHES : ENROLLED)
      .filter(([courseId, ids]) => ids.includes(userId) && courseId !== ARCHIVED_COURSE_ID)
      .map(([courseId]) => courseId),
  )

  vi.mocked(storage.signedUrl).mockImplementation(async (_bucket, path) => `https://storage.test/signed/${path}?token=abc`)
  vi.mocked(auditRepository.record).mockResolvedValue(undefined)
}

export const app = createApp()

/** Minimal valid file bodies for magic-byte checks. */
export const FILES = {
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
  png: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e0005fe02fea72d8e650000000049454e44ae426082', 'hex'),
  exe: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62), Buffer.from('PE\0\0'), Buffer.alloc(200)]),
}
