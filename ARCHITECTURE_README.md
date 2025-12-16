# Architecture Documentation Index

## 🚨 START HERE 🚨

If you're about to modify asset save logic, validation, or database operations:

**👉 READ THIS FIRST: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)**

---

## Documentation Structure

### Level 1: Critical Constraints (MUST READ)

**[CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)**
- ⚠️ Mandatory reading for all developers
- Contains forbidden and required patterns
- Lists consequences of violations
- Authorization requirements for changes
- **Read this before making ANY changes to save operations**

**[ARCHITECTURE_QUICK_REFERENCE.md](ARCHITECTURE_QUICK_REFERENCE.md)**
- Quick lookup for correct patterns
- Do/Don't examples
- API reference
- Pre-commit checklist

---

### Level 2: Implementation Guides

**[TRANSACTIONAL_SAVE_GUIDE.md](TRANSACTIONAL_SAVE_GUIDE.md)**
- Complete usage guide
- API documentation
- Behavior details
- Error handling
- Migration instructions
- Best practices

**[TRANSACTIONAL_SAVE_EXAMPLES.md](TRANSACTIONAL_SAVE_EXAMPLES.md)**
- 10 practical code examples
- Single save examples
- Bulk save examples
- Error handling patterns
- React component integration
- Batch processing
- AG Grid integration

---

### Level 3: Technical Details

**[VALIDATION_AND_TRANSACTION_SUMMARY.md](VALIDATION_AND_TRANSACTION_SUMMARY.md)**
- Technical overview
- Architecture diagrams
- Database function specifications
- API function specifications
- Behavior guarantees
- Testing recommendations
- Benefits summary

---

## Quick Start

### For Developers Writing New Code

1. Read: [ARCHITECTURE_QUICK_REFERENCE.md](ARCHITECTURE_QUICK_REFERENCE.md)
2. Copy patterns from: [TRANSACTIONAL_SAVE_EXAMPLES.md](TRANSACTIONAL_SAVE_EXAMPLES.md)
3. Test using checklist in: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)

### For Developers Modifying Existing Code

1. Read: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)
2. Review: [TRANSACTIONAL_SAVE_GUIDE.md](TRANSACTIONAL_SAVE_GUIDE.md)
3. Check patterns in: [TRANSACTIONAL_SAVE_EXAMPLES.md](TRANSACTIONAL_SAVE_EXAMPLES.md)

### For Code Reviewers

1. Use checklist from: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)
2. Verify against: [ARCHITECTURE_QUICK_REFERENCE.md](ARCHITECTURE_QUICK_REFERENCE.md)
3. Reject any forbidden patterns listed in: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)

### For System Architects

1. Full technical details: [VALIDATION_AND_TRANSACTION_SUMMARY.md](VALIDATION_AND_TRANSACTION_SUMMARY.md)
2. Implementation guide: [TRANSACTIONAL_SAVE_GUIDE.md](TRANSACTIONAL_SAVE_GUIDE.md)
3. Constraints: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)

---

## Key Implementation Files

### Application Layer
- `src/lib/api.ts` - Contains transactional save functions
  - `validateAndSaveAsset()`
  - `validateAndSaveBulkAssets()`
  - `api.assets.saveTransactional()`
  - `api.assets.saveBulkTransactional()`

### Validation Layer
- `src/lib/validation.ts` - Validation rules and logic

### Database Layer
- `supabase/migrations/20251216103948_add_transactional_save_functions.sql`
  - `save_asset_transactional()` - Single asset save function
  - `save_assets_bulk_transactional()` - Bulk asset save function

---

## Architecture Principles

### 1. Validation-First
- Validation runs BEFORE any save attempt
- Invalid data is rejected by database
- No exceptions

### 2. Transactional Integrity
- All operations in ONE transaction:
  1. Asset save
  2. Building total area update
  3. Distribution flags update
  4. Audit log creation
- If ANY step fails, ALL steps roll back
- No partial saves

### 3. Error Handling
- Always check `result.success`
- Handle validation errors specifically
- Never ignore errors
- Provide user feedback

---

## Common Patterns

### ✅ Correct Pattern
```typescript
const result = await api.assets.saveTransactional(assetData, 'manual_update');
if (!result.success) {
  showError(result.error);
  return;
}
showSuccess('Saved successfully');
```

### ❌ Forbidden Pattern
```typescript
await supabase.from('assets').insert(assetData); // WRONG!
```

---

## Testing

All save operations must be tested for:
1. Validation enforcement
2. Transaction rollback
3. Success path with all post-save actions

See [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md) for testing requirements.

---

## Support

### Questions About Usage
- See examples: [TRANSACTIONAL_SAVE_EXAMPLES.md](TRANSACTIONAL_SAVE_EXAMPLES.md)
- See guide: [TRANSACTIONAL_SAVE_GUIDE.md](TRANSACTIONAL_SAVE_GUIDE.md)

### Questions About Architecture
- See summary: [VALIDATION_AND_TRANSACTION_SUMMARY.md](VALIDATION_AND_TRANSACTION_SUMMARY.md)
- See constraints: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md)

### Need to Modify Architecture
- Read: [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md) Section 10
- Contact: System Architect
- Requirement: Written authorization

---

## Version History

- **v1.0** (2024-12-16) - Initial transactional save architecture
  - Added validation enforcement
  - Added transactional save functions
  - Added comprehensive documentation

---

## Related Documentation

### Other Architecture Documents
- `VALIDATION_IMPLEMENTATION.md` - Validation system details
- `VALIDATION_PSEUDOCODE.md` - Validation logic pseudocode
- `TRANSACTIONAL_SAVE_GUIDE.md` - Usage guide (linked above)

### User Manuals
- `SIMULATIONS_GUIDE.md` - Simulations feature guide
- `LOCAL_SETUP.md` - Local development setup

### Technical Analysis
- `REDUNDANT_API_CALLS_ANALYSIS.md` - API optimization analysis
- `SCHEMA_VALIDATION_REPORT.md` - Schema validation report
- `DEDUPLICATION_EXPLANATION.md` - Deduplication logic

---

**Remember: When in doubt, read [CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md](CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md) first!**
