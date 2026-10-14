
(()=>{
 const root=document.getElementById('parking-design');
 let current='home';
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let searching=false;
 function motion(element,frames,options){
  if(reducedMotion.matches||!element||typeof element.animate!=='function')return Promise.resolve();
  return element.animate(frames,{easing:'cubic-bezier(.22,.8,.35,1)',...options}).finished.catch(()=>{});
 }
 async function search(){
  if(searching)return;
  searching=true;
  const submit=root.querySelector('.search button');submit.disabled=true;
  try{
   await motion(root.querySelector('.hero-character'),[
    {transform:'translateX(0) rotate(0)'},
    {transform:'translateX(9px) rotate(3deg)',offset:.25},
    {transform:'translateX(-65px) rotate(-3deg)',opacity:0}
   ],{duration:430});
   if(current==='home')show('compare');
  }finally{searching=false;submit.disabled=false;}
 }
 function show(screen){current=screen;root.querySelectorAll('[data-view]').forEach(v=>v.hidden=v.dataset.view!==screen);root.querySelectorAll('.preview-switch [data-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.screen===screen)));root.querySelectorAll('.bottom-nav [data-screen]').forEach(b=>b.classList.toggle('active',b.dataset.screen===(screen==='compare'?'home':screen)));root.querySelector('.profile-panel').hidden=true;}
 function save(){}
 root.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.screen==='compare'&&current==='home'){search();return;}
  show(b.dataset.screen);
  if(b.closest('.bottom-nav'))motion(b,[{transform:'scale(1)'},{transform:'scale(.9)',offset:.35},{transform:'scale(1)'}],{duration:230});
  save();
 }));
 root.querySelector('.search').addEventListener('submit',e=>{e.preventDefault();const value=root.querySelector('input').value.trim();if(value)root.querySelector('.destination-name').textContent=value;search();save();});
 root.querySelectorAll('.parking-option').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('.parking-option').forEach(x=>x.classList.toggle('selected',x===b));root.querySelector('.selected-name').textContent=b.dataset.name;const fee=Number(b.dataset.price)*4;root.querySelector('.fee-value').innerHTML=fee.toLocaleString('ko-KR')+'<span>원</span>';root.querySelector('#pay-demo').textContent=fee.toLocaleString('ko-KR')+'원 결제 체험하기';root.querySelector('.payment-body').hidden=false;root.querySelector('.success-body').hidden=true;}));
 root.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const cards=[...root.querySelectorAll('.parking-option')];cards.sort((a,c)=>Number(a.dataset[b.dataset.sort])-Number(c.dataset[b.dataset.sort]));cards.forEach(c=>root.querySelector('.parking-list').append(c));}));
 root.querySelector('#pay-demo').addEventListener('click',()=>{root.querySelector('.payment-body').hidden=true;root.querySelector('.success-body').hidden=false;const fee=root.querySelector('.fee-value').textContent;root.querySelector('.success-body .sample-note').textContent=fee+' 결제 체험 · 실제 청구 없음';motion(root.querySelector('.success-character'),[
  {transform:'translateX(0) rotate(0)',opacity:1},
  {transform:'translateX(12px) rotate(3deg)',opacity:1,offset:.18},
  {transform:'translateX(-160px) rotate(-4deg)',opacity:0,offset:.55},
  {transform:'translateX(80px) rotate(0)',opacity:0,offset:.56},
  {transform:'translateX(0) rotate(0)',opacity:1}
 ],{duration:1100});save();});
 root.querySelector('#profile-button').addEventListener('click',()=>root.querySelector('.profile-panel').hidden=false);root.querySelector('#close-profile').addEventListener('click',()=>root.querySelector('.profile-panel').hidden=true);
 show(['home','compare','payment'].includes(current)?current:'home');
})();
