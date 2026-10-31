import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPage, apiSend, errorMessage } from '@/lib/api'
import type { AttemptPayload, AttemptResult, AttemptSummary, Quiz, QuizQuestion } from '@/lib/types'

export const quizKeys = {
  detail: (id: string) => ['quizzes', id] as const,
  results: (id: string, page: number) => ['quizzes', id, 'results', page] as const,
}

export function useQuiz(id: string | undefined) {
  return useQuery({ queryKey: quizKeys.detail(id ?? 'new'), queryFn: () => apiGet<Quiz>(`/quizzes/${id}`), enabled: Boolean(id) })
}

export interface QuizResultRow {
  student: { id: string; fullName: string; email: string; rollNo: string | null }
  attempt: AttemptSummary | null
}

export function useQuizResults(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: quizKeys.results(id, page),
    queryFn: () => apiPage<QuizResultRow, { page: number; pageSize: number; total: number; totalMarks: number }>(`/quizzes/${id}/results`, { page, pageSize: 50 }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export interface QuizInput {
  title: string
  description: string | null
  timeLimitMinutes: number
  opensAt: string
  closesAt: string
  isPublished: boolean
  shuffleQuestions: boolean
  questions: Array<Omit<QuizQuestion, 'id'> & { correctOptionIds: string[] }>
}

export function useSaveQuiz(courseId: string, quizId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<QuizInput>) =>
      quizId ? apiSend<Quiz>('PATCH', `/quizzes/${quizId}`, input) : apiSend<Quiz>('POST', `/courses/${courseId}/quizzes`, input),
    onSuccess: (quiz) => {
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'quizzes'] })
      qc.setQueryData(quizKeys.detail(quiz.id), quiz)
    },
  })
}

export function usePublishQuiz(quiz: Pick<Quiz, 'id' | 'courseId'>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isPublished: boolean) => apiSend<Quiz>('PATCH', `/quizzes/${quiz.id}`, { isPublished }),
    onSuccess: (updated) => {
      toast.success(updated.isPublished ? 'Quiz published' : 'Quiz unpublished')
      void qc.invalidateQueries({ queryKey: quizKeys.detail(quiz.id) })
      void qc.invalidateQueries({ queryKey: ['courses', quiz.courseId, 'quizzes'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useDeleteQuiz(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/quizzes/${id}`),
    onSuccess: () => {
      toast.success('Quiz deleted')
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'quizzes'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function startAttempt(quizId: string) {
  return apiSend<AttemptPayload>('POST', `/quizzes/${quizId}/attempt`)
}

export function submitAttempt(quizId: string, answers: Record<string, string[]>) {
  return apiSend<AttemptResult>('POST', `/quizzes/${quizId}/attempt/submit`, { answers })
}
