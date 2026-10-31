/**
 * Seeds a HOSTED Supabase project with demo data through the admin API
 * (local `supabase db reset` uses supabase/seed.sql instead).
 * Idempotent: re-running skips anything that already exists.
 *
 *   npm run db:seed --workspace backend
 *
 * Every account gets the temporary password below and must change it at first sign-in.
 * Never run this against production.
 */
import { adminDb } from '../src/config/supabase.js'

const TEMP_PASSWORD = 'ChangeMe123!'

const users = [
  { email: 'admin@gutech.example', fullName: 'Amina Al-Balushi', role: 'admin', rollNo: null },
  { email: 'teacher.one@gutech.example', fullName: 'Salim Al-Hinai', role: 'teacher', rollNo: null },
  { email: 'teacher.two@gutech.example', fullName: 'Maha Al-Rawahi', role: 'teacher', rollNo: null },
  { email: 'student.one@gutech.example', fullName: 'Noor Said', role: 'student', rollNo: 'S2026001' },
  { email: 'student.two@gutech.example', fullName: 'Omar Nasser', role: 'student', rollNo: 'S2026002' },
  { email: 'student.three@gutech.example', fullName: 'Mariam Ahmed', role: 'student', rollNo: 'S2026003' },
  { email: 'student.four@gutech.example', fullName: 'Yusuf Hamad', role: 'student', rollNo: 'S2026004' },
  { email: 'student.five@gutech.example', fullName: 'Laila Khalid', role: 'student', rollNo: 'S2026005' },
] as const

const courses = [
  { code: 'CS101', title: 'Introduction to Computer Science', description: 'A practical foundation in computing, programming and problem solving.', teacher: 'teacher.one@gutech.example' },
  { code: 'MG204', title: 'Innovation and Entrepreneurship', description: 'From opportunity discovery to validating a sustainable venture.', teacher: 'teacher.two@gutech.example' },
  { code: 'DS180', title: 'Data Stories and Visualisation', description: 'Explore data, reveal patterns and communicate findings with clarity.', teacher: 'teacher.one@gutech.example' },
]

function check<T>(result: { data: T; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

/** Like check, but the query must return data. */
function need<T>(result: { data: T; error: { message: string } | null }, label: string): NonNullable<T> {
  const data = check(result, label)
  if (data === null || data === undefined) throw new Error(`${label}: no data returned`)
  return data
}

async function ensureUser(u: (typeof users)[number]): Promise<string> {
  const existing = check(await adminDb.from('profiles').select('id').eq('email', u.email).maybeSingle(), 'find profile')
  if (existing) return (existing as { id: string }).id

  const { data, error } = await adminDb.auth.admin.createUser({
    email: u.email,
    password: TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.fullName },
  })
  let id = data.user?.id
  if (error) {
    // Auth user exists without a profile (e.g. a partial earlier run): look it up.
    const list = await adminDb.auth.admin.listUsers({ perPage: 1000 })
    id = list.data.users.find((x) => x.email === u.email)?.id
    if (!id) throw new Error(`create ${u.email}: ${error.message}`)
  }
  check(
    await adminDb.from('profiles').insert({ id, full_name: u.fullName, email: u.email, role: u.role, roll_no: u.rollNo, must_change_password: true }),
    `insert profile ${u.email}`,
  )
  return id as string
}

async function main() {
  console.info('Seeding users…')
  const ids = new Map<string, string>()
  for (const u of users) ids.set(u.email, await ensureUser(u))

  console.info('Seeding courses…')
  const courseIds = new Map<string, string>()
  for (const c of courses) {
    const row = need(
      await adminDb
        .from('courses')
        .upsert({ code: c.code, title: c.title, description: c.description }, { onConflict: 'code' })
        .select('id')
        .single(),
      `course ${c.code}`,
    )
    courseIds.set(c.code, row.id as string)
    check(
      await adminDb.from('course_teachers').upsert({ course_id: row.id, teacher_id: ids.get(c.teacher) }, { ignoreDuplicates: true }),
      `teacher ${c.code}`,
    )
  }

  console.info('Enrolling students…')
  const enrollments = users
    .filter((u) => u.role === 'student')
    .flatMap((u) =>
      courses
        .filter((c) => c.code !== 'MG204' || ['S2026001', 'S2026002', 'S2026003'].includes(u.rollNo ?? ''))
        .map((c) => ({ course_id: courseIds.get(c.code), student_id: ids.get(u.email) })),
    )
  check(await adminDb.from('enrollments').upsert(enrollments, { ignoreDuplicates: true }), 'enrollments')

  console.info('Adding demo content…')
  const adminId = ids.get('admin@gutech.example')
  const teacherId = ids.get('teacher.one@gutech.example')
  const cs101 = courseIds.get('CS101')

  const hasWelcome = need(await adminDb.from('announcements').select('id').is('course_id', null).limit(1), 'announcements')
  if (hasWelcome.length === 0) {
    check(
      await adminDb.from('announcements').insert([
        { course_id: null, author_id: adminId, title: 'Welcome to the GUtech learning portal', body: 'Your courses, resources, assignments, marks and campus updates now live in one place.', is_pinned: true },
        { course_id: cs101, author_id: teacherId, title: 'Lab session moved to Thursday', body: "This week's programming lab moves to Thursday 10:00 in Lab B2." },
      ]),
      'insert announcements',
    )
  }

  const hasAssignment = need(await adminDb.from('assignments').select('id').eq('course_id', cs101).limit(1), 'assignments')
  if (hasAssignment.length === 0) {
    check(
      await adminDb.from('assignments').insert({
        course_id: cs101,
        created_by: teacherId,
        title: 'Problem set 1: Algorithms',
        instructions: 'Solve the five problems and explain the complexity of each solution.',
        max_marks: 20,
        due_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      }),
      'insert assignment',
    )
  }

  const hasQuiz = need(await adminDb.from('quizzes').select('id').eq('course_id', cs101).limit(1), 'quizzes')
  if (hasQuiz.length === 0) {
    const quiz = need(
      await adminDb
        .from('quizzes')
        .insert({
          course_id: cs101,
          created_by: teacherId,
          title: 'Week 1 check-in',
          description: 'A short warm-up on computing fundamentals.',
          time_limit_minutes: 10,
          opens_at: new Date(Date.now() - 864e5).toISOString(),
          closes_at: new Date(Date.now() + 14 * 864e5).toISOString(),
          is_published: true,
        })
        .select('id')
        .single(),
      'insert quiz',
    )
    check(
      await adminDb.rpc('save_quiz_questions', {
        p_quiz_id: quiz.id,
        p_questions: [
          { type: 'mcq_single', prompt: 'Which unit executes program instructions?', marks: 2, options: [{ id: 'a', text: 'CPU' }, { id: 'b', text: 'SSD' }, { id: 'c', text: 'Monitor' }], correctOptionIds: ['a'] },
          { type: 'mcq_multi', prompt: 'Select every programming language.', marks: 3, options: [{ id: 'a', text: 'Python' }, { id: 'b', text: 'HTML' }, { id: 'c', text: 'TypeScript' }, { id: 'd', text: 'SQL' }], correctOptionIds: ['a', 'c', 'd'] },
          { type: 'true_false', prompt: 'Binary uses base 2.', marks: 1, options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], correctOptionIds: ['true'] },
        ],
      }),
      'quiz questions',
    )
  }

  console.info(`Done. Sign in with any seeded email and the temporary password ${TEMP_PASSWORD}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
