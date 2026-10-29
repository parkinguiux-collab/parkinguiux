# SMS account integration

## Implemented
- Existing introductory slides lead to signup/login.
- Korean 010 numbers → +82 E.164; SMS OTP verification via Supabase Auth.
- Signup: name, birth year, contact email (not email verified), vehicle plate, searchable model.
- Verified Supabase user ID owns the profile; RLS limits select/insert/update to that user. No service-role key used.
- Access token is returned only in an HttpOnly, Secure, SameSite=Strict cookie on Vercel. No tokens, phone or signup fields in browser localStorage. Session is limited to one hour; reauthentication is required after expiry. Refresh tokens are intentionally not retained.
- Profile editing writes to the same database. Logout clears the session cookie.
- Existing parking/payment interactions remain the existing preview; SMS auth does not connect a real parking operator or payment gateway. Account-mode demo parking/coupon state is memory-only and isolated from browser demo preferences.

## Provisioning (not complete until verified)
1. Supabase free organization `parkinguiux` was created with user approval. The user created project `parking` (`yjqcvecskqdkupmpqbzo`, Frankfurt eu-central-1). Reuse this project; do not create a second one.
2. `supabase/migrations/20261029_parking_profiles.sql` was run successfully in that project on 2026-10-29. The profile table grants authenticated users access only through self-only RLS policies.
3. Enable Phone auth, connect an SMS provider supporting Korean recipients. The provider may require billing/sender verification. This repository contains no SMS credentials. Never enable test OTPs on production.
4. Enable hCaptcha in Supabase Auth. Add the deployed site domain to hCaptcha; store its secret in Supabase, and its public sitekey in Vercel. Set OTP length to 6, expiry to 3 minutes and resend interval to at least 60 seconds; set suitable send limits in Supabase/provider.
5. Configure Vercel environment variables through the dashboard (never commit secrets):
   - `SUPABASE_URL`: project URL (`https://<ref>.supabase.co`)
   - `SUPABASE_PUBLISHABLE_KEY`: publishable/anon key; never service_role
   - `HCAPTCHA_SITEKEY`: public sitekey
   - `APP_ORIGIN`: `https://parkinguiux.vercel.app`
   - `AUTH_READY`: `true` **only after** database, Phone provider and CAPTCHA are configured.
6. Redeploy. Verify real SMS to an explicitly authorized test number: new signup, reload session, logout/login, wrong/expired OTP, resend cooldown, denied cross-account read/write.

Until configured, `/api/account?action=config` reports `ready:false`. Forms show an honest connection status; no SMS success, fake token, local registration or bypass is provided.

## Official vehicle catalog
Source: [KEA public automobile fuel-efficiency search](https://min24.energy.or.kr/trans_hp/AHP/HP_03/HP_03_01_010.do), downloaded 2026-10-29 using the same public search request as the page (no filters). 4,293 source rows, 3,631 unique manufacturer + model labels. Years 2008 onward in this snapshot; includes detailed trim labels and domestic/imported manufacturers. It is **not** a guaranteed exhaustive list of every car sold in Korea (historic, special vehicles or unreported models may be absent).

`assets/vehicle-catalog.json` preserves official labels. Search supports manufacturer aliases (Hyundai/현대자동차, KG/쌍용, BMW/비엠더블유, etc.) and sorts with `Intl.Collator('ko-KR')`. No invented “현대 스포츠카” model entries. Model IDs are stable SHA-256 prefixes of manufacturer + model. The raw personal-data-free official records are not needed in production.

Official docs: [Phone auth](https://supabase.com/docs/guides/auth/phone-login), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
