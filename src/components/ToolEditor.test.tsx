import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTool, listTools, mergeTools, updateTool, type CatalogTool } from '../lib/catalogService'
import { ToolEditor } from './ToolEditor'

vi.mock('../lib/catalogService', () => ({ createTool: vi.fn(), listTools: vi.fn(), updateTool: vi.fn(), mergeTools: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ session: { user: {id: 'user'} }, loading: false }) }))
const existing: CatalogTool = { id: 'first', name: 'PDF', slug: 'pdf', description: null, apm_id: 'example/skills/Tools/Pdf', repo_url: 'https://github.com/example/skills', website_url: null, install_command: null, updated_at:'2026-11-27', merged_into:null }
const fill = (label:string,value:string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
beforeEach(() => { vi.mocked(listTools).mockResolvedValue([existing]) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('shared tool editor', () => {
  it('resolves an exact package alias to the surviving entry without saving a duplicate', async () => {
    vi.mocked(listTools).mockResolvedValue([{...existing, aliases:[{...existing, id:'old', apm_id:'sample/older/Tools/Pdf'}]}])
    const done=vi.fn()
    render(<ToolEditor onSaved={done} onCancel={vi.fn()} initialName="Another name"/>)
    fill('APM package identifier','Sample/OLDER/Tools/Pdf')
    fireEvent.click(screen.getByRole('button',{name:'Create tool'}))
    fireEvent.click(await screen.findByRole('button',{name:'Use existing'}))
    expect(screen.queryByRole('button',{name:'Keep separate'})).toBeNull()
    expect(done).toHaveBeenCalledWith(expect.objectContaining({id:'first'}))
    expect(createTool).not.toHaveBeenCalled()
  })
  it('keeps separate packages in the same repository, preserving case-sensitive paths', async () => {
    vi.mocked(createTool).mockResolvedValue({...existing,id:'second'})
    render(<ToolEditor onSaved={vi.fn()} onCancel={vi.fn()} initialName="PDF"/>)
    fill('APM package identifier','example/skills/Tools/pdf')
    fill('Source repository or package URL','https://github.com/example/skills')
    fireEvent.click(screen.getByRole('button',{name:'Create tool'}))
    fireEvent.click(await screen.findByRole('button',{name:'Keep separate'}))
    await waitFor(() => expect(createTool).toHaveBeenCalledWith(expect.objectContaining({apm_id:'example/skills/Tools/pdf'})))
  })
  it('previews a proposed merge of unsaved fields and retains unfilled catalog details', async () => {
    vi.mocked(updateTool).mockResolvedValue(existing)
    render(<ToolEditor onSaved={vi.fn()} onCancel={vi.fn()} initialName="PDF"/>)
    fill('Description','Read and assemble PDFs')
    fireEvent.click(screen.getByRole('button',{name:'Create tool'}))
    fireEvent.click(await screen.findByRole('button',{name:'Merge details'}))
    expect(updateTool).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Confirm merge'}))
    await waitFor(() => expect(updateTool).toHaveBeenCalledWith('first',expect.objectContaining({apm_id:existing.apm_id,description:'Read and assemble PDFs'}),existing.updated_at))
  })
  it('merges two saved entries through the audited merge operation', async () => {
    vi.mocked(mergeTools).mockResolvedValue(existing)
    render(<ToolEditor tool={{...existing,id:'second',name:'PDF Reader'}} onSaved={vi.fn()} onCancel={vi.fn()}/>)
    fill('Tool name','PDF')
    fireEvent.click(screen.getByRole('button',{name:'Save changes'}))
    fireEvent.click(await screen.findByRole('button',{name:'Merge tools'}))
    fireEvent.click(screen.getByRole('button',{name:'Confirm merge'}))
    await waitFor(() => expect(mergeTools).toHaveBeenCalledWith('second','first'))
    expect(updateTool).not.toHaveBeenCalled()
  })
})
