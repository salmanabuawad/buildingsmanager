# Quick Deploy - Get Started in 5 Minutes

Your application is **production-ready** and built in the `dist/` folder.

## 🚀 Fastest Way to Deploy (Netlify)

Your app is already configured for Netlify. Choose one method:

### Method 1: Using the Deployment Script (Recommended)

**Mac/Linux:**
```bash
./deploy.sh
```

**Windows:**
```powershell
.\deploy.ps1
```

The script will guide you through the deployment process.

---

### Method 2: Manual Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy to production
netlify deploy --prod
```

When prompted:
- **Publish directory**: `dist`
- The rest is auto-configured from `netlify.toml`

---

### Method 3: Drag & Drop (No CLI Required)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the `dist/` folder onto the page
3. Your site is live instantly!

**Note**: You'll need to add environment variables manually:
- Go to Site settings → Environment variables
- Add:
  - `VITE_SUPABASE_URL`: `https://mmqnrwjjxewrgwczezzf.supabase.co`
  - `VITE_SUPABASE_ANON_KEY`: (from netlify.toml line 10)

---

## ✅ What's Already Configured

- ✅ Production build optimized and minified
- ✅ All console.log statements removed
- ✅ Environment variables configured in `netlify.toml`
- ✅ SPA routing configured (no 404 errors)
- ✅ Supabase backend ready

---

## 📦 Your Build Stats

```
Main bundle:  3.3 MB (929 KB gzipped)
Styles:       307 KB (51 KB gzipped)
PDF Viewer:   446 KB (131 KB gzipped)
```

Fully optimized for production use.

---

## 🔗 Current Configuration

**Supabase Project**: `mmqnrwjjxewrgwczezzf`
**Supabase URL**: `https://mmqnrwjjxewrgwczezzf.supabase.co`
**Configured Site**: `https://buildingmanager.bolt.host/`

---

## 🆘 Need Other Options?

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for:
- Vercel deployment
- AWS S3 + CloudFront
- Docker containers
- Custom domain setup
- Database migration steps

---

## 🎯 Next Steps After Deployment

1. **Test login** - Make sure authentication works
2. **Check database** - Verify data loads correctly
3. **Upload test file** - Ensure storage buckets work
4. **Set up custom domain** (optional)
5. **Enable monitoring** (Netlify Analytics)

---

## 🚨 Important Notes

- The `VITE_SUPABASE_ANON_KEY` in `netlify.toml` is safe to expose (it's public)
- Your database is protected by Row Level Security (RLS) policies
- All sensitive operations require authentication
- Regular backups are handled by Supabase

---

**Ready to deploy?** Run `./deploy.sh` (or `.\deploy.ps1` on Windows) now!
