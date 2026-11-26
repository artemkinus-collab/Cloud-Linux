const $=id=>document.getElementById(id);
let apiBase="https://cloud-linux-api.artemkinus.workers.dev";
let sessionToken="";
const out=$("output");
const picker=$("userPicker"),pickerTrigger=$("userPickerTrigger"),pickerMenu=$("userPickerMenu");
const userDetails={
  artem:{label:"artem",hint:"Стандартный пользователь",initial:"A"},
  root:{label:"root",hint:"Системный пользователь",initial:"R"}
};
function closeUserPicker(){pickerMenu.hidden=true;pickerTrigger.setAttribute("aria-expanded","false");picker.classList.remove("open")}
function selectUser(name){
  const info=userDetails[name];if(!info)return;
  $("user").value=name;$("selectedUser").textContent=info.label;
  $("selectedUserHint").textContent=info.hint;$("userAvatar").textContent=info.initial;
  pickerMenu.querySelectorAll("[data-user]").forEach(option=>{
    const active=option.dataset.user===name;
    option.classList.toggle("selected",active);option.setAttribute("aria-selected",String(active));
  });
  closeUserPicker();
}
pickerTrigger.addEventListener("click",()=>{
  const opening=pickerMenu.hidden;pickerMenu.hidden=!opening;
  pickerTrigger.setAttribute("aria-expanded",String(opening));picker.classList.toggle("open",opening);
});
pickerMenu.querySelectorAll("[data-user]").forEach(option=>option.addEventListener("click",()=>selectUser(option.dataset.user)));
document.addEventListener("click",event=>{if(!picker.contains(event.target))closeUserPicker()});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!pickerMenu.hidden){closeUserPicker();pickerTrigger.focus()}
  if((event.key==="ArrowDown"||event.key==="ArrowUp")&&document.activeElement===pickerTrigger){
    event.preventDefault();pickerMenu.hidden=false;pickerTrigger.setAttribute("aria-expanded","true");picker.classList.add("open");
    const options=[...pickerMenu.querySelectorAll("[data-user]")];
    options[event.key==="ArrowDown"?0:options.length-1].focus();
  }
});
pickerMenu.querySelectorAll("[data-user]").forEach((option,index)=>{
  option.addEventListener("keydown",event=>{
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();pickerMenu.querySelectorAll("[data-user]")[(index+(event.key==="ArrowDown"?1:-1)+2)%2].focus();
    }
  });
});

function line(t,c="result"){const d=document.createElement("div");d.className=c;d.textContent=t;out.append(d);$("terminal").scrollTop=$("terminal").scrollHeight}
async function request(path,options={},authenticated=true){
  const headers={"Content-Type":"application/json",...(options.headers||{})};
  if(authenticated&&sessionToken)headers.Authorization="Bearer "+sessionToken;
  const r=await fetch(apiBase+path,{...options,headers});
  const data=await r.json().catch(()=>({error:"Ответ API не является JSON"}));
  if(!r.ok)throw new Error(data.error||("HTTP "+r.status));
  return data;
}
function time(s){return s?new Date(s).toLocaleString():"—"}
async function refresh(){
  const data=await request("/api/runs");
  $("status").textContent="● API подключён · "+data.total_count+" запусков";
  $("status").style.color="#4ade80";
  line("Получено запусков: "+data.total_count);
  for(const r of data.runs.slice(0,8))line("#"+r.id+" "+r.name+" | "+r.status+(r.conclusion?" / "+r.conclusion:"")+" | "+r.branch+" | "+time(r.created_at));
}
async function run(){
  const r=await request("/api/dispatch",{method:"POST",body:JSON.stringify({ref:"main"})});
  line(r.message);
  setTimeout(()=>refresh().catch(e=>line(e.message)),2500);
}
async function files(){
  const data=await request("/api/runs"),tree=$("tree");tree.replaceChildren();
  for(const r of data.runs){
    const b=document.createElement("button");b.className="artifact-run";
    b.textContent="▣ Run #"+r.id+" · "+(r.conclusion||r.status)+" · "+time(r.created_at);
    b.onclick=async()=>{
      try{
        const j=await request("/api/runs/"+r.id+"/jobs");
        tree.querySelectorAll(".job-detail").forEach(x=>x.remove());
        for(const job of j.jobs){
          const box=document.createElement("div");box.className="job-detail";
          box.textContent=job.name+" — "+job.status+(job.conclusion?" / "+job.conclusion:"");
          for(const step of job.steps){const p=document.createElement("div");p.className="step-detail";p.textContent=step.name+" — "+step.status+(step.conclusion?" / "+step.conclusion:"");box.append(p)}
          tree.append(box);
        }
      }catch(e){line("Ошибка загрузки заданий: "+e.message)}
    };
    tree.append(b);
  }
  if(!data.runs.length)tree.textContent="Пока нет запусков.";
}
$("loginBtn").onclick=async()=>{
  const user=$("user").value,password=$("password").value,otp=$("otp").value;
  const button=$("loginBtn");button.disabled=true;$("loginMsg").textContent="Проверка данных…";
  try{
    const result=await request("/api/login",{method:"POST",body:JSON.stringify({user,password,otp})},false);
    sessionToken=result.session;
    $("password").value="";$("otp").value="";
    $("login").hidden=true;$("app").hidden=false;
    $("status").textContent="● Вход выполнен: "+result.user;
    $("status").style.color="#4ade80";
    line("Авторизация успешна · пользователь "+result.user);
    line("Сессия действует ограниченное время и не сохраняется после перезагрузки страницы.");
    await refresh();$("command").focus();
  }catch(e){sessionToken="";$("loginMsg").textContent="Войти не удалось: "+e.message}
  finally{button.disabled=false}
};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("otp").focus()});
$("otp").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click()});
$("commandForm").onsubmit=async e=>{
  e.preventDefault();const c=$("command").value.trim();if(!c)return;
  line("cloudlinux:~$ "+c,"cmdline");$("command").value="";
  try{
    if(c==="clear"){out.replaceChildren();return}
    if(c==="help"){line("Команды: help, status, runs, run, clear. Произвольные команды ОС не исполняются.");return}
    if(c==="status"){const h=await request("/api/health");line(JSON.stringify(h,null,2));return}
    if(c==="runs"){await refresh();return}
    if(c==="run"){await run();return}
    line("Неизвестная команда. Разрешены только команды управления GitHub Actions.");
  }catch(err){line("ОШИБКА: "+err.message)}
};
$("runBtn").onclick=()=>run().catch(e=>line("ОШИБКА запуска: "+e.message));
$("refreshBtn").onclick=()=>refresh().catch(e=>line("ОШИБКА обновления: "+e.message));
$("filesBtn").onclick=()=>{$("explorer").hidden=false;files().catch(e=>line("ОШИБКА списка: "+e.message))};
$("loadRuns").onclick=()=>files().catch(e=>line(e.message));
$("closeFiles").onclick=()=>$("explorer").hidden=true;
$("explorer").onclick=e=>{if(e.target===$("explorer"))$("explorer").hidden=true};
$("logoutBtn").onclick=()=>{
  sessionToken="";$("app").hidden=true;$("login").hidden=false;
  $("password").value="";$("otp").value="";out.replaceChildren();
  $("status").textContent="● Не подключено";$("loginMsg").textContent="";
};
