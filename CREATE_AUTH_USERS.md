# Creating Supabase Auth Users

The default users (`admin` and `user`) are created in the `users` table via migration, but they need to be created in **Supabase Auth** separately to enable login.

## Option 1: Create via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **Add User** → **Create new user**
4. Create the admin user:
   - **Email**: `admin@buildingsmanager.local`
   - **Password**: `admin`
   - **Auto Confirm User**: ✅ (check this)
5. Create the user (read-only):
   - **Email**: `user@buildingsmanager.local`
   - **Password**: `user`
   - **Auto Confirm User**: ✅ (check this)

6. After creating the users, link them to the `users` table by running this SQL in the SQL Editor:

```sql
-- Link admin user (replace <auth-user-id> with the actual ID from Auth dashboard)
UPDATE users 
SET auth_user_id = '<admin-auth-user-id>'
WHERE user_name = 'admin';

-- Link user (replace <auth-user-id> with the actual ID from Auth dashboard)
UPDATE users 
SET auth_user_id = '<user-auth-user-id>'
WHERE user_name = 'user';
```

To find the auth user IDs:
- In Supabase Dashboard → Authentication → Users
- Click on each user to see their UUID (this is the `auth_user_id`)

## Option 2: Use Browser Script

1. Open `scripts/create-auth-users-browser.html` in your browser
2. Enter your Supabase URL and Anon Key
3. Click "צור משתמשים" (Create Users)
4. Note: This uses `signUp` which may require email confirmation. For production, use Option 1 or Option 3.

## Option 3: Use Node.js Script (Requires Service Role Key)

If you have the **Service Role Key** (not the Anon Key), you can use the Node.js script:

1. Set environment variables:
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

2. Run the script:
   ```bash
   node scripts/create-auth-users.js
   ```

**Important**: Never expose the Service Role Key in client-side code!

## Option 4: Manual SQL + Auth API

If you prefer to create users programmatically:

1. Use Supabase Management API or Admin SDK with Service Role Key
2. Create users via `auth.admin.createUser()`
3. Link them to the `users` table as shown in Option 1

## Troubleshooting

### "Invalid login credentials"
- Make sure users exist in Supabase Auth (not just in the `users` table)
- Verify the email addresses match exactly
- Check that users are confirmed (Auto Confirm enabled)

### "User not found in users table"
- Run the migration `20260113000003_add_default_users.sql` first
- Then link the auth users to the users table using the UPDATE queries above

### "Email not confirmed"
- In Supabase Dashboard, enable "Auto Confirm User" when creating users
- Or manually confirm users in Authentication → Users

## Default Credentials

After setup, you can login with:

- **Admin** (full permissions):
  - Email: `admin@buildingsmanager.local`
  - Password: `admin123`

- **User** (read-only):
  - Email: `user@buildingsmanager.local`
  - Password: `user123`
