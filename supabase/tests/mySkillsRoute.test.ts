import { describe, expect, it } from 'vitest'
import { mySkillsRoute } from '../functions/agent/mySkills'

const id = 'a98bfe29-b4df-4cca-a750-40bb284f94e4'
const list = ['my-skills','setups']
const item = [...list,id]
const route = (method:string,path:string[],body:Record<string,unknown>={}) => mySkillsRoute(method,path,body,'my-skills')

describe('private agent setup routes', () => {
  it('requires a dedicated grant for every private route', () => {
    for (const scope of ['read','practices','contribute','catalog']) {
      for (const method of ['GET','PUT','PATCH','POST']) expect(mySkillsRoute(method,item,{},scope)).toMatchObject({status:403})
    }
  })
  it('lists setups and forwards a stable create request UUID', () => {
    expect(route('GET',list)).toMatchObject({collection:true,rpc:'list_my_skills_setups'})
    expect(route('POST',list,{name:' Work ',request_id:id})).toEqual({rpc:'create_my_skills_setup',created:true,args:{p_name:'Work',p_request_id:id}})
    expect(route('POST',list,{name:'Personal',request_id:'default'})).toMatchObject({status:400})
  })
  it('resolves legacy reads and writes to default, and named writes to their own ID', () => {
    const config = {repo:'',drafts:[],selected_packages:[]}
    const body = {config,expected_version:4}
    for (const method of ['GET','PUT']) {
      expect(route(method,['my-skills'],body)).toEqual(route(method,[...list,'default'],body))
    }
    expect(route('PUT',item,body)).toEqual({rpc:'save_my_skills_setup',args:{p_id:id,p_config:config,p_expected_version:4}})
    expect(route('PATCH',item,{name:'Changed',expected_version:6})).toEqual({rpc:'rename_my_skills_setup',args:{p_id:id,p_name:'Changed',p_expected_version:6}})
  })
  it('rejects missing concurrency checks, unsupported identifiers, and caller supplied owner IDs', () => {
    expect(route('PUT',item,{config:{}})).toMatchObject({status:400})
    expect(route('POST',list,{name:'Other',owner_id:id})).toMatchObject({status:400})
    expect(route('PUT',item,{config:{},expected_version:0,owner_id:id})).toMatchObject({status:400})
    expect(route('GET',[...list,'not-a-uuid'])).toMatchObject({status:404})
    expect(route('GET',[...item,'extra'])).toMatchObject({status:404})
  })
})
