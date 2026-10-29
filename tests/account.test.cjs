const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler,phoneNumber,validateProfile}=require('../lib/account.cjs');
const search=require('../assets/vehicle-search.js');
const catalog=require('../assets/vehicle-catalog.json');
const env={AUTH_READY:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public-key',HCAPTCHA_SITEKEY:'test-sitekey',APP_ORIGIN:'https://parkinguiux.vercel.app',VERCEL:'1'};
const uid='11111111-1111-4111-8111-111111111111';
const verifiedUser={id:uid,phone:'821012345678',phone_confirmed_at:'2026-10-29T00:00:00Z'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}}}
async function run(handler,body,headers={}){const res=response();await handler({method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json',...headers},body},res);return res;}
const profileInput={name:'테스트',email:'tester@example.com',birthYear:2000,plate:'32가 4321',vehicleId:catalog.vehicles[0].id};
test('한국 휴대폰 형식과 서버에서 차종/입력 검증',()=>{
 assert.equal(phoneNumber('010-1234-5678'),'+821012345678');
 assert.equal(phoneNumber('+821012345678'),'+821012345678');
 assert.throws(()=>phoneNumber('123456'));
 assert.equal(validateProfile(profileInput).plate,'32가4321');
 for(const fields of [{vehicleId:'forged'},{birthYear:9999},{email:'invalid'},{plate:'bad'}]) assert.throws(()=>validateProfile({...profileInput,...fields}));
});
test('설정 누락 시 문자 요청/가짜 로그인 없이 503',async()=>{
 let calls=0;const handler=createHandler({env:{},fetcher:()=>{calls++;throw Error()}});
 const res=await run(handler,{action:'request',phone:'01012345678',mode:'signup'},{origin:'http://localhost:4173'});
 assert.equal(res.statusCode,503);assert.equal(calls,0);assert.equal(res.headers['Set-Cookie'],undefined);
});
test('외부 사이트의 POST와 인증 없는 개인정보 저장 거부',async()=>{
 let calls=0;const handler=createHandler({env,fetcher:()=>{calls++;throw Error()}});
 assert.equal((await run(handler,{action:'request'},{origin:'https://other.example'})).statusCode,403);
 assert.equal((await run(handler,{action:'profile',...profileInput})).statusCode,401);
 assert.equal(calls,0);
});
test('캡차와 기존 계정 로그인 조건을 문자 제공자에 전달',async()=>{
 let request;
 const handler=createHandler({env,fetcher:async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({})}}});
 assert.equal((await run(handler,{action:'request',phone:'01012345678',mode:'login'})).statusCode,400);
 const res=await run(handler,{action:'request',phone:'01012345678',mode:'login',captchaToken:'test-captcha'});
 assert.equal(res.statusCode,200);assert.equal(request.body.create_user,false);assert.equal(request.body.phone,'+821012345678');assert.equal(request.body.gotrue_meta_security.captcha_token,'test-captcha');
});
test('문자 확인과 검증된 휴대폰 계정 확인 후에만 HttpOnly 쿠키 발급',async()=>{
 const calls=[];
 const handler=createHandler({env,fetcher:async url=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('/verify')?{access_token:'test-access',expires_in:3600}:url.endsWith('/user')?verifiedUser:[]}}});
 const res=await run(handler,{action:'verify',phone:'01012345678',code:'123456'});
 assert.equal(res.statusCode,200);assert.equal(res.body.user.id,uid);assert.equal(res.body.profile,null);
 assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Strict; Max-Age=3600; Secure/);assert.equal(res.body.access_token,undefined);
 const bad=createHandler({env,fetcher:async url=>({ok:true,json:async()=>url.endsWith('/verify')?{access_token:'test-access'}:{id:uid,phone:'821012345678'}})});
 assert.equal((await run(bad,{action:'verify',phone:'01012345678',code:'123456'})).statusCode,401);
});
test('프로필 주인은 요청 본문이 아니라 서버에서 검증한 사용자로 고정',async()=>{
 let saved;
 const handler=createHandler({env,fetcher:async(url,o)=>{if(url.endsWith('/user'))return {ok:true,json:async()=>verifiedUser};saved={...o,body:JSON.parse(o.body)};return {ok:true,json:async()=>({})}}});
 const res=await run(handler,{action:'profile',id:'attacker',...profileInput},{cookie:'__Host-parking_session=test-access'});
 assert.equal(res.statusCode,200);assert.equal(saved.body.id,uid);assert.equal(saved.headers.Authorization,'Bearer test-access');assert.equal(saved.body.contact_email,profileInput.email);
});
test('공식 목록 건수/ID 무결성과 제조사·모델 검색 가나다순',()=>{
 assert.equal(catalog.sourceRows,4293);assert.equal(catalog.vehicles.length,3631);assert.equal(new Set(catalog.vehicles.map(v=>v.id)).size,3631);
 const prepared=search.prepare(catalog.vehicles);
 const hyundai=search.search(prepared,'현대');assert.ok(hyundai.length>0);assert.ok(hyundai.every(v=>v.search.includes('현대')));
 assert.ok(search.search(prepared,'현대 아반떼').length>0);assert.ok(search.search(prepared,'제네시스').length>0);
 const collator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
 assert.deepEqual(hyundai,[...hyundai].sort((a,b)=>collator.compare(a.brand,b.brand)||collator.compare(a.model,b.model)));
 assert.equal(search.search(prepared,'존재하지않는차종').length,0);
});
