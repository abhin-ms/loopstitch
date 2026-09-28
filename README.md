# Loopstitch Co. — Ecommerce Site

A full-stack storefront + admin dashboard for **Loopstitch Co.**, built for `loopstitch.online`.

- **Backend:** Python (FastAPI + SQLAlchemy), JWT auth, PDF invoice generation
- **Frontend:** React + Vite + Tailwind CSS v4 + Framer Motion
- **Database:** SQLite by default (zero config). MySQL/MariaDB supported for your aaPanel VPS — just set one env var.

---

## What you get

**Storefront**
- Home, Shop (with category filter), Product detail, Cart, Checkout, Order confirmation, About
- Fully responsive, animated (page transitions, hover states, scroll reveals, a scrolling drop-ticker)
- Multi-image product gallery, per-size stock — a size shows **"Sold Out / Locked"** and can't be added to cart once stock hits 0
- Order placed → order confirmation page → **downloadable PDF invoice**

**Admin dashboard — hidden, not linked anywhere on the site**
- Login only at **`/admin/login`** (no signup route exists anywhere in the codebase)
- Dashboard: revenue, order count, low-stock / sold-out size counts
- Products: create/edit/delete, upload multiple images per product, set stock **per size** (S/M/L/XL/XXL or your own), toggle active/featured
- Orders: view all orders, update status (pending → paid → shipped → delivered), download invoice PDF per order

---

## Project structure

```
loopstitch-ecommerce/
├── backend/           FastAPI app
│   ├── app/
│   │   ├── main.py        all API routes
│   │   ├── models.py      database tables
│   │   ├── schemas.py     request/response validation
│   │   ├── auth.py        JWT admin auth (no signup — accounts are created via seed.py only)
│   │   ├── invoice.py     PDF invoice generator
│   │   └── database.py    SQLite/MySQL connection
│   ├── seed.py         run once to create your admin login
│   └── requirements.txt
└── frontend/           React app
    └── src/
        ├── pages/           public pages (Home, Shop, ProductDetail, Cart, Checkout...)
        ├── pages/admin/     admin pages (AdminLogin, AdminDashboard, AdminProducts...)
        ├── components/      Navbar, Footer, ProductCard, SizePicker, AdminLayout...
        ├── context/         Cart state, Admin auth state
        └── api/client.js    axios instance
```

---

## 1. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

python seed.py
# → prompts you to set an admin username + password
# → offers to add 2 demo products so the store isn't empty

uvicorn app.main:app --reload --port 8000
```

API now runs at `http://localhost:8000`. Interactive API docs: `http://localhost:8000/docs`.

### Using MySQL/MariaDB instead of SQLite (for your aaPanel VPS)

```bash
export DATABASE_URL="mysql+pymysql://dbuser:dbpassword@localhost:3306/loopstitch"
```

Create the `loopstitch` database in aaPanel first — the app will create all tables automatically on first run.

---

## 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env       # edit VITE_API_URL if your API isn't on localhost:8000
npm run dev
```

Site now runs at `http://localhost:5173`.

**Build for production:**
```bash
npm run build       # outputs static files to frontend/dist
```

---

## 3. Using the admin dashboard

1. Go to `yourdomain.com/admin/login` (this URL is never linked from the public site — bookmark it)
2. Log in with the username/password you set via `seed.py`
3. **Add a product:** Products → "+ Add product" → fill in name/price/description → set stock for each size → **Create product** → then upload images (image upload only unlocks after the product is first saved, since images attach to a product ID)
4. **Lock a size:** set its stock to `0` — it instantly shows as "Locked / Sold Out" on the storefront and can no longer be ordered
5. **Orders:** every order auto-generates an order number and decrements stock immediately, so two customers can never both buy the last piece. Download the invoice PDF from the Orders page any time.

---

## 4. Deploying to your VPS (aaPanel / Nginx, matching your usual setup)

