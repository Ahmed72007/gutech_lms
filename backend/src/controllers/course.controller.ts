import type { Request, Response } from 'express'
import { uploadedFile } from '../middleware/upload.js'
import {
  createAssignmentSchema,
  gradeSchema,
  listAssignmentsQuery,
  submissionsQuery,
  submitSchema,
  updateAssignmentSchema,
} from '../schemas/assignment.schema.js'
import { courseIdParams, idParams } from '../schemas/common.schema.js'
import { gradebookQuery, myMarksQuery } from '../schemas/marks.schema.js'
import { createQuizSchema, quizListQuery, resultsQuery, submitAttemptSchema, updateQuizSchema } from '../schemas/quiz.schema.js'
import { createResourceSchema, listResourcesQuery } from '../schemas/resource.schema.js'
import * as assignmentService from '../services/assignment.service.js'
import * as courseService from '../services/course.service.js'
import * as dashboardService from '../services/dashboard.service.js'
import * as marksService from '../services/marks.service.js'
import * as quizService from '../services/quiz.service.js'
import * as resourceService from '../services/resource.service.js'
import { ctx, sendData, sendPage } from '../utils/http.js'

// Courses ---------------------------------------------------------------------
export async function myCourses(req: Request, res: Response) {
  sendData(res, await courseService.myCourses(ctx(req)))
}

export async function dashboard(req: Request, res: Response) {
  sendData(res, await dashboardService.dashboard(ctx(req)))
}

export async function getCourse(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendData(res, await courseService.getCourse(ctx(req), id))
}

export async function members(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendData(res, await courseService.members(ctx(req), id))
}

// Resources -------------------------------------------------------------------
export async function uploadResource(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendData(res, await resourceService.upload(ctx(req), id, createResourceSchema.parse(req.body), uploadedFile(req)), 201)
}

export async function listResources(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendPage(res, await resourceService.list(ctx(req), id, listResourcesQuery.parse(req.query)))
}

export async function downloadResource(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await resourceService.downloadUrl(ctx(req), id))
}

export async function deleteResource(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  await resourceService.remove(ctx(req), id)
  res.status(204).end()
}

// Assignments -----------------------------------------------------------------
export async function createAssignment(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendData(res, await assignmentService.create(ctx(req), id, createAssignmentSchema.parse(req.body), uploadedFile(req)), 201)
}

export async function listAssignments(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendPage(res, await assignmentService.list(ctx(req), id, listAssignmentsQuery.parse(req.query)))
}

export async function getAssignment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.get(ctx(req), id))
}

export async function updateAssignment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.update(ctx(req), id, updateAssignmentSchema.parse(req.body ?? {}), uploadedFile(req)))
}

export async function deleteAssignment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  await assignmentService.remove(ctx(req), id)
  res.status(204).end()
}

export async function assignmentAttachment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.attachmentUrl(ctx(req), id))
}

export async function submitAssignment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.submit(ctx(req), id, submitSchema.parse(req.body ?? {}), uploadedFile(req)))
}

export async function listSubmissions(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendPage(res, await assignmentService.listSubmissions(ctx(req), id, submissionsQuery.parse(req.query)))
}

export async function submissionFile(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.submissionFileUrl(ctx(req), id))
}

export async function gradeSubmission(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await assignmentService.grade(ctx(req), id, gradeSchema.parse(req.body)))
}

// Quizzes ---------------------------------------------------------------------
export async function createQuiz(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendData(res, await quizService.create(ctx(req), id, createQuizSchema.parse(req.body)), 201)
}

export async function listQuizzes(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  sendPage(res, await quizService.list(ctx(req), id, quizListQuery.parse(req.query)))
}

export async function getQuiz(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await quizService.get(ctx(req), id))
}

export async function updateQuiz(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await quizService.update(ctx(req), id, updateQuizSchema.parse(req.body)))
}

export async function deleteQuiz(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  await quizService.remove(ctx(req), id)
  res.status(204).end()
}

export async function startAttempt(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await quizService.startAttempt(ctx(req), id), 201)
}

export async function submitAttempt(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await quizService.submitAttempt(ctx(req), id, submitAttemptSchema.parse(req.body ?? {})))
}

export async function quizResults(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendPage(res, await quizService.results(ctx(req), id, resultsQuery.parse(req.query)))
}

// Marks -----------------------------------------------------------------------
export async function myMarks(req: Request, res: Response) {
  sendData(res, await marksService.myMarks(ctx(req), myMarksQuery.parse(req.query)))
}

export async function gradebook(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  const result = await marksService.gradebook(ctx(req), id, gradebookQuery.parse(req.query))
  res.json(result)
}

export async function gradebookCsv(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  const { fileName, csv } = await marksService.gradebookCsv(ctx(req), id)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.send(csv)
}
