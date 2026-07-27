const STORAGE_KEY = 'quartile_pipeline_v4';
  const STEP_DEFINITIONS = [
    ['planilha1A','Planilha 1A recebida/localizada'],
    ['planilha1B','Planilha 1B gerada'],
    ['planilha1C','Planilha 1C gerada'],
    ['revisaoSEO','SEO revisado: Title, Highlights, Bullets e Backend Keywords'],
    ['revisaoTime','Revisão interna concluída'],
    ['versaoFinal','Versão final gerada'],
    ['envioCliente','Planilha enviada ao cliente'],
    ['aprovacaoCliente','Cliente aprovou'],
    ['uploadPortal','Upload realizado no portal'],
    ['verificarPaginaProduto','Verificar página do produto']
  ];

  let state = { version:5, clients:[], demandsByDate:{}, completedByDate:{} };
  let selectedClientId = null;
  let calendarCursor = new Date();
  let calendarSelectedDate = localDateKey();

  const THEME_KEY = 'quartile_pipeline_theme';
  const COLLAPSED_ROUNDS_KEY = 'quartile_pipeline_collapsed_rounds';

  function getCollapsedRounds(){
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_ROUNDS_KEY) || '[]')); }
    catch { return new Set(); }
  }

  function isRoundCollapsed(roundId){ return getCollapsedRounds().has(roundId); }

  function toggleRoundDetails(roundId){
    const body=document.getElementById(`round-body-${roundId}`);
    const button=document.getElementById(`round-toggle-${roundId}`);
    if(!body||!button)return;
    const collapsed=body.classList.toggle('hidden');
    button.textContent=collapsed?'Expandir':'Recolher';
    button.setAttribute('aria-expanded', String(!collapsed));
    const rounds=getCollapsedRounds();
    collapsed?rounds.add(roundId):rounds.delete(roundId);
    localStorage.setItem(COLLAPSED_ROUNDS_KEY, JSON.stringify([...rounds]));
  }

  function applyTheme(theme){
    document.documentElement.dataset.theme=theme;
    const button=document.getElementById('theme-toggle');
    if(button) button.textContent=theme==='dark'?'☀️ Fundo claro':'🌙 Fundo escuro';
  }

  function toggleTheme(){
    const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
    localStorage.setItem(THEME_KEY,next);
    applyTheme(next);
  }

  function initTheme(){ applyTheme(localStorage.getItem(THEME_KEY)||'light'); }

  function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function localDateKey(date = new Date()){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function formatDate(value){
    if(!value) return 'N/A';
    const [y,m,d]=value.split('-').map(Number);
    return new Date(y,m-1,d).toLocaleDateString('pt-BR');
  }
  function parseLocalDate(value){
    if(!value) return null;
    const [y,m,d]=value.split('-').map(Number);
    return new Date(y,m-1,d);
  }
  function addMonthsClamped(date,months){
    const result=new Date(date.getFullYear(),date.getMonth(),1);
    const targetMonth=date.getMonth()+months;
    result.setFullYear(date.getFullYear()+Math.floor(targetMonth/12));
    result.setMonth(((targetMonth%12)+12)%12);
    const lastDay=new Date(result.getFullYear(),result.getMonth()+1,0).getDate();
    result.setDate(Math.min(date.getDate(),lastDay));
    return result;
  }
  function nextRoundDate(endDate,frequency){
    const date=parseLocalDate(endDate); if(!date)return '';
    const next=new Date(date);
    if(frequency==='semanal') next.setDate(next.getDate()+7);
    else if(frequency==='bimestral') return localDateKey(addMonthsClamped(date,2));
    else if(frequency==='trimestral') return localDateKey(addMonthsClamped(date,3));
    else return localDateKey(addMonthsClamped(date,1));
    return localDateKey(next);
  }
  function frequencyLabel(value){
    return ({semanal:'Semanal',mensal:'Mensal',bimestral:'Bimestral',trimestral:'Trimestral'})[value]||value||'Mensal';
  }
  function daysFromToday(value){
    const date=parseLocalDate(value); if(!date)return null;
    const today=parseLocalDate(localDateKey());
    return Math.round((date-today)/86400000);
  }
  function getNextRoundReminder(client){
    const rounds=client.rounds||[];
    if(!rounds.length)return null;
    const last=rounds[rounds.length-1];
    if(calculateRoundStatus(last)!=='concluido')return null;
    if(!last.endDate)return {client,round:last,nextDate:'',days:null,type:'missing-date'};
    const nextDate=nextRoundDate(last.endDate,client.frequency||'mensal');
    const days=daysFromToday(nextDate);
    const type=days<0?'overdue':days===0?'today':days<=3?'upcoming':'future';
    return {client,round:last,nextDate,days,type};
  }
  function esc(value=''){
    return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  function safeUrl(value=''){
    try{
      const u=new URL(value);
      return ['http:','https:'].includes(u.protocol) ? u.href : '';
    }catch{return '';}
  }
  function toast(message){
    const el=document.getElementById('toast');
    el.textContent=message; el.classList.remove('hidden');
    setTimeout(()=>el.classList.add('hidden'),2200);
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function migrateLegacyClients(legacyClients){
    return legacyClients.map(old=>{
      const client=newClient();
      client.id=String(old.id||uid());
      client.code=old.codigo||'';
      client.name=old.nome||'';
      client.folderNumber=old.pasta||'';
      client.csmEmail=old.emailCSM||'';
      client.frequency=old.frequencia||'mensal';
      client.secondApprover=old.segundoAprovador==='sim';
      client.discovery={status:old.discoveryRealizada==='sim'?'realizada':'pendente',date:old.dataDiscovery||'',gongLink:'',notes:''};
      client.survey={status:old.survey||'pendente',link:old.linkSurvey||'',sentDate:'',responseDate:''};
      client.rounds=(old.rounds||[]).filter(r=>r.data||r.notas||r.status!=='pendente').map((oldRound,index)=>{
        const round=newRound(index+1);
        round.startDate=oldRound.data||'';
        round.notes=oldRound.notas||'';
        if(oldRound.status==='aprovado'){
          STEP_DEFINITIONS.forEach(([key])=>round.steps[key]=true);
          round.endDate=oldRound.data||'';
        }else if(oldRound.status==='em andamento'||oldRound.status==='revisao'){
          round.steps.planilha1A=true;
        }
        return round;
      });
      if((old.asins||[]).length){
        if(!client.rounds.length) client.rounds.push(newRound(1));
        client.rounds[client.rounds.length-1].asins=old.asins.map(a=>({
          id:String(a.id||uid()),code:String(a.codigo||'').toUpperCase(),productName:'',salesShare:Number.isFinite(Number(a.vendas))?Number(a.vendas):null,
          status:a.status==='concluido'?'concluido':a.status==='em-otimizacao'?'revisao-seo':'fila',startDate:'',endDate:'',notes:''
        }));
      }
      return client;
    });
  }

  function normalizeStateData(){
    state.demandsByDate=state.demandsByDate||{};
    state.completedByDate=state.completedByDate||{};
    state.clients.forEach(client=>{
      client.rounds=(client.rounds||[]).map(round=>{
        round.steps=round.steps||{};
        STEP_DEFINITIONS.forEach(([key])=>{
          if(typeof round.steps[key]!=='boolean'){
            // Preserva rounds já concluídos antes da inclusão da nova etapa.
            round.steps[key]=(key==='verificarPaginaProduto'&&round.steps.uploadPortal&&round.endDate)?true:false;
          }
        });
        round.asins=round.asins||[];
        round.links=round.links||{planilha1A:'',planilha1B:'',planilha1C:'',final:''};
        return round;
      });
    });
  }

  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        state={version:5,clients:Array.isArray(parsed.clients)?parsed.clients:[],demandsByDate:parsed.demandsByDate||{},completedByDate:parsed.completedByDate||{}};
      }else{
        const legacyRaw=localStorage.getItem('quartile_clientes_v3');
        if(legacyRaw){
          const legacy=JSON.parse(legacyRaw);
          if(Array.isArray(legacy)&&legacy.length){
            state.clients=migrateLegacyClients(legacy);
            save();
          }
        }
      }
      normalizeStateData();
      save();
    }catch(error){
      console.error(error);
      alert('Não foi possível carregar os dados salvos. Um novo banco local será iniciado.');
      state={version:5,clients:[],demandsByDate:{},completedByDate:{}};
    }
  }

  function newRound(number){
    const steps={};
    STEP_DEFINITIONS.forEach(([key])=>steps[key]=false);
    return {
      id:uid(), number, status:'nao-iniciado', startDate:'', endDate:'', dueDate:'',
      notes:'', links:{planilha1A:'',planilha1B:'',planilha1C:'',final:''},
      steps, asins:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    };
  }

  function newClient(){
    return {
      id:uid(), code:'', name:'', product:'', folderNumber:'', marketplace:'Amazon US',
      csmEmail:'', internalOwner:'', frequency:'mensal', secondApprover:false,
      optimizationDate:'', portalLink:'', folderLink:'', notes:'',
      discovery:{status:'pendente',date:'',gongLink:'',notes:''},
      survey:{status:'pendente',link:'',sentDate:'',responseDate:''},
      rounds:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    };
  }

  function findClient(id){ return state.clients.find(c=>c.id===id); }
  function activeRound(client){
    return [...(client.rounds||[])].reverse().find(r=>calculateRoundStatus(r)!=='concluido') || null;
  }
  function calculateRoundProgress(round){
    const total=STEP_DEFINITIONS.length;
    const done=STEP_DEFINITIONS.filter(([key])=>Boolean(round.steps?.[key])).length;
    return {done,total,percent:Math.round((done/total)*100)};
  }
  function calculateRoundStatus(round){
    const s=round.steps||{};
    if(s.verificarPaginaProduto) return 'concluido';
    if(s.uploadPortal) return 'verificacao-pagina-pendente';
    if(s.aprovacaoCliente) return 'upload-pendente';
    if(s.envioCliente) return 'aguardando-cliente';
    if(Object.values(s).some(Boolean)) return 'em-progresso';
    return 'nao-iniciado';
  }
  function calculateClientStatus(client){
    const round=activeRound(client);
    if(!round) return client.rounds?.length ? 'concluido' : 'sem-round';
    return calculateRoundStatus(round);
  }
  function statusLabel(status){
    return ({'sem-round':'Sem round ativo','nao-iniciado':'Não iniciado','em-progresso':'Em progresso','aguardando-cliente':'Aguardando cliente','upload-pendente':'Upload pendente','verificacao-pagina-pendente':'Verificar página','concluido':'Concluído'})[status]||status;
  }
  function statusChip(status){
    const cls=status==='concluido'?'chip-success':status==='aguardando-cliente'?'chip-warning':status==='upload-pendente'||status==='verificacao-pagina-pendente'?'chip-danger':status==='em-progresso'?'chip-info':'chip-neutral';
    return `<span class="chip ${cls}">${statusLabel(status)}</span>`;
  }

  function showView(view){
    ['dashboard','today','calendar','client'].forEach(v=>document.getElementById(`${v}-view`).classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');
    if(view==='dashboard') renderDashboard();
    if(view==='today') renderToday();
    if(view==='calendar') renderCalendar();
    if(view==='client') renderClientDetail();
  }

  function renderDashboard(){
    renderDaily();
    const clients=state.clients;
    document.getElementById('kpi-total').textContent=clients.length;
    document.getElementById('kpi-progress').textContent=clients.filter(c=>calculateClientStatus(c)==='em-progresso').length;
    document.getElementById('kpi-waiting').textContent=clients.filter(c=>calculateClientStatus(c)==='aguardando-cliente').length;
    document.getElementById('kpi-done').textContent=clients.reduce((sum,c)=>sum+(c.rounds||[]).filter(r=>calculateRoundStatus(r)==='concluido').length,0);
    renderNextRoundAlerts();

    const search=(document.getElementById('client-search')?.value||'').trim().toLowerCase();
    const filter=document.getElementById('client-filter')?.value||'todos';
    const filtered=clients.filter(c=>{
      const hay=`${c.name} ${c.code} ${c.product}`.toLowerCase();
      const matchesSearch=hay.includes(search);
      const matchesFilter=filter==='todos'||calculateClientStatus(c)===filter;
      return matchesSearch&&matchesFilter;
    });

    document.getElementById('client-list').innerHTML=filtered.length?filtered.map(c=>{
      const round=activeRound(c);
      const status=calculateClientStatus(c);
      const progress=round?calculateRoundProgress(round):{percent:0};
      return `<div class="client-card">
        <div class="client-head">
          <div style="flex:1">
            <div class="client-name">${esc(c.name)}</div>
            <div class="client-meta">Código: ${esc(c.code)} • Produto: ${esc(c.product||'N/A')} • Responsável: ${esc(c.internalOwner||'N/A')}</div>
            <div class="chips">
              ${statusChip(status)}
              <span class="chip chip-neutral">${c.rounds?.length||0} round(s)</span>
              <span class="chip ${c.discovery?.status==='realizada'?'chip-success':'chip-warning'}">Discovery: ${esc(c.discovery?.status||'pendente')}</span>
              ${round?`<span class="chip chip-info">Round ${round.number}: ${progress.percent}%</span>`:''}
            </div>
          </div>
          <div class="inline-actions">
            <button class="btn btn-primary btn-small" onclick="openClient('${c.id}')">Abrir</button>
            <button class="btn btn-secondary btn-small" onclick="openClientForm('${c.id}')">Editar</button>
          </div>
        </div>
      </div>`;
    }).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
  }

  function renderNextRoundAlerts(){
    const container=document.getElementById('next-round-alerts'); if(!container)return;
    const reminders=state.clients.map(getNextRoundReminder).filter(Boolean);
    const actionable=reminders.filter(r=>['overdue','today','upcoming','missing-date'].includes(r.type));
    if(!actionable.length){container.innerHTML='';container.classList.add('hidden');return;}
    const order={overdue:0,today:1,upcoming:2,'missing-date':3};
    actionable.sort((a,b)=>(order[a.type]-order[b.type])||(a.nextDate||'').localeCompare(b.nextDate||''));
    container.classList.remove('hidden');
    container.innerHTML=`<div class="next-round-panel"><div class="next-round-heading"><div><strong>Próximos rounds</strong><span>${actionable.length} cliente(s) precisam de atenção</span></div><button class="btn btn-secondary btn-small" onclick="showView('today')">Ver agenda</button></div><div class="next-round-list">${actionable.map(nextRoundAlertItem).join('')}</div></div>`;
  }
  function nextRoundAlertItem(reminder){
    const {client,round,nextDate,days,type}=reminder;
    let title='',detail='',cls='notice-upcoming';
    if(type==='overdue'){title=`Round ${round.number+1} atrasado há ${Math.abs(days)} dia(s)`;detail=`Deveria ter começado em ${formatDate(nextDate)}`;cls='notice-overdue';}
    else if(type==='today'){title=`Começar o Round ${round.number+1} hoje`;detail=`Periodicidade ${frequencyLabel(client.frequency)} • ${formatDate(nextDate)}`;cls='notice-today';}
    else if(type==='upcoming'){title=`Round ${round.number+1} começa em ${days} dia(s)`;detail=`Data prevista: ${formatDate(nextDate)} • ${frequencyLabel(client.frequency)}`;}
    else {title='Informe a data de conclusão do último round';detail=`Round ${round.number} está concluído, mas sem data final.`;cls='notice-missing';}
    return `<div class="next-round-item ${cls}"><div><strong>${esc(client.name)}</strong><p>${esc(title)}<br><span>${esc(detail)}</span></p></div><div class="inline-actions"><button class="btn btn-secondary btn-small" onclick="openClient('${client.id}')">Abrir cliente</button>${type!=='missing-date'?`<button class="btn btn-primary btn-small" onclick="startScheduledRound('${client.id}')">Iniciar round</button>`:''}</div></div>`;
  }
  function startScheduledRound(clientId){
    const c=findClient(clientId); if(!c)return;
    const reminder=getNextRoundReminder(c);
    addRound(clientId);
    const created=c.rounds[c.rounds.length-1];
    if(reminder?.nextDate) created.startDate=localDateKey();
    save(); selectedClientId=clientId; showView('client');
  }

  function completedItems(date){
    if(!state.completedByDate[date]) state.completedByDate[date]=[];
    return state.completedByDate[date];
  }
  function addCompletedRecord({date=localDateKey(),text,sourceType='manual',sourceId='',clientId='',roundId='',stepKey=''}){
    if(!text)return;
    const items=completedItems(date);
    if(sourceId&&items.some(item=>item.sourceId===sourceId))return;
    items.push({id:uid(),text,sourceType,sourceId,clientId,roundId,stepKey,completedAt:new Date().toISOString()});
  }
  function removeCompletedRecord(sourceId){
    if(!sourceId)return;
    Object.keys(state.completedByDate||{}).forEach(date=>{
      state.completedByDate[date]=(state.completedByDate[date]||[]).filter(item=>item.sourceId!==sourceId);
      if(!state.completedByDate[date].length)delete state.completedByDate[date];
    });
  }

  function getRoundPendingTasks(){
    const tasks=[];
    state.clients.forEach(client=>{
      const round=activeRound(client);
      if(!round)return;
      STEP_DEFINITIONS.forEach(([key,label],index)=>{
        if(!round.steps?.[key]){
          tasks.push({
            id:`round-${round.id}-${key}`,
            clientId:client.id,
            roundId:round.id,
            stepKey:key,
            label,
            order:index,
            clientName:client.name,
            roundNumber:round.number,
            dueDate:round.dueDate||''
          });
        }
      });
    });
    return tasks.sort((a,b)=>(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||a.clientName.localeCompare(b.clientName)||a.order-b.order);
  }

  function completeRoundTask(clientId,roundId,key){
    const round=findClient(clientId)?.rounds.find(r=>r.id===roundId);
    if(!round)return;
    round.steps[key]=true;
    const stepLabel=STEP_DEFINITIONS.find(([stepKey])=>stepKey===key)?.[1]||key;
    const client=findClient(clientId);
    addCompletedRecord({
      text:`${client?.name||'Cliente'} — Round ${round.number}: ${stepLabel}`,
      sourceType:'round-step',sourceId:`round-${roundId}-${key}`,clientId,roundId,stepKey:key
    });
    round.status=calculateRoundStatus(round);
    round.updatedAt=new Date().toISOString();
    if(key==='verificarPaginaProduto'&&!round.endDate)round.endDate=localDateKey();
    save();
    renderDashboard();
    toast('Etapa concluída e removida das tarefas diárias.');
  }

  function renderDaily(){
    const date=localDateKey();
    if(!state.demandsByDate[date]) state.demandsByDate[date]={required:{emailMorning:false,emailLunch:false,emailEvening:false,priorities:false},items:[]};
    const memo=state.demandsByDate[date];
    const required=[
      ['emailMorning','📧 E-mail da manhã','Verificar inbox'],
      ['emailLunch','📧 E-mail do almoço','Verificar respostas'],
      ['emailEvening','📧 E-mail das 19h','Última verificação'],
      ['priorities','🎯 Verificar pendências','Definir prioridades']
    ];
    const done=required.filter(([key])=>memo.required[key]).length;
    document.getElementById('daily-required').innerHTML=`
      <div class="task-grid">${required.map(([key,label,desc])=>`<label class="task-card ${memo.required[key]?'done':'pending'}"><input type="checkbox" ${memo.required[key]?'checked':''} onchange="toggleRequired('${key}')"><div><strong style="font-size:13px">${label}</strong><div style="font-size:11px;color:var(--muted);margin-top:3px">${desc}</div></div></label>`).join('')}</div>
      <div style="margin-top:10px"><div class="progress"><div class="progress-fill" style="width:${done/required.length*100}%"></div></div><div class="progress-text">${done}/${required.length} tarefas obrigatórias concluídas</div></div>`;

    const roundTasks=getRoundPendingTasks();
    const groupedRoundTasks=roundTasks.reduce((groups,task)=>{
      if(!groups[task.clientId]) groups[task.clientId]={clientId:task.clientId,clientName:task.clientName,tasks:[]};
      groups[task.clientId].tasks.push(task);
      return groups;
    },{});
    const roundTaskGroups=Object.values(groupedRoundTasks).sort((a,b)=>a.clientName.localeCompare(b.clientName));
    const roundTasksHtml=roundTasks.length?`<div class="auto-task-heading"><strong>Pendências automáticas dos rounds</strong><span>${roundTasks.length} etapa(s) em ${roundTaskGroups.length} loja(s)</span></div>
      <div class="store-task-groups">${roundTaskGroups.map(group=>{
        const first=group.tasks[0];
        const overdue=group.tasks.some(task=>task.dueDate&&daysFromToday(task.dueDate)<0);
        return `<details class="store-task-group ${overdue?'has-overdue':''}">
          <summary>
            <span class="store-task-title"><strong>${esc(group.clientName)}</strong><small>Round ${first.roundNumber}${first.dueDate?` • Prazo: ${formatDate(first.dueDate)}`:''}</small></span>
            <span class="store-task-count">${group.tasks.length} pendência(s)</span>
          </summary>
          <div class="store-task-body">
            ${group.tasks.map(task=>`<div class="memo-item system-task">
              <input type="checkbox" onchange="completeRoundTask('${task.clientId}','${task.roundId}','${task.stepKey}')">
              <span><strong>${esc(task.label)}</strong>${task.dueDate?`<small>Prazo: ${formatDate(task.dueDate)}</small>`:''}</span>
              <button class="btn btn-secondary btn-small" onclick="openClient('${task.clientId}')">Abrir</button>
            </div>`).join('')}
          </div>
        </details>`;
      }).join('')}</div>`:'';
    const manualHtml=memo.items.length?`<div class="auto-task-heading manual-heading"><strong>Demandas adicionadas manualmente</strong><span>${memo.items.length} item(ns)</span></div>${memo.items.map(item=>`<div class="memo-item ${item.done?'done':''}">
      <input type="checkbox" ${item.done?'checked':''} onchange="toggleDemand('${item.id}')">
      <span style="${item.done?'text-decoration:line-through;color:#98a2b3':''}">${item.priority==='alta'?'🔴 ':''}${esc(item.text)}</span>
      <button class="btn btn-danger btn-small" onclick="deleteDemand('${item.id}')">Excluir</button>
    </div>`).join('')}`:'';
    document.getElementById('daily-demands').innerHTML=roundTasksHtml+manualHtml||'<div class="empty" style="padding:18px">Nenhuma demanda pendente hoje.</div>';
    save();
  }

  function toggleRequired(key){
    const memo=state.demandsByDate[localDateKey()];
    memo.required[key]=!memo.required[key]; save(); renderDaily();
  }
  function addDemand(){
    const input=document.getElementById('new-demand'); const text=input.value.trim(); if(!text)return;
    const date=localDateKey();
    if(!state.demandsByDate[date]) state.demandsByDate[date]={required:{emailMorning:false,emailLunch:false,emailEvening:false,priorities:false},items:[]};
    state.demandsByDate[date].items.push({id:uid(),text,priority:document.getElementById('demand-priority').value,done:false,createdAt:new Date().toISOString(),completedAt:''});
    input.value=''; save(); renderDaily();
    if(document.getElementById('calendar-view')&&!document.getElementById('calendar-view').classList.contains('hidden'))renderCalendar();
    toast('Demanda registrada no calendário de hoje.');
  }
  function setDemandDone(date,id,done){
    const item=state.demandsByDate?.[date]?.items?.find(i=>i.id===id);
    if(!item)return;
    item.done=done;
    item.completedAt=done?new Date().toISOString():'';
    if(done) addCompletedRecord({date,text:item.text,sourceType:'daily-demand',sourceId:`demand-${id}`});
    else removeCompletedRecord(`demand-${id}`);
    save();
  }
  function toggleDemand(id){
    const date=localDateKey();
    const item=state.demandsByDate?.[date]?.items?.find(i=>i.id===id);
    if(!item)return;
    setDemandDone(date,id,!item.done);
    renderDaily();
  }
  function toggleCalendarDemand(date,id){
    const item=state.demandsByDate?.[date]?.items?.find(i=>i.id===id);
    if(!item)return;
    setDemandDone(date,id,!item.done);
    renderCalendar();
    if(date===localDateKey())renderDaily();
  }
  function deleteDemand(id){ state.demandsByDate[localDateKey()].items=state.demandsByDate[localDateKey()].items.filter(i=>i.id!==id); removeCompletedRecord(`demand-${id}`); save(); renderDaily(); }

  function openClient(id){ selectedClientId=id; showView('client'); }

  function renderClientDetail(){
    const c=findClient(selectedClientId); if(!c){showView('dashboard');return;}
    const links=[['Pasta',c.folderLink],['Portal',c.portalLink],['Survey',c.survey?.link],['Gong',c.discovery?.gongLink]].filter(([,u])=>safeUrl(u));
    document.getElementById('client-detail').innerHTML=`
      <div class="detail-header">
        <div class="client-head">
          <div><h1>${esc(c.name)}</h1><div class="chips">${statusChip(calculateClientStatus(c))}<span class="chip chip-neutral">${c.rounds?.length||0} round(s)</span></div></div>
          <div class="inline-actions"><button class="btn btn-secondary" onclick="openClientForm('${c.id}')">Editar cliente</button><button class="btn btn-danger" onclick="deleteClient('${c.id}')">Excluir</button></div>
        </div>
        <div class="detail-meta" style="margin-top:14px">
          ${meta('Código',c.code)}${meta('Produto',c.product)}${meta('Marketplace',c.marketplace)}${meta('Pasta',c.folderNumber)}${meta('CSM',c.csmEmail)}${meta('Responsável',c.internalOwner)}${meta('Frequência',c.frequency)}${meta('Otimização automática',formatDate(c.optimizationDate))}
        </div>
      </div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card"><div class="section-title">Discovery</div>${meta('Status',c.discovery?.status||'pendente')}${meta('Data',formatDate(c.discovery?.date))}${meta('Observações',c.discovery?.notes||'N/A')}</div>
        <div class="card"><div class="section-title">Survey</div>${meta('Status',c.survey?.status||'pendente')}${meta('Data de envio',formatDate(c.survey?.sentDate))}${meta('Data de resposta',formatDate(c.survey?.responseDate))}</div>
      </div>

      ${links.length?`<div class="card" style="margin-bottom:16px"><div class="section-title">Links rápidos</div><div class="chips">${links.map(([label,url])=>`<a class="chip chip-info" href="${safeUrl(url)}" target="_blank" rel="noopener">${label}</a>`).join('')}</div></div>`:''}

      <div class="client-head" style="margin-bottom:12px"><div><h2 style="color:var(--primary);font-size:20px">Rounds de otimização</h2><p style="color:var(--muted);font-size:12px;margin-top:3px">Cada round repete o fluxo completo do cliente.</p></div><button class="btn btn-primary" onclick="addRound('${c.id}')">+ Iniciar próximo round</button></div>
      <div>${c.rounds?.length?c.rounds.slice().reverse().map(r=>renderRound(c,r)).join(''):'<div class="empty">Nenhum round criado. Inicie o primeiro round para começar o fluxo.</div>'}</div>
    `;
  }

  function meta(label,value){ return `<div class="meta-box" style="margin-bottom:8px"><small>${esc(label)}</small><strong>${esc(value||'N/A')}</strong></div>`; }

  function renderRound(client,round){
    const progress=calculateRoundProgress(round); const status=calculateRoundStatus(round);
    const asins=round.asins||[];
    const collapsed=isRoundCollapsed(round.id);
    return `<div class="round-card ${collapsed?'round-collapsed':''}">
      <div class="round-header">
        <div><div class="round-title">Round ${round.number}</div><div class="round-sub">Início: ${formatDate(round.startDate)} • Prazo: ${formatDate(round.dueDate)} • ${progress.done}/${progress.total} etapas</div></div>
        <div class="round-actions">${statusChip(status)}<button id="round-toggle-${round.id}" class="btn btn-secondary btn-small" aria-expanded="${!collapsed}" onclick="toggleRoundDetails('${round.id}')">${collapsed?'Expandir':'Recolher'}</button><button class="btn btn-secondary btn-small" onclick="openRoundEditor('${client.id}','${round.id}')">Editar dados</button><button class="btn btn-danger btn-small" onclick="deleteRound('${client.id}','${round.id}')">Excluir</button></div>
      </div>
      <div class="round-summary"><div class="progress"><div class="progress-fill" style="width:${progress.percent}%"></div></div><div class="progress-text">${progress.percent}% concluído</div></div>
      <div id="round-body-${round.id}" class="round-body ${collapsed?'hidden':''}">
        <div class="steps">${STEP_DEFINITIONS.map(([key,label])=>`<label class="step ${round.steps?.[key]?'done':''}"><input type="checkbox" ${round.steps?.[key]?'checked':''} onchange="toggleStep('${client.id}','${round.id}','${key}')"><span>${label}</span></label>`).join('')}</div>
        <div class="grid grid-2">
          <div class="card round-inner-card"><div class="card-title">Links das planilhas</div>${roundLinks(round)}</div>
          <div class="card round-inner-card"><div class="card-title">Observações</div><div style="font-size:13px;color:var(--muted);white-space:pre-wrap">${esc(round.notes||'Nenhuma observação.')}</div></div>
        </div>
        <div style="margin-top:14px"><div class="client-head"><div class="card-title" style="margin:0">ASINs deste round</div><button class="btn btn-primary btn-small" onclick="openAsinForm('${client.id}','${round.id}')">+ Adicionar ASIN</button></div>
        ${asins.length?`<table class="asin-table"><thead><tr><th>ASIN</th><th>Produto</th><th>% vendas</th><th>Status</th><th>Datas</th><th>Ações</th></tr></thead><tbody>${asins.map(a=>`<tr><td><strong>${esc(a.code)}</strong></td><td>${esc(a.productName||'N/A')}</td><td>${Number.isFinite(a.salesShare)?a.salesShare+'%':'N/A'}</td><td>${esc(asinStatusLabel(a.status))}</td><td>Início: ${formatDate(a.startDate)}<br>Fim: ${formatDate(a.endDate)}</td><td><div class="inline-actions"><button class="btn btn-secondary btn-small" onclick="openAsinForm('${client.id}','${round.id}','${a.id}')">Editar</button><button class="btn btn-danger btn-small" onclick="deleteAsin('${client.id}','${round.id}','${a.id}')">Excluir</button></div></td></tr>`).join('')}</tbody></table>`:'<div class="empty" style="padding:18px;margin-top:10px">Nenhum ASIN cadastrado neste round.</div>'}</div>
      </div>
    </div>`;
  }

  function roundLinks(round){
    const items=[['Planilha 1A',round.links?.planilha1A],['Planilha 1B',round.links?.planilha1B],['Planilha 1C',round.links?.planilha1C],['Versão final',round.links?.final]];
    return `<div class="chips">${items.map(([label,url])=>safeUrl(url)?`<a class="chip chip-info" href="${safeUrl(url)}" target="_blank" rel="noopener">${label}</a>`:`<span class="chip chip-neutral">${label}: sem link</span>`).join('')}</div>`;
  }

  function addRound(clientId){
    const c=findClient(clientId); if(!c)return;
    const last=c.rounds?.[c.rounds.length-1];
    if(last&&calculateRoundStatus(last)!=='concluido'&&!confirm('O round atual ainda não foi concluído. Deseja criar outro mesmo assim?'))return;
    const round=newRound((c.rounds?.length||0)+1); round.startDate=localDateKey(); c.rounds.push(round); c.updatedAt=new Date().toISOString(); save(); renderClientDetail(); toast('Novo round criado.');
  }
  function toggleStep(clientId,roundId,key){
    const client=findClient(clientId);
    const r=client?.rounds.find(x=>x.id===roundId); if(!r)return;
    r.steps[key]=!r.steps[key];
    const sourceId=`round-${roundId}-${key}`;
    const stepLabel=STEP_DEFINITIONS.find(([stepKey])=>stepKey===key)?.[1]||key;
    if(r.steps[key]) addCompletedRecord({text:`${client.name||'Cliente'} — Round ${r.number}: ${stepLabel}`,sourceType:'round-step',sourceId,clientId,roundId,stepKey:key});
    else removeCompletedRecord(sourceId);
    r.status=calculateRoundStatus(r); r.updatedAt=new Date().toISOString();
    if(r.steps.verificarPaginaProduto&&!r.endDate)r.endDate=localDateKey();
    if(!r.steps.verificarPaginaProduto)r.endDate='';
    save(); renderClientDetail();
  }
  function deleteRound(clientId,roundId){
    const c=findClient(clientId); if(!c||!confirm('Excluir este round e todos os ASINs vinculados?'))return;
    c.rounds=c.rounds.filter(r=>r.id!==roundId); c.rounds.forEach((r,i)=>r.number=i+1); save(); renderClientDetail();
  }

  function openClientForm(clientId=null){
    const c=clientId?structuredClone(findClient(clientId)):newClient();
    openModal(`<div class="modal-header"><h2 style="color:var(--primary)">${clientId?'Editar cliente':'Novo cliente'}</h2><button class="btn btn-secondary btn-small" onclick="closeModal()">Fechar</button></div>
      <div class="grid grid-2">
        ${field('Nome do cliente *','client-name',c.name)}${field('Código *','client-code',c.code)}${field('Produto/categoria','client-product',c.product)}${field('Número da pasta','client-folder-number',c.folderNumber)}
        ${field('Marketplace','client-marketplace',c.marketplace)}${field('E-mail do CSM','client-csm',c.csmEmail,'email')}${field('Responsável interno','client-owner',c.internalOwner)}
        ${selectField('Frequência','client-frequency',c.frequency,[['semanal','Semanal'],['mensal','Mensal'],['bimestral','Bimestral'],['trimestral','Trimestral']])}
        ${field('Data de otimização automática','client-optimization-date',c.optimizationDate,'date')}${field('Link da pasta','client-folder-link',c.folderLink,'url')}${field('Link do portal','client-portal-link',c.portalLink,'url')}
        ${selectField('Segundo aprovador','client-second-approver',c.secondApprover?'sim':'nao',[['nao','Não'],['sim','Sim']])}
      </div>
      <div class="section-title" style="margin-top:18px">Discovery</div><div class="grid grid-2">${selectField('Status','discovery-status',c.discovery.status,[['pendente','Pendente'],['agendada','Agendada'],['realizada','Realizada'],['nao-aplicavel','Não aplicável']])}${field('Data','discovery-date',c.discovery.date,'date')}${field('Link da Gong','discovery-gong',c.discovery.gongLink,'url')}${field('Observações','discovery-notes',c.discovery.notes,'textarea')}</div>
      <div class="section-title" style="margin-top:18px">Survey</div><div class="grid grid-2">${selectField('Status','survey-status',c.survey.status,[['pendente','Pendente'],['enviado','Enviado'],['respondido','Respondido'],['nao-aplicavel','Não aplicável']])}${field('Link','survey-link',c.survey.link,'url')}${field('Data de envio','survey-sent',c.survey.sentDate,'date')}${field('Data de resposta','survey-response',c.survey.responseDate,'date')}</div>
      <div class="section-title" style="margin-top:18px">Observações gerais</div>${field('Observações','client-notes',c.notes,'textarea')}
      <div class="actions" style="margin-top:18px"><button class="btn btn-primary" onclick="saveClientForm('${clientId||''}')">Salvar cliente</button><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button></div>`);
  }

  function field(label,id,value='',type='text'){
    const normalized=value??'';
    if(type==='textarea') return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}">${esc(normalized)}</textarea></div>`;
    return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(normalized)}"></div>`;
  }
  function selectField(label,id,value,options){ return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select></div>`; }

  function saveClientForm(clientId){
    const name=document.getElementById('client-name').value.trim(); const code=document.getElementById('client-code').value.trim();
    if(!name||!code){alert('Preencha nome e código.');return;}
    const duplicate=state.clients.some(c=>c.code.toLowerCase()===code.toLowerCase()&&c.id!==clientId); if(duplicate){alert('Já existe um cliente com este código.');return;}
    const c=clientId?findClient(clientId):newClient();
    Object.assign(c,{name,code,product:val('client-product'),folderNumber:val('client-folder-number'),marketplace:val('client-marketplace'),csmEmail:val('client-csm'),internalOwner:val('client-owner'),frequency:val('client-frequency'),optimizationDate:val('client-optimization-date'),folderLink:val('client-folder-link'),portalLink:val('client-portal-link'),secondApprover:val('client-second-approver')==='sim',notes:val('client-notes'),updatedAt:new Date().toISOString()});
    c.discovery={status:val('discovery-status'),date:val('discovery-date'),gongLink:val('discovery-gong'),notes:val('discovery-notes')};
    c.survey={status:val('survey-status'),link:val('survey-link'),sentDate:val('survey-sent'),responseDate:val('survey-response')};
    if(!clientId)state.clients.push(c);
    save(); closeModal(); selectedClientId=c.id; showView('client'); toast('Cliente salvo.');
  }
  function val(id){ return document.getElementById(id)?.value.trim()||''; }

  function openRoundEditor(clientId,roundId){
    const r=findClient(clientId)?.rounds.find(x=>x.id===roundId); if(!r)return;
    openModal(`<div class="modal-header"><h2 style="color:var(--primary)">Editar Round ${r.number}</h2><button class="btn btn-secondary btn-small" onclick="closeModal()">Fechar</button></div>
      <div class="grid grid-2">${field('Data de início','round-start',r.startDate,'date')}${field('Prazo','round-due',r.dueDate,'date')}${field('Data de conclusão','round-end',r.endDate,'date')}${field('Link Planilha 1A','round-link-a',r.links?.planilha1A,'url')}${field('Link Planilha 1B','round-link-b',r.links?.planilha1B,'url')}${field('Link Planilha 1C','round-link-c',r.links?.planilha1C,'url')}${field('Link da versão final','round-link-final',r.links?.final,'url')}</div>
      <div style="margin-top:14px">${field('Observações','round-notes',r.notes,'textarea')}</div>
      <div class="actions" style="margin-top:16px"><button class="btn btn-primary" onclick="saveRoundEditor('${clientId}','${roundId}')">Salvar</button><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button></div>`);
  }
  function saveRoundEditor(clientId,roundId){
    const r=findClient(clientId)?.rounds.find(x=>x.id===roundId); if(!r)return;
    r.startDate=val('round-start');r.dueDate=val('round-due');r.endDate=val('round-end');r.notes=val('round-notes');
    r.links={planilha1A:val('round-link-a'),planilha1B:val('round-link-b'),planilha1C:val('round-link-c'),final:val('round-link-final')};r.updatedAt=new Date().toISOString();
    save();closeModal();renderClientDetail();toast('Round atualizado.');
  }

  function asinStatusLabel(s){return ({'fila':'Em fila','planilha-1a':'Planilha 1A','planilha-1b':'Planilha 1B','planilha-1c':'Planilha 1C','revisao-seo':'Revisão SEO','revisao-time':'Revisão interna','aguardando-cliente':'Aguardando cliente','aprovado':'Aprovado','upload-pendente':'Upload pendente','verificacao-pagina-pendente':'Verificar página','concluido':'Concluído'})[s]||s;}
  function openAsinForm(clientId,roundId,asinId=''){
    const round=findClient(clientId)?.rounds.find(r=>r.id===roundId); if(!round)return;
    const a=asinId?structuredClone(round.asins.find(x=>x.id===asinId)):{id:uid(),code:'',productName:'',salesShare:'',status:'fila',startDate:'',endDate:'',notes:''};
    openModal(`<div class="modal-header"><h2 style="color:var(--primary)">${asinId?'Editar':'Adicionar'} ASIN</h2><button class="btn btn-secondary btn-small" onclick="closeModal()">Fechar</button></div>
      <div class="grid grid-2">${field('ASIN *','asin-code-input',a.code)}${field('Nome do produto','asin-product',a.productName)}${field('% de vendas','asin-sales',a.salesShare,'number')}${selectField('Status','asin-status',a.status,[['fila','Em fila'],['planilha-1a','Planilha 1A'],['planilha-1b','Planilha 1B'],['planilha-1c','Planilha 1C'],['revisao-seo','Revisão SEO'],['revisao-time','Revisão interna'],['aguardando-cliente','Aguardando cliente'],['aprovado','Aprovado'],['upload-pendente','Upload pendente'],['concluido','Concluído']])}${field('Data de início','asin-start',a.startDate,'date')}${field('Data de conclusão','asin-end',a.endDate,'date')}</div>
      <div style="margin-top:14px">${field('Observações','asin-notes',a.notes,'textarea')}</div>
      <div class="actions" style="margin-top:16px"><button class="btn btn-primary" onclick="saveAsin('${clientId}','${roundId}','${asinId}')">Salvar</button><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button></div>`);
  }
  function saveAsin(clientId,roundId,asinId){
    const round=findClient(clientId)?.rounds.find(r=>r.id===roundId); if(!round)return;
    const code=val('asin-code-input').toUpperCase(); if(!/^[A-Z0-9]{10}$/.test(code)){alert('O ASIN deve ter exatamente 10 letras ou números.');return;}
    const duplicate=round.asins.some(a=>a.code===code&&a.id!==asinId); if(duplicate){alert('Este ASIN já existe neste round.');return;}
    const salesRaw=val('asin-sales'); const sales=salesRaw===''?null:Number(salesRaw); if(sales!==null&&(sales<0||sales>100)){alert('O percentual de vendas deve ficar entre 0 e 100.');return;}
    const data={id:asinId||uid(),code,productName:val('asin-product'),salesShare:sales,status:val('asin-status'),startDate:val('asin-start'),endDate:val('asin-end'),notes:val('asin-notes')};
    if(asinId){const idx=round.asins.findIndex(a=>a.id===asinId);round.asins[idx]=data;}else round.asins.push(data);
    save();closeModal();renderClientDetail();toast('ASIN salvo.');
  }
  function deleteAsin(clientId,roundId,asinId){const r=findClient(clientId)?.rounds.find(x=>x.id===roundId);if(!r||!confirm('Excluir este ASIN?'))return;r.asins=r.asins.filter(a=>a.id!==asinId);save();renderClientDetail();}

  function deleteClient(id){if(!confirm('Excluir este cliente, todos os rounds e ASINs?'))return;state.clients=state.clients.filter(c=>c.id!==id);save();showView('dashboard');}

  function monthTitle(date){
    const text=date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    return text.charAt(0).toUpperCase()+text.slice(1);
  }
  function calendarDemandItems(date){
    return state.demandsByDate?.[date]?.items||[];
  }
  function calendarOtherCompletedItems(date){
    return (state.completedByDate?.[date]||[]).filter(item=>item.sourceType!=='daily-demand');
  }
  function renderCalendar(){
    const year=calendarCursor.getFullYear();
    const month=calendarCursor.getMonth();
    document.getElementById('calendar-month-title').textContent=monthTitle(calendarCursor);
    const firstDay=new Date(year,month,1);
    const lastDay=new Date(year,month+1,0);
    const cells=[];
    const previousLast=new Date(year,month,0).getDate();
    for(let i=firstDay.getDay()-1;i>=0;i--) cells.push({date:new Date(year,month-1,previousLast-i),outside:true});
    for(let day=1;day<=lastDay.getDate();day++) cells.push({date:new Date(year,month,day),outside:false});
    let nextDay=1;
    while(cells.length%7!==0||cells.length<42) cells.push({date:new Date(year,month+1,nextDay++),outside:true});
    const today=localDateKey();
    document.getElementById('calendar-grid').innerHTML=cells.map(cell=>{
      const key=localDateKey(cell.date);
      const demands=calendarDemandItems(key);
      const other=calendarOtherCompletedItems(key);
      const count=demands.length+other.length;
      const pending=demands.filter(item=>!item.done).length;
      return `<button class="calendar-day ${cell.outside?'outside':''} ${key===today?'today':''} ${key===calendarSelectedDate?'selected':''}" onclick="selectCalendarDate('${key}')">
        <span class="calendar-day-number">${cell.date.getDate()}</span>
        ${count?`<span class="calendar-task-count">${count} tarefa${count===1?'':'s'}</span>`:''}
        ${pending?`<span class="calendar-pending-count">${pending} pendente${pending===1?'':'s'}</span>`:''}
      </button>`;
    }).join('');
    renderCalendarDay();
  }
  function renderCalendarDay(){
    const date=parseLocalDate(calendarSelectedDate)||new Date();
    document.getElementById('calendar-selected-title').textContent=date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    const demands=calendarDemandItems(calendarSelectedDate).slice().sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
    const completed=calendarOtherCompletedItems(calendarSelectedDate).slice().sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
    const demandsHtml=demands.length?`<div class="calendar-subheading"><strong>Demandas registradas</strong><span>${demands.length}</span></div><div class="completed-task-list">${demands.map(item=>`<div class="completed-task-item calendar-demand ${item.done?'is-done':'is-pending'}">
      <input type="checkbox" ${item.done?'checked':''} onchange="toggleCalendarDemand('${calendarSelectedDate}','${item.id}')">
      <div><strong>${item.priority==='alta'?'🔴 ':''}${esc(item.text)}</strong><small>${item.done?'Concluída e registrada':'Pendente'}${item.completedAt?` • ${new Date(item.completedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:''}</small></div>
      <span class="calendar-status-badge ${item.done?'done':'pending'}">${item.done?'Concluída':'Pendente'}</span>
    </div>`).join('')}</div>`:'';
    const completedHtml=completed.length?`<div class="calendar-subheading"><strong>Outras conclusões</strong><span>${completed.length}</span></div><div class="completed-task-list">${completed.map(item=>`<div class="completed-task-item">
      <span class="completed-check">✓</span>
      <div><strong>${esc(item.text)}</strong><small>${item.sourceType==='round-step'?'Etapa de round':'Registro manual'}</small></div>
      <button class="btn btn-danger btn-small" onclick="deleteCompletedTask('${calendarSelectedDate}','${item.id}')">Excluir</button>
    </div>`).join('')}</div>`:'';
    document.getElementById('calendar-day-items').innerHTML=demandsHtml+completedHtml||'<div class="empty calendar-empty">Nenhuma tarefa registrada neste dia.</div>';
  }
  function selectCalendarDate(date){
    calendarSelectedDate=date;
    const selected=parseLocalDate(date);
    if(selected&&(selected.getMonth()!==calendarCursor.getMonth()||selected.getFullYear()!==calendarCursor.getFullYear())) calendarCursor=new Date(selected.getFullYear(),selected.getMonth(),1);
    renderCalendar();
  }
  function changeCalendarMonth(delta){
    calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+delta,1);
    renderCalendar();
  }
  function goCalendarToday(){
    calendarCursor=new Date();
    calendarSelectedDate=localDateKey();
    renderCalendar();
  }
  function openCompletedTaskForm(date=calendarSelectedDate){
    openModal(`<div class="modal-header"><h2 style="color:var(--primary)">Registrar tarefa concluída</h2><button class="btn btn-secondary btn-small" onclick="closeModal()">Fechar</button></div>
      <div class="grid grid-2">${field('Data','completed-task-date',date||localDateKey(),'date')}${field('Tarefa concluída *','completed-task-text','')}</div>
      <div class="actions" style="margin-top:16px"><button class="btn btn-primary" onclick="saveCompletedTask()">Salvar no calendário</button><button class="btn btn-secondary" onclick="closeModal()">Cancelar</button></div>`);
  }
  function saveCompletedTask(){
    const date=val('completed-task-date');
    const text=val('completed-task-text').trim();
    if(!date||!text){alert('Informe a data e a tarefa concluída.');return;}
    addCompletedRecord({date,text,sourceType:'manual'});
    save();closeModal();calendarSelectedDate=date;calendarCursor=parseLocalDate(date)||new Date();renderCalendar();toast('Tarefa registrada no calendário.');
  }
  function deleteCompletedTask(date,id){
    if(!confirm('Excluir este registro do calendário? A etapa original não será desmarcada.'))return;
    state.completedByDate[date]=(state.completedByDate[date]||[]).filter(item=>item.id!==id);
    if(!state.completedByDate[date].length)delete state.completedByDate[date];
    save();renderCalendar();
  }

  function renderToday(){
    const today=localDateKey();
    const overdue=[],dueToday=[],waiting=[],uploads=[],pageChecks=[];
    state.clients.forEach(c=>(c.rounds||[]).forEach(r=>{
      const status=calculateRoundStatus(r);
      const item={client:c,round:r};
      if(r.dueDate&&r.dueDate<today&&status!=='concluido')overdue.push(item);
      if(r.dueDate===today&&status!=='concluido')dueToday.push(item);
      if(status==='aguardando-cliente')waiting.push(item);
      if(status==='upload-pendente')uploads.push(item);
      if(status==='verificacao-pagina-pendente')pageChecks.push(item);
    }));
    const reminders=state.clients.map(getNextRoundReminder).filter(Boolean);
    const nextOverdue=reminders.filter(r=>r.type==='overdue');
    const nextToday=reminders.filter(r=>r.type==='today');
    const nextUpcoming=reminders.filter(r=>r.type==='upcoming');
    const missingDates=reminders.filter(r=>r.type==='missing-date');
    document.getElementById('today-content').innerHTML=[
      nextRoundGroup('Próximos rounds atrasados',nextOverdue,'Nenhum próximo round atrasado.'),
      nextRoundGroup('Começar próximo round hoje',nextToday,'Nenhum novo round previsto para hoje.'),
      nextRoundGroup('Próximos 3 dias',nextUpcoming,'Nenhum novo round previsto para os próximos 3 dias.'),
      nextRoundGroup('Conclusões sem data',missingDates,'Todos os rounds concluídos possuem data final.'),
      todayGroup('Entregas atrasadas',overdue,'Nenhum round em andamento atrasado.'),todayGroup('Entregas que vencem hoje',dueToday,'Nenhum round em andamento vence hoje.'),todayGroup('Aguardando cliente',waiting,'Nenhum cliente aguardando aprovação.'),todayGroup('Upload pendente',uploads,'Nenhum upload pendente.'),todayGroup('Verificar página do produto',pageChecks,'Nenhuma verificação de página pendente.')
    ].join('');
  }
  function nextRoundGroup(title,items,emptyText){return `<div class="today-group"><div class="section-title">${title} (${items.length})</div>${items.length?items.map(r=>nextRoundAlertItem(r)).join(''):`<div class="empty" style="padding:18px">${emptyText}</div>`}</div>`;}
  function todayGroup(title,items,emptyText){return `<div class="today-group"><div class="section-title">${title} (${items.length})</div>${items.length?items.map(({client,round})=>`<div class="today-item"><div><strong>${esc(client.name)} — Round ${round.number}</strong><p>Prazo: ${formatDate(round.dueDate)} • ${statusLabel(calculateRoundStatus(round))}</p></div><button class="btn btn-primary btn-small" onclick="openClient('${client.id}')">Abrir cliente</button></div>`).join(''):`<div class="empty" style="padding:18px">${emptyText}</div>`}</div>`;}

  function openModal(html){document.getElementById('modal-content').innerHTML=html;document.getElementById('modal').classList.remove('hidden');}
  function closeModal(){document.getElementById('modal').classList.add('hidden');document.getElementById('modal-content').innerHTML='';}
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});

  function exportBackup(){
    const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`quartile-backup-${localDateKey()}.json`;a.click();URL.revokeObjectURL(url);
  }
  function importBackup(event){
    const file=event.target.files[0]; if(!file)return;
    const reader=new FileReader(); reader.onload=()=>{try{const parsed=JSON.parse(reader.result);if(!Array.isArray(parsed.clients))throw new Error();if(!confirm('Substituir os dados atuais pelo backup importado?'))return;state={version:5,clients:parsed.clients,demandsByDate:parsed.demandsByDate||{},completedByDate:parsed.completedByDate||{}};save();showView('dashboard');toast('Backup importado.');}catch{alert('Arquivo de backup inválido.');}finally{event.target.value='';}};reader.readAsText(file);
  }

  initTheme();
  load();
  showView('dashboard');
