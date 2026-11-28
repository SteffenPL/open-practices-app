export const isSetupId = (value: string) => value === 'default' ||
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)

type Route = { status:number; error:string } | {
  rpc:string; args:Record<string, unknown>; collection?:boolean; created?:boolean
}

export function mySkillsRoute(method:string, segments:string[], body:Record<string,unknown>, scope:string):Route {
  if (scope !== 'my-skills') return {status:403,error:'Generate a dedicated My Skills grant to access your private setups.'}
  const [resource, subresource, setup] = segments
  if (resource !== 'my-skills' || (segments.length > 1 && subresource !== 'setups') ||
      segments.length > 3 || (setup !== undefined && !isSetupId(setup))) {
    return {status:404,error:'Unknown private setup route.'}
  }
  const listing = segments.length === 2
  const id = setup ?? 'default'
  if (method === 'GET') {
    return listing ? {rpc:'list_my_skills_setups',args:{},collection:true} :
      {rpc:'load_my_skills_setup',args:{p_id:id}}
  }
  const exact = (...keys:string[]) => Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body,key))
  if (listing && method === 'POST') {
    if (!(exact('name') || exact('name','request_id')) || typeof body.name !== 'string' || !body.name.trim())
      return {status:400,error:'Supply the setup name and an optional request_id UUID for retries.'}
    if ('request_id' in body && (typeof body.request_id !== 'string' || body.request_id === 'default' || !isSetupId(body.request_id)))
      return {status:400,error:'request_id must be a UUID.'}
    return {rpc:'create_my_skills_setup',args:{p_name:body.name.trim(),...('request_id' in body ? {p_request_id:body.request_id} : {})},created:true}
  }
  if (!listing && (method === 'PUT' || (setup !== undefined && method === 'PATCH'))) {
    const version = body.expected_version
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > 2147483647) {
      return {status:400,error:'Supply expected_version from the latest setup read.'}
    }
    if (method === 'PATCH') {
      if (!exact('name','expected_version') || typeof body.name !== 'string' || !body.name.trim()) return {status:400,error:'Supply name and expected_version.'}
      return {rpc:'rename_my_skills_setup',args:{p_id:id,p_name:body.name.trim(),p_expected_version:version}}
    }
    if (!exact('config','expected_version') || !body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
      return {status:400,error:'Supply the full config and expected_version.'}
    }
    return {rpc:'save_my_skills_setup',args:{p_id:id,p_config:body.config,p_expected_version:version}}
  }
  return {status:405,error:listing ? 'Use GET or POST for the setup list.' :
    setup === undefined ? 'Use GET or PUT for the default My Skills setup.' : 'Use GET, PUT, or PATCH for a setup.'}
}
