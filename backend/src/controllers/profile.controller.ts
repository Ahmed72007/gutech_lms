import type { Request, Response } from 'express'
import { uploadedFile } from '../middleware/upload.js'
import { updateOwnProfileSchema } from '../schemas/user.schema.js'
import * as profileService from '../services/profile.service.js'
import { ctx, errors, sendData } from '../utils/http.js'

export async function getProfile(req: Request, res: Response) {
  sendData(res, await profileService.getOwnProfile(ctx(req)))
}

export async function updateProfile(req: Request, res: Response) {
  sendData(res, await profileService.updateOwnProfile(ctx(req), updateOwnProfileSchema.parse(req.body)))
}

export async function uploadAvatar(req: Request, res: Response) {
  const file = uploadedFile(req)
  if (!file) throw errors.unprocessable('Choose an image to upload.')
  sendData(res, await profileService.uploadAvatar(ctx(req), file))
}

export async function removeAvatar(req: Request, res: Response) {
  sendData(res, await profileService.removeAvatar(ctx(req)))
}
