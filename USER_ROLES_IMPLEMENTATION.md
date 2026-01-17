# User Roles Implementation

## Overview
This document describes the role-based access control (RBAC) system implemented in the Buildings Manager application. The system supports two roles:
- **Admin**: Full permissions (create, read, update, delete)
- **User**: Read-only access (view data only, no modifications)

## Implementation Details

### 1. Database Migration
**File**: `supabase/migrations/20260113000002_add_user_role.sql`

- Adds `user_role` column to `users` table
- Default value: `'user'` (read-only)
- Valid values: `'admin'` or `'user'`
- Existing users are set to `'admin'` by default to maintain access

### 2. User Role Context
**File**: `src/contexts/UserRoleContext.tsx`

- React context provider that manages user role state
- Fetches user role from database based on authenticated user
- Provides `isReadOnly` and `isAdmin` boolean flags
- Automatically refreshes on auth state changes

**Usage**:
```typescript
import { useUserRole } from '../contexts/UserRoleContext';

const { isReadOnly, isAdmin } = useUserRole();
```

### 3. Components Updated

#### BuildingsList.tsx
- ✅ Added `useUserRole` hook
- ✅ All editable fields check `isReadOnly`
- ✅ Save/Cancel buttons hidden for read-only users
- ✅ Add Building button hidden for read-only users
- ✅ Delete button hidden for read-only users

#### AssetsList.tsx
- ✅ Added `useUserRole` hook
- ✅ `isFieldEditable` function checks `isReadOnly`
- ✅ Save/Cancel buttons hidden for read-only users

### 4. Components That Need Updates

The following components should be updated to respect read-only access:

- **AssetDetails.tsx**: Disable save buttons and editable fields
- **AssetTypes.tsx**: Disable save/delete buttons and editable fields
- **AddressList.tsx**: Disable save/delete buttons and editable fields
- **TransferAreas.tsx**: Disable save buttons and editable fields
- **AssetDataEntry.tsx**: Disable save buttons and editable fields
- **ValidationRulesManager.tsx**: Disable edit/delete buttons
- **FieldConfigManager.tsx**: Disable save buttons
- **AssetsFileImport.tsx**: Disable import/save buttons
- **BuildingListImport.tsx**: Disable import buttons
- **ChangeTaxRegionModal.tsx**: Disable save/validate buttons

### 5. Pattern for Updating Components

1. **Import the hook**:
```typescript
import { useUserRole } from '../contexts/UserRoleContext';
```

2. **Use the hook**:
```typescript
const { isReadOnly } = useUserRole();
```

3. **Update editable fields**:
```typescript
editable: (params) => {
  if (isReadOnly) return false;
  // ... existing logic
}
```

4. **Hide/disable action buttons**:
```typescript
{!isReadOnly && (
  <button onClick={handleSave}>Save</button>
)}
```

5. **Disable grid editing**:
```typescript
<AgGridReact
  // ... other props
  rowSelection={isReadOnly ? undefined : 'multiple'}
  // editable columns will be handled by column definitions
/>
```

### 6. Default Users

The system includes two default users (created via migration `20260113000003_add_default_users.sql`):

- **admin/admin123**: Admin role with full permissions
  - Username: `admin`
  - Email: `admin@buildingsmanager.local`
  - Password: `admin123` (minimum 6 characters required by Supabase)
  - Role: `admin`

- **user/user123**: Read-only user role
  - Username: `user`
  - Email: `user@buildingsmanager.local`
  - Password: `user123` (minimum 6 characters required by Supabase)
  - Role: `user`

**Note**: These users have `auth_user_id = NULL` initially. To link them to Supabase Auth users:
1. Create users in Supabase Auth dashboard
2. Update the `users` table with the corresponding `auth_user_id`:

```sql
-- Link admin user to Supabase Auth user
UPDATE users 
SET auth_user_id = '<supabase-auth-user-id>'
WHERE user_name = 'admin';

-- Link user to Supabase Auth user
UPDATE users 
SET auth_user_id = '<supabase-auth-user-id>'
WHERE user_name = 'user';
```

### 7. Setting User Roles

To set a user's role, update the `users` table:

```sql
-- Set user to admin
UPDATE users 
SET user_role = 'admin' 
WHERE auth_user_id = '<user-auth-id>' OR user_name = '<username>';

-- Set user to read-only
UPDATE users 
SET user_role = 'user' 
WHERE auth_user_id = '<user-auth-id>' OR user_name = '<username>';
```

### 8. Testing

1. **Test as Admin**:
   - Verify all edit/save/delete buttons are visible
   - Verify all fields are editable
   - Verify save operations work

2. **Test as Read-Only User**:
   - Verify edit/save/delete buttons are hidden
   - Verify fields are not editable
   - Verify data can still be viewed and exported

### 9. Security Notes

- Role is checked client-side for UI purposes
- **Important**: Server-side validation should also be implemented via Row Level Security (RLS) policies in Supabase
- The default role is `'user'` (read-only) for security
- Existing users are set to `'admin'` during migration to maintain access

### 10. Future Enhancements

- Add more granular permissions (e.g., can edit but not delete)
- Add role management UI for admins
- Implement server-side RLS policies
- Add audit logging for role changes
