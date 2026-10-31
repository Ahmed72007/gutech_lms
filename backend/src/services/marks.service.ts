import type { z } from 'zod'
import * as marksRepository from '../repositories/marks.repository.js'
import type { GradebookCell, GradebookItem, GradebookStudent } from '../repositories/marks.repository.js'
import type { gradebookQuery, myMarksQuery } from '../schemas/marks.schema.js'
import type { RequestContext } from '../types/domain.js'
import { toCsv } from '../utils/csv.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { assertCanManage, assertCanView } from './access.service.js'

const round2 = (n: number) => Math.round(n * 100) / 100

/** percentage = sum(obtained) / sum(max) * 100, counting graded items only. */
export function totals(entries: Array<{ obtained: number | null; max: number }>) {
  const graded = entries.filter((e) => e.obtained !== null)
  const obtained = round2(graded.reduce((sum, e) => sum + (e.obtained ?? 0), 0))
  const max = round2(graded.reduce((sum, e) => sum + e.max, 0))
  return {
    obtained,
    max,
    percentage: max > 0 ? round2((obtained / max) * 100) : null,
    gradedCount: graded.length,
    pendingCount: entries.length - graded.length,
  }
}

export async function myMarks(ctx: RequestContext, query: z.infer<typeof myMarksQuery>) {
  if (ctx.user.role !== 'student') throw errors.forbidden('Only students have personal marks.')
  if (query.studentId && query.studentId !== ctx.user.id) throw errors.forbidden('You can only view your own marks.')
  if (query.courseId) await assertCanView(ctx.user, query.courseId)

  const rows = await marksRepository.studentMarks(ctx.db, ctx.user.id, query.courseId)
  const courses = await marksRepository.coursesByIds([...new Set(rows.map((r) => r.courseId))])

  const byCourse = courses.map((course) => {
    const items = rows
      .filter((r) => r.courseId === course.id)
      .map((r) => ({ ...r, status: r.obtained === null ? ('pending' as const) : ('graded' as const) }))
      .sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''))
    return { course, items, totals: totals(items) }
  })

  return { courses: byCourse, overall: totals(rows) }
}

function buildRows(items: GradebookItem[], students: GradebookStudent[], cells: GradebookCell[]) {
  const index = new Map(cells.map((c) => [`${c.studentId}:${c.itemId}`, c]))
  return students.map((student) => {
    const studentCells = items.map((item) => {
      const cell = index.get(`${student.id}:${item.id}`)
      return {
        itemId: item.id,
        obtained: cell?.obtained ?? null,
        status: !cell ? ('missing' as const) : cell.obtained === null ? ('pending' as const) : ('graded' as const),
        submissionId: cell?.submissionId ?? null,
      }
    })
    const graded = studentCells.map((c, i) => ({ obtained: c.obtained, max: items[i]?.max ?? 0 }))
    return { student, cells: studentCells, totals: totals(graded) }
  })
}

export async function gradebook(ctx: RequestContext, courseId: string, query: z.infer<typeof gradebookQuery>) {
  const access = await assertCanManage(ctx.user, courseId)
  const [items, { rows: students, total }] = await Promise.all([
    marksRepository.gradebookItems(courseId),
    marksRepository.gradebookStudents(courseId, query),
  ])
  const cells = await marksRepository.gradebookCells(
    items,
    students.map((s) => s.id),
  )
  return {
    data: { course: access.course, items, rows: buildRows(items, students, cells) },
    meta: pageMeta(query, total),
  }
}

/** Full gradebook as CSV (UTF-8 BOM for Excel). */
export async function gradebookCsv(ctx: RequestContext, courseId: string) {
  const access = await assertCanManage(ctx.user, courseId)
  const items = await marksRepository.gradebookItems(courseId)

  const students: GradebookStudent[] = []
  for (let page = 1; ; page += 1) {
    const { rows, total } = await marksRepository.gradebookStudents(courseId, { page, pageSize: 100 })
    students.push(...rows)
    if (students.length >= total || rows.length === 0) break
  }
  const cells = await marksRepository.gradebookCells(
    items,
    students.map((s) => s.id),
  )
  const rows = buildRows(items, students, cells)

  const headers = ['Roll No', 'Name', 'Email', ...items.map((i) => `${i.title} (/${i.max})`), 'Total', 'Out of', 'Percentage']
  const lines = rows.map((r) => [
    r.student.rollNo,
    r.student.fullName,
    r.student.email,
    ...r.cells.map((c) => (c.status === 'graded' ? c.obtained : c.status === 'pending' ? 'Pending' : '')),
    r.totals.obtained,
    r.totals.max,
    r.totals.percentage === null ? '' : `${r.totals.percentage}%`,
  ])
  return { fileName: `${access.course.code}-gradebook.csv`, csv: toCsv(headers, lines) }
}
