import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {getTool,listToolHistory,listToolPractices,type CatalogTool} from '../lib/catalogService'
import {ToolPage} from './ToolCatalog'

vi.mock('../lib/catalogService',()=>({getTool:vi.fn(),listToolHistory:vi.fn(),listToolPractices:vi.fn()}))
vi.mock('../auth/useAuth',()=>({useAuth:()=>({session:null})}))
afterEach(() => {cleanup(); vi.resetAllMocks()})

it('shows the merged source, revision author, text diff and linked practices', async () => {
  const entry:CatalogTool = {id:'canonical',name:'Catalog Tool',slug:'catalog-tool',description:'Current description',apm_id:'org/tool',repo_url:null,website_url:null,install_command:'apm install org/tool',updated_at:'2026-11-27',merged_into:null}
  vi.mocked(getTool).mockResolvedValue(entry)
  vi.mocked(listToolPractices).mockResolvedValue([{id:'practice',title:'A practice'} as Awaited<ReturnType<typeof listToolPractices>>[number]])
  vi.mocked(listToolHistory).mockResolvedValue([{id:'r',tool_id:'canonical',editor_id:'editor',editor:{display_name:'A contributor',avatar_url:null},action:'merge',before:{...entry,id:'old',description:'Original description',name:'Old Entry'},after:entry,created_at:'2026-11-27'}])
  render(<MemoryRouter initialEntries={['/tools/canonical']}><Routes><Route path="/tools/:id" element={<ToolPage/>}/></Routes></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'Catalog Tool'})).toBeTruthy()
  expect(screen.getByRole('link',{name:'A practice'}).getAttribute('href')).toBe('/practice/practice')
  fireEvent.click(screen.getByText('merge'))
  expect(screen.getByText('Editor · A contributor')).toBeTruthy()
  expect(screen.getByRole('link',{name:'Old Entry'}).getAttribute('href')).toBe('/tools/old')
  expect(screen.getByText('Original description').tagName).toBe('DEL')
})
