# Local master-data store

This folder keeps the **client Excel → PostgreSQL** source of truth for local/dev.

| Path | What |
|---|---|
| `excel/ZEENTRAVEL_Kitchen.xlsx` | Canonical Kitchen workbook copy |
| `excel/Sales_ZEENTRAVEL.xlsx` | Sales workbook (B2B) |
| `kitchen-seed.json` | Normalized import JSON (hotels, activities, guides, b2b, drivers, clients) |
| `snapshots/local_master_data_*.sql` | pg_dump of local master tables |

## Already loaded into local DB

Database: `postgresql://zeengo:zeengo@127.0.0.1:5432/zeengo_v1`

Tables populated: `vendors`, `clients`, `driver_profiles`, `staff_users`, `master_data_imports`.

## Re-seed / restore

```bash
# From Excel → JSON → DB
python3 scripts/export-kitchen-xlsx.py prisma/data/excel/ZEENTRAVEL_Kitchen.xlsx
node scripts/merge-sales-b2b-into-seed.js prisma/data/excel/Sales_ZEENTRAVEL.xlsx
DATABASE_URL='postgresql://zeengo:zeengo@127.0.0.1:5432/zeengo_v1?schema=public' \
  KITCHEN_UPDATE_VENDORS=1 KITCHEN_SEED_BOOKINGS=0 \
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-kitchen.ts
```
