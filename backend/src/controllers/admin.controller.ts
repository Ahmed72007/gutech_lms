import type { Request, Response } from 'express'
import { uploadedFile } from '../middleware/upload.js'
import { adminComplaintsQuery, updateComplaintSchema } from '../schemas/communication.schema.js'
import { idParams } from '../schemas/common.schema.js'
import {
  createCourseSchema,
  enrollmentParams,
  enrollQuery,
  enrollSchema,
  listCoursesQuery,
  rosterQuery,
  setTeachersSchema,
  updateCourseSchema,
} from '../schemas/course.schema.js'
import { auditQuery } from '../schemas/marks.schema.js'
import { adminResetPasswordSchema, createUserSchema, listUsersQuery, updateUserSchema } from '../schemas/user.schema.js'
import * as auditService from '../services/audit.service.js'
import * as complaintService from '../services/complaint.service.js'
import * as courseService from '../services/course.service.js'
import * as userService from '../services/user.service.js'
import { ctx, errors, sendData, sendPage } from '../utils/http.js'

// Users -----------------------------------------------------------------------
export async function createUser(req: Request, res: Response) {
  sendData(res, await userService.createUser(ctx(req).user, createUserSchema.parse(req.body)), 201)
}

export async function listUsers(req: Request, res: Response) {
  sendPage(res, await userService.listUsers(listUsersQuery.parse(req.query)))
}

export async function updateUser(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await userService.updateUser(ctx(req).user, id, updateUserSchema.parse(req.body)))
}

export async function resetUserPassword(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await userService.resetUserPassword(ctx(req).user, id, adminResetPasswordSchema.parse(req.body ?? {})))
}

// Courses ---------------------------------------------------------------------
export async function listCourses(req: Request, res: Response) {
  sendPage(res, await courseService.listCourses(listCoursesQuery.parse(req.query)))
}

export async function getCourse(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await courseService.getCourseForAdmin(id))
}

export async function createCourse(req: Request, res: Response) {
  sendData(res, await courseService.createCourse(ctx(req).user, createCourseSchema.parse(req.body)), 201)
}

export async function updateCourse(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await courseService.updateCourse(ctx(req).user, id, updateCourseSchema.parse(req.body)))
}

export async function setTeachers(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  const { teacherIds } = setTeachersSchema.parse(req.body)
  sendData(res, await courseService.setTeachers(ctx(req).user, id, teacherIds))
}

export async function listRoster(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendPage(res, await courseService.listRoster(id, rosterQuery.parse(req.query)))
}

/** JSON `{ studentIds }` or a multipart CSV upload (`file`). `?dryRun=true` previews. */
export async function enroll(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  const { dryRun } = enrollQuery.parse(req.query)
  const file = uploadedFile(req)
  const source = file ? { csv: file.buffer.toString('utf8') } : enrollSchema.parse(req.body)
  if (file && file.size === 0) throw errors.unprocessable('The CSV file is empty.')
  const report = await courseService.enroll(ctx(req).user, id, source, dryRun)
  sendData(res, report, dryRun ? 200 : 201)
}

export async function unenroll(req: Request, res: Response) {
  const { id, studentId } = enrollmentParams.parse(req.params)
  await courseService.unenroll(ctx(req).user, id, studentId)
  res.status(204).end()
}

// Complaints ------------------------------------------------------------------
export async function listComplaints(req: Request, res: Response) {
  sendPage(res, await complaintService.listAll(adminComplaintsQuery.parse(req.query)))
}

export async function updateComplaint(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await complaintService.updateStatus(ctx(req), id, updateComplaintSchema.parse(req.body)))
}

// Audit -----------------------------------------------------------------------
export async function listAudit(req: Request, res: Response) {
  sendPage(res, await auditService.list(auditQuery.parse(req.query)))
}
