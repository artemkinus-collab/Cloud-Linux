const $=id=>document.getElementById(id);
const apiBase="https://cloud-linux-api.artemkinus.workers.dev";
let sessionToken="";
const out=$("output"),picker=$("userPicker"),pickerTrigger=$("userPickerTrigger"),pickerMenu=$("userPickerMenu");
const userDetails={artem:{label:"artem",initial:"A"},root:{label:"root",initial:"R"}};
function closeUserPicker(){pickerMenu.hidden=true;pickerTrigger.setAttribute("aria-expanded","false")}
function selectUser(name){
 const info=userDetails[name];if(!info)return;
 $("user").value=name;$("selectedUser").textContent=info.label;$("userAvatar").textContent=info.initial;
 pickerMenu.querySelectorAll("[data-user]").forEach(o=>{const active=o.dataset.user===name;o.classList.toggle("selected",active);o.setAttribute("aria-selected",String(active))});closeUserPicker();
}
pickerTrigger.addEventListener("click",()=>{const opening=pickerMenu.hidden;pickerMenu.hidden=!opening;pickerTrigger.setAttribute("aria-expanded",String(opening))});
pickerMenu.querySelectorAll("[data-user]").forEach(o=>o.addEventListener("click",()=>selectUser(o.dataset.user)));
document.addEventListener("click",e=>{if(!picker.contains(e.target))closeUserPicker()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!pickerMenu.hidden)closeUserPicker();else if(!$("explorer").hidden)$("explorer").hidden=true}});
function line(t,c="result"){const d=document.createElement("div");d.className=c;d.textContent=t;out.append(d);$("terminalBody").scrollTop=$("terminalBody").scrollHeight}
function authHeaders(extra={}){return {...extra,...(sessionToken?{Authorization:"Bearer "+sessionToken}:{})}}
async function request(path,options={},authenticated=true){
 const headers={"Content-Type":"application/json",...(options.headers||{})};if(authenticated&&sessionToken)headers.Authorization="Bearer "+sessionToken;
 const r=await fetch(apiBase+path,{...options,headers});
 if(!r.ok){const data=await r.json().catch(()=>({error:"HTTP "+r.status}));throw new Error(data.error||"HTTP "+r.status)}
 return r.json();
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function time(s){return s?new Date(s).toLocaleString():"—"}
async function getRuns(){return request("/api/runs")}
async function refresh(){
 const data=await getRuns();
 line("Связь с GitHub Actions установлена. Найдено диагностических запусков: "+data.total_count);
 return data;
}
async function run(mode="full"){
 const before=await getRuns(),previous=new Set(before.runs.map(r=>r.id));
 const accepted=await request("/api/dispatch",{method:"POST",body:JSON.stringify({ref:"main",report:mode})});
 line(accepted.message+" · профиль: "+mode);
 for(let attempt=0;attempt<45;attempt++){
  await sleep(4000);
  const data=await getRuns(),current=data.runs.find(r=>!previous.has(r.id));
  if(current){
   line("Запуск #"+current.id+": "+current.status+(current.conclusion?" / "+current.conclusion:""));
   if(current.status==="completed"){
    line(current.conclusion==="success"?"Диагностика завершена. Отчёт доступен в «Файлы» и «История».":"Диагностика завершилась с результатом: "+current.conclusion,current.conclusion==="success"?"result":"error");
    return current;
   }
  }else if(attempt%3===0)line("Ожидание запуска GitHub Actions…");
 }
 line("Задание ещё выполняется. Откройте «История», чтобы проверить статус.");
}
async function downloadArtifact(id){
 const response=await fetch(apiBase+"/api/artifacts/"+id+"/download",{headers:authHeaders()});
 if(!response.ok){const d=await response.json().catch(()=>({error:"HTTP "+response.status}));throw new Error(d.error||"Ошибка скачивания")}
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="cloud-linux-report.zip";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 line("ZIP-отчёт скачан.");
}
async function showHistory(){
 $("explorerTitle").textContent="История";$("explorer").hidden=false;
 const data=await getRuns(),tree=$("tree");tree.replaceChildren();
 for(const r of data.runs){
  const card=document.createElement("section");card.className="run-card";
  const b=document.createElement("button");b.className="artifact-run";
  b.textContent="#"+r.id+" · "+(r.conclusion||r.status)+" · "+time(r.created_at);
  const details=document.createElement("div");details.className="run-details";
  b.onclick=async()=>{
   details.replaceChildren();const status=document.createElement("p");status.className="note";status.textContent="Загрузка деталей…";details.append(status);
   try{
    const [jobs,artifacts]=await Promise.all([request("/api/runs/"+r.id+"/jobs"),request("/api/runs/"+r.id+"/artifacts")]);details.replaceChildren();
    for(const job of jobs.jobs){const box=document.createElement("div");box.className="job-detail";box.textContent=job.name+" — "+job.status+(job.conclusion?" / "+job.conclusion:"");
     for(const step of job.steps){const p=document.createElement("div");p.className="step-detail";p.textContent=step.name+" — "+step.status+(step.conclusion?" / "+step.conclusion:"");box.append(p)}details.append(box)}
    for(const artifact of artifacts.artifacts){const row=document.createElement("div");row.className="artifact-row";const info=document.createElement("span");info.textContent=artifact.name+" · "+(artifact.size_in_bytes/1024).toFixed(1)+" KB";
     const dl=document.createElement("button");dl.className="download-artifact";dl.textContent=artifact.expired?"Срок хранения истёк":"Скачать ZIP";dl.disabled=artifact.expired;dl.onclick=()=>downloadArtifact(artifact.id).catch(e=>line("Ошибка скачивания: "+e.message));row.append(info,dl);details.append(row)}
    if(!artifacts.artifacts.length){const p=document.createElement("p");p.className="note";p.textContent="Отчёт для этого запуска отсутствует.";details.append(p)}
   }catch(e){details.replaceChildren();const p=document.createElement("p");p.className="note";p.textContent="Ошибка: "+e.message;details.append(p)}
  };
  const link=document.createElement("a");link.className="run-link";link.href=r.html_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="GitHub ↗";
  card.append(b,link,details);tree.append(card);
 }
 if(!data.runs.length)tree.textContent="Запусков пока нет.";
}
async function showFiles(){
 $("explorerTitle").textContent="Файлы";$("explorer").hidden=false;
 const tree=$("tree");tree.replaceChildren();const data=await getRuns();let count=0;
 for(const r of data.runs){
  const artifacts=await request("/api/runs/"+r.id+"/artifacts");
  for(const artifact of artifacts.artifacts){
   count++;const row=document.createElement("div");row.className="artifact-row";
   const info=document.createElement("span");info.textContent=artifact.name+" · Run #"+r.id+" · "+(artifact.size_in_bytes/1024).toFixed(1)+" KB";
   const dl=document.createElement("button");dl.className="download-artifact";dl.textContent=artifact.expired?"Истёк срок":"Скачать ZIP";dl.disabled=artifact.expired;dl.onclick=()=>downloadArtifact(artifact.id).catch(e=>line("Ошибка скачивания: "+e.message));
   row.append(info,dl);tree.append(row);
  }
 }
 if(!count)tree.textContent="Файлы пока не созданы. Сначала запустите диагностику.";
}
$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();const user=$("user").value,password=$("password").value,otp=$("otp").value,button=$("loginBtn");
 button.disabled=true;$("loginMsg").textContent="Проверка…";
 try{
  const result=await request("/api/login",{method:"POST",body:JSON.stringify({user,password,otp})},false);
  sessionToken=result.session;$("password").value="";$("otp").value="";
  $("login").hidden=true;$("app").hidden=false;out.replaceChildren();
  line("Авторизация успешна · пользователь "+result.user);
  line("Сессия активна в этой вкладке.");
  await refresh();$("command").focus();
 }catch(e){sessionToken="";$("loginMsg").textContent="Вход не выполнен: "+e.message}
 finally{button.disabled=false}
});
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("otp").focus()});
$("otp").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginForm").requestSubmit()});
$("commandForm").onsubmit=async e=>{
 e.preventDefault();const raw=$("command").value.trim(),c=raw.toLowerCase();if(!c)return;line("cloudlinux:~$ "+raw,"cmdline");$("command").value="";
 try{
  if(c==="clear"){out.replaceChildren();return}
  if(c==="help"){line("Доступные команды:\nhelp — список команд\nstatus — состояние API и GitHub\nruns — последние диагностические запуски\nrun или run full — полная диагностика\nrun storage — проверка хранилища\nrun runtime — сведения об ОС и среде\nclear — очистить экран\n\nПроизвольный shell, sudo и управление хостом не поддерживаются.");return}
  if(c==="status"){line(JSON.stringify(await request("/api/health"),null,2));return}
  if(c==="runs"){const d=await getRuns();line("Диагностических запусков: "+d.total_count);for(const r of d.runs.slice(0,10))line("#"+r.id+" "+r.status+(r.conclusion?" / "+r.conclusion:"")+" · "+time(r.created_at));return}
  if(c==="run"||c==="run full"){await run("full");return}
  if(c==="run storage"){await run("storage");return}
  if(c==="run runtime"){await run("runtime");return}
  if(c.startsWith("sudo ")||c==="sudo"||c==="reboot"||c.startsWith("apt ")||c.startsWith("rm ")||c.startsWith("shutdown")){line("Команда не выполнена: Cloud Linux не предоставляет интерактивный shell или доступ к управлению хостом. Диагностика выполняется отдельными заданиями GitHub Actions.","error");return}
  line("Команда не поддерживается. Введите help для списка доступных действий.","error");
 }catch(err){line("ОШИБКА: "+err.message,"error")}
};
$("runBtn").onclick=()=>run("full").catch(e=>line("ОШИБКА запуска: "+e.message,"error"));
$("refreshBtn").onclick=()=>refresh().catch(e=>line("ОШИБКА обновления: "+e.message,"error"));
$("filesBtn").onclick=()=>showFiles().catch(e=>line("ОШИБКА файлов: "+e.message,"error"));
$("historyBtn").onclick=()=>showHistory().catch(e=>line("ОШИБКА истории: "+e.message,"error"));
$("closeFiles").onclick=()=>$("explorer").hidden=true;
$("explorer").onclick=e=>{if(e.target===$("explorer"))$("explorer").hidden=true};
$("logoutBtn").onclick=()=>{
 sessionToken="";$("app").hidden=true;$("login").hidden=false;$("password").value="";$("otp").value="";out.replaceChildren();$("loginMsg").textContent="";
};
