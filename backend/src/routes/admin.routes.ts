import { Router } from 'express'
import * as admin from '../controllers/admin.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notFoundHandler } from '../middleware/error.js'
import { singleFile } from '../middleware/upload.js'
import { asyncHandler as h } from '../utils/http.js'

/** Everything under /api/admin is admin-only. The service-role client is reachable only from here and from checked services. */
const router = Router()
router.use(requireAuth, requireRole('admin'))

router.get('/users', h(admin.listUsers))
router.post('/users', h(admin.createUser))
router.patch('/users/:id', h(admin.updateUser))
router.post('/users/:id/reset-password', h(admin.resetUserPassword))

router.get('/courses', h(admin.listCourses))
router.post('/courses', h(admin.createCourse))
router.get('/courses/:id', h(admin.getCourse))
router.patch('/courses/:id', h(admin.updateCourse))
router.put('/courses/:id/teachers', h(admin.setTeachers))
router.get('/courses/:id/enrollments', h(admin.listRoster))
router.post('/courses/:id/enrollments', singleFile('file', 1024 * 1024), h(admin.enroll))
router.delete('/courses/:id/enrollments/:studentId', h(admin.unenroll))

router.get('/complaints', h(admin.listComplaints))
router.patch('/complaints/:id', h(admin.updateComplaint))

router.get('/audit-log', h(admin.listAudit))

router.use(notFoundHandler)

export default router
