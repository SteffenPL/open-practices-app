import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorPage } from './EditorPage'
import { createPractice, getPractice, updatePractice, uploadPracticeImage } from '../lib/practiceService'
import { saveElements } from '../lib/elementService'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))

const navigate = vi.fn()
const routeParams = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
  useParams: () => routeParams.value,
}))

vi.mock('@uiw/react-md-editor', () => ({
  default: () => <textarea aria-label="body" />,
}))

vi.mock('../components/ElementsEditor', () => ({
  ElementsEditor: () => <div />,
}))
vi.mock('../components/ImportForm', () => ({
  ImportForm: () => <div />,
}))
vi.mock('../lib/toolService', () => ({
  provisionTool: vi.fn(),
}))

vi.mock('../lib/practiceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/practiceService')>()),
  createPractice: vi.fn(),
  updatePractice: vi.fn(),
  uploadPracticeImage: vi.fn(),
  getPractice: vi.fn(),
}))
vi.mock('../lib/elementService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/elementService')>()),
  saveElements: vi.fn(),
  elementDraftError: () => null,
}))

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  vi.clearAllMocks()
  navigate.mockReset()
  routeParams.value = {}
})

afterEach(cleanup)

function fillTitle(title: string) {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } })
}

describe('EditorPage save diagnostics', () => {
  it('shows message, code and hint when creating fails', async () => {
    const error = {
      message: 'insert violates foreign key constraint "practices_author_id_fkey"',
      code: '23503',
      hint: 'No matching row in profiles.',
      details: null,
    }
    vi.mocked(createPractice).mockRejectedValue(error)

    render(<EditorPage />)
    fillTitle('hello world')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    expect(
      await screen.findByText(/insert violates foreign key constraint/),
    ).toBeTruthy()
    expect(screen.getByText(/code 23503/)).toBeTruthy()
    expect(screen.getByText(/hint: No matching row in profiles\./)).toBeTruthy()
    expect(consoleError).toHaveBeenCalledWith(expect.anything(), error)
  })

  it('shows the error message when updating fails', async () => {
    routeParams.value = { id: 'practice-1' }
    vi.mocked(getPractice).mockResolvedValue({
      id: 'practice-1',
      author_id: 'user-1',
      title: '',
      body: '',
      image_path: null,
    } as never)
    vi.mocked(updatePractice).mockRejectedValue(
      new Error('row-level security policy blocked the update'),
    )

    render(<EditorPage />)
    await screen.findByRole('button', { name: 'Save' })
    fillTitle('hello world')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('row-level security policy blocked the update'),
    ).toBeTruthy()
  })

  it('shows a readable fallback when a non-error value is thrown', async () => {
    vi.mocked(createPractice).mockResolvedValue({ id: 'practice-1' } as never)
    vi.mocked(saveElements).mockRejectedValue(undefined)

    render(<EditorPage />)
    fillTitle('hello world')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    expect(await screen.findByText('Unknown error')).toBeTruthy()
  })

  it('shows diagnostics when an image upload fails', async () => {
    const error = { message: 'Bucket not found', statusCode: '404' }
    vi.mocked(uploadPracticeImage).mockRejectedValue(error)

    const { container } = render(<EditorPage />)
    fillTitle('hello world')
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    })

    expect(await screen.findByText(/Bucket not found/)).toBeTruthy()
    expect(consoleError).toHaveBeenCalledWith(expect.anything(), error)
  })
})
