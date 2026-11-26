const $=id=>document.getElementById(id);
const apiBase="https://cloud-linux-api.artemkinus.workers.dev";
let sessionToken="";
const out=$("output"),picker=$("userPicker"),pickerTrigger=$("userPickerTrigger"),pickerMenu=$("userPickerMenu");
const userDetails={artem:{label:"artem",hint:"Стандартный пользователь",initial:"A"},root:{label:"root",hint:"Системный пользователь",initial:"R"}};
function closeUserPicker(){pickerMenu.hidden=true;pickerTrigger.setAttribute("aria-expanded","false");picker.classList.remove("open")}
function selectUser(name){
 const info=userDetails[name];if(!info)return;
 $("user").value=name;$("selectedUser").textContent=info.label;$("selectedUserHint").textContent=info.hint;$("userAvatar").textContent=info.initial;
 pickerMenu.querySelectorAll("[data-user]").forEach(o=>{const active=o.dataset.user===name;o.classList.toggle("selected",active);o.setAttribute("aria-selected",String(active))});closeUserPicker();
}
pickerTrigger.addEventListener("click",()=>{const opening=pickerMenu.hidden;pickerMenu.hidden=!opening;pickerTrigger.setAttribute("aria-expanded",String(opening));picker.classList.toggle("open",opening)});
pickerMenu.querySelectorAll("[data-user]").forEach(o=>o.addEventListener("click",()=>selectUser(o.dataset.user)));
document.addEventListener("click",e=>{if(!picker.contains(e.target))closeUserPicker()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!pickerMenu.hidden){closeUserPicker();pickerTrigger.focus()}});
function line(t,c="result"){const d=document.createElement("div");d.className=c;d.textContent=t;out.append(d);$("terminal").scrollTop=$("terminal").scrollHeight}
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
 $("status").textContent="● API подключён · "+data.total_count+" запусков";$("status").style.color="#4ce2a0";
 $("statusMetric").textContent="Онлайн";$("runsMetric").textContent=String(data.total_count);
 line("Получено запусков: "+data.total_count);
 for(const r of data.runs.slice(0,8))line("#"+r.id+" "+r.name+" | "+r.status+(r.conclusion?" / "+r.conclusion:"")+" | "+r.branch+" | "+time(r.created_at));
 return data;
}
async function run(mode="full"){
 const before=await getRuns(),previous=new Set(before.runs.map(r=>r.id));
 const accepted=await request("/api/dispatch",{method:"POST",body:JSON.stringify({ref:"main",report:mode})});
 line(accepted.message+" · профиль: "+mode);
 $("statusMetric").textContent="В очереди";
 for(let attempt=0;attempt<45;attempt++){
  await sleep(4000);
  const data=await getRuns();const current=data.runs.find(r=>!previous.has(r.id));
  if(current){
   $("statusMetric").textContent=current.status==="completed"?(current.conclusion==="success"?"Готово":"Ошибка"):"Выполняется";
   $("runsMetric").textContent=String(data.total_count);
   line("Запуск #"+current.id+": "+current.status+(current.conclusion?" / "+current.conclusion:""));
   if(current.status==="completed"){
    line(current.conclusion==="success"?"Диагностика завершена успешно. Отчёт доступен в Истории.":"Диагностика завершилась с результатом: "+current.conclusion);
    return current;
   }
  }else if(attempt%3===0){$("statusMetric").textContent="Ожидание runner";line("Ожидание запуска GitHub Actions…")}
 }
 line("Запуск ещё выполняется. Его статус можно проверить командой runs или в разделе «История».");
 $("statusMetric").textContent="Выполняется";
}
async function downloadArtifact(id){
 const response=await fetch(apiBase+"/api/artifacts/"+id+"/download",{headers:authHeaders()});
 if(!response.ok){const d=await response.json().catch(()=>({error:"HTTP "+response.status}));throw new Error(d.error||"Ошибка скачивания")}
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="cloud-linux-report.zip";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 line("Архив отчёта скачан.");
}
async function files(){
 const data=await getRuns(),tree=$("tree");tree.replaceChildren();
 for(const r of data.runs){
  const card=document.createElement("section");card.className="run-card";
  const b=document.createElement("button");b.className="artifact-run";
  b.textContent="▣ Run #"+r.id+" · "+(r.conclusion||r.status)+" · "+time(r.created_at);
  const details=document.createElement("div");details.className="run-details";
  b.onclick=async()=>{
   details.replaceChildren();
   const status=document.createElement("p");status.className="note";status.textContent="Загрузка заданий и отчётов…";details.append(status);
   try{
    const [jobs,artifacts]=await Promise.all([request("/api/runs/"+r.id+"/jobs"),request("/api/runs/"+r.id+"/artifacts")]);
    details.replaceChildren();
    for(const job of jobs.jobs){
     const box=document.createElement("div");box.className="job-detail";box.textContent=job.name+" — "+job.status+(job.conclusion?" / "+job.conclusion:"");
     for(const step of job.steps){const p=document.createElement("div");p.className="step-detail";p.textContent=step.name+" — "+step.status+(step.conclusion?" / "+step.conclusion:"");box.append(p)}details.append(box);
    }
    for(const artifact of artifacts.artifacts){
     const row=document.createElement("div");row.className="artifact-row";
     const info=document.createElement("span");info.textContent=artifact.name+" · "+(artifact.size_in_bytes/1024).toFixed(1)+" KB";
     const dl=document.createElement("button");dl.className="download-artifact";dl.textContent=artifact.expired?"Срок хранения истёк":"Скачать ZIP";dl.disabled=artifact.expired;
     dl.onclick=()=>downloadArtifact(artifact.id).catch(e=>line("Ошибка скачивания: "+e.message));
     row.append(info,dl);details.append(row);
    }
    if(!artifacts.artifacts.length){const p=document.createElement("p");p.className="note";p.textContent="Для этого запуска отчёты пока не опубликованы.";details.append(p)}
   }catch(e){details.replaceChildren();const p=document.createElement("p");p.className="note";p.textContent="Ошибка загрузки: "+e.message;details.append(p)}
  };
  const link=document.createElement("a");link.className="run-link";link.href=r.html_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Открыть в GitHub ↗";
  card.append(b,link,details);tree.append(card);
 }
 if(!data.runs.length)tree.textContent="Пока нет запусков.";
}
$("loginBtn").onclick=async()=>{
 const user=$("user").value,password=$("password").value,otp=$("otp").value,button=$("loginBtn");
 button.disabled=true;$("loginMsg").textContent="Проверка данных…";
 try{
  const result=await request("/api/login",{method:"POST",body:JSON.stringify({user,password,otp})},false);
  sessionToken=result.session;$("password").value="";$("otp").value="";
  $("login").hidden=true;$("app").hidden=false;$("status").textContent="● Вход выполнен: "+result.user;$("status").style.color="#4ce2a0";
  $("statusMetric").textContent="Авторизован";line("Авторизация успешна · пользователь "+result.user);
  line("Сессия действует 1 час и хранится только в памяти вкладки.");
  await refresh();$("command").focus();
 }catch(e){sessionToken="";$("loginMsg").textContent="Войти не удалось: "+e.message}
 finally{button.disabled=false}
};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("otp").focus()});
$("otp").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click()});
$("commandForm").onsubmit=async e=>{
 e.preventDefault();const c=$("command").value.trim().toLowerCase();if(!c)return;line("cloudlinux:~$ "+c,"cmdline");$("command").value="";
 try{
  if(c==="clear"){out.replaceChildren();return}
  if(c==="help"){line("Команды Cloud Linux:\\nhelp — справка\\nstatus — состояние API и репозитория\\nruns — последние запуски Actions\\nrun — полная диагностика\\nrun storage — проверка дисков и рабочей папки\\nrun runtime — сведения об ОС, ядре и среде выполнения\\nclear — очистить вывод\\nПроизвольный shell и sudo не поддерживаются.");return}
  if(c==="status"){line(JSON.stringify(await request("/api/health"),null,2));return}
  if(c==="runs"){await refresh();return}
  if(c==="run"||c==="run full"){await run("full");return}
  if(c==="run storage"){await run("storage");return}
  if(c==="run runtime"){await run("runtime");return}
  line("Неизвестная команда. Введите help для списка доступных команд.");
 }catch(err){line("ОШИБКА: "+err.message)}
};
$("runBtn").onclick=()=>run("full").catch(e=>line("ОШИБКА запуска: "+e.message));
$("refreshBtn").onclick=()=>refresh().catch(e=>line("ОШИБКА обновления: "+e.message));
$("filesBtn").onclick=()=>{$("explorer").hidden=false;files().catch(e=>line("ОШИБКА списка: "+e.message))};
$("loadRuns").onclick=()=>files().catch(e=>line(e.message));
$("closeFiles").onclick=()=>$("explorer").hidden=true;
$("explorer").onclick=e=>{if(e.target===$("explorer"))$("explorer").hidden=true};
$("logoutBtn").onclick=()=>{
 sessionToken="";$("app").hidden=true;$("login").hidden=false;$("password").value="";$("otp").value="";out.replaceChildren();
 $("status").textContent="● Не подключено";$("loginMsg").textContent="";$("statusMetric").textContent="Ожидание";
};
