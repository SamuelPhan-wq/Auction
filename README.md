# LCTW Silent Auction

A mobile-friendly silent auction website for the Lao Conservation Trust for Wildlife. It is hosted free on **GitHub Pages**, and bids are saved in a **Google Sheet**.

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | Guests | Gallery of every artwork. Search, filter ("No bids yet", "My bids"), sort, and bid from a pop-up. |
| `item.html?id=…` | Guests (from a QR code) | One artwork: large zoomable photo, current bid, bid form, bid history. |
| `admin.html` | Admin | Password protected. Totals, every lot's top bidder and phone number, full bid history, remove/restore bids, set an end time, close bidding, download CSVs. |
| `qr.html` | Admin | Printable QR code label for every artwork, plus a "view all" poster. |

**A bid needs** a name, a phone number and an amount. Email is optional. Bidders can choose to appear as "Anonymous". Phone numbers and emails are never shown publicly; only the admin can see them.

**Also included**
- Minimum bid enforcement: starting bid, then current bid plus the minimum increment. One-tap buttons fill in suggested amounts.
- Two people bidding at the same moment can't both win: the server checks again before saving.
- An "Are you sure?" check on unusually large bids, to catch an extra zero.
- "You're winning" or "You've been outbid" badges, plus a **My bids** list on each phone.
- Bidders' details are remembered on their phone so they only type them once.
- Live updates every 15 seconds, a countdown to the closing time, and bidding locks automatically when time runs out.
- Admin can remove a joke or mistaken bid, and can restore it later.
- Winners CSV: lot, winner, phone and amount, ready for collecting payment.
- LCTW logo, colours and fonts (same as the Staff Requests app), and a dark mode.

---

## 1. Try it now (demo mode)

While `apiUrl` in `assets/config.js` is empty, the site runs in **demo mode**: bids are only saved in your own browser. The admin password in demo mode is `demo`.

Browsers block some features when you double-click a file, so open the site through a small local server instead:

```bash
cd ~/Documents/GitHub/LCTW/Auction && python3 -m http.server 8000
```

Then go to http://localhost:8000.

## 2. Set up the Google Sheet (≈10 minutes)

1. Go to [sheets.new](https://sheets.new) and name the sheet **LCTW Auction Bids**.
2. Open **Extensions → Apps Script**. Delete everything there and paste in the full contents of [`apps-script/Code.gs`](apps-script/Code.gs).
3. Click **Save** 💾. Then set the admin password: click ⚙️ **Project Settings** (left side) → **Script properties** → **Add script property**. Property: `ADMIN_PASSWORD`, Value: your password → **Save script properties**. Never type the real password into `Code.gs`, because that file is public on GitHub.
4. Click **Deploy → New deployment**. Click the ⚙️ next to "Select type" and choose **Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Click **Deploy**, then **Authorize access**. Choose your Google account. If you see *"Google hasn't verified this app"*, click **Advanced → Go to … (unsafe)**. It is your own script.
6. Copy the **Web app URL** (it ends in `/exec`).
7. Open `assets/config.js` and paste it in: `apiUrl: "https://script.google.com/macros/s/…/exec",`

A **Bids** tab appears in the sheet after the first bid. You can watch bids arrive there live.

> When you edit `Code.gs` later, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the same URL.

## 3. Put it on GitHub Pages

1. Create a new repository on GitHub, for example `lctw-auction`. It can be public: no private data is stored in the site files.
2. Upload or push everything in this folder. `.gitignore` leaves out the large original photos, which the site doesn't need.
3. In the repository, go to **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
4. After about a minute the site will be live at `https://YOUR-NAME.github.io/lctw-auction/`.
5. Put that address in `siteUrl` in `assets/config.js` and push again. This makes sure the QR codes always point to the live site.

## 4. Print the QR codes

**Order and lock the lot numbers first** (see "Lot order" below), then open `https://YOUR-NAME.github.io/lctw-auction/admin.html`, sign in, and click **Print QR code labels**. Labels print 6 per A4 page. **Print from Google Chrome** (Safari ignores the page settings and shifts the labels). **Scan a couple with your phone before the event.**

## 5. On the night

- **Set the end time** in the admin dashboard. Bidding closes by itself at that time, or you can click **Close bidding now**.
- After closing, click **Winners (CSV)** for the list of who to call and how much they owe.
- If someone places a joke bid, open that lot in the admin table and click **Remove**.

## Lot order and lot numbers (drag and drop)

On the admin page, the **Lot numbers & order** panel shows every artwork as a picture with its lot number.
- **Drag a picture** to a new place and the numbers renumber to match. On a touch screen, press and hold a picture first, or use the **‹ ›** buttons on it.
- Click **Save order** to keep it. **Discard changes** and **Original order** are there if you change your mind.
- **Lot numbers lock automatically when the first bid is placed**, and the server then refuses any reordering. You can also click **Lock lot numbers now** once the numbering is final (do this before printing the QR labels). Until the first bid you can **Unlock** again.
- Guests see the new numbers within about 15 seconds. The QR codes don't contain lot numbers, so reordering never breaks them. Only the number printed on the label changes, so finish the order before printing.

## Names, descriptions, starting bids and increments (from the admin page)

No code editing needed. On the admin page:
- **Starting bids & increments** panel: sets the default for every lot.
- **Tap any lot** in the table to **rename the artwork**, add a description, or give it its own starting bid and/or increment. It is marked **custom**. **Reset to original** undoes all of these.

The server enforces these amounts, and guests' pages update within about 15 seconds. Which amount wins: the lot's own setting → the admin default → `items.js` → `config.js`. Changing a starting bid only matters until the first bid; after that, the increment sets the next minimum.

---

## Changing things

| To change… | Edit |
|---|---|
| Starting bids and increments | **Admin page** (see above) |
| Title, currency, fallback starting bid and increment | `assets/config.js` |
| Artwork names and descriptions | **Admin page** (tap a lot), or `assets/items.js` |
| Lot order / lot numbers | **Admin page** (drag and drop; locks at the first bid) |
| Photos, adding/removing artworks | `assets/items.js` |
| Colours | top of `assets/styles.css` |
| Admin password | Apps Script → ⚙️ Project Settings → Script properties → `ADMIN_PASSWORD` (takes effect immediately) |

> **After editing any file in `assets/`**, change the `?v=3` at the end of the `assets/…` links in all four `.html` files to a new number (`?v=4`, and so on). Browsers keep old copies for up to 10 minutes, and the new number makes them load the fresh files straight away.

**Adding a new artwork:** resize the photo (about 1400px wide for `images/full/`, 560px for `images/thumb/`). On a Mac:

```bash
sips -Z 1400 -s formatOptions 62 "photo.jpg" --out images/full/new-id.jpg && sips -Z 560 -s formatOptions 60 "photo.jpg" --out images/thumb/new-id.jpg
```

Then add a line to `assets/items.js`.

> ⚠️ Don't change an artwork's `id` after QR codes are printed or bids have started. The QR codes and the saved bids both use it.

## Files

```
index.html        gallery (view all + bid)
item.html         single artwork page (QR target)
admin.html        admin dashboard
qr.html           printable QR labels
assets/config.js  settings  ← edit me
assets/items.js   artwork list  ← edit me
assets/app.js     shared logic
assets/styles.css LCTW styling
images/full/      large photos
images/thumb/     gallery thumbnails
apps-script/Code.gs  Google Sheets backend (paste into Apps Script)
```
