'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/auth';

const PAGE_SIZE = 5000;
const CORE_FIELDS = ['first_name','last_name','name','full_name','email','phone','company','title','website','linkedin','domain','industry','location','city','state','country','address','zip','revenue','employees','founded'];
const ENRICHMENT_FIELDS = ['ai_summary','ai_score','ai_category','web_research','verified_email','found_email','status','enriched_at','waterfall_result','condition_result','push_result','scraped_data'];
const STEP_TYPES = [{id:'ai_enrich',label:'AI Enrich',icon:'🤖',color:'#6366f1'},{id:'web_research',label:'Web Research',icon:'🔍',color:'#0ea5e9'},{id:'api_verify',label:'Verify Email',icon:'✅',color:'#22c55e'},{id:'api_find_email',label:'Find Email',icon:'📧',color:'#f59e0b'},{id:'waterfall',label:'Waterfall',icon:'💧',color:'#8b5cf6'},{id:'formula',label:'Formula',icon:'⚡',color:'#ec4899'},{id:'condition_gate',label:'Condition Gate',icon:'🔀',color:'#ef4444'},{id:'api_push',label:'API Push',icon:'📤',color:'#14b8a6'},{id:'scrape',label:'Scrape',icon:'🕷️',color:'#f97316'}];
const AI_MODELS = {openai:['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo'],anthropic:['claude-opus-4-6','claude-sonnet-4-6','claude-haiku-4-5-20251001'],perplexity:['llama-3-sonar-large-32k-online','llama-3-sonar-small-32k-online']};
const PROMPT_LIBRARY = [{id:'enrich',label:'Enrich Lead',template:'Given this lead data: {{row}}\n\nProvide a 2-sentence professional summary.'},{id:'score',label:'Score Lead',template:'Rate this lead 1-10: {{row}}\n\nReturn only a single integer.'},{id:'category',label:'Categorize',template:'Categorize into [SaaS, Agency, E-commerce, Healthcare, Finance, Other]: {{company}}'},{id:'email',label:'Write Email',template:'Write a short cold email to {{first_name}} at {{company}}. Under 100 words.'},{id:'research',label:'Research Company',template:'Research {{company}} (website: {{website}}). What they do, size, recent news.'},{id:'qualify',label:'Qualify Lead',template:'Does this lead qualify? {{row}}\n\nAnswer YES or NO with one sentence reason.'}];

function estimateCost(model,usage){const rates={'gpt-4o':{input:0.005,output:0.015},'gpt-4o-mini':{input:0.00015,output:0.0006},'claude-opus-4-6':{input:0.015,output:0.075},'claude-sonnet-4-6':{input:0.003,output:0.015},'claude-haiku-4-5-20251001':{input:0.00025,output:0.00125},'llama-3-sonar-small-32k-online':{input:0.0002,output:0.0002}};const r=rates[model];if(!r||!usage)return 0;return((usage.input_tokens||usage.prompt_tokens||0)/1000)*r.input+((usage.output_tokens||usage.completion_tokens||0)/1000)*r.output;}
async function callAIDirect(provider,apiKey,model,prompt,systemPrompt=''){if(!apiKey)throw new Error('No API key for '+provider);if(provider==='openai'){const msgs=systemPrompt?[{role:'system',content:systemPrompt},{role:'user',content:prompt}]:[{role:'user',content:prompt}];const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body:JSON.stringify({model,messages:msgs,max_tokens:1000})});if(!res.ok){const e=await res.json();throw new Error(e.error?.message||res.statusText);}const d=await res.json();return{text:d.choices?.[0]?.message?.content?.trim()||'',cost:estimateCost(model,d.usage)};}if(provider==='anthropic'){const body={model,max_tokens:1000,messages:[{role:'user',content:prompt}]};if(systemPrompt)body.system=systemPrompt;const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(body)});if(!res.ok){const e=await res.json();throw new Error(e.error?.message||res.statusText);}const d=await res.json();return{text:d.content?.[0]?.text?.trim()||'',cost:estimateCost(model,d.usage)};}if(provider==='perplexity'){const msgs=systemPrompt?[{role:'system',content:systemPrompt},{role:'user',content:prompt}]:[{role:'user',content:prompt}];const res=await fetch('https://api.perplexity.ai/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body:JSON.stringify({model,messages:msgs,max_tokens:1000})});if(!res.ok){const e=await res.json();throw new Error(e.error?.message||res.statusText);}const d=await res.json();return{text:d.choices?.[0]?.message?.content?.trim()||'',cost:estimateCost(model,d.usage)};}throw new Error('Unknown provider: '+provider);}
function fillTemplate(template,row){if(!template)return'';let out=template.replace(/\{\{row\}\}/g,JSON.stringify(row));for(const[k,v]of Object.entries(row)){out=out.replace(new RegExp('\\{\\{'+k+'\\}\\}','g'),v??'');}return out;}
function detectColumnType(values){const nonEmpty=values.filter(Boolean);if(!nonEmpty.length)return'text';if(nonEmpty.every(v=>/^https?:\/\//i.test(String(v))))return'url';if(nonEmpty.every(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))))return'email';if(nonEmpty.every(v=>!isNaN(Number(v))))return'number';return'text';}
function sortColumns(cols){return[...cols].sort((a,b)=>{const ai=CORE_FIELDS.indexOf(a),bi=CORE_FIELDS.indexOf(b),ae=ENRICHMENT_FIELDS.indexOf(a),be=ENRICHMENT_FIELDS.indexOf(b);if(ai!==-1&&bi!==-1)return ai-bi;if(ai!==-1)return-1;if(bi!==-1)return 1;if(ae!==-1&&be!==-1)return ae-be;if(ae!==-1)return-1;if(be!==-1)return 1;return a.localeCompare(b);});}
function parseCSV(text){const lines=text.trim().split(/\r?\n/);if(!lines.length)return{headers:[],rows:[]};const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/\s+/g,'_'));const rows=lines.slice(1).map(line=>{const vals=[];let cur='',inQ=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=ch;}vals.push(cur.trim());return headers.reduce((obj,h,i)=>{obj[h]=vals[i]??'';return obj;},{});});return{headers,rows};}
function rowsToCSV(rows,cols){const header=cols.join(',');const body=rows.map(r=>cols.map(c=>{const v=r.data?.[c]??'';const s=String(v);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;}).join(','));return[header,...body].join('\n');}
function evaluateCondition(value,operator,threshold){const v=isNaN(Number(value))?String(value).toLowerCase():Number(value);const t=isNaN(Number(threshold))?String(threshold).toLowerCase():Number(threshold);switch(operator){case'==':return v==t;case'!=':return v!=t;case'>':return v>t;case'>=':return v>=t;case'<':return v<t;case'<=':return v<=t;case'contains':return String(value).toLowerCase().includes(String(threshold).toLowerCase());case'not_contains':return!String(value).toLowerCase().includes(String(threshold).toLowerCase());default:return false;}}
function Spinner({size=16}){return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{display:'inline-block',animation:'spin 0.8s linear infinite'}}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>);}
function Badge({children,color='#6366f1'}){return(<span style={{background:color+'22',color,border:'1px solid '+color+'44',borderRadius:4,padding:'1px 7px',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{children}</span>);}
function Modal({title,onClose,children,width=560}){useEffect(()=>{const fn=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[onClose]);return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:'#151515',border:'1px solid #2a2a2a',borderRadius:10,width,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.6)'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #222'}}><span style={{fontWeight:700,fontSize:15,color:'#f0f0f0'}}>{title}</span><button onClick={onClose} style={{background:'none',border:'none',color:'#666',cursor:'pointer',fontSize:18}}>✕</button></div><div style={{padding:20}}>{children}</div></div></div>);}
function Notification({msg,type='info',onDone}){useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);const colors={info:'#6366f1',success:'#22c55e',error:'#ef4444',warning:'#f59e0b'};return(<div style={{position:'fixed',bottom:24,right:24,zIndex:2000,background:'#1a1a1a',border:'1px solid '+colors[type]+'44',borderLeft:'3px solid '+colors[type],borderRadius:8,padding:'12px 18px',maxWidth:360,color:'#e0e0e0',fontSize:13}}>{msg}</div>);}

