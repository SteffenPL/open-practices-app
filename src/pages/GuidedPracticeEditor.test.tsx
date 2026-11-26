import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { GuidedPracticeEditor } from './GuidedPracticeEditor'
import { createPractice, updatePractice } from '../lib/practiceService'
import { provisionTool } from '../lib/toolService'
import { saveElements } from '../lib/elementService'
import { GUIDED_CLOSING_MARKER, getInstallCommand } from './guidedPracticeContent'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'author-1' } }, loading: false }),
}))

vi.mock('../lib/supabase', () => ({ supabase: null }))
vi.mock('../lib/practiceService', () => ({
  createPractice: vi.fn(),
  updatePractice: vi.fn(),
  imageUrl: (path: string | null) => path,
  uploadPracticeImage: vi.fn(),
}))
vi.mock('../lib/toolService', () => ({ provisionTool: vi.fn() }))
vi.mock('../lib/elementService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/elementService')>()),
  saveElements: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createPractice).mockResolvedValue({ id: 'practice-1' } as never)
  vi.mocked(updatePractice).mockResolvedValue({ id: 'practice-1' } as never)
  vi.mocked(provisionTool).mockResolvedValue({
    id: 'tool-1',
    apm_id: 'microsoft/playwright',
    repo_url: null,
    name: 'playwright',
    description: null,
  })
  vi.mocked(saveElements).mockResolvedValue(undefined)
})

afterEach(cleanup)

function answer(text: string) {
  const composer = screen.getByRole('textbox')
  fireEvent.change(composer, { target: { value: text } })
  fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false })
}

async function finishConversation() {
  answer('A repeatable browser test practice')
  answer('It catches broken flows before release')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'microsoft/playwright' } })
  fireEvent.click(await screen.findByRole('button', { name: /Add.*microsoft\/playwright/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Use apm install microsoft/playwright' }))
  answer('It runs real browser journeys and is easy to start with a focused smoke test.')
  fireEvent.click(await screen.findByRole('button', { name: 'No, continue' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Closing remarks' }))
  answer('Start with the one path your users rely on most.')
  await screen.findByRole('button', { name: 'Publish practice' })
}

describe('guided practice editor', () => {
  it('publishes a guided practice through existing services and reuses its id after a partial failure', async () => {
    vi.mocked(saveElements)
      .mockRejectedValueOnce(new Error('temporary option write failure'))
      .mockResolvedValueOnce(undefined)

    render(<MemoryRouter><GuidedPracticeEditor /></MemoryRouter>)
    await finishConversation()

    fireEvent.click(screen.getByRole('button', { name: 'Publish practice' }))
    expect(await screen.findByText('temporary option write failure')).toBeTruthy()
    expect(createPractice).toHaveBeenCalledTimes(1)
    expect(saveElements).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Publish practice' }))
    await waitFor(() => expect(updatePractice).toHaveBeenCalledTimes(1))
    expect(createPractice).toHaveBeenCalledTimes(1)
    expect(updatePractice).toHaveBeenCalledWith('practice-1', expect.objectContaining({ title: 'A repeatable browser test practice' }), false)
    expect(saveElements).toHaveBeenCalledTimes(2)

    const [, elementDrafts] = vi.mocked(saveElements).mock.calls[1]
    expect(elementDrafts).toHaveLength(1)
    expect(elementDrafts[0].options).toHaveLength(1)
    expect(elementDrafts[0].options[0].tool_id).toBe('tool-1')
    expect(getInstallCommand(elementDrafts[0].options[0].description)).toBe('apm install microsoft/playwright')
    expect(vi.mocked(createPractice).mock.calls[0][1].body).toContain(GUIDED_CLOSING_MARKER)
  })
})
