# Deploy Edge Functions

## Overview

This document explains how to deploy Supabase Edge Functions for secure user management:
1. **change-user-password**: Securely changes user passwords using the service role key
2. **create-users**: Creates default users with auto-confirm (no email confirmation required)

## Prerequisites

1. Supabase CLI installed: `npm install -g supabase`
2. Logged in to Supabase: `supabase login`
3. Linked to your project: `supabase link --project-ref your-project-ref`

## Deployment Steps

### 1. Deploy the Edge Functions

```bash
# Deploy password change function
supabase functions deploy change-user-password

# Deploy create users function
supabase functions deploy create-users
```

### 2. Set Environment Variables

The Edge Function requires these environment variables (set in Supabase Dashboard):

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (found in Project Settings > API)

Set them via Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add secrets:
   - `SUPABASE_URL` = Your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = Your service role key

Or via CLI:
```bash
supabase secrets set SUPABASE_URL=your-project-url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Verify Deployment

After deployment:
- The password change feature in the User Management page will automatically use the Edge Function
- The "Create Default Users" button on the Login page will automatically use the Edge Function (with fallback to signUp)

## Function Details

### change-user-password

**Location**: `supabase/functions/change-user-password/index.ts`

**Endpoint**: `https://your-project.supabase.co/functions/v1/change-user-password`

**Security**:
- Requires authentication (Bearer token)
- Verifies user is admin before allowing password change
- Uses service role key server-side (never exposed to client)

**Request Body**:
```json
{
  "auth_user_id": "user-uuid",
  "new_password": "new-password-here"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

### create-users

**Location**: `supabase/functions/create-users/index.ts`

**Endpoint**: `https://your-project.supabase.co/functions/v1/create-users`

**Security**:
- Uses service role key server-side (never exposed to client)
- Creates users with auto-confirm (no email confirmation required)
- Automatically links users to the `users` table

**Request**: No body required (POST request)

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "user": "admin",
      "success": true,
      "message": "✅ משתמש admin נוצר בהצלחה ומקושר ל-users table",
      "auth_user_id": "uuid"
    },
    {
      "user": "user",
      "success": true,
      "message": "✅ משתמש user נוצר בהצלחה ומקושר ל-users table",
      "auth_user_id": "uuid"
    }
  ],
  "message": "All users created successfully"
}
```

## Troubleshooting

### Function Not Found (404)
- Ensure the function is deployed: `supabase functions list`
- Check the function name matches exactly: `change-user-password`

### Unauthorized (401/403)
- Ensure the user is logged in
- Verify the user has admin role in the `users` table

### Missing Configuration (500)
- Check environment variables are set correctly
- Verify service role key is valid

## Alternative: Local Development

For local development, you can run the Edge Function locally:

```bash
supabase functions serve change-user-password
```

Then update the API URL in `src/lib/api.ts` to point to `http://localhost:54321/functions/v1/change-user-password` during development.
