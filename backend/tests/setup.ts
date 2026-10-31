import { beforeEach, vi } from 'vitest'
import { installAuthFixtures } from './helpers.js'

// The data layer is mocked for API tests: every route is exercised through the
// real middleware, validation and services, with repositories as test doubles.
vi.mock('../src/repositories/auth.repository.js')
vi.mock('../src/repositories/profile.repository.js')
vi.mock('../src/repositories/access.repository.js')
vi.mock('../src/repositories/audit.repository.js')
vi.mock('../src/repositories/storage.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repositories/storage.repository.js')>()
  return {
    ...actual,
    upload: vi.fn(),
    remove: vi.fn(),
    signedUrl: vi.fn(async (_bucket: string, path: string) => `https://storage.test/signed/${path}?token=abc`),
  }
})
vi.mock('../src/repositories/course.repository.js')
vi.mock('../src/repositories/resource.repository.js')
vi.mock('../src/repositories/assignment.repository.js')
vi.mock('../src/repositories/quiz.repository.js')
vi.mock('../src/repositories/marks.repository.js')
vi.mock('../src/repositories/announcement.repository.js')
vi.mock('../src/repositories/chat.repository.js')
vi.mock('../src/repositories/complaint.repository.js')
vi.mock('../src/repositories/notification.repository.js')
vi.mock('../src/repositories/dashboard.repository.js')

beforeEach(() => {
  vi.resetAllMocks()
  installAuthFixtures()
})
