// DEVELOPMENT ONLY: creates the local dev user (idempotent) in the local
// Supabase from `supabase start`. Credentials come from the root .env:
// DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD (see .env.example).
process.loadEnvFile(new URL("../.env", import.meta.url));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } = process.env;
if (!SUPABASE_URL?.match(/^http:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|172\.)/)) {
  throw new Error(`Refusing to create a dev user on a non-local Supabase (${SUPABASE_URL}).`);
}
if (!DEV_LOGIN_EMAIL || !DEV_LOGIN_PASSWORD) throw new Error("Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD in .env");

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    email: DEV_LOGIN_EMAIL,
    password: DEV_LOGIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Dev User" },
  }),
});
const body = await res.json();
if (res.ok) console.log(`created dev user ${DEV_LOGIN_EMAIL}`);
else if (String(body.msg ?? body.message).includes("already")) console.log(`dev user ${DEV_LOGIN_EMAIL} already exists`);
else throw new Error(`Supabase: ${res.status} ${JSON.stringify(body)}`);
