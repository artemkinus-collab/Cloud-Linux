const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin || "null",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-CloudLinux-Key",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});
function reply(data, status, origin) {
  return new Response(JSON.stringify(data), {status, headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
}
async function gh(env, path, init={}) {
  const response = await fetch("https://api.github.com"+path, {
    ...init,
    headers: {
      "Accept":"application/vnd.github+json",
      "Authorization":"Bearer "+env.GITHUB_TOKEN,
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"Cloud-Linux-Worker",
      ...(init.headers||{})
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("GitHub API "+response.status+": "+detail.slice(0,700));
  }
  if (response.status===204) return null;
  return response.json();
}
export default {
 async fetch(request, env) {
  const url=new URL(request.url), origin=request.headers.get("Origin")||"null";
  if (request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(env.ALLOWED_ORIGIN||origin)});
  if (env.ALLOWED_ORIGIN && origin!==env.ALLOWED_ORIGIN) return reply({error:"Origin not allowed"},403,env.ALLOWED_ORIGIN);
  if (!env.ACCESS_KEY || !env.GITHUB_TOKEN || !env.REPO_OWNER || !env.REPO_NAME) return reply({error:"Worker secrets/configuration incomplete"},503,origin);
  if (request.headers.get("X-CloudLinux-Key")!==env.ACCESS_KEY) return reply({error:"Unauthorized"},401,origin);
  const base="/repos/"+encodeURIComponent(env.REPO_OWNER)+"/"+encodeURIComponent(env.REPO_NAME);
  try {
    if (url.pathname==="/api/health" && request.method==="GET") {
      const repo=await gh(env,base);
      return reply({ok:true,repository:repo.full_name,private:repo.private,default_branch:repo.default_branch},200,origin);
    }
    if (url.pathname==="/api/runs" && request.method==="GET") {
      const data=await gh(env,base+"/actions/runs?per_page=10");
      return reply({total_count:data.total_count,runs:data.workflow_runs.map(r=>({
        id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,branch:r.head_branch,
        created_at:r.created_at,updated_at:r.updated_at,html_url:r.html_url
      }))},200,origin);
    }
    if (url.pathname==="/api/dispatch" && request.method==="POST") {
      const body=await request.json().catch(()=>({}));
      const ref=body.ref==="main"?"main":null;
      if (!ref) return reply({error:"Only the main branch can be dispatched"},400,origin);
      await gh(env,base+"/actions/workflows/cloud-linux.yml/dispatches",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref})
      });
      return reply({accepted:true,message:"Workflow dispatch accepted"},202,origin);
    }
    const jobsMatch=url.pathname.match(/^\/api\/runs\/(\d+)\/jobs$/);
    if (jobsMatch && request.method==="GET") {
      const data=await gh(env,base+"/actions/runs/"+jobsMatch[1]+"/jobs?per_page=30");
      return reply({jobs:data.jobs.map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,started_at:j.started_at,completed_at:j.completed_at,steps:(j.steps||[]).map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))}))},200,origin);
    }
    return reply({error:"Not found"},404,origin);
  } catch(e) { return reply({error:String(e.message||e)},502,origin); }
 }
};