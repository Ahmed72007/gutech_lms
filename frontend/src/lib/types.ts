export type Role = 'admin' | 'teacher' | 'student'

export interface PageMeta {
  page: number
  pageSize: number
  total: number
}

export interface Paged<T> {
  data: T[]
  meta: PageMeta
}

export interface Profile {
  id: string
  fullName: string
  email: string
  role: Role
  rollNo: string | null
  phone: string | null
  bio: string | null
  avatarUrl: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export interface Session {
  accessToken: string
  expiresAt: number | null
  profile: Profile
}

export interface AdminUser {
  id: string
  fullName: string
  email: string
  role: Role
  rollNo: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
}

export interface PersonRef {
  id: string
  fullName: string
  email: string
}

export interface Course {
  id: string
  code: string
  title: string
  description: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  teachers: PersonRef[]
  studentCount: number
}

export interface CourseDetail extends Course {
  viewer: { canManage: boolean; isTeacher: boolean; isStudent: boolean }
}

export interface CourseRef {
  id: string
  code: string
  title: string
}

export interface Member {
  id: string
  fullName: string
  email: string
  rollNo: string | null
  role: 'teacher' | 'student'
}

export interface RosterStudent {
  id: string
  fullName: string
  email: string
  rollNo: string | null
  enrolledAt: string
}

export interface EnrollmentReport {
  dryRun: boolean
  enrolled: number
  matched: Array<{ id: string; email: string; fullName: string }>
  alreadyEnrolled: string[]
  duplicates: string[]
  unknown: string[]
  notStudents: string[]
  invalid: string[]
}

export interface Resource {
  id: string
  courseId: string
  title: string
  description: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; fullName: string } | null
}

export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'graded'

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  textAnswer: string | null
  fileName: string | null
  hasFile: boolean
  submittedAt: string
  isLate: boolean
  marksObtained: number | null
  feedback: string | null
  gradedAt: string | null
  status: SubmissionStatus
}

export interface Assignment {
  id: string
  courseId: string
  title: string
  instructions: string
  maxMarks: number
  dueAt: string
  allowLate: boolean
  attachmentName: string | null
  hasAttachment: boolean
  createdAt: string
  updatedAt: string
  mySubmission?: Submission | null
  status?: SubmissionStatus
  stats?: { submitted: number; graded: number }
}

export interface AssignmentDetail extends Assignment {
  course: CourseRef & { isArchived: boolean }
  viewer: { canManage: boolean; isStudent: boolean }
}

export interface SubmissionRow {
  student: { id: string; fullName: string; email: string; rollNo: string | null }
  submission: Submission | null
  status: SubmissionStatus
}

export type QuestionType = 'mcq_single' | 'mcq_multi' | 'true_false'
export type QuizWindow = 'draft' | 'upcoming' | 'open' | 'closed'
export type AttemptStatus = 'in_progress' | 'submitted' | 'expired'

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  type: QuestionType
  prompt: string
  options: QuizOption[]
  marks: number
  correctOptionIds?: string[]
}

export interface AttemptSummary {
  id: string
  status: AttemptStatus
  startedAt: string
  expiresAt: string
  submittedAt: string | null
  score: number | null
}

export interface Quiz {
  id: string
  courseId: string
  title: string
  description: string | null
  timeLimitMinutes: number
  opensAt: string
  closesAt: string
  isPublished: boolean
  shuffleQuestions: boolean
  window: QuizWindow
  questionCount?: number
  totalMarks: number
  attemptCount?: number
  myAttempt?: AttemptSummary | null
  questions?: QuizQuestion[]
  course?: CourseRef
  viewer?: { canManage: boolean }
}

export interface AttemptPayload {
  attemptId: string
  quizId: string
  title: string
  startedAt: string
  expiresAt: string
  serverTime: string
  questions: QuizQuestion[]
}

export interface AttemptResult {
  attemptId: string
  score: number
  totalMarks: number
  correctCount: number
  questionCount: number
  submittedAt: string
  expired: boolean
}

export interface Totals {
  obtained: number
  max: number
  percentage: number | null
  gradedCount: number
  pendingCount: number
}

export interface MarkItem {
  courseId: string
  kind: 'assignment' | 'quiz'
  itemId: string
  title: string
  obtained: number | null
  max: number
  gradedAt: string | null
  status: 'pending' | 'graded'
}

export interface MyMarks {
  courses: Array<{ course: CourseRef; items: MarkItem[]; totals: Totals }>
  overall: Totals
}

export interface GradebookItem {
  id: string
  kind: 'assignment' | 'quiz'
  title: string
  max: number
  dueAt: string
}

export interface Gradebook {
  course: CourseRef
  items: GradebookItem[]
  rows: Array<{
    student: { id: string; fullName: string; email: string; rollNo: string | null }
    cells: Array<{ itemId: string; obtained: number | null; status: 'graded' | 'pending' | 'missing'; submissionId: string | null }>
    totals: Totals
  }>
}

export interface Announcement {
  id: string
  courseId: string | null
  title: string
  body: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
  author: { id: string; fullName: string; role: Role } | null
  course: CourseRef | null
  isRead: boolean
}

export interface ChatMessage {
  id: string
  courseId: string
  senderId: string
  body: string | null
  createdAt: string
  deletedAt: string | null
  sender: { id: string; fullName: string; role: Role } | null
}

export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'rejected'
export type ComplaintCategory = 'academic' | 'technical' | 'facility' | 'conduct' | 'other'

export interface Complaint {
  id: string
  raisedBy: { id: string; fullName: string; email: string; role: Role } | null
  course: CourseRef | null
  category: ComplaintCategory
  subject: string
  description: string
  attachmentName: string | null
  hasAttachment: boolean
  status: ComplaintStatus
  adminResponse: string | null
  resolvedBy: { id: string; fullName: string } | null
  createdAt: string
  updatedAt: string
}

export interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface AuditEntry {
  id: number
  action: string
  entity: string
  entityId: string | null
  at: string
  actor: { id: string; fullName: string; role: Role } | null
}

export interface SignedFile {
  url: string
  fileName: string | null
  expiresIn: number
}

export interface StudentDashboard {
  role: 'student'
  courses: Course[]
  upcomingAssignments: Array<{ id: string; title: string; dueAt: string; maxMarks: number; allowLate: boolean; course: CourseRef | null; submitted: boolean }>
  openQuizzes: Array<{ id: string; title: string; closesAt: string; timeLimitMinutes: number; course: CourseRef | null }>
  recentMarks: Array<{ courseId: string; kind: string; itemId: string; title: string; obtained: number | null; max: number; gradedAt: string | null }>
  overall: Totals
}

export interface TeacherDashboard {
  role: 'teacher'
  courses: Course[]
  studentCount: number
  toGrade: {
    total: number
    rows: Array<{
      id: string
      submittedAt: string
      isLate: boolean
      student: { id: string; fullName: string } | null
      assignment: { id: string; title: string; courseId: string }
    }>
  }
  upcomingDeadlines: Array<{ id: string; title: string; dueAt: string; maxMarks: number; course: CourseRef | null }>
}

export interface AdminDashboard {
  role: 'admin'
  users: Record<Role, number>
  activeCourses: number
  openComplaints: number
  recentAudit: AuditEntry[]
  recentComplaints: Array<Pick<Complaint, 'id' | 'subject' | 'category' | 'status' | 'createdAt' | 'raisedBy'>>
}

export type Dashboard = StudentDashboard | TeacherDashboard | AdminDashboard
