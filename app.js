
(()=>{
 const root=document.getElementById('parking-design');
 let current='home';
 function show(screen){current=screen;root.querySelectorAll('[data-view]').forEach(v=>v.hidden=v.dataset.view!==screen);root.querySelectorAll('.preview-switch [data-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.screen===screen)));root.querySelectorAll('.bottom-nav [data-screen]').forEach(b=>b.classList.toggle('active',b.dataset.screen===(screen==='compare'?'home':screen)));root.querySelector('.profile-panel').hidden=true;}
 function save(){}
 root.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.screen);save();}));
 root.querySelector('.search').addEventListener('submit',e=>{e.preventDefault();const value=root.querySelector('input').value.trim();if(value)root.querySelector('.destination-name').textContent=value;show('compare');save();});
 root.querySelectorAll('.parking-option').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('.parking-option').forEach(x=>x.classList.toggle('selected',x===b));root.querySelector('.selected-name').textContent=b.dataset.name;const fee=Number(b.dataset.price)*4;root.querySelector('.fee-value').innerHTML=fee.toLocaleString('ko-KR')+'<span>원</span>';root.querySelector('#pay-demo').textContent=fee.toLocaleString('ko-KR')+'원 결제 체험하기';root.querySelector('.payment-body').hidden=false;root.querySelector('.success-body').hidden=true;}));
 root.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const cards=[...root.querySelectorAll('.parking-option')];cards.sort((a,c)=>Number(a.dataset[b.dataset.sort])-Number(c.dataset[b.dataset.sort]));cards.forEach(c=>root.querySelector('.parking-list').append(c));}));
 root.querySelector('#pay-demo').addEventListener('click',()=>{root.querySelector('.payment-body').hidden=true;root.querySelector('.success-body').hidden=false;const fee=root.querySelector('.fee-value').textContent;root.querySelector('.success-body .sample-note').textContent=fee+' 결제 체험 · 실제 청구 없음';save();});
 root.querySelector('#profile-button').addEventListener('click',()=>root.querySelector('.profile-panel').hidden=false);root.querySelector('#close-profile').addEventListener('click',()=>root.querySelector('.profile-panel').hidden=true);
 show(['home','compare','payment'].includes(current)?current:'home');
})();
