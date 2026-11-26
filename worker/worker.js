const ALLOWED_ORIGIN = "https://artemkinus-collab.github.io";
const cors = () => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "Content-Disposition",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});
function reply(data,status){
  return new Response(JSON.stringify(data),{status,headers:{...cors(),"Content-Type":"application/json","Cache-Control":"no-store"}});
}
const enc=new TextEncoder();
function b64url(bytes){let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function fromB64url(value){const s=value.replace(/-/g,"+").replace(/_/g,"/");const binary=atob(s+"=".repeat((4-s.length%4)%4));return Uint8Array.from(binary,c=>c.charCodeAt(0))}
async function hmacKey(secret){return crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])}
async function createSession(user,secret){
  const payload=b64url(enc.encode(JSON.stringify({sub:user,exp:Date.now()+60*60*1000})));
  const key=await hmacKey(secret),sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload)));
  return payload+"."+b64url(sig);
}
async function validSession(token,secret){
  try{
    const parts=token.split(".");if(parts.length!==2)return false;
    const key=await hmacKey(secret),sig=fromB64url(parts[1]);
    if(!await crypto.subtle.verify("HMAC",key,sig,enc.encode(parts[0])))return false;
    const payload=JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    return (payload.sub==="root"||payload.sub==="artem")&&Number.isFinite(payload.exp)&&payload.exp>Date.now();
  }catch{return false}
}
function constantTimeEqual(a,b){
  const x=enc.encode(String(a)),y=enc.encode(String(b));let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
  return diff===0;
}
function ghHeaders(env){return {"Accept":"application/vnd.github+json","Authorization":"Bearer "+env.GITHUB_TOKEN,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"Cloud-Linux-Worker"}}
async function gh(env,path,init={}){
  const response=await fetch("https://api.github.com"+path,{...init,headers:{...ghHeaders(env),...(init.headers||{})}});
  if(!response.ok){const detail=await response.text();throw new Error("GitHub API "+response.status+": "+detail.slice(0,350))}
  if(response.status===204)return null;return response.json();
}
async function artifactZip(env,artifactId){
  const response=await fetch("https://api.github.com/repos/"+encodeURIComponent(env.REPO_OWNER)+"/"+encodeURIComponent(env.REPO_NAME)+"/actions/artifacts/"+artifactId+"/zip",{headers:ghHeaders(env),redirect:"follow"});
  if(!response.ok){const detail=await response.text();throw new Error("Artifact download failed ("+response.status+"): "+detail.slice(0,250))}
  return response;
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("Origin")||"";
  if(origin!==ALLOWED_ORIGIN)return new Response("Origin not allowed",{status:403});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
  if(!env.GITHUB_TOKEN||!env.REPO_OWNER||!env.REPO_NAME)return reply({error:"Worker configuration incomplete"},503);
  if(url.pathname==="/api/login"&&request.method==="POST"){
    if(!env.ARTEM_PASSWORD||!env.OTP_CODE||!env.SESSION_SECRET)return reply({error:"Authentication secrets are not configured"},503);
    const body=await request.json().catch(()=>null);
    if(!body||!["root","artem"].includes(body.user)||!constantTimeEqual(body.password||"",env.ARTEM_PASSWORD)||!constantTimeEqual(body.otp||"",env.OTP_CODE))
      return reply({error:"Неверный пользователь, пароль или OTP-код"},401);
    return reply({ok:true,user:body.user,session:await createSession(body.user,env.SESSION_SECRET),expires_in:3600},200);
  }
  const auth=request.headers.get("Authorization")||"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!env.SESSION_SECRET||!token||!await validSession(token,env.SESSION_SECRET))
    return reply({error:"Сессия недействительна или истекла. Войдите снова."},401);
  const base="/repos/"+encodeURIComponent(env.REPO_OWNER)+"/"+encodeURIComponent(env.REPO_NAME);
  try{
    if(url.pathname==="/api/health"&&request.method==="GET"){
      const repo=await gh(env,base);
      return reply({ok:true,repository:repo.full_name,private:repo.private,default_branch:repo.default_branch,api:"online"},200);
    }
    if(url.pathname==="/api/runs"&&request.method==="GET"){
      const data=await gh(env,base+"/actions/runs?per_page=10");
      return reply({total_count:data.total_count,runs:data.workflow_runs.map(r=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,branch:r.head_branch,created_at:r.created_at,updated_at:r.updated_at,html_url:r.html_url}))},200);
    }
    if(url.pathname==="/api/dispatch"&&request.method==="POST"){
      const body=await request.json().catch(()=>({})),mode=body.report||"full";
      if(body.ref!=="main")return reply({error:"Only the main branch can be dispatched"},400);
      if(!["full","storage","runtime"].includes(mode))return reply({error:"Unknown diagnostics profile"},400);
      await gh(env,base+"/actions/workflows/cloud-linux.yml/dispatches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:{report:mode}})});
      return reply({accepted:true,report:mode,message:"Диагностика поставлена в очередь GitHub Actions"},202);
    }
    const artifactsMatch=url.pathname.match(/^\/api\/runs\/(\d+)\/artifacts$/);
    if(artifactsMatch&&request.method==="GET"){
      const data=await gh(env,base+"/actions/runs/"+artifactsMatch[1]+"/artifacts?per_page=20");
      return reply({artifacts:data.artifacts.map(a=>({id:a.id,name:a.name,size_in_bytes:a.size_in_bytes,expired:a.expired,expires_at:a.expires_at,download_path:"/api/artifacts/"+a.id+"/download"}))},200);
    }
    const downloadMatch=url.pathname.match(/^\/api\/artifacts\/(\d+)\/download$/);
    if(downloadMatch&&request.method==="GET"){
      const file=await artifactZip(env,downloadMatch[1]);
      return new Response(file.body,{status:200,headers:{...cors(),"Content-Type":"application/zip","Content-Disposition":'attachment; filename="cloud-linux-report.zip"',"Cache-Control":"no-store"}});
    }
    const jobsMatch=url.pathname.match(/^\/api\/runs\/(\d+)\/jobs$/);
    if(jobsMatch&&request.method==="GET"){
      const data=await gh(env,base+"/actions/runs/"+jobsMatch[1]+"/jobs?per_page=30");
      return reply({jobs:data.jobs.map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,started_at:j.started_at,completed_at:j.completed_at,steps:(j.steps||[]).map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))}))},200);
    }
    return reply({error:"Not found"},404);
  }catch(e){return reply({error:String(e.message||e)},502)}
 }
};
