import { Router } from 'express'
import * as comms from '../controllers/communication.controller.js'
import * as course from '../controllers/course.controller.js'
import * as profile from '../controllers/profile.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { chatLimiter } from '../middleware/rateLimit.js'
import { singleFile } from '../middleware/upload.js'
import { FILE_POLICIES } from '../utils/files.js'
import { asyncHandler as h } from '../utils/http.js'

/**
 * Authenticated application routes. Role guards here are the first gate;
 * services re-check course membership/ownership for every request.
 */
const router = Router()
router.use(requireAuth)

const staff = requireRole('teacher', 'admin')
const student = requireRole('student')
const members = requireRole('teacher', 'student')
const documentUpload = (field: string) => singleFile(field, FILE_POLICIES.document.maxBytes)

// Profile + dashboard
router.get('/profile', h(profile.getProfile))
router.patch('/profile', h(profile.updateProfile))
router.post('/profile/avatar', singleFile('avatar', FILE_POLICIES.avatar.maxBytes), h(profile.uploadAvatar))
router.delete('/profile/avatar', h(profile.removeAvatar))
router.get('/me/dashboard', h(course.dashboard))
router.get('/me/courses', members, h(course.myCourses))
router.get('/me/marks', student, h(course.myMarks))

// Courses
router.get('/courses/:id', h(course.getCourse))
router.get('/courses/:id/members', h(course.members))

// Resources (Feature 2)
router.post('/courses/:id/resources', staff, documentUpload('file'), h(course.uploadResource))
router.get('/courses/:id/resources', h(course.listResources))
router.get('/resources/:id/download', h(course.downloadResource))
router.delete('/resources/:id', staff, h(course.deleteResource))

// Assignments (Feature 4)
router.post('/courses/:id/assignments', staff, documentUpload('attachment'), h(course.createAssignment))
router.get('/courses/:id/assignments', h(course.listAssignments))
router.get('/assignments/:id', h(course.getAssignment))
router.patch('/assignments/:id', staff, documentUpload('attachment'), h(course.updateAssignment))
router.delete('/assignments/:id', staff, h(course.deleteAssignment))
router.get('/assignments/:id/attachment', h(course.assignmentAttachment))
router.put('/assignments/:id/submission', student, documentUpload('file'), h(course.submitAssignment))
router.get('/assignments/:id/submissions', staff, h(course.listSubmissions))
router.get('/submissions/:id/download', h(course.submissionFile))
router.patch('/submissions/:id/grade', staff, h(course.gradeSubmission))

// Quizzes (Feature 5)
router.post('/courses/:id/quizzes', staff, h(course.createQuiz))
router.get('/courses/:id/quizzes', h(course.listQuizzes))
router.get('/quizzes/:id', h(course.getQuiz))
router.patch('/quizzes/:id', staff, h(course.updateQuiz))
router.delete('/quizzes/:id', staff, h(course.deleteQuiz))
router.post('/quizzes/:id/attempt', student, h(course.startAttempt))
router.post('/quizzes/:id/attempt/submit', student, h(course.submitAttempt))
router.get('/quizzes/:id/results', staff, h(course.quizResults))

// Marks (Feature 7)
router.get('/courses/:id/gradebook', staff, h(course.gradebook))
router.get('/courses/:id/gradebook.csv', staff, h(course.gradebookCsv))

// Announcements (Feature 6)
router.get('/announcements', h(comms.listAnnouncements))
router.post('/announcements', staff, h(comms.createAnnouncement))
router.get('/announcements/unread-count', h(comms.unreadAnnouncements))
router.post('/announcements/read', h(comms.markAnnouncementsRead))
router.patch('/announcements/:id', staff, h(comms.updateAnnouncement))
router.delete('/announcements/:id', staff, h(comms.deleteAnnouncement))

// Classroom chat (Feature 8)
router.get('/courses/:id/messages', h(comms.listMessages))
router.post('/courses/:id/messages', chatLimiter, h(comms.sendMessage))
router.delete('/messages/:id', h(comms.deleteMessage))

// Complaints (Feature 9)
router.post('/complaints', members, singleFile('attachment', FILE_POLICIES.complaint.maxBytes), h(comms.createComplaint))
router.get('/complaints/mine', members, h(comms.myComplaints))
router.get('/complaints/:id', h(comms.getComplaint))
router.get('/complaints/:id/attachment', h(comms.complaintAttachment))

// Notifications
router.get('/notifications', h(comms.listNotifications))
router.get('/notifications/unread-count', h(comms.unreadNotifications))
router.post('/notifications/read', h(comms.markNotificationsRead))

export default router
