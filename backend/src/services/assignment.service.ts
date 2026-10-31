import type { z } from 'zod'
import * as assignmentRepository from '../repositories/assignment.repository.js'
import type { Assignment, Submission } from '../repositories/assignment.repository.js'
import * as auditRepository from '../repositories/audit.repository.js'
import * as storage from '../repositories/storage.repository.js'
import type {
  createAssignmentSchema,
  gradeSchema,
  listAssignmentsQuery,
  submissionsQuery,
  submitSchema,
  updateAssignmentSchema,
} from '../schemas/assignment.schema.js'
import type { RequestContext, UploadedFile } from '../types/domain.js'
import { FILE_POLICIES, inspectFile, sanitizeFileName, storagePath } from '../utils/files.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { now } from '../utils/time.js'
import { assertCanManage, assertCanView, getCourseAccess } from './access.service.js'

export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'graded'

export function submissionStatus(submission: Submission | null | undefined): SubmissionStatus {
  if (!submission) return 'pending'
  if (submission.gradedAt) return 'graded'
  return submission.isLate ? 'late' : 'submitted'
}

function presentAssignment(a: Assignment) {
  return {
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    instructions: a.instructions,
    maxMarks: a.maxMarks,
    dueAt: a.dueAt,
    allowLate: a.allowLate,
    attachmentName: a.attachmentName,
    hasAttachment: Boolean(a.attachmentPath),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

export function presentSubmission(s: Submission) {
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    textAnswer: s.textAnswer,
    fileName: s.fileName,
    hasFile: Boolean(s.filePath),
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    marksObtained: s.marksObtained,
    feedback: s.feedback,
    gradedAt: s.gradedAt,
    status: submissionStatus(s),
  }
}

async function loadAssignment(id: string): Promise<Assignment> {
  const assignment = await assignmentRepository.findById(id)
  if (!assignment) throw errors.notFound('Assignment not found.')
  return assignment
}

async function storeAttachment(courseId: string, file: UploadedFile) {
  const { mime } = await inspectFile(file, FILE_POLICIES.document)
  const name = sanitizeFileName(file.originalName)
  const path = storagePath(`assignments/${courseId}`, name)
  await storage.upload(storage.BUCKETS.resources, path, file.buffer, mime)
  return { path, name }
}

export async function create(
  ctx: RequestContext,
  courseId: string,
  input: z.infer<typeof createAssignmentSchema>,
  file: UploadedFile | null,
) {
  await assertCanManage(ctx.user, courseId)
  if (input.dueAt <= now()) throw errors.unprocessable('The due date must be in the future.', [{ path: 'dueAt', message: 'Must be in the future' }])

  const attachment = file ? await storeAttachment(courseId, file) : null
  try {
    const assignment = await assignmentRepository.insert(courseId, ctx.user.id, {
      ...input,
      attachmentPath: attachment?.path ?? null,
      attachmentName: attachment?.name ?? null,
    })
    return presentAssignment(assignment)
  } catch (error) {
    if (attachment) await storage.remove(storage.BUCKETS.resources, [attachment.path])
    throw error
  }
}

export async function list(ctx: RequestContext, courseId: string, query: z.infer<typeof listAssignmentsQuery>) {
  const access = await assertCanView(ctx.user, courseId)
  const { rows, total } = await assignmentRepository.listForCourse(ctx.db, courseId, query)
  const ids = rows.map((a) => a.id)

  if (access.isStudent) {
    const mine = await assignmentRepository.ownSubmissions(ctx.db, ctx.user.id, ids)
    return {
      data: rows.map((a) => {
        const submission = mine.get(a.id)
        return {
          ...presentAssignment(a),
          mySubmission: submission ? presentSubmission(submission) : null,
          status: submissionStatus(submission),
        }
      }),
      meta: pageMeta(query, total),
    }
  }

  const stats = await assignmentRepository.submissionStats(ids)
  return {
    data: rows.map((a) => ({ ...presentAssignment(a), stats: stats.get(a.id) ?? { submitted: 0, graded: 0 } })),
    meta: pageMeta(query, total),
  }
}

export async function get(ctx: RequestContext, assignmentId: string) {
  const assignment = await loadAssignment(assignmentId)
  const access = await assertCanView(ctx.user, assignment.courseId)
  const base = { ...presentAssignment(assignment), course: access.course, viewer: { canManage: access.canManage, isStudent: access.isStudent } }
  if (access.isStudent) {
    const submission = await assignmentRepository.findSubmission(assignment.id, ctx.user.id)
    return { ...base, mySubmission: submission ? presentSubmission(submission) : null, status: submissionStatus(submission) }
  }
  const stats = await assignmentRepository.submissionStats([assignment.id])
  return { ...base, stats: stats.get(assignment.id) ?? { submitted: 0, graded: 0 } }
}

export async function update(
  ctx: RequestContext,
  assignmentId: string,
  input: z.infer<typeof updateAssignmentSchema>,
  file: UploadedFile | null,
) {
  const assignment = await loadAssignment(assignmentId)
  await assertCanManage(ctx.user, assignment.courseId)

  if (input.maxMarks !== undefined) {
    const highest = await assignmentRepository.highestGrade(assignment.id)
    if (highest !== null && input.maxMarks < highest) {
      throw errors.conflict(`Max marks cannot be lower than an existing grade (${highest}).`)
    }
  }

  const { removeAttachment, ...fields } = input
  let attachment: { path: string; name: string } | null = null
  if (file) attachment = await storeAttachment(assignment.courseId, file)

  try {
    const updated = await assignmentRepository.update(assignment.id, {
      ...fields,
      ...(attachment
        ? { attachmentPath: attachment.path, attachmentName: attachment.name }
        : removeAttachment
          ? { attachmentPath: null, attachmentName: null }
          : {}),
    })
    if ((attachment || removeAttachment) && assignment.attachmentPath) {
      await storage.remove(storage.BUCKETS.resources, [assignment.attachmentPath])
    }
    return presentAssignment(updated)
  } catch (error) {
    if (attachment) await storage.remove(storage.BUCKETS.resources, [attachment.path])
    throw error
  }
}

export async function remove(ctx: RequestContext, assignmentId: string) {
  const assignment = await loadAssignment(assignmentId)
  await assertCanManage(ctx.user, assignment.courseId)
  const submissionFiles = await assignmentRepository.submissionFilePaths(assignment.id)
  await assignmentRepository.remove(assignment.id)
  await storage.remove(storage.BUCKETS.resources, [assignment.attachmentPath])
  await storage.remove(storage.BUCKETS.submissions, submissionFiles)
  await auditRepository.record(ctx.user.id, 'assignment.delete', 'assignment', assignment.id)
}

export async function attachmentUrl(ctx: RequestContext, assignmentId: string) {
  const assignment = await loadAssignment(assignmentId)
  await assertCanView(ctx.user, assignment.courseId)
  if (!assignment.attachmentPath) throw errors.notFound('This assignment has no attachment.')
  const url = await storage.signedUrl(storage.BUCKETS.resources, assignment.attachmentPath, { downloadName: assignment.attachmentName ?? undefined })
  return { url, fileName: assignment.attachmentName, expiresIn: storage.SIGNED_URL_TTL_SECONDS }
}

/**
 * Create or replace the caller's submission. The server clock decides lateness;
 * resubmitting clears any previous grade.
 */
export async function submit(ctx: RequestContext, assignmentId: string, input: z.infer<typeof submitSchema>, file: UploadedFile | null) {
  if (ctx.user.role !== 'student') throw errors.forbidden('Only students can submit assignments.')
  const assignment = await loadAssignment(assignmentId)
  const access = await getCourseAccess(ctx.user, assignment.courseId)
  if (!access.isStudent) throw errors.forbidden('You are not enrolled in this course.')

  const submittedAt = now()
  const isLate = submittedAt > new Date(assignment.dueAt)
  if (isLate && !assignment.allowLate) {
    throw errors.conflict('The deadline has passed and late submissions are not accepted.', 'DEADLINE_PASSED')
  }

  const existing = await assignmentRepository.findSubmission(assignment.id, ctx.user.id)
  let filePath = input.removeFile ? null : (existing?.filePath ?? null)
  let fileName = input.removeFile ? null : (existing?.fileName ?? null)
  let uploadedPath: string | null = null

  if (file) {
    const { mime } = await inspectFile(file, FILE_POLICIES.document)
    fileName = sanitizeFileName(file.originalName)
    uploadedPath = storagePath(`${assignment.courseId}/${assignment.id}/${ctx.user.id}`, fileName)
    await storage.upload(storage.BUCKETS.submissions, uploadedPath, file.buffer, mime)
    filePath = uploadedPath
  }

  const textAnswer = input.textAnswer ?? null
  if (!textAnswer && !filePath) {
    if (uploadedPath) await storage.remove(storage.BUCKETS.submissions, [uploadedPath])
    throw errors.unprocessable('Add a written answer or attach a file.')
  }

  try {
    const submission = await assignmentRepository.upsertSubmission({
      assignmentId: assignment.id,
      studentId: ctx.user.id,
      textAnswer,
      filePath,
      fileName,
      isLate,
      submittedAt,
    })
    if (existing?.filePath && existing.filePath !== filePath) {
      await storage.remove(storage.BUCKETS.submissions, [existing.filePath])
    }
    return presentSubmission(submission)
  } catch (error) {
    if (uploadedPath) await storage.remove(storage.BUCKETS.submissions, [uploadedPath])
    throw error
  }
}

export async function listSubmissions(ctx: RequestContext, assignmentId: string, query: z.infer<typeof submissionsQuery>) {
  const assignment = await loadAssignment(assignmentId)
  await assertCanManage(ctx.user, assignment.courseId)
  const { rows, total } = await assignmentRepository.roster(assignment.courseId, assignment.id, query)
  return {
    data: rows.map((entry) => ({
      student: entry.student,
      submission: entry.submission ? presentSubmission(entry.submission) : null,
      status: submissionStatus(entry.submission),
    })),
    meta: pageMeta(query, total),
  }
}

/** Students may download only their own file; graders any file in their course. */
export async function submissionFileUrl(ctx: RequestContext, submissionId: string) {
  const submission = await assignmentRepository.findSubmissionById(submissionId)
  if (!submission) throw errors.notFound('Submission not found.')
  if (submission.studentId !== ctx.user.id) {
    const assignment = await loadAssignment(submission.assignmentId)
    await assertCanManage(ctx.user, assignment.courseId)
  }
  if (!submission.filePath) throw errors.notFound('This submission has no file.')
  const url = await storage.signedUrl(storage.BUCKETS.submissions, submission.filePath, { downloadName: submission.fileName ?? undefined })
  return { url, fileName: submission.fileName, expiresIn: storage.SIGNED_URL_TTL_SECONDS }
}

export async function grade(ctx: RequestContext, submissionId: string, input: z.infer<typeof gradeSchema>) {
  const submission = await assignmentRepository.findSubmissionById(submissionId)
  if (!submission) throw errors.notFound('Submission not found.')
  const assignment = await loadAssignment(submission.assignmentId)
  await assertCanManage(ctx.user, assignment.courseId)

  if (input.marks > assignment.maxMarks) {
    throw errors.unprocessable(`Marks must be between 0 and ${assignment.maxMarks}.`, [
      { path: 'marks', message: `Must be at most ${assignment.maxMarks}` },
    ])
  }

  const graded = await assignmentRepository.grade(submission.id, {
    marks: input.marks,
    feedback: input.feedback ?? null,
    graderId: ctx.user.id,
    gradedAt: now(),
  })
  await auditRepository.record(ctx.user.id, 'submission.grade', 'submission', submission.id)
  return presentSubmission(graded)
}
