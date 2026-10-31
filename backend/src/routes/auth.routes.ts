import { Router } from 'express'
import * as auth from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'
import { notFoundHandler } from '../middleware/error.js'
import { forgotPasswordLimiter, loginLimiter, sensitiveLimiter } from '../middleware/rateLimit.js'
import { asyncHandler as h } from '../utils/http.js'

// There is intentionally no sign-up route: users are created by admins only.
const router = Router()

router.post('/login', loginLimiter, h(auth.login))
router.post('/refresh', h(auth.refresh))
router.post('/forgot-password', forgotPasswordLimiter, h(auth.forgotPassword))
router.post('/reset-password', sensitiveLimiter, h(auth.resetPassword))
router.post('/logout', requireAuth, h(auth.logout))
router.get('/me', requireAuth, h(auth.me))
router.post('/change-password', requireAuth, sensitiveLimiter, h(auth.changePassword))
router.use(notFoundHandler)

export default router
