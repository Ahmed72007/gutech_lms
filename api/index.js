// Vercel serverless entry: the whole Express API runs as one function at /api/*.
// `npm run build` compiles backend/ to backend/dist before functions are bundled.
import { createApp } from '../backend/dist/app.js'

export default createApp()
