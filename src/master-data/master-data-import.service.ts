import { Injectable } from '@nestjs/common';
import { VendorType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

type VendorDraft = {
  name: string;
  type: VendorType;
  city: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  businessKey: string;
};

type RowDiff = {
  action: 'create' | 'update' | 'unchanged' | 'invalid';
  businessKey: string;
  name: string;
  type: string;
  city: string | null;
  reason?: string;
  changes?: string[];
};

type SheetPreview = {
  sheet: string;
  create: number;
  update: number;
  unchanged: number;
  invalid: number;
  rows: RowDiff[];
};

function normName(raw: unknown): string | null {
  if (raw == null) return null;
  let t = String(raw).trim().replace(/\s+/g, ' ');
  t = t.replace(/^[\d.\-*]+\s*/, '').replace(/^⭐+\s*/, '').trim();
  return t.length >= 2 ? t : null;
}

function clean(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().replace(/\s+/g, ' ');
  if (!t || ['coming soon', 'n/a', '#n/a'].includes(t.toLowerCase())) return null;
  return t;
}

function cleanPhone(raw: unknown): string | null {
  const t = clean(raw);
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return t.startsWith('+') ? `+${digits}` : `+${digits}`;
}

function businessKey(name: string, type: string, city: string | null) {
  return `${type}|${(city || 'unknown').toLowerCase()}|${name.toLowerCase()}`;
}

/** Upsert key = type + city + name. Null city must not collide with a named city. */
function vendorMatchWhere(draft: Pick<VendorDraft, 'name' | 'type' | 'city'>) {
  return {
    name: { equals: draft.name, mode: 'insensitive' as const },
    type: draft.type,
    deletedAt: null,
    city: draft.city
      ? { equals: draft.city, mode: 'insensitive' as const }
      : null,
  };
}

@Injectable()
export class MasterDataImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.masterDataImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        uploadedByUser: { select: { id: true, fullName: true, email: true } },
      },
    });
    return { data: rows };
  }

  async getById(id: string) {
    const row = await this.prisma.masterDataImport.findUnique({
      where: { id },
      include: {
        uploadedByUser: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!row) throw AppError.notFound('IMPORT_NOT_FOUND', 'Import not found');
    return row;
  }

  async previewUpload(file: Express.Multer.File, staffId: string) {
    const filename = file.originalname || 'upload';
    const lower = filename.toLowerCase();
    let drafts: VendorDraft[] = [];
    let sourceKind: 'xlsx' | 'kitchen_json' = 'xlsx';

    if (lower.endsWith('.json')) {
      sourceKind = 'kitchen_json';
      drafts = this.parseKitchenJson(file.buffer);
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      sourceKind = 'xlsx';
      drafts = this.parseXlsxVendors(file.buffer);
    } else {
      throw AppError.validation('Supported uploads: .xlsx, .xls, or kitchen .json');
    }

    const preview = await this.buildPreview(drafts);
    const summary = {
      sheets: preview.map((s) => ({
        sheet: s.sheet,
        create: s.create,
        update: s.update,
        unchanged: s.unchanged,
        invalid: s.invalid,
      })),
      totals: preview.reduce(
        (acc, s) => ({
          create: acc.create + s.create,
          update: acc.update + s.update,
          unchanged: acc.unchanged + s.unchanged,
          invalid: acc.invalid + s.invalid,
        }),
        { create: 0, update: 0, unchanged: 0, invalid: 0 },
      ),
    };

    const row = await this.prisma.masterDataImport.create({
      data: {
        filename,
        sourceKind,
        status: 'previewed',
        uploadedBy: staffId,
        summary,
        preview: {
          vendors: drafts,
          sheets: preview,
        },
      },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: staffId,
      action: 'master_data.import_preview',
      entity: 'master_data_import',
      entityId: row.id,
      diff: { filename, sourceKind, summary },
    });

    return {
      id: row.id,
      filename,
      sourceKind,
      status: row.status,
      summary,
      sheets: preview,
    };
  }

  async commit(importId: string, staffId: string) {
    const job = await this.prisma.masterDataImport.findUnique({
      where: { id: importId },
    });
    if (!job) throw AppError.notFound('IMPORT_NOT_FOUND', 'Import not found');
    if (job.status === 'committed') {
      throw AppError.conflict('IMPORT_ALREADY_COMMITTED', 'Import already committed');
    }

    const preview = job.preview as {
      vendors?: VendorDraft[];
    };
    const drafts = preview.vendors ?? [];
    if (drafts.length === 0) {
      throw AppError.validation('Import preview has no vendor rows to commit');
    }

    const report = {
      created: 0,
      updated: 0,
      unchanged: 0,
      invalid: 0,
      errors: [] as string[],
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const draft of drafts) {
          if (!draft.name?.trim()) {
            report.invalid += 1;
            continue;
          }
          const existing = await tx.vendor.findFirst({
            where: vendorMatchWhere(draft),
          });

          if (!existing) {
            await tx.vendor.create({
              data: {
                name: draft.name,
                type: draft.type,
                city: draft.city,
                phone: draft.phone,
                email: draft.email,
                notes: draft.notes,
                isActive: true,
              },
            });
            report.created += 1;
            continue;
          }

          const next = {
            phone: draft.phone ?? existing.phone,
            email: draft.email ?? existing.email,
            notes: draft.notes ?? existing.notes,
            city: draft.city ?? existing.city,
          };
          const changed =
            next.phone !== existing.phone ||
            next.email !== existing.email ||
            next.notes !== existing.notes ||
            next.city !== existing.city;

          if (!changed) {
            report.unchanged += 1;
            continue;
          }

          await tx.vendor.update({
            where: { id: existing.id },
            data: next,
          });
          report.updated += 1;
        }

        await tx.masterDataImport.update({
          where: { id: importId },
          data: {
            status: 'committed',
            report,
            committedAt: new Date(),
          },
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      await this.prisma.masterDataImport.update({
        where: { id: importId },
        data: { status: 'failed', errorMessage: message, report },
      });
      throw err;
    }

    await this.audit.log({
      actorType: 'staff',
      actorId: staffId,
      action: 'master_data.import_commit',
      entity: 'master_data_import',
      entityId: importId,
      diff: report,
    });

    return { id: importId, status: 'committed', report };
  }

  private async buildPreview(drafts: VendorDraft[]): Promise<SheetPreview[]> {
    const byType = new Map<string, VendorDraft[]>();
    for (const d of drafts) {
      const key = d.type;
      const list = byType.get(key) ?? [];
      list.push(d);
      byType.set(key, list);
    }

    const sheets: SheetPreview[] = [];
    for (const [type, rows] of byType) {
      const diffs: RowDiff[] = [];
      let create = 0;
      let update = 0;
      let unchanged = 0;
      let invalid = 0;

      for (const draft of rows) {
        if (!draft.name) {
          invalid += 1;
          diffs.push({
            action: 'invalid',
            businessKey: draft.businessKey,
            name: '',
            type,
            city: draft.city,
            reason: 'Missing name',
          });
          continue;
        }

        const existing = await this.prisma.vendor.findFirst({
          where: vendorMatchWhere(draft),
        });

        if (!existing) {
          create += 1;
          diffs.push({
            action: 'create',
            businessKey: draft.businessKey,
            name: draft.name,
            type,
            city: draft.city,
          });
          continue;
        }

        const changes: string[] = [];
        if (draft.phone && draft.phone !== existing.phone) changes.push('phone');
        if (draft.email && draft.email !== existing.email) changes.push('email');
        if (draft.notes && draft.notes !== existing.notes) changes.push('notes');
        if (draft.city && draft.city !== existing.city) changes.push('city');

        if (changes.length === 0) {
          unchanged += 1;
          diffs.push({
            action: 'unchanged',
            businessKey: draft.businessKey,
            name: draft.name,
            type,
            city: draft.city,
          });
        } else {
          update += 1;
          diffs.push({
            action: 'update',
            businessKey: draft.businessKey,
            name: draft.name,
            type,
            city: draft.city,
            changes,
          });
        }
      }

      sheets.push({
        sheet: type,
        create,
        update,
        unchanged,
        invalid,
        rows: diffs.slice(0, 200),
      });
    }

    return sheets;
  }

  private parseKitchenJson(buf: Buffer): VendorDraft[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch {
      throw AppError.validation('Invalid JSON file');
    }
    const root = parsed as {
      hotels?: Array<Record<string, unknown>>;
      activities?: Array<Record<string, unknown>>;
      guides?: Array<Record<string, unknown>>;
      b2b?: Array<Record<string, unknown>>;
      vendors?: Array<Record<string, unknown>>;
    };

    const out: VendorDraft[] = [];
    const push = (
      row: Record<string, unknown>,
      fallbackType: VendorType,
    ) => {
      const name = normName(row.name);
      if (!name) return;
      const type = (String(row.type || fallbackType) as VendorType) || fallbackType;
      if (!Object.values(VendorType).includes(type)) return;
      const city = clean(row.city);
      out.push({
        name,
        type,
        city,
        phone: cleanPhone(row.phone),
        email: clean(row.email),
        notes: clean(row.notes),
        businessKey: businessKey(name, type, city),
      });
    };

    for (const row of root.hotels ?? []) push(row, VendorType.hotel);
    for (const row of root.activities ?? []) push(row, VendorType.activity);
    for (const row of root.guides ?? []) push(row, VendorType.guide);
    for (const row of root.b2b ?? []) push(row, VendorType.b2b);
    for (const row of root.vendors ?? []) push(row, VendorType.service);
    return out;
  }

  /** Best-effort XLSX parse for hotel-like columns (name/city/phone/email/notes). */
  private parseXlsxVendors(buf: Buffer): VendorDraft[] {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const out: VendorDraft[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
      });
      const typeHint = /hotel/i.test(sheetName)
        ? VendorType.hotel
        : /activ/i.test(sheetName)
          ? VendorType.activity
          : /guide/i.test(sheetName)
            ? VendorType.guide
            : /b2b|partner/i.test(sheetName)
              ? VendorType.b2b
              : /service/i.test(sheetName)
                ? VendorType.service
                : VendorType.hotel;

      for (const row of rows) {
        const name =
          normName(row.name) ||
          normName(row.Name) ||
          normName(row.Hotel) ||
          normName(row.hotel) ||
          normName(row['Hotel Name']);
        if (!name) continue;
        const city =
          clean(row.city) ||
          clean(row.City) ||
          clean(row.Location) ||
          clean(row.location);
        out.push({
          name,
          type: typeHint,
          city,
          phone: cleanPhone(row.phone ?? row.Phone ?? row.Tel),
          email: clean(row.email ?? row.Email),
          notes: clean(row.notes ?? row.Notes ?? row.Address ?? row.address),
          businessKey: businessKey(name, typeHint, city),
        });
      }
    }

    if (out.length === 0) {
      throw AppError.validation(
        'No vendor rows detected. Prefer kitchen-seed.json export, or include name/city columns.',
      );
    }
    return out;
  }
}
