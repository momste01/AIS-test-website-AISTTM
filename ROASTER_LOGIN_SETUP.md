# Roaster Login + Gated Pricing

Lets roasters create an account on the website and, once **approved by us**, see
wholesale prices inline on the catalog and lot pages. Accounts and approval live
in the **same Supabase project as the AIS software** (`lwsxxobinajquhvdryci`), so
one login works everywhere.

## How it works

1. A roaster visits **`/login.html`** → *Create account* (roastery, name, email, password).
2. Supabase creates the auth user; a trigger creates a `roaster_profiles` row with
   `approved = false`. The roaster sees an **"Account under review"** screen.
3. **We approve them** in Supabase (one checkbox — see below).
4. Next time they sign in, `catalog.html` and `lot.html` fetch prices from
   `roaster_prices` and **reveal them inline**. Everyone else sees a small
   "🔒 Log in to see roaster pricing" prompt instead of a number.

Prices are protected by **Row Level Security**, not just hidden in the page: an
unapproved or signed-out visitor's request for prices comes back empty from the
database. So the numbers never reach the browser unless the account is approved.

## One-time database setup

Run **`supabase/roaster-auth.sql`** once in the Supabase dashboard
(SQL Editor → paste the file → Run). It creates the `roaster_profiles` and
`roaster_prices` tables, the signup trigger, and the RLS policies. It's safe to
re-run.

Then, in **Authentication → Providers → Email**, decide whether to require email
confirmation (recommended on) — the login page handles both cases.

## Approving a roaster

Table Editor → `roaster_profiles` → tick **`approved`** on their row. Or in SQL:

```sql
update public.roaster_profiles
set approved = true
where id = (select id from auth.users where email = 'them@roastery.com');
```

## Setting prices

Table Editor → `roaster_prices`. One row per lot, where `lot_slug` matches the
catalog card's `data-lot` value. The current slugs are:

```
frinsa-collective-fully-washed   frinsa-collective-natural   frinsa-collective-wet-hulled
frinsa-honey-lactic              frinsa-honey-tempe          frinsa-estate-natural-lactic
pkni-washed                      pkni-honey                  pkni-natural
```

Set **either** `price_display` (a ready-made string like `USD $7.20 / lb`, shown
as-is) **or** `price_amount` + `currency` + `price_unit` (formatted for you).
Lots with no row simply show no price to approved roasters.

> Later, `roaster_prices` can be replaced by a **view** over the AIS software's
> internal pricing tables (`coffee_price_tier`, `product_history`) so prices stay
> in sync automatically. It's a standalone table for now to keep the public site
> decoupled from internal cost data.

## Files in this change

| File | Purpose |
|------|---------|
| `login.html` | Sign-up / sign-in / approval-pending / approved screens |
| `js/ais-supabase.js` | Shared Supabase client + auth/profile helpers (public anon key) |
| `js/roaster-pricing.js` | Reveals prices on catalog/lot pages for approved roasters |
| `supabase/roaster-auth.sql` | Tables, signup trigger, RLS policies (run once) |
| `catalog.html`, `lot.html` | Price slot + `Roaster Login` nav link + script include |
| `index/coffee/cocopeat/europe.html` | `Roaster Login` nav link |

## Security notes

- The anon key in `js/ais-supabase.js` is **public by design** — it only permits
  what RLS allows. Never put the service-role key in any client file.
- Roasters can read only their own profile row and cannot self-approve (there is
  no update policy for them; approval requires the dashboard/service role).