export default function Dashboard() {
  const { supabase, user, profile, loading, signOut, isAdmin, isPaid } = useAuth();
  const userId = user?.id || 'default';
  const [lists,setLists]=useState([]);
  const [activeListId,setActiveListId]=useState(null);
  const [rows,setRows]=useState([]);
  const [columns,setColumns]=useState([]);
  const [colOrder,setColOrder]=useState([]);
  const [colTypes,setColTypes]=useState({});
  const [page,setPage]=useState(0);
  const [totalRows,setTotalRows]=useState(0);
  const [selectedRows,setSelectedRows]=useState(new Set());
  const [sortConfig,setSortConfig]=useState({key:null,dir:'asc'});
  const [filters,setFilters]=useState({});
  const [searchQuery,setSearchQuery]=useState('');
  const [editingCell,setEditingCell]=useState(null);
  const [editValue,setEditValue]=useState('');
  const [contextMenu,setContextMenu]=useState(null);
  const [workflows,setWorkflows]=useState([]);
  const [activeWorkflowId,setActiveWorkflowId]=useState(null);
  const [editingWorkflow,setEditingWorkflow]=useState(null);
  const [apiKeys,setApiKeys]=useState({});
  const [runMode,setRunMode]=useState('1');
  const [isRunning,setIsRunning]=useState(false);
  const [runningStepId,setRunningStepId]=useState(null);
  const [stepProgress,setStepProgress]=useState({});
  const [waterfallReport,setWaterfallReport]=useState(null);
  const [notification,setNotification]=useState(null);
  const [activeTab,setActiveTab]=useState('data');
  const [listsLoading,setListsLoading]=useState(false);
  const [tableLoading,setTableLoading]=useState(false);
  const [uploadLoading,setUploadLoading]=useState(false);
  const [showNewList,setShowNewList]=useState(false);
  const [newListName,setNewListName]=useState('');
  const [showApiKeys,setShowApiKeys]=useState(false);
  const [showPromptLibrary,setShowPromptLibrary]=useState(false);
  const [showTemplates,setShowTemplates]=useState(false);
  const [showStepModal,setShowStepModal]=useState(false);
  const [editingStep,setEditingStep]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const fileInputRef=useRef(null);
  const mergeInputRef=useRef(null);
  const editInputRef=useRef(null);
  const contextMenuRef=useRef(null);

  const activeList=useMemo(()=>lists.find(l=>l.id===activeListId),[lists,activeListId]);
  const activeWorkflow=useMemo(()=>workflows.find(w=>w.id===activeWorkflowId),[workflows,activeWorkflowId]);
  const notify=useCallback((msg,type='info')=>setNotification({msg,type}),[]);

  const displayedRows=useMemo(()=>{
    let r=[...rows];
    if(searchQuery){const q=searchQuery.toLowerCase();r=r.filter(row=>Object.values(row.data||{}).some(v=>String(v).toLowerCase().includes(q)));}
    Object.entries(filters).forEach(([col,val])=>{if(val)r=r.filter(row=>String(row.data?.[col]??'').toLowerCase().includes(val.toLowerCase()));});
    if(sortConfig.key){r.sort((a,b)=>{const av=a.data?.[sortConfig.key]??'',bv=b.data?.[sortConfig.key]??'';const an=Number(av),bn=Number(bv);const cmp=(!isNaN(an)&&!isNaN(bn))?an-bn:String(av).localeCompare(String(bv));return sortConfig.dir==='asc'?cmp:-cmp;});}
    return r;
  },[rows,searchQuery,filters,sortConfig]);

  const runCount=useMemo(()=>{if(runMode==='all')return displayedRows.length;return Math.min(Number(runMode),displayedRows.length);},[runMode,displayedRows.length]);

  const loadLists=useCallback(async()=>{if(!supabase||!user)return;setListsLoading(true);try{const{data,error}=await supabase.from('lists').select('id,name,created_at,row_count').eq('user_id',userId).order('created_at',{ascending:false});if(error)throw error;setLists(data||[]);}catch(err){notify('Failed to load lists','error');}finally{setListsLoading(false);}
  },[supabase,user,userId,notify]);

  const loadRows=useCallback(async(listId,pg=0)=>{if(!supabase||!listId)return;setTableLoading(true);try{const from=pg*PAGE_SIZE,to=from+PAGE_SIZE-1;const{data,error,count}=await supabase.from('list_rows').select('id,data,created_at',{count:'exact'}).eq('list_id',listId).order('created_at',{ascending:true}).range(from,to);if(error)throw error;setRows(data||[]);if(count!==null)setTotalRows(count);const allKeys=new Set();(data||[]).forEach(row=>Object.keys(row.data||{}).forEach(k=>allKeys.add(k)));const cols=sortColumns([...allKeys]);setColumns(cols);setColOrder(cols);const types={};cols.forEach(col=>{const vals=(data||[]).map(r=>r.data?.[col]);types[col]=detectColumnType(vals);});setColTypes(types);}catch(err){notify('Failed to load rows','error');}finally{setTableLoading(false);}
  },[supabase,notify]);

  const loadWorkflows=useCallback(async()=>{if(!supabase||!user)return;try{const{data,error}=await supabase.from('workflows').select('id,name,steps,created_at').eq('user_id',userId).order('created_at',{ascending:false});if(error)throw error;setWorkflows(data||[]);}catch(err){console.error(err);}
  },[supabase,user,userId]);

  const loadApiKeys=useCallback(async()=>{if(!supabase||!user)return;try{const{data,error}=await supabase.from('api_keys').select('provider,key_value').eq('user_id',userId);if(error)throw error;const kmap={};(data||[]).forEach(r=>{kmap[r.provider]=r.key_value;});setApiKeys(kmap);}catch(err){console.error(err);}
  },[supabase,user,userId]);

  useEffect(()=>{if(user&&supabase){loadLists();loadWorkflows();loadApiKeys();}},[user,supabase,loadLists,loadWorkflows,loadApiKeys]);
  useEffect(()=>{if(activeListId){setPage(0);setRows([]);setSelectedRows(new Set());loadRows(activeListId,0);}},[activeListId,loadRows]);
  useEffect(()=>{const fn=e=>{if(contextMenu&&contextMenuRef.current&&!contextMenuRef.current.contains(e.target))setContextMenu(null);};document.addEventListener('mousedown',fn);return()=>document.removeEventListener('mousedown',fn);},[contextMenu]);
  useEffect(()=>{if(editingCell&&editInputRef.current){editInputRef.current.focus();editInputRef.current.select();}},[editingCell]);

  const createList=useCallback(async(name)=>{if(!supabase||!name.trim())return;try{const{data,error}=await supabase.from('lists').insert({name:name.trim(),user_id:userId}).select().single();if(error)throw error;setLists(prev=>[data,...prev]);setActiveListId(data.id);setShowNewList(false);setNewListName('');notify('List created','success');}catch(err){notify('Create list failed: '+err.message,'error');}
  },[supabase,userId,notify]);

  const deleteList=useCallback(async(listId)=>{if(!supabase||!window.confirm('Delete this list?'))return;try{await supabase.from('list_rows').delete().eq('list_id',listId);await supabase.from('lists').delete().eq('id',listId);setLists(prev=>prev.filter(l=>l.id!==listId));if(activeListId===listId){setActiveListId(null);setRows([]);setColumns([]);}notify('List deleted','success');}catch(err){notify('Delete failed','error');}
  },[supabase,activeListId,notify]);

  const handleCSVUpload=useCallback(async(file,isMerge=false)=>{if(!file||!supabase)return;setUploadLoading(true);try{const text=await file.text();const{headers,rows:csvRows}=parseCSV(text);if(!csvRows.length){notify('CSV is empty','warning');return;}let listId=activeListId;if(!listId){const{data:newList,error:le}=await supabase.from('lists').insert({name:file.name.replace('.csv',''),user_id:userId}).select().single();if(le)throw le;listId=newList.id;setLists(prev=>[newList,...prev]);setActiveListId(listId);}const BATCH=500;let inserted=0;for(let i=0;i<csvRows.length;i+=BATCH){const batch=csvRows.slice(i,i+BATCH).map(r=>({list_id:listId,data:r}));const{error}=await supabase.from('list_rows').insert(batch);if(error)throw error;inserted+=batch.length;}await supabase.from('lists').update({row_count:inserted}).eq('id',listId);await loadRows(listId,0);await loadLists();notify('Imported '+inserted+' rows','success');}catch(err){notify('Import failed: '+err.message,'error');}finally{setUploadLoading(false);}
  },[supabase,activeListId,userId,loadRows,loadLists,notify]);

  const handleExport=useCallback(()=>{if(!rows.length)return;const csv=rowsToCSV(displayedRows,colOrder);const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(activeList?.name||'export')+'.csv';a.click();URL.revokeObjectURL(url);},[rows,displayedRows,colOrder,activeList]);

  const commitEdit=useCallback(async()=>{if(!editingCell||!supabase){setEditingCell(null);return;}const{rowId,col}=editingCell;const row=rows.find(r=>r.id===rowId);if(!row){setEditingCell(null);return;}const newData={...row.data,[col]:editValue};try{const{error}=await supabase.from('list_rows').update({data:newData}).eq('id',rowId);if(error)throw error;setRows(prev=>prev.map(r=>r.id===rowId?{...r,data:newData}:r));}catch(err){notify('Save failed','error');}finally{setEditingCell(null);}
  },[editingCell,editValue,rows,supabase,notify]);

  const saveApiKey=useCallback(async(provider,keyValue)=>{if(!supabase||!keyValue.trim())return;try{await supabase.from('api_keys').upsert({user_id:userId,provider,key_value:keyValue.trim()},{onConflict:'user_id,provider'});setApiKeys(prev=>({...prev,[provider]:keyValue.trim()}));notify(provider+' key saved','success');}catch(err){notify('Save key failed','error');}
  },[supabase,userId,notify]);

  const saveWorkflow=useCallback(async(wf)=>{if(!supabase)return;try{if(wf.id&&workflows.find(w=>w.id===wf.id)){const{data,error}=await supabase.from('workflows').update({name:wf.name,steps:wf.steps}).eq('id',wf.id).select().single();if(error)throw error;setWorkflows(prev=>prev.map(w=>w.id===wf.id?data:w));}else{const{data,error}=await supabase.from('workflows').insert({name:wf.name,steps:wf.steps,user_id:userId}).select().single();if(error)throw error;setWorkflows(prev=>[data,...prev]);setActiveWorkflowId(data.id);}setEditingWorkflow(null);notify('Workflow saved','success');}catch(err){notify('Save failed','error');}
  },[supabase,userId,workflows,notify]);

  const runStep=useCallback(async(step,targetRows)=>{if(!step)return;setRunningStepId(step.id);setStepProgress(prev=>({...prev,[step.id]:{done:0,total:targetRows.length,cost:0}}));let totalCost=0;const waterfallData=[];for(let i=0;i<targetRows.length;i++){const row=targetRows[i];let result='',cost=0;try{if(['ai_enrich','web_research'].includes(step.type)){const provider=step.config?.provider||'openai';const model=step.config?.model||'gpt-4o-mini';const apiKey=apiKeys[provider];const prompt=fillTemplate(step.config?.promptTemplate||'Enrich: {{row}}',row.data);const res=await callAIDirect(provider,apiKey,model,prompt,step.config?.systemPrompt||'');result=res.text;cost=res.cost;totalCost+=cost;waterfallData.push({row:i+1,provider,model,result:result.slice(0,80),cost,status:'ok'});}else if(step.type==='formula'){try{const fn=new Function(...Object.keys(row.data||{}),`return (${step.config?.formula||''})`);result=String(fn(...Object.values(row.data||{})));}catch{result='#ERROR';}}else if(step.type==='condition_gate'){const val=row.data?.[step.config?.field||''];result=evaluateCondition(val,step.config?.operator||'==',step.config?.value||'')?'PASS':'FAIL';}else if(step.type==='api_verify'){result=row.data?.email?'verified':'no_email';}else if(step.type==='api_find_email'){result=row.data?.email||'found:'+( row.data?.first_name||'')+'@'+(row.data?.domain||'unknown.com');}else if(step.type==='scrape'){result='scraped:'+(row.data?.website||'');}else if(step.type==='api_push'){result='pushed:'+new Date().toISOString();}else if(step.type==='waterfall'){const providers=step.config?.providers||['openai','anthropic'];for(const p of providers){try{const model=AI_MODELS[p]?.[1];const prompt=fillTemplate(step.config?.promptTemplate||'Enrich: {{row}}',row.data);const res=await callAIDirect(p,apiKeys[p],model,prompt);result=res.text;cost=res.cost;totalCost+=cost;waterfallData.push({row:i+1,provider:p,model,result:result.slice(0,80),cost,status:'ok'});break;}catch{waterfallData.push({row:i+1,provider:p,model:'',result:'failed',cost:0,status:'error'});}}}}catch(e){result='ERROR: '+e.message;}
    const outputField=step.config?.outputField||(step.type==='ai_enrich'?'ai_summary':step.type==='web_research'?'web_research':step.type==='condition_gate'?'condition_result':step.type==='api_verify'?'verified_email':step.type==='api_find_email'?'found_email':step.type==='scrape'?'scraped_data':step.type==='api_push'?'push_result':'waterfall_result');
    const newData={...row.data,[outputField]:result};try{await supabase.from('list_rows').update({data:newData}).eq('id',row.id);setRows(prev=>prev.map(r=>r.id===row.id?{...r,data:newData}:r));}catch{}
    setStepProgress(prev=>({...prev,[step.id]:{done:i+1,total:targetRows.length,cost:totalCost}}));}
  if(waterfallData.length)setWaterfallReport({step,data:waterfallData,totalCost});setRunningStepId(null);},[apiKeys,supabase]);

  const getRowsToProcess=useCallback(()=>{if(runMode==='all')return displayedRows;return displayedRows.slice(0,Number(runMode));},[runMode,displayedRows]);

  const runWorkflowStep=useCallback(async(step)=>{if(isRunning)return;setIsRunning(true);try{await runStep(step,getRowsToProcess());}finally{setIsRunning(false);}},[isRunning,runStep,getRowsToProcess]);

  const runFullWorkflow=useCallback(async()=>{if(!activeWorkflow||isRunning)return;setIsRunning(true);const target=getRowsToProcess();try{for(const step of activeWorkflow.steps){await runStep(step,target);}notify('Workflow complete!','success');}catch(err){notify('Error: '+err.message,'error');}finally{setIsRunning(false);}},[activeWorkflow,isRunning,getRowsToProcess,runStep,notify]);

  const totalPages=Math.ceil(totalRows/PAGE_SIZE);
  const btn=(extra={})=>({background:'#1e1e1e',border:'1px solid #2a2a2a',borderRadius:6,color:'#ccc',cursor:'pointer',fontSize:12,fontWeight:500,padding:'6px 12px',fontFamily:'inherit',...extra});
  const primaryBtn=(extra={})=>({...btn(),background:'#6366f1',border:'1px solid #818cf8',color:'#fff',fontWeight:600,...extra});
  const inp=(extra={})=>({background:'#111',border:'1px solid #2a2a2a',borderRadius:6,color:'#e0e0e0',fontSize:12,padding:'6px 10px',fontFamily:'inherit',outline:'none',width:'100%',...extra});

  if(loading)return(<div style={{minHeight:'100vh',background:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',color:'#666',fontFamily:'monospace'}}><Spinner size={32}/></div>);
  if(!user)return(<div style={{minHeight:'100vh',background:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace'}}><div style={{textAlign:'center'}}><div style={{fontSize:32,marginBottom:16}}>🔒</div><p style={{color:'#aaa',marginBottom:20}}>Sign in to continue</p><a href="/auth/login" style={{padding:'10px 24px',background:'#6366f1',color:'#fff',borderRadius:6,textDecoration:'none',fontWeight:600}}>Sign In</a></div></div>);

  return(
    <div style={{minHeight:'100vh',background:'#0a0a0a',color:'#e0e0e0',fontFamily:"'JetBrains Mono','Fira Mono',monospace",fontSize:13,display:'flex',flexDirection:'column'}}>
      <header style={{height:52,background:'#101010',borderBottom:'1px solid #1e1e1e',display:'flex',alignItems:'center',padding:'0 16px',gap:12,position:'sticky',top:0,zIndex:100,flexShrink:0}}>
        <span style={{fontWeight:800,fontSize:15,color:'#fff',letterSpacing:'-0.5px',marginRight:8}}>⚡ Jaklay</span>
        <div style={{display:'flex',gap:2,background:'#161616',borderRadius:6,padding:2}}>
          {[['data','📊 Data'],['workflow','⚙️ Workflow'],['reports','📈 Reports']].map(([id,label])=>(<button key={id} onClick={()=>setActiveTab(id)} style={{...btn(),border:'none',background:activeTab===id?'#252525':'transparent',color:activeTab===id?'#fff':'#666',padding:'4px 12px'}}>{label}</button>))}
        </div>
        <div style={{flex:1}}/>
        <Badge color={isAdmin?'#f59e0b':isPaid?'#22c55e':'#6b7280'}>{isAdmin?'👑 Admin':isPaid?'⭐ Pro':'Free'}</Badge>
        <span style={{color:'#555',fontSize:11}}>{profile?.email||user.email}</span>
        <button onClick={()=>setShowApiKeys(true)} style={btn({padding:'5px 10px'})}>🔑 Keys</button>
        <button onClick={()=>setShowPromptLibrary(true)} style={btn({padding:'5px 10px'})}>📚 Prompts</button>
        <button onClick={signOut} style={btn({color:'#ef4444',borderColor:'#ef444433',padding:'5px 10px'})}>Sign Out</button>
      </header>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <aside style={{width:sidebarOpen?220:0,flexShrink:0,overflow:'hidden',background:'#0e0e0e',borderRight:'1px solid #1a1a1a',display:'flex',flexDirection:'column',transition:'width 0.2s'}}>
          <div style={{padding:12,borderBottom:'1px solid #1a1a1a',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:1}}>Lists</span>
            <button onClick={()=>setShowNewList(true)} style={btn({padding:'3px 8px',fontSize:11})}>+ New</button>
          </div>
          {listsLoading&&<div style={{padding:12,color:'#555',fontSize:11}}><Spinner size={12}/> Loading...</div>}
          <div style={{flex:1,overflowY:'auto',padding:'4px 0'}}>
            {lists.map(list=>(<div key={list.id} onClick={()=>setActiveListId(list.id)} style={{padding:'8px 12px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',background:activeListId===list.id?'#1a1a2e':'transparent',borderLeft:activeListId===list.id?'2px solid #6366f1':'2px solid transparent'}}>
              <div><div style={{fontSize:12,color:activeListId===list.id?'#a5b4fc':'#ccc',fontWeight:activeListId===list.id?600:400}}>{list.name}</div><div style={{fontSize:10,color:'#444'}}>{list.row_count??'?'} rows</div></div>
              <button onClick={e=>{e.stopPropagation();deleteList(list.id);}} style={{background:'none',border:'none',color:'#333',cursor:'pointer',fontSize:12}}>✕</button>
            </div>))}
            {!listsLoading&&!lists.length&&<div style={{padding:16,color:'#444',fontSize:11,textAlign:'center'}}>No lists yet.<br/>Upload a CSV to start.</div>}
          </div>
          <div style={{padding:10,borderTop:'1px solid #1a1a1a',display:'flex',flexDirection:'column',gap:6}}>
            <input ref={fileInputRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])handleCSVUpload(e.target.files[0]);e.target.value='';}}/>
            <input ref={mergeInputRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{if(e.target.files[0])handleCSVUpload(e.target.files[0],true);e.target.value='';}}/>
            <button onClick={()=>fileInputRef.current?.click()} style={primaryBtn({width:'100%',textAlign:'center'})} disabled={uploadLoading}>{uploadLoading?'Importing...':'📥 Import CSV'}</button>
            {activeListId&&<button onClick={()=>mergeInputRef.current?.click()} style={btn({width:'100%',textAlign:'center',fontSize:11})}>🔀 Merge CSV</button>}
            {rows.length>0&&<button onClick={handleExport} style={btn({width:'100%',textAlign:'center',fontSize:11})}>📤 Export CSV</button>}
          </div>
        </aside>
        <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{height:44,background:'#0e0e0e',borderBottom:'1px solid #1a1a1a',display:'flex',alignItems:'center',padding:'0 12px',gap:8,flexShrink:0}}>
            <button onClick={()=>setSidebarOpen(p=>!p)} style={btn({padding:'4px 8px',fontSize:14})}>{sidebarOpen?'◀':'▶'}</button>
            {activeTab==='data'&&<>
              <input placeholder="Search..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{...inp(),width:180}}/>
              <button onClick={()=>{const n=prompt('Column name:');if(n){const key=n.trim().toLowerCase().replace(/\s+/g,'_');if(!columns.includes(key)){setColumns(p=>[...p,key]);setColOrder(p=>[...p,key]);setRows(p=>p.map(r=>({...r,data:{...r.data,[key]:''}})));notify('Column added','success');}}}} style={btn({padding:'4px 10px',fontSize:11})}>+ Column</button>
              {selectedRows.size>0&&<><span style={{color:'#555',fontSize:11}}>{selectedRows.size} selected</span><button onClick={async()=>{if(!window.confirm('Delete?'))return;const ids=[...selectedRows];await supabase.from('list_rows').delete().in('id',ids);setRows(p=>p.filter(r=>!selectedRows.has(r.id)));setSelectedRows(new Set());notify('Deleted','success');}} style={btn({color:'#ef4444',padding:'4px 10px',fontSize:11})}>🗑 Delete</button></>}
              <div style={{flex:1}}/>
              {totalRows>0&&<span style={{color:'#444',fontSize:11}}>{displayedRows.length}/{totalRows} rows{totalPages>1&&' · pg '+(page+1)+'/'+totalPages}</span>}
              {page>0&&<button onClick={()=>{setPage(p=>p-1);loadRows(activeListId,page-1);}} style={btn({padding:'4px 8px',fontSize:11})}>◀</button>}
              {page<totalPages-1&&<button onClick={()=>{setPage(p=>p+1);loadRows(activeListId,page+1);}} style={btn({padding:'4px 8px',fontSize:11})}>▶</button>}
            </>}
            {activeTab==='workflow'&&<>
              <select value={activeWorkflowId||''} onChange={e=>setActiveWorkflowId(e.target.value||null)} style={{...inp(),width:200}}>
                <option value="">— Select workflow —</option>
                {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button onClick={()=>setEditingWorkflow({id:null,name:'New Workflow',steps:[]})} style={btn({padding:'4px 10px',fontSize:11})}>+ New</button>
              {activeWorkflow&&<button onClick={()=>setEditingWorkflow({...activeWorkflow,steps:[...(activeWorkflow.steps||[])]})} style={btn({padding:'4px 10px',fontSize:11})}>✏️ Edit</button>}
              <div style={{flex:1}}/>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'#141414',border:'1px solid #222',borderRadius:6,padding:'4px 8px'}}>
                <span style={{fontSize:10,color:'#555'}}>TEST:</span>
                {[['1','1'],['5','5'],['10','10'],['all','All']].map(([v,l])=>(<button key={v} onClick={()=>setRunMode(v)} style={btn({padding:'2px 8px',fontSize:10,background:runMode===v?'#6366f1':'#111',color:runMode===v?'#fff':'#666',border:runMode===v?'1px solid #818cf8':'1px solid #1a1a1a'})}>{l}</button>))}
                <span style={{fontSize:10,color:'#444'}}>= {runCount} rows</span>
              </div>
              {activeWorkflow&&<button onClick={runFullWorkflow} disabled={isRunning||!rows.length} style={primaryBtn({padding:'5px 14px',opacity:isRunning||!rows.length?0.5:1})}>{isRunning?'Running...':'▶ Run All'}</button>}
            </>}
          </div>

          {activeTab==='data'&&(
            <div style={{flex:1,overflow:'auto'}}>
              {!activeListId&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:16,color:'#333'}}><div style={{fontSize:48}}>📊</div><p>Select a list or import a CSV</p><button onClick={()=>fileInputRef.current?.click()} style={primaryBtn({padding:'10px 24px',fontSize:13})}>📥 Import CSV</button></div>}
              {activeListId&&tableLoading&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'#555',gap:10}}><Spinner size={20}/> Loading...</div>}
              {activeListId&&!tableLoading&&rows.length===0&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'#444',flexDirection:'column',gap:12}}><p>No rows.</p><button onClick={()=>fileInputRef.current?.click()} style={primaryBtn()}>Import CSV</button></div>}
              {activeListId&&!tableLoading&&rows.length>0&&(
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{background:'#111',position:'sticky',top:0,zIndex:10}}>
                    <th style={{width:36,padding:'8px',borderBottom:'1px solid #1e1e1e',textAlign:'center'}}><input type="checkbox" checked={selectedRows.size===displayedRows.length&&displayedRows.length>0} onChange={()=>{if(selectedRows.size===displayedRows.length)setSelectedRows(new Set());else setSelectedRows(new Set(displayedRows.map(r=>r.id)));}} style={{cursor:'pointer'}}/></th>
                    <th style={{width:40,padding:'8px',borderBottom:'1px solid #1e1e1e',color:'#333',fontWeight:400,fontSize:10}}>#</th>
                    {colOrder.map(col=>(<th key={col} onContextMenu={e=>{e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY,col,isHeader:true});}} onClick={()=>setSortConfig(prev=>({key:col,dir:prev.key===col&&prev.dir==='asc'?'desc':'asc'}))} style={{padding:'8px 10px',borderBottom:'1px solid #1e1e1e',color:ENRICHMENT_FIELDS.includes(col)?'#a78bfa':CORE_FIELDS.includes(col)?'#60a5fa':'#888',fontWeight:600,textAlign:'left',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',minWidth:100}}>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>{col}{sortConfig.key===col&&<span style={{fontSize:9,color:'#6366f1'}}>{sortConfig.dir==='asc'?'▲':'▼'}</span>}</div>
                      <input placeholder="filter..." value={filters[col]||''} onChange={e=>{e.stopPropagation();setFilters(p=>({...p,[col]:e.target.value}));}} onClick={e=>e.stopPropagation()} style={{...inp(),width:'100%',marginTop:4,fontSize:10,padding:'2px 6px',background:'#0a0a0a'}}/>
                    </th>))}
                  </tr></thead>
                  <tbody>{displayedRows.map((row,ri)=>(<tr key={row.id} style={{background:selectedRows.has(row.id)?'#13132a':ri%2===0?'#0d0d0d':'#0a0a0a'}}>
                    <td style={{padding:'4px 8px',borderBottom:'1px solid #141414',textAlign:'center'}}><input type="checkbox" checked={selectedRows.has(row.id)} onChange={()=>{setSelectedRows(prev=>{const s=new Set(prev);s.has(row.id)?s.delete(row.id):s.add(row.id);return s;});}} style={{cursor:'pointer'}}/></td>
                    <td style={{padding:'4px 8px',borderBottom:'1px solid #141414',color:'#333',fontSize:10,textAlign:'right'}}>{page*PAGE_SIZE+ri+1}</td>
                    {colOrder.map(col=>{const val=row.data?.[col]??'';const isEditing=editingCell?.rowId===row.id&&editingCell?.col===col;return(<td key={col} onDoubleClick={()=>{setEditingCell({rowId:row.id,col});setEditValue(val);}} onContextMenu={e=>{e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY,rowId:row.id,col,val});}} style={{padding:'4px 10px',borderBottom:'1px solid #141414',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'text',color:val?'#d0d0d0':'#2a2a2a'}}>
                      {isEditing?(<input ref={editInputRef} value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditingCell(null);}} style={{...inp(),padding:'2px 4px',width:'100%',minWidth:80}}/>):(<span title={String(val)}>{colTypes[col]==='url'&&val?<a href={String(val)} target="_blank" rel="noreferrer" style={{color:'#60a5fa',textDecoration:'none'}}>{String(val).slice(0,30)}</a>:String(val).slice(0,60)}{String(val).length>60&&'…'}</span>)}
                    </td>);})}
                  </tr>))}</tbody>
                </table>
              )}
            </div>
          )}

          {activeTab==='workflow'&&(
            <div style={{flex:1,overflow:'auto',padding:20}}>
              {!activeWorkflow&&!editingWorkflow&&<div style={{textAlign:'center',color:'#333',marginTop:60}}><div style={{fontSize:40,marginBottom:16}}>⚙️</div><p style={{marginBottom:16}}>No workflow selected</p><button onClick={()=>setEditingWorkflow({id:null,name:'New Workflow',steps:[]})} style={primaryBtn({padding:'10px 20px'})}>+ New Workflow</button></div>}
              {(editingWorkflow||activeWorkflow)&&(()=>{const wf=editingWorkflow||activeWorkflow;const isEditing=!!editingWorkflow;return(<div style={{maxWidth:700}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                  {isEditing?<input value={wf.name} onChange={e=>setEditingWorkflow(prev=>({...prev,name:e.target.value}))} style={{...inp(),fontSize:18,fontWeight:700,flex:1}}/>:<h2 style={{margin:0,fontWeight:700,fontSize:18,color:'#fff'}}>{wf.name}</h2>}
                  {isEditing&&<><button onClick={()=>saveWorkflow(wf)} style={primaryBtn()}>💾 Save</button><button onClick={()=>setEditingWorkflow(null)} style={btn()}>Cancel</button></>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {(wf.steps||[]).map((step,si)=>{const prog=stepProgress[step.id];const def=STEP_TYPES.find(s=>s.id===step.type)||STEP_TYPES[0];return(<div key={step.id} style={{background:'#111',border:runningStepId===step.id?'1px solid #6366f1':'1px solid #1e1e1e',borderRadius:8,padding:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{background:def.color+'18',color:def.color,border:'1px solid '+def.color+'33',borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:600}}>{def.icon} {def.label}</span>
                      <span style={{color:'#aaa',fontWeight:600,fontSize:13}}>{step.label}</span>
                      <div style={{flex:1}}/>
                      {!isEditing&&<button onClick={()=>runWorkflowStep(step)} disabled={isRunning||!rows.length} style={btn({padding:'3px 10px',fontSize:11,opacity:isRunning||!rows.length?0.4:1})}>{runningStepId===step.id?'Running...':'▶ Run ('+runCount+')'}</button>}
                      {isEditing&&<><button onClick={()=>{setEditingStep({...step,_idx:si});setShowStepModal(true);}} style={btn({padding:'3px 8px',fontSize:11})}>✏️</button><button onClick={()=>setEditingWorkflow(prev=>({...prev,steps:prev.steps.filter((_,i)=>i!==si)}))} style={btn({padding:'3px 8px',fontSize:11,color:'#ef4444'})}>✕</button></>}
                    </div>
                    <div style={{fontSize:11,color:'#444',display:'flex',flexWrap:'wrap',gap:8}}>
                      {step.config?.provider&&<span>provider: <span style={{color:'#7c6af7'}}>{step.config.provider}</span></span>}
                      {step.config?.model&&<span>model: <span style={{color:'#7c6af7'}}>{step.config.model}</span></span>}
                      {step.config?.outputField&&<span>→ <span style={{color:'#22c55e'}}>{step.config.outputField}</span></span>}
                    </div>
                    {prog&&<div style={{marginTop:8}}><div style={{background:'#1a1a1a',borderRadius:3,height:4}}><div style={{background:'#6366f1',height:'100%',width:(prog.done/prog.total*100)+'%',transition:'width 0.3s'}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:3,fontSize:10,color:'#444'}}><span>{prog.done}/{prog.total}</span>{prog.cost>0&&<span style={{color:'#22c55e'}}>${prog.cost.toFixed(5)}</span>}</div></div>}
                  </div>);})}
                </div>
                {isEditing&&<div style={{marginTop:16,display:'flex',gap:8,flexWrap:'wrap'}}>
                  {STEP_TYPES.map(st=>(<button key={st.id} onClick={()=>{const s={id:String(Date.now()),type:st.id,label:st.label,config:{provider:'openai',model:'gpt-4o-mini',promptTemplate:'Enrich: {{row}}',outputField:st.id==='ai_enrich'?'ai_summary':st.id==='web_research'?'web_research':'result'}};setEditingStep({...s,_idx:-1,_isNew:true});setShowStepModal(true);}} style={btn({fontSize:11})}>{st.icon} {st.label}</button>))}
                </div>}
              </div>);})()} 
            </div>
          )}

          {activeTab==='reports'&&(
            <div style={{flex:1,overflow:'auto',padding:20}}>
              <h2 style={{fontWeight:700,fontSize:16,marginBottom:16,color:'#fff'}}>📈 Reports</h2>
              {!waterfallReport&&<div style={{color:'#333',textAlign:'center',marginTop:60}}><div style={{fontSize:40,marginBottom:12}}>💧</div><p>Run a workflow step to generate a report</p></div>}
              {waterfallReport&&<div>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}><h3 style={{margin:0,fontSize:14,color:'#ccc'}}>{waterfallReport.step.label}</h3><Badge color="#22c55e">Total: ${waterfallReport.totalCost.toFixed(5)}</Badge></div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{background:'#111'}}>{['Row','Provider','Model','Result','Cost','Status'].map(h=><th key={h} style={{padding:'8px 12px',borderBottom:'1px solid #1e1e1e',textAlign:'left',color:'#555',fontWeight:600,fontSize:11}}>{h}</th>)}</tr></thead>
                  <tbody>{[...waterfallReport.data].sort((a,b)=>(b.cost||0)-(a.cost||0)).map((r,i)=>(<tr key={i} style={{background:i%2===0?'#0d0d0d':'#0a0a0a'}}>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414',color:'#555'}}>{r.row}</td>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414'}}><Badge color="#6366f1">{r.provider}</Badge></td>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414',color:'#666',fontSize:11}}>{r.model}</td>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414',color:'#aaa',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.result}</td>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414',color:'#22c55e',fontFamily:'monospace',fontSize:11}}>${(r.cost||0).toFixed(6)}</td>
                    <td style={{padding:'6px 12px',borderBottom:'1px solid #141414'}}><Badge color={r.status==='ok'?'#22c55e':'#ef4444'}>{r.status}</Badge></td>
                  </tr>))}</tbody>
                </table>
              </div>}
            </div>
          )}
        </main>
      </div>

      {contextMenu&&<div ref={contextMenuRef} style={{position:'fixed',left:contextMenu.x,top:contextMenu.y,zIndex:500,background:'#161616',border:'1px solid #2a2a2a',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,0.6)',minWidth:180,overflow:'hidden',fontSize:12}}>
        {contextMenu.isHeader?<>
          <div style={{padding:'6px 12px',color:'#555',fontSize:10,borderBottom:'1px solid #1a1a1a',fontWeight:700}}>COLUMN: {contextMenu.col}</div>
          {[['Sort A→Z',()=>{setSortConfig({key:contextMenu.col,dir:'asc'});setContextMenu(null);}],['Sort Z→A',()=>{setSortConfig({key:contextMenu.col,dir:'desc'});setContextMenu(null);}],['Delete Column',()=>{if(window.confirm('Delete column?')){setColumns(p=>p.filter(c=>c!==contextMenu.col));setColOrder(p=>p.filter(c=>c!==contextMenu.col));setRows(p=>p.map(r=>{const d={...r.data};delete d[contextMenu.col];return{...r,data:d};}));}setContextMenu(null);},'#ef4444']].map(([label,fn,color])=>(<button key={label} onClick={fn} style={{display:'block',width:'100%',padding:'8px 14px',background:'none',border:'none',color:color||'#ccc',cursor:'pointer',textAlign:'left',fontFamily:'inherit',fontSize:12}}>{label}</button>))}
        </>:<>
          <div style={{padding:'6px 12px',color:'#555',fontSize:10,borderBottom:'1px solid #1a1a1a'}}>{contextMenu.col}</div>
          {[['✏️ Edit',()=>{setEditingCell({rowId:contextMenu.rowId,col:contextMenu.col});setEditValue(contextMenu.val);setContextMenu(null);}],['📋 Copy',()=>{navigator.clipboard.writeText(String(contextMenu.val||''));setContextMenu(null);notify('Copied','success');}],['🗑 Delete Row',()=>{if(window.confirm('Delete row?')){supabase.from('list_rows').delete().eq('id',contextMenu.rowId).then(()=>setRows(p=>p.filter(r=>r.id!==contextMenu.rowId)));}setContextMenu(null);},'#ef4444']].map(([label,fn,color])=>(<button key={label} onClick={fn} style={{display:'block',width:'100%',padding:'8px 14px',background:'none',border:'none',color:color||'#ccc',cursor:'pointer',textAlign:'left',fontFamily:'inherit',fontSize:12}}>{label}</button>))}
        </>}
      </div>}

      {showApiKeys&&<Modal title="🔑 API Keys" onClose={()=>setShowApiKeys(false)} width={480}>
        {['openai','anthropic','perplexity'].map(provider=>(<div key={provider} style={{marginBottom:14}}>
          <label style={{fontSize:11,color:'#666',display:'block',marginBottom:4,textTransform:'capitalize'}}>{provider}</label>
          <div style={{display:'flex',gap:8}}><input type="password" placeholder={apiKeys[provider]?'••••••••':'Enter key...'} defaultValue={apiKeys[provider]||''} id={'key_'+provider} style={{...inp(),flex:1}}/><button onClick={()=>{const el=document.getElementById('key_'+provider);saveApiKey(provider,el.value);}} style={btn({padding:'6px 12px'})}>Save</button></div>
          {apiKeys[provider]&&<div style={{fontSize:10,color:'#22c55e',marginTop:3}}>✓ Configured</div>}
        </div>))}
      </Modal>}

      {showPromptLibrary&&<Modal title="📚 Prompt Library" onClose={()=>setShowPromptLibrary(false)} width={600}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {PROMPT_LIBRARY.map(p=>(<div key={p.id} style={{background:'#0d0d0d',border:'1px solid #1e1e1e',borderRadius:6,padding:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><span style={{fontWeight:600,color:'#ccc',fontSize:13}}>{p.label}</span><button onClick={()=>{navigator.clipboard.writeText(p.template);notify('Copied!','success');}} style={btn({padding:'3px 10px',fontSize:10})}>📋 Copy</button></div>
            <pre style={{margin:0,fontSize:10,color:'#555',fontFamily:'inherit',whiteSpace:'pre-wrap'}}>{p.template}</pre>
          </div>))}
        </div>
      </Modal>}

      {showNewList&&<Modal title="+ New List" onClose={()=>setShowNewList(false)} width={380}>
        <input autoFocus placeholder="List name..." value={newListName} onChange={e=>setNewListName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createList(newListName);if(e.key==='Escape')setShowNewList(false);}} style={{...inp(),marginBottom:12}}/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button onClick={()=>setShowNewList(false)} style={btn()}>Cancel</button><button onClick={()=>createList(newListName)} disabled={!newListName.trim()} style={primaryBtn({opacity:newListName.trim()?1:0.4})}>Create</button></div>
      </Modal>}

      {showStepModal&&editingStep&&<Modal title={(editingStep._isNew?'+ Add':'✏️ Edit')+' Step'} onClose={()=>{setShowStepModal(false);setEditingStep(null);}} width={520}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Type</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{STEP_TYPES.map(st=>(<button key={st.id} onClick={()=>setEditingStep(p=>({...p,type:st.id,label:st.label}))} style={btn({fontSize:11,background:editingStep.type===st.id?st.color+'22':'#111',borderColor:editingStep.type===st.id?st.color:'#1e1e1e',color:editingStep.type===st.id?st.color:'#666'})}>{st.icon} {st.label}</button>))}</div></div>
          <div><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Label</label><input value={editingStep.label||''} onChange={e=>setEditingStep(p=>({...p,label:e.target.value}))} style={inp()}/></div>
          {['ai_enrich','web_research','waterfall'].includes(editingStep.type)&&<>
            <div style={{display:'flex',gap:10}}>
              <div style={{flex:1}}><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Provider</label><select value={editingStep.config?.provider||'openai'} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,provider:e.target.value,model:AI_MODELS[e.target.value]?.[1]||''}}))} style={inp()}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="perplexity">Perplexity</option></select></div>
              <div style={{flex:1}}><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Model</label><select value={editingStep.config?.model||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,model:e.target.value}}))} style={inp()}>{(AI_MODELS[editingStep.config?.provider||'openai']||[]).map(m=><option key={m} value={m}>{m}</option>)}</select></div>
            </div>
            <div><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Prompt — use {'{{column}}'} or {'{{row}}'}</label><textarea rows={4} value={editingStep.config?.promptTemplate||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,promptTemplate:e.target.value}}))} style={{...inp(),resize:'vertical'}}/></div>
          </>}
          {editingStep.type==='condition_gate'&&<div style={{display:'flex',gap:8}}>
            <div style={{flex:2}}><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Field</label><select value={editingStep.config?.field||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,field:e.target.value}}))} style={inp()}><option value="">— pick column —</option>{columns.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div style={{flex:1}}><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Op</label><select value={editingStep.config?.operator||'=='} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,operator:e.target.value}}))} style={inp()}>{['==','!=','>','>=','<','<=','contains','not_contains'].map(o=><option key={o}>{o}</option>)}</select></div>
            <div style={{flex:1}}><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Value</label><input value={editingStep.config?.value||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,value:e.target.value}}))} style={inp()}/></div>
          </div>}
          {editingStep.type==='formula'&&<div><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Formula (JS)</label><input value={editingStep.config?.formula||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,formula:e.target.value}}))} placeholder="first_name + ' ' + last_name" style={{...inp(),fontFamily:'monospace'}}/></div>}
          <div><label style={{fontSize:11,color:'#666',display:'block',marginBottom:4}}>Output Column</label><input value={editingStep.config?.outputField||''} onChange={e=>setEditingStep(p=>({...p,config:{...p.config,outputField:e.target.value}}))} placeholder="ai_summary" style={inp()}/></div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}>
          <button onClick={()=>{setShowStepModal(false);setEditingStep(null);}} style={btn()}>Cancel</button>
          <button onClick={()=>{const step={...editingStep};const idx=step._idx;const isNew=step._isNew;delete step._idx;delete step._isNew;setEditingWorkflow(prev=>{const steps=[...(prev?.steps||[])];if(isNew)steps.push(step);else steps[idx]=step;return{...prev,steps};});setShowStepModal(false);setEditingStep(null);}} style={primaryBtn()}>{editingStep._isNew?'+ Add':'💾 Save'}</button>
        </div>
      </Modal>}

      {notification&&<Notification msg={notification.msg} type={notification.type} onDone={()=>setNotification(null)}/>}
      <style>{'@import url(\'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap\');*{box-sizing:border-box;}::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:#0a0a0a;}::-webkit-scrollbar-thumb{background:#222;border-radius:3px;}@keyframes spin{to{transform:rotate(360deg)}}input[type="checkbox"]{accent-color:#6366f1;}select option{background:#1a1a1a;color:#e0e0e0;}'}</style>
    </div>
  );
}
