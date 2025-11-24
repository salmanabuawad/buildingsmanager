# Deduplication Explanation

## Problem
When validating an asset, multiple validation functions might return the **same error message**. For example:
- `validateMainAssetTypeComplete` might return: "סוג הנכס "211" לא קיים באזור המס של הבניין"
- `validateMainAssetTypeForBuilding` might also return: "סוג הנכס "211" לא קיים באזור המס של הבניין"

If both are called, the same error appears twice in the results.

## Solution: Deduplication

**Before (with duplicates):**
```javascript
const assetErrors = [];

// Validation 1 returns error: "סוג הנכס "211" לא קיים באזור המס של הבניין"
if (!result1.valid && result1.error) {
  assetErrors.push(result1.error);  // Adds error
}

// Validation 2 returns the SAME error: "סוג הנכס "211" לא קיים באזור המס של הבניין"
if (!result2.valid && result2.error) {
  assetErrors.push(result2.error);  // Adds the SAME error again!
}

// Result: assetErrors = [
//   "סוג הנכס "211" לא קיים באזור המס של הבניין",
//   "סוג הנכס "211" לא קיים באזור המס של הבניין"  // DUPLICATE!
// ]
```

**After (with deduplication):**
```javascript
const assetErrors = [];
const seenErrors = new Set<string>(); // Track which errors we've already seen

// Validation 1 returns error: "סוג הנכס "211" לא קיים באזור המס של הבניין"
if (!result1.valid && result1.error) {
  if (!seenErrors.has(result1.error)) {  // Check if we've seen this error
    assetErrors.push(result1.error);      // Add it
    seenErrors.add(result1.error);         // Mark it as seen
  }
}

// Validation 2 returns the SAME error: "סוג הנכס "211" לא קיים באזור המס של הבניין"
if (!result2.valid && result2.error) {
  if (!seenErrors.has(result2.error)) {  // Check if we've seen this error
    assetErrors.push(result2.error);      // Skip - already seen!
    seenErrors.add(result2.error);
  }
}

// Result: assetErrors = [
//   "סוג הנכס "211" לא קיים באזור המס של הבניין"  // Only once!
// ]
```

## How It Works

1. **Create a Set to track seen errors**: `const seenErrors = new Set<string>()`
   - A Set stores unique values - if you try to add the same value twice, it only stores it once

2. **Before adding an error, check if we've seen it**:
   ```javascript
   if (!seenErrors.has(result.error)) {
     // Only add if we haven't seen it before
     assetErrors.push(result.error);
     seenErrors.add(result.error);  // Mark it as seen
   }
   ```

3. **Result**: Each unique error message appears only once, even if multiple validations return the same error

## Example Scenario

**Without deduplication:**
```
Asset 100501 validation errors:
1. "סוג הנכס "211" לא קיים באזור המס של הבניין"
2. "סוג הנכס "211" לא קיים באזור המס של הבניין"  ← DUPLICATE
3. "גודל הנכס (50) קטן מהמינימום (100)"
```

**With deduplication:**
```
Asset 100501 validation errors:
1. "סוג הנכס "211" לא קיים באזור המס של הבניין"
2. "גודל הנכס (50) קטן מהמינימום (100)"
```

## Code Location

The deduplication is implemented in:
- `src/components/AssetsList.tsx` - Batch validation function (around line 551-630)

