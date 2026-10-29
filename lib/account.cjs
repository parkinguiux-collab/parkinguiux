'use strict';
const catalog = require('../assets/vehicle-catalog.json');
const vehicles = new Map(catalog.vehicles.map(v => [v.id, v]));
function problem(status, message) { return Object.assign(new Error(message), { status }); }
function phoneNumber(value) {
  const phone = String(value || '').replace(/[\s()-]/g, '');
  if (/^010\d{8}$/.test(phone)) return '+82' + phone.slice(1);
  if (/^\+8210\d{8}$/.test(phone)) return phone;
  throw problem(400, '휴대폰 번호를 확인해 주세요. 예: 01012345678');
}
function validateProfile(input, now = new Date()) {
  const name = String(input.name || '').trim().normalize('NFC');
  const email = String(input.email || '').trim();
  const birthYear = Number(input.birthYear);
  const plate = String(input.plate || '').replace(/\s/g, '').normalize('NFC');
  const vehicle = vehicles.get(input.vehicleId);
  if (!/^[가-힣a-zA-Z ·'-]{2,40}$/.test(name)) throw problem(400, '이름은 2~40자로 입력해 주세요.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw problem(400, '이메일 주소를 확인해 주세요.');
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > now.getFullYear()) throw problem(400, '출생연도를 확인해 주세요.');
  if (!/^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(plate)) throw problem(400, '차량 번호를 확인해 주세요. 예: 32가 4321');
  if (!vehicle) throw problem(400, '검색 목록에서 차종을 선택해 주세요.');
  return { name, contact_email: email, birth_year: birthYear, plate, vehicle_id: vehicle.id, vehicle_brand: vehicle.brand, vehicle_model: vehicle.model };
}
const columns = 'id,name,contact_email,birth_year,plate,vehicle_id,vehicle_brand,vehicle_model';
function createHandler({ env = process.env, fetcher = fetch } = {}) {
  const secure = env.VERCEL === '1' || env.NODE_ENV === 'production';
  const cookieName = secure ? '__Host-parking_session' : 'parking_session';
  const cookie = (value, age) => `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const ready = () => env.AUTH_READY === 'true' && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '') && !!env.SUPABASE_PUBLISHABLE_KEY && !!env.HCAPTCHA_SITEKEY;
  async function api(path, { token, method = 'GET', body, headers = {} } = {}) {
    const response = await fetcher(`${env.SUPABASE_URL}${path}`, { method, headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw problem(429, '요청이 많아요. 잠시 후 다시 시도해 주세요.');
      if (['otp_expired', 'otp_disabled', 'validation_failed'].includes(data.code)) throw problem(400, '인증번호가 틀렸거나 만료됐어요. 다시 확인해 주세요.');
      if (response.status === 401 || response.status === 403 && path === '/auth/v1/user') throw problem(401, '로그인이 만료됐어요. 다시 인증해 주세요.');
      throw problem(502, path === '/auth/v1/otp' ? '인증번호를 요청하지 못했어요. 번호를 확인하고 다시 시도해 주세요.' : '연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    return data;
  }
  async function user(token) {
    if (!token) throw problem(401, '휴대폰 인증 후 이용해 주세요.');
    const u = await api('/auth/v1/user', { token });
    if (!u.id || !u.phone_confirmed_at || !u.phone) throw problem(401, '휴대폰 인증 후 이용해 주세요.');
    return u;
  }
  async function profile(token, id) {
    const rows = await api(`/rest/v1/parking_profiles?id=eq.${encodeURIComponent(id)}&select=${columns}`, { token });
    if (!Array.isArray(rows)) throw problem(502, '회원정보를 불러오지 못했어요.');
    return rows[0] || null;
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Vary', 'Cookie');
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw problem(405, '지원하지 않는 요청입니다.'); }
      const tokenMatch = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='));
      const token = tokenMatch ? decodeURIComponent(tokenMatch.slice(cookieName.length + 1)) : '';
      if (req.method === 'GET' && req.query?.action === 'config') return res.status(200).json({ ready: ready(), captchaSitekey: ready() ? env.HCAPTCHA_SITEKEY : null });
      if (req.method === 'POST') {
        const allowed = new Set([env.APP_ORIGIN, env.VERCEL_URL && `https://${env.VERCEL_URL}`, ...(!secure ? ['http://localhost:4173', 'http://127.0.0.1:4173'] : [])].filter(Boolean));
        if (!allowed.has(req.headers.origin)) throw problem(403, '이 화면에서 다시 요청해 주세요.');
        if (!(req.headers['content-type'] || '').startsWith('application/json')) throw problem(415, '지원하지 않는 입력 형식입니다.');
      }
      const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (JSON.stringify(input).length > 10000) throw problem(413, '입력 내용이 너무 깁니다.');
      if (req.method === 'POST' && input.action === 'logout') {
        res.setHeader('Set-Cookie', cookie('', 0));
        if (ready() && token) await api('/auth/v1/logout?scope=local', { token, method: 'POST' }).catch(() => {});
        return res.status(200).json({ ok: true });
      }
      if (!ready()) throw problem(503, '문자 인증 서비스를 연결 중이에요. 연결이 완료되면 이용할 수 있어요.');
      if (req.method === 'GET') {
        if (!token) return res.status(200).json({ user: null, profile: null });
        const u = await user(token);
        return res.status(200).json({ user: { id: u.id, phone: u.phone }, profile: await profile(token, u.id) });
      }
      if (input.action === 'request') {
        const phone = phoneNumber(input.phone);
        if (!['login', 'signup'].includes(input.mode)) throw problem(400, '로그인 방식을 확인해 주세요.');
        if (typeof input.captchaToken !== 'string' || !input.captchaToken || input.captchaToken.length > 4096) throw problem(400, '자동입력 방지 확인을 완료해 주세요.');
        await api('/auth/v1/otp', { method: 'POST', body: { phone, create_user: input.mode === 'signup', channel: 'sms', gotrue_meta_security: { captcha_token: input.captchaToken } } });
        return res.status(200).json({ ok: true, retryAfter: 60 });
      }
      if (input.action === 'verify') {
        const phone = phoneNumber(input.phone);
        if (!/^\d{6}$/.test(String(input.code || ''))) throw problem(400, '인증번호 6자리를 입력해 주세요.');
        const result = await api('/auth/v1/verify', { method: 'POST', body: { phone, token: input.code, type: 'sms' } });
        const u = await user(result.access_token);
        if (phoneNumber(u.phone.startsWith('+') ? u.phone : '+' + u.phone) !== phone) throw problem(401, '인증한 번호를 확인해 주세요.');
        const p = await profile(result.access_token, u.id);
        res.setHeader('Set-Cookie', cookie(result.access_token, Math.min(Number(result.expires_in) || 3600, 3600)));
        return res.status(200).json({ user: { id: u.id, phone: u.phone }, profile: p });
      }
      if (input.action === 'profile') {
        const u = await user(token);
        const p = validateProfile(input);
        await api('/rest/v1/parking_profiles?on_conflict=id', { token, method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: u.id, ...p } });
        return res.status(200).json({ user: { id: u.id, phone: u.phone }, profile: { id: u.id, ...p } });
      }
      throw problem(400, '요청을 확인해 주세요.');
    } catch (error) {
      if (error.status === 401) res.setHeader('Set-Cookie', cookie('', 0));
      return res.status(error.status || (error instanceof SyntaxError ? 400 : 502)).json({ error: error.status ? error.message : '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.' });
    }
  };
}
module.exports = { createHandler, phoneNumber, validateProfile };
