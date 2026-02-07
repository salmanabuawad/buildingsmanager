# AssetFlow Deployment Guide

This guide covers how to deploy your AssetFlow application to production.

## Prerequisites

Before deploying, ensure you have:
- ✅ Production build completed (`npm run build`)
- ✅ Supabase database configured and accessible
- ✅ All migrations applied to your production Supabase instance

## Deployment Options

### Option 1: Netlify (Recommended - Already Configured)

Your application is pre-configured for Netlify deployment.

#### Quick Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Deploy**
   ```bash
   netlify deploy --prod
   ```

#### Deploy via Netlify Dashboard

1. **Push to Git Repository**
   ```bash
   git init
   git add .
   git commit -m "Production ready"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Netlify**
   - Go to [netlify.com](https://www.netlify.com/)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository
   - Netlify will auto-detect settings from `netlify.toml`

3. **Environment Variables** (Already set in netlify.toml)
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

#### Current Netlify Configuration
```
Build command: npx vite build
Publish directory: dist
Site URL: https://buildingmanager.bolt.host/
```

---

### Option 2: Vercel

Vercel offers excellent performance and is optimized for Vite applications.

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables**
   ```bash
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   ```

4. **Deploy to Production**
   ```bash
   vercel --prod
   ```

#### Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com/)
2. Import your Git repository
3. Configure build settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables in Settings → Environment Variables

---

### Option 3: Static Hosting (AWS S3, DigitalOcean Spaces, etc.)

Deploy the `dist/` folder to any static hosting service.

#### AWS S3 + CloudFront

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://your-bucket-name
   ```

2. **Upload Files**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name
   ```

3. **Enable Static Website Hosting**
   - In S3 Console: Properties → Static website hosting
   - Index document: `index.html`
   - Error document: `index.html` (for SPA routing)

4. **Configure CloudFront** (Optional but recommended)
   - Create CloudFront distribution
   - Point to S3 bucket
   - Enable HTTPS

#### DigitalOcean App Platform

1. Connect your repository
2. Configure build:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add environment variables
4. Deploy

---

### Option 4: Docker Deployment

Use this for containerized environments (AWS ECS, Google Cloud Run, Azure Container Apps).

**Create Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Create nginx.conf:**
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Build and Deploy:**
```bash
docker build -t assetflow .
docker run -p 80:80 assetflow
```

---

## Environment Variables

Your application requires these environment variables in production:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key | `eyJhbGc...` |

### Getting Supabase Credentials

1. Go to [supabase.com](https://supabase.com) → Your Project
2. Click Settings → API
3. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Project API keys** → `anon/public` → `VITE_SUPABASE_ANON_KEY`

---

## Post-Deployment Checklist

After deploying, verify:

- [ ] Application loads successfully
- [ ] Login functionality works
- [ ] Database connections are working
- [ ] File uploads work (check Supabase storage)
- [ ] Edge functions are deployed (if used)
- [ ] All environment variables are set correctly
- [ ] HTTPS is enabled
- [ ] Domain/DNS is configured (if custom domain)

---

## Database Setup (Production)

Ensure your production Supabase database has:

1. **All migrations applied**
   ```bash
   # Run migrations in Supabase SQL Editor
   # Or use Supabase CLI
   supabase db push
   ```

2. **Storage buckets created**
   - `structure-drawings`
   - `dwg-files`

3. **Edge functions deployed** (if applicable)
   ```bash
   # Deploy edge functions using the Supabase MCP tools
   # or Supabase CLI
   supabase functions deploy
   ```

4. **RLS policies enabled** (already configured in migrations)

5. **Default users created** (if needed)
   - Use the admin panel or edge function to create users

---

## Monitoring and Maintenance

### Performance Monitoring
- Use Netlify Analytics or Vercel Analytics
- Monitor Supabase dashboard for database performance
- Set up error tracking (e.g., Sentry)

### Logs
- **Netlify**: Functions → Function logs
- **Vercel**: Deployments → View logs
- **Supabase**: Dashboard → Logs

### Backups
```bash
# Backup Supabase database
# Via Supabase Dashboard: Database → Backups
# Or use pg_dump with connection string
```

---

## Troubleshooting

### Build Fails
- Check Node version (should be 18+)
- Clear node_modules and reinstall: `npm ci`
- Check for TypeScript errors: `npm run typecheck`

### Environment Variables Not Working
- Ensure variables start with `VITE_`
- Restart build after adding variables
- Check deployment logs for missing variables

### 404 Errors on Refresh
- Ensure SPA redirect is configured:
  - Netlify: Check `netlify.toml` redirects
  - Vercel: Add `vercel.json` with rewrites
  - Nginx: Ensure `try_files` directive

### Database Connection Issues
- Verify Supabase URL and keys
- Check RLS policies allow access
- Verify users table has entries

---

## Custom Domain Setup

### Netlify
1. Go to Domain settings
2. Add custom domain
3. Update DNS records at your registrar

### Vercel
1. Go to Project Settings → Domains
2. Add domain
3. Configure DNS (automatic with Vercel nameservers)

---

## Scaling Considerations

For high-traffic deployments:

1. **Enable CDN** (Netlify/Vercel handle this automatically)
2. **Optimize Supabase**
   - Upgrade to Pro plan for better performance
   - Enable connection pooling
   - Add database indexes for frequently queried columns
3. **Code Splitting** (already implemented via dynamic imports)
4. **Image Optimization** (compress images before upload)

---

## Security Best Practices

- ✅ Use HTTPS (handled by hosting provider)
- ✅ Keep Supabase keys secure (never commit to Git)
- ✅ Enable RLS policies (already configured)
- ✅ Regular security updates: `npm audit fix`
- ✅ Monitor Supabase auth logs for suspicious activity
- ✅ Implement rate limiting (Supabase handles this)

---

## Need Help?

- **Netlify**: [docs.netlify.com](https://docs.netlify.com)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Vite**: [vitejs.dev/guide/static-deploy](https://vitejs.dev/guide/static-deploy.html)
