# Chicken Brûlée — Project Rules

## After every code change, ALWAYS:
1. **Deploy to FTP** — `FTP_PASS=Y0r3kJ3st3r /opt/homebrew/bin/node scripts/deploy.js`
2. **Push to GitHub** — `git add -A && git commit -m "<message>" && git push`

## Paths
- Local: `/Users/abbas/GameOS/chicken-brulee`
- Live: `https://llamagriffin.com/game-os/chicken-brulee/`
- GitHub: `https://github.com/bakatronix/chicken-brulee`
- FTP: `ftp.bakatron.com` → `/game-os/chicken-brulee`
- Supabase: `ryixbzjnyhjwvojhmdcs`

## Secrets (never commit, never log)
- GitHub token: keep in remote URL only
- FTP password: Y0r3kJ3st3r (set as env var, never in files)
- Supabase service_role: stored in Supabase edge function secrets
- DeepSeek key: stored in Supabase edge function secrets
- DB password: Y0r3kJ3st3r1234

## Database
- Host: `db.ryixbzjnyhjwvojhmdcs.supabase.co`
- User: `postgres`
- Password: `Y0r3kJ3st3r1234`
- Database: `postgres`
- SSL: required (rejectUnauthorized: false)
