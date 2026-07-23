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
    ['uploadPortal','Upload realizado no portal']
  ];

  let state = { version:4, clients:[], demandsByDate:{} };
  let selectedClientId = null;

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

  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        state={version:4,clients:Array.isArray(parsed.clients)?parsed.clients:[],demandsByDate:parsed.demandsByDate||{}};
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
    }catch(error){
      console.error(error);
      alert('Não foi possível carregar os dados salvos. Um novo banco local será iniciado.');
      state={version:4,clients:[],demandsByDate:{}};
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
    if(s.uploadPortal) return 'concluido';
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
    return ({'sem-round':'Sem round ativo','nao-iniciado':'Não iniciado','em-progresso':'Em progresso','aguardando-cliente':'Aguardando cliente','upload-pendente':'Upload pendente','concluido':'Concluído'})[status]||status;
  }
  function statusChip(status){
    const cls=status==='concluido'?'chip-success':status==='aguardando-cliente'?'chip-warning':status==='upload-pendente'?'chip-danger':status==='em-progresso'?'chip-info':'chip-neutral';
    return `<span class="chip ${cls}">${statusLabel(status)}</span>`;
  }

  function showView(view){
    ['dashboard','today','client'].forEach(v=>document.getElementById(`${v}-view`).classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');
    if(view==='dashboard') renderDashboard();
    if(view==='today') renderToday();
    if(view==='client') renderClientDetail();
  }

  function renderDashboard(){
    renderDaily();
    const clients=state.clients;
    document.getElementById('kpi-total').textContent=clients.length;
    document.getElementById('kpi-progress').textContent=clients.filter(c=>calculateClientStatus(c)==='em-progresso').length;
    document.getElementById('kpi-waiting').textContent=clients.filter(c=>calculateClientStatus(c)==='aguardando-cliente').length;
    document.getElementById('kpi-done').textContent=clients.reduce((sum,c)=>sum+(c.rounds||[]).filter(r=>calculateRoundStatus(r)==='concluido').length,0);

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

    document.getElementById('daily-demands').innerHTML=memo.items.length?memo.items.map(item=>`<div class="memo-item ${item.done?'done':''}">
      <input type="checkbox" ${item.done?'checked':''} onchange="toggleDemand('${item.id}')">
      <span style="${item.done?'text-decoration:line-through;color:#98a2b3':''}">${item.priority==='alta'?'🔴 ':''}${esc(item.text)}</span>
      <button class="btn btn-danger btn-small" onclick="deleteDemand('${item.id}')">Excluir</button>
    </div>`).join(''):'<div class="empty" style="padding:18px">Nenhuma demanda adicionada hoje.</div>';
    save();
  }

  function toggleRequired(key){
    const memo=state.demandsByDate[localDateKey()];
    memo.required[key]=!memo.required[key]; save(); renderDaily();
  }
  function addDemand(){
    const input=document.getElementById('new-demand'); const text=input.value.trim(); if(!text)return;
    state.demandsByDate[localDateKey()].items.push({id:uid(),text,priority:document.getElementById('demand-priority').value,done:false});
    input.value=''; save(); renderDaily();
  }
  function toggleDemand(id){ const item=state.demandsByDate[localDateKey()].items.find(i=>i.id===id); if(item)item.done=!item.done; save(); renderDaily(); }
  function deleteDemand(id){ state.demandsByDate[localDateKey()].items=state.demandsByDate[localDateKey()].items.filter(i=>i.id!==id); save(); renderDaily(); }

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
    const r=findClient(clientId)?.rounds.find(x=>x.id===roundId); if(!r)return;
    r.steps[key]=!r.steps[key]; r.status=calculateRoundStatus(r); r.updatedAt=new Date().toISOString();
    if(r.steps.uploadPortal&&!r.endDate)r.endDate=localDateKey();
    if(!r.steps.uploadPortal)r.endDate='';
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

  function asinStatusLabel(s){return ({'fila':'Em fila','planilha-1a':'Planilha 1A','planilha-1b':'Planilha 1B','planilha-1c':'Planilha 1C','revisao-seo':'Revisão SEO','revisao-time':'Revisão interna','aguardando-cliente':'Aguardando cliente','aprovado':'Aprovado','upload-pendente':'Upload pendente','concluido':'Concluído'})[s]||s;}
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

  function renderToday(){
    const today=localDateKey();
    const overdue=[],dueToday=[],waiting=[],uploads=[];
    state.clients.forEach(c=>(c.rounds||[]).forEach(r=>{
      const status=calculateRoundStatus(r);
      const item={client:c,round:r};
      if(r.dueDate&&r.dueDate<today&&status!=='concluido')overdue.push(item);
      if(r.dueDate===today&&status!=='concluido')dueToday.push(item);
      if(status==='aguardando-cliente')waiting.push(item);
      if(status==='upload-pendente')uploads.push(item);
    }));
    document.getElementById('today-content').innerHTML=[
      todayGroup('Atrasadas',overdue,'Nenhum round atrasado.'),todayGroup('Vencem hoje',dueToday,'Nenhum round vence hoje.'),todayGroup('Aguardando cliente',waiting,'Nenhum cliente aguardando aprovação.'),todayGroup('Upload pendente',uploads,'Nenhum upload pendente.')
    ].join('');
  }
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
    const reader=new FileReader(); reader.onload=()=>{try{const parsed=JSON.parse(reader.result);if(!Array.isArray(parsed.clients))throw new Error();if(!confirm('Substituir os dados atuais pelo backup importado?'))return;state={version:4,clients:parsed.clients,demandsByDate:parsed.demandsByDate||{}};save();showView('dashboard');toast('Backup importado.');}catch{alert('Arquivo de backup inválido.');}finally{event.target.value='';}};reader.readAsText(file);
  }

  initTheme();
  load();
  showView('dashboard');
