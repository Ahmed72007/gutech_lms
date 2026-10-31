import type { Request, Response } from 'express'
import { uploadedFile } from '../middleware/upload.js'
import {
  createAnnouncementSchema,
  createComplaintSchema,
  listAnnouncementsQuery,
  listMessagesQuery,
  markNotificationsSchema,
  markReadSchema,
  myComplaintsQuery,
  sendMessageSchema,
  updateAnnouncementSchema,
} from '../schemas/communication.schema.js'
import { courseIdParams, idParams, pagination } from '../schemas/common.schema.js'
import * as announcementService from '../services/announcement.service.js'
import * as chatService from '../services/chat.service.js'
import * as complaintService from '../services/complaint.service.js'
import * as notificationService from '../services/notification.service.js'
import { ctx, sendData, sendPage } from '../utils/http.js'

// Announcements ---------------------------------------------------------------
export async function createAnnouncement(req: Request, res: Response) {
  sendData(res, await announcementService.create(ctx(req), createAnnouncementSchema.parse(req.body)), 201)
}

export async function listAnnouncements(req: Request, res: Response) {
  sendPage(res, await announcementService.list(ctx(req), listAnnouncementsQuery.parse(req.query)))
}

export async function updateAnnouncement(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await announcementService.update(ctx(req), id, updateAnnouncementSchema.parse(req.body)))
}

export async function deleteAnnouncement(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  await announcementService.remove(ctx(req), id)
  res.status(204).end()
}

export async function markAnnouncementsRead(req: Request, res: Response) {
  const { before } = markReadSchema.parse(req.body ?? {})
  sendData(res, await announcementService.markRead(ctx(req), before))
}

export async function unreadAnnouncements(req: Request, res: Response) {
  sendData(res, await announcementService.unreadCount(ctx(req)))
}

// Chat ------------------------------------------------------------------------
export async function listMessages(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  res.json(await chatService.history(ctx(req), id, listMessagesQuery.parse(req.query)))
}

export async function sendMessage(req: Request, res: Response) {
  const { id } = courseIdParams.parse(req.params)
  const { body } = sendMessageSchema.parse(req.body)
  sendData(res, await chatService.send(ctx(req), id, body), 201)
}

export async function deleteMessage(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  await chatService.remove(ctx(req), id)
  res.status(204).end()
}

// Complaints ------------------------------------------------------------------
export async function createComplaint(req: Request, res: Response) {
  sendData(res, await complaintService.create(ctx(req), createComplaintSchema.parse(req.body), uploadedFile(req)), 201)
}

export async function myComplaints(req: Request, res: Response) {
  sendPage(res, await complaintService.listMine(ctx(req), myComplaintsQuery.parse(req.query)))
}

export async function getComplaint(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await complaintService.get(ctx(req), id))
}

export async function complaintAttachment(req: Request, res: Response) {
  const { id } = idParams.parse(req.params)
  sendData(res, await complaintService.attachmentUrl(ctx(req), id))
}

// Notifications ---------------------------------------------------------------
export async function listNotifications(req: Request, res: Response) {
  sendPage(res, await notificationService.list(ctx(req), pagination.parse(req.query)))
}

export async function unreadNotifications(req: Request, res: Response) {
  sendData(res, await notificationService.unreadCount(ctx(req)))
}

export async function markNotificationsRead(req: Request, res: Response) {
  const { ids } = markNotificationsSchema.parse(req.body ?? {})
  await notificationService.markRead(ctx(req), ids)
  sendData(res, { success: true })
}
