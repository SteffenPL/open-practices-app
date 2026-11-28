import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {AgentsPage} from './AgentsPage'

vi.mock('../auth/useAuth',()=>({useAuth:()=>({session:{access_token:'user-session'},loading:false})}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('creates a read-only grant deliberately and keeps credentials out of prompts',async()=>{
  const grant={id:'grant',scope:'read',expires_at:new Date(Date.now()+100000).toISOString(),token:'opaque-secret'}
  const api=vi.fn().mockImplementation(async (_url,opts)=>Response.json(opts.method==='GET'?{grants:[]}:grant))
  vi.stubGlobal('fetch',api)
  const writeText=vi.fn()
  vi.stubGlobal('navigator',{clipboard:{writeText}})
  render(<AgentsPage/>)
  expect(screen.queryByRole('button',{name:'Copy grant'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Copy prompt: Find a tool'}))
  expect(writeText.mock.calls[0][0]).toContain('OPEN_PRACTICES_TOKEN')
  expect(writeText.mock.calls[0][0]).not.toMatch(/opaque-secret|user-session/)
  fireEvent.click(screen.getByRole('button',{name:'Generate grant'}))
  fireEvent.click(await screen.findByRole('button',{name:'Copy grant'}))
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith('opaque-secret'))
  expect(api.mock.calls.find(([,opts])=>opts.method==='POST')?.[1].body).toBe('{"scope":"read"}')
  expect(screen.queryByText('opaque-secret')).toBeNull()
})
