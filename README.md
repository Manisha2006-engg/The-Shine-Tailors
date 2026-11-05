# The Shine Tailors — Full-stack website

This is a starter production-style project built from your tailoring-shop requirements. It uses your earlier HTML design as a visual reference and provides a connected, database-backed website.

## Features
- Customer registration and login
- Customer profile: name, age, phone and address
- Manual body measurements and measurement-sheet image upload
- Public design gallery for blouses, chudidars and embroidery
- Customer tailoring orders and a separate marriage/bridal order form
- Shop-owner-only dashboard to accept/reject orders and assign delivery dates
- Customer order tracking
- Customer list for the shop owner
- Automatic shop email reminders 3 days before delivery and on the delivery date
- SQLite database created automatically in `data/`

## Requirements
- Node.js 20 or newer
- VS Code
- Internet connection for the Google Fonts and sample gallery photos (the app itself runs locally)

## Run in VS Code (Windows)
1. Extract `The-Shine-Tailors.zip`.
2. Open the extracted `The-Shine-Tailors` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:
   ```bash
   npm install
   ```
5. Copy `.env.example` to a new file named `.env`.
   - PowerShell: `Copy-Item .env.example .env`
   - Command Prompt: `copy .env.example .env`
6. Open `.env`. Set a long random `JWT_SECRET`, and change `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
7. Start the app:
   ```bash
   npm run dev
   ```
   Or use `npm start`.
8. Open **http://localhost:3000** in your browser.

## Shop owner login
The owner account is created the first time the server starts using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. Use those exact values to log in. The owner dashboard appears only for an admin account.

If you change the admin email/password after the account has already been created, the existing database account is not automatically renamed. For a fresh local test database, stop the server and delete `data/shine-tailors.sqlite`, then start it again. This deletes local test data.

## Email delivery reminders
The scheduler checks every day at **9:00 AM according to the computer/server's local time**.
- The shop receives a reminder 3 days before an accepted/in-progress order's assigned delivery date.
- The shop receives another reminder on the delivery date.
- Set `SHOP_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` in `.env`.
- For Gmail, enable 2-Step Verification and create a Google **App Password**. Do not put your normal Gmail password in the project.
- If SMTP is not configured, reminder details are printed in the VS Code terminal instead of emailed.
- The computer/server must be running at the scheduled time. For real online use, host the backend on an always-on server.

## How the database works
SQLite is stored in `data/shine-tailors.sqlite`. It is created automatically. Tables store accounts, measurements, gallery designs and orders. Uploaded images are saved in `public/uploads/`.

## Important before publishing online
This is a local development starter, not a completed security audit. Before collecting real customer information:
- Use HTTPS and a strong unique `JWT_SECRET`.
- Change the sample owner credentials.
- Configure regular encrypted database and upload backups.
- Add a privacy notice and obtain customer consent before storing personal measurements.
- Use a persistent hosting service and cloud file storage for uploads.
- Consider moving from SQLite to PostgreSQL if the shop grows or multiple staff members need concurrent access.
- Do not expose the admin credentials or `.env` file.

## Project structure
```text
The-Shine-Tailors/
├── server.js
├── db.js
├── package.json
├── .env.example
├── README.md
├── data/                  # created automatically
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── uploads/           # uploaded photos and measurement sheets
```

## Troubleshooting
- `npm` is not recognized: install Node.js LTS, restart VS Code and try `node -v` and `npm -v`.
- Port 3000 is busy: set another `PORT` in `.env`, for example `PORT=3001`.
- Database package install errors: use current Node.js LTS (20+) and run `npm install` again.
- No reminder email: check SMTP settings and the VS Code terminal. Without SMTP settings the scheduler logs reminders only.
