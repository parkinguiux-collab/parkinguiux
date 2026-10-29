# Email account integration

The user changed the login method from SMS to email verification on 2026-10-29.

## Implemented
- Signup/login requests a real Supabase email magic link. PKCE S256 binds the link to a one-hour HttpOnly verifier cookie. The link must be opened in the browser that requested it.
- The callback exchanges the one-use code on the server, verifies the authenticated email, and stores a one-hour HttpOnly/Secure/SameSite=Strict session cookie. No access/refresh tokens or signup fields are persisted in localStorage; auth codes are removed from the URL immediately.
- New users enter name, birth year, phone (unverified contact number), plate and a searchable official model after verifying email. Existing users enter the home screen. Profile edits are stored in Supabase. Email changes require a separate verification flow and are not allowed through the profile form.
- RLS restricts each profile to its authenticated user ID and JWT email. Server uses publishable key + user token, never a service-role key. Anonymous profile reads were verified to return 401/42501.
- Existing parking/payment/coupon interactions remain the prior preview. Account-mode parking state is memory-only and isolated from local demo preferences. Real parking operators and payment gateways are not connected.

## Confirmed infrastructure
- Free organization `parkinguiux`, user-created project `parking` (`yjqcvecskqdkupmpqbzo`, Frankfurt eu-central-1).
- Both migrations in `supabase/migrations/` ran successfully. The second migrates the self-only policy from phone to email and adds the contact phone column.
- Supabase Site URL: `https://parkinguiux.vercel.app`; allowed redirect: `https://parkinguiux.vercel.app/` only.
- Vercel has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN` for Production/Preview. The legacy SMS `AUTH_READY=false` remains unused by the email implementation.
- Set `EMAIL_AUTH_READY=true` to enable the email endpoint. hCaptcha is supported when `HCAPTCHA_SITEKEY` is configured and the provider secret is enabled in Supabase; otherwise existing Supabase email rate limits apply. Do not disable confirmation or use fake verification/test OTPs in production.

## Remaining external delivery limitation
Supabase's default email delivery is limited to organization team-member addresses, with a small provider-enforced hourly limit. Therefore this setup can be tested with the project's team email but is **not yet general-public email delivery**. A custom SMTP sender/service or Send Email hook must be connected to allow arbitrary users to sign up. Email templates currently remain the Supabase defaults; no paid upgrade was purchased.

A real end-to-end test still needs the user to request mail to an authorized team email and open the link in the same browser, then complete profile/save/logout/login. Mocked backend tests verify PKCE failure, unverified-user denial, cookie protection and identity ownership; they do not prove email delivery.

Official docs: [Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [default SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Official vehicle catalog
Source: [KEA public automobile fuel-efficiency search](https://min24.energy.or.kr/trans_hp/AHP/HP_03/HP_03_01_010.do), downloaded 2026-10-29 using the same public search request as the page (no filters). 4,293 source rows, 3,631 unique manufacturer + model labels. Years 2008 onward in this snapshot; includes detailed trim labels and domestic/imported manufacturers. It is **not** a guaranteed exhaustive list of every car sold in Korea (historic, special vehicles or unreported models may be absent).

`assets/vehicle-catalog.json` preserves official labels. Search supports manufacturer aliases (Hyundai/현대자동차, KG/쌍용, BMW/비엠더블유, etc.) and sorts with `Intl.Collator('ko-KR')`. No invented “현대 스포츠카” model entries. Model IDs are stable SHA-256 prefixes of manufacturer + model. The raw personal-data-free official records are not needed in production.

Official docs: [Phone auth](https://supabase.com/docs/guides/auth/phone-login), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
