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

it('requests private collection access only after selecting the dedicated scope', async()=>{
  const api=vi.fn().mockImplementation(async (_url,opts)=>Response.json(opts.method==='GET'?{grants:[]}:{id:'one',scope:'my-skills',expires_at:'2026-11-28T00:00:00Z',token:'opaque'}))
  vi.stubGlobal('fetch',api)
  const writeText=vi.fn()
  vi.stubGlobal('navigator',{clipboard:{writeText}})
  render(<AgentsPage/>)
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'my-skills'}})
  fireEvent.click(screen.getByRole('button',{name:'Generate grant'}))
  await screen.findByRole('button',{name:'Copy grant'})
  expect(JSON.parse(api.mock.calls.find(([,opts])=>opts.method==='POST')?.[1].body)).toEqual({scope:'my-skills'})
  fireEvent.click(screen.getByRole('button',{name:'Copy prompt: Work with my private skills'}))
  expect(writeText.mock.calls[0][0]).toContain('expected_version')
  expect(writeText.mock.calls[0][0]).not.toContain('opaque')
})

it('preselects the linked My Skills scope without issuing a grant',async()=>{
  window.location.hash='/agents?scope=my-skills'
  const api=vi.fn().mockResolvedValue(Response.json({grants:[]}))
  vi.stubGlobal('fetch',api)
  try {
    render(<AgentsPage/>)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('my-skills')
    await waitFor(()=>expect(api).toHaveBeenCalled())
    expect(api.mock.calls.every(([,opts])=>opts.method==='GET')).toBe(true)
  } finally {
    window.location.hash=''
  }
})