**Backend:**
1. Upload the `backend/` folder to your VPS, set up the venv + `pip install -r requirements.txt` there
2. Set `DATABASE_URL` (MySQL) and `SECRET_KEY` (a long random string) as environment variables — don't leave the default secret key in production
3. Run with Gunicorn + Uvicorn workers behind Nginx, e.g.:
   ```bash
   gunicorn app.main:app -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 -w 2
   ```
4. Point an Nginx server block (e.g. `api.loopstitch.online`) at `127.0.0.1:8000`, and make sure `/uploads` is proxied too so product images load

**Frontend:**
1. Set `VITE_API_URL=https://api.loopstitch.online` in `.env` before building
2. `npm run build`
3. Upload the contents of `frontend/dist` to your Nginx web root for `loopstitch.online`
4. Add an Nginx rewrite so all routes fall back to `index.html` (standard SPA config), e.g.:
   ```nginx
   location / {
     try_files $uri /index.html;
   }
   ```

**CORS:** update the `CORS_ORIGINS` env var on the backend to include your live domain (it already defaults to `https://loopstitch.online` and `https://www.loopstitch.online`).

---

## 5. Payments

This starter ships with a **cash/UPI-on-delivery style checkout** (no payment gateway wired in) so you can test the full flow immediately. To take live payments, integrate Razorpay or Stripe inside `frontend/src/pages/Checkout.jsx` and confirm/create the order server-side in `backend/app/main.py` (`create_order`) after payment succeeds.

---

## 6. Notes

- Change `SECRET_KEY` in `backend/app/auth.py` (or set it via env var) before going live — it signs the admin login tokens
- There is intentionally **no admin signup endpoint anywhere** — the only way to create an admin account is running `seed.py` yourself
- Uploaded product images are stored in `backend/uploads/products/` and served at `/uploads/products/...`
- Design system: display type is Anton (poster-style headlines), body is Space Grotesk, and prices/tags/labels use JetBrains Mono — paired with a black/red/acid-yellow palette and a halftone texture nodding to manga screentone, with a scrolling "drop ticker" as the signature element

---

## 7. Delhivery shipping (automatic)

Every order that gets paid (online, or COD with its advance) is sent to Delhivery automatically:

1. **Shipment created** right after payment verification, and the AWB is saved on the order
2. **Pickup date = order date + 3 days** (IST). Sundays and any `DELHIVERY_HOLIDAYS` are skipped
3. **One pickup request per date.** Delhivery allows one open pickup per warehouse per day, so the first order for a date books it and later orders for that date go out with it
4. If Delhivery refuses a pickup (for example, the date is too far ahead), it is **retried automatically every 3 hours** until the date. Admins can also press Retry
5. Setting an order to **cancelled** in admin also cancels its Delhivery shipment

Admin → Orders shows each order's AWB and pickup date, a **Label** button (the Delhivery PDF to print), **Ship / Retry ship** for failed orders, and a list of upcoming pickups.

**Env vars** (in `backend/.env` or docker-compose):

```
DELHIVERY_TOKEN=xxxxxxxx                 # Delhivery One → Settings → API Setup
DELHIVERY_PICKUP_LOCATION=LOOPSTITCH_WH  # warehouse name EXACTLY as registered in Delhivery (case-sensitive)
DELHIVERY_MODE=staging                   # switch to "live" after testing
DELHIVERY_AUTO=true                      # false = only ship when you press "Ship" in admin
DELHIVERY_PICKUP_AFTER_DAYS=3
DELHIVERY_PICKUP_TIME=14:00:00
DELHIVERY_SKIP_SUNDAY=true
DELHIVERY_HOLIDAYS=2026-10-20,2026-11-08
DELHIVERY_WEIGHT_PER_ITEM_G=350          # packed weight per tee, in grams
```

The code is in `backend/app/delhivery.py`. The new DB columns and table are added automatically on startup, or you can run `python migrate.py`.
