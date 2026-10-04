import { jsPDF } from 'jspdf';
import { InspectionItemStatus, SavedInspection, Vehicle } from '../types';
import { PDF_OPTIONS } from './pdfConfig.ts';
import {
  INSPECTION_SECTIONS,
  InspectionSectionDef,
  getInspectionStatus,
  hasValidPhoto,
  STATUS_LABELS,
} from './inspectionSections.ts';

export { PDF_OPTIONS } from './pdfConfig.ts';
export type { PdfOptions } from './pdfConfig.ts';

// ─────────────────────────────────────────────────────────────
// Phase 4: professional AutoInspect inspection report.
// Layout engine: every block measures itself and calls
// ensureSpace() before drawing — nothing is clipped, overlapped
// or drawn outside page bounds. Photos render in inspection
// order in a 2-column grid; only photos that exist are rendered.
// ─────────────────────────────────────────────────────────────

const MARGIN = PDF_OPTIONS.PAGE_MARGIN; // 30
const FOOTER_H = PDF_OPTIONS.FOOTER_HEIGHT; // 30
const BOTTOM_SAFE = 12;

const FS_TITLE = 20;
const FS_SECTION = 13;
const FS_BODY = 10;
const FS_SMALL = 9;
const FS_CAPTION = 9;
const LINE = 1.35;

const INK = PDF_OPTIONS.COLOR_TEXT;
const MUTED = PDF_OPTIONS.COLOR_TEXT_SECONDARY;
const PRIMARY = PDF_OPTIONS.COLOR_PRIMARY;
const BORDER = PDF_OPTIONS.COLOR_BORDER;
const WHITE = PDF_OPTIONS.COLOR_WHITE;
const ROW_ALT = '#F9FAFB';

interface EvidencePhoto {
  sectionTitle: string;
  itemLabel: string;
  status: string;
  comment: string;
  base64: string;
}

interface Ctx {
  doc: jsPDF;
  y: number;
  contentX: number;
  contentWidth: number;
  pageH: number;
  pageW: number;
}

// ── Small safe-value helpers (never render undefined/null) ────
const clean = (v: unknown, fallback = 'Not Provided'): string => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return fallback;
  const s = String(v).trim();
  return s === '' ? fallback : s;
};

const STATUS_TEXT: Record<string, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  needs_attention: 'Needs Attention',
  not_available: 'Not Available',
};

const statusLabel = (s: InspectionItemStatus | null | undefined): string =>
  s ? STATUS_TEXT[s] ?? 'Not Inspected' : 'Not Inspected';

const fmtDateTime = (iso?: string): string => {
  if (!iso) return 'Not Provided';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Not Provided';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Not Provided';
  }
};

/** Clean, filesystem-safe PDF filename: AutoInspect_REG_id.pdf */
export const buildPdfFilename = (inspection: SavedInspection): string => {
  const vehicle = inspection.vehicles?.[0];
  const reg =
    (vehicle?.registrationNumber || (vehicle as any)?.licensePlate || 'NOREG').trim() || 'NOREG';
  const id = (inspection.id || 'report').trim() || 'report';
  return `AutoInspect_${reg}_${id}.pdf`.replace(/[^\w.\-]+/g, '_');
};

// ── Image helpers (existing pipeline, reused) ─────────────────
type ReencodeOpts = {
  format?: 'JPEG' | 'PNG';
  quality?: number;
  forceWhiteBg?: boolean;
};

async function reencodeForPdf(
  dataUrl: string,
  targetW: number,
  targetH: number,
  opts: ReencodeOpts = {},
): Promise<string> {
  const { format = 'JPEG', quality = 0.58, forceWhiteBg = false } = opts;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img load'));
    i.src = dataUrl;
  });
  const ratio = img.naturalWidth / img.naturalHeight;
  let w = targetW;
  let h = Math.round(targetW / ratio);
  if (h > targetH) {
    h = targetH;
    w = Math.round(targetH * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  if (forceWhiteBg) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return format === 'PNG' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
}

const dimCache = new Map<string, { w: number; h: number }>();

async function photoDimensions(dataUrl: string): Promise<{ w: number; h: number } | null> {
  const cached = dimCache.get(dataUrl);
  if (cached) return cached;
  try {
    const d = await new Promise<{ w: number; h: number }>((res, rej) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => rej(new Error('img load'));
      img.src = dataUrl;
    });
    // Bound cache growth: one PDF has at most a few dozen photos.
    if (dimCache.size > 200) dimCache.clear();
    dimCache.set(dataUrl, d);
    return d;
  } catch {
    return null;
  }
}

const asDataUrl = (base64: string): string =>
  base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;

// ── Page-break engine ─────────────────────────────────────────
const maxY = (ctx: Ctx): number => ctx.pageH - FOOTER_H - BOTTOM_SAFE;

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y + needed <= maxY(ctx)) return;
  ctx.doc.addPage();
  ctx.y = MARGIN;
}

function gap(ctx: Ctx, n = 10): void {
  ctx.y += n;
}

// ── Cover header (text brand — no third-party logo) ──────────
function drawCoverHeader(ctx: Ctx, inspection: SavedInspection): void {
  const { doc, contentX, contentWidth, pageW } = ctx;
  const bandH = 64;
  ensureSpace(ctx, bandH + 8);
  const y0 = ctx.y;
  doc.setFillColor(PRIMARY);
  doc.rect(0, y0, pageW, bandH, 'F');
  doc.setTextColor(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('AutoInspect', contentX, y0 + 26);
  doc.setFontSize(FS_TITLE);
  doc.text('Vehicle Inspection Report', contentX, y0 + 48);
  doc.setFontSize(FS_SMALL);
  doc.setFont('helvetica', 'normal');
  const right = contentX + contentWidth;
  const shortId = clean(inspection.id, 'N/A');
  doc.text(`ID: ${shortId.slice(0, 24)}`, right, y0 + 24, { align: 'right' });
  doc.text(fmtDateTime(inspection.inspectionDate), right, y0 + 40, { align: 'right' });
  ctx.y = y0 + bandH + 14;

  // Meta strip
  const status = STATUS_LABELS[getInspectionStatus(inspection)];
  metaTable(ctx, [
    ['Inspection ID', clean(inspection.id, 'N/A')],
    ['Inspection Date', fmtDateTime(inspection.inspectionDate)],
    ['Last Updated', inspection.updatedAt ? fmtDateTime(inspection.updatedAt) : 'Not Provided'],
    ['Status', status],
    ['Agent', clean(inspection.agentName)],
    ['Insured', clean(inspection.insuredName)],
    ['Policy No.', clean(inspection.policyNumber)],
  ]);
}

function metaTable(ctx: Ctx, rows: Array<[string, string]>): void {
  const { doc, contentX, contentWidth } = ctx;
  const labelW = Math.round(contentWidth * 0.32);
  const valueW = contentWidth - labelW;
  const pad = 6;
  doc.setFontSize(FS_BODY);
  for (const [label, value] of rows) {
    const lines = doc.splitTextToSize(value, valueW - pad * 2) as string[];
    const rowH = Math.max(FS_BODY * LINE + pad * 2, lines.length * FS_BODY * LINE + pad * 2);
    ensureSpace(ctx, rowH);
    doc.setFillColor(ROW_ALT);
    doc.rect(contentX, ctx.y, contentWidth, rowH, 'F');
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.rect(contentX, ctx.y, contentWidth, rowH, 'D');
    doc.setTextColor(MUTED);
    doc.setFont('helvetica', 'bold');
    doc.text(label, contentX + pad, ctx.y + pad + FS_BODY * 0.85);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, contentX + labelW + pad, ctx.y + pad + FS_BODY * 0.85);
    ctx.y += rowH;
  }
  gap(ctx, 4);
}

// ── Section banner ────────────────────────────────────────────
function sectionBar(ctx: Ctx, title: string, subtitle?: string): void {
  const { doc, contentX, contentWidth } = ctx;
  const h = subtitle ? 30 : 22;
  ensureSpace(ctx, h + 6);
  doc.setFillColor(PDF_OPTIONS.COLOR_PRIMARY_LIGHT);
  doc.roundedRect(contentX, ctx.y, contentWidth, h, 3, 3, 'F');
  doc.setTextColor(PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS_SECTION);
  doc.text(title.toUpperCase(), contentX + 8, ctx.y + (subtitle ? 13 : 15));
  if (subtitle) {
    doc.setTextColor(MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS_SMALL);
    doc.text(subtitle, contentX + 8, ctx.y + 24);
  }
  ctx.y += h + 8;
}

function vehicleBanner(ctx: Ctx, index: number, vehicle: Vehicle): void {
  const { doc, contentX, contentWidth } = ctx;
  const reg = clean(vehicle.registrationNumber || (vehicle as any).licensePlate, 'NO REG');
  const mm = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  const title = `VEHICLE ${index + 1} — ${reg.toUpperCase()}${mm ? ` · ${mm}` : ''}`;
  doc.setFontSize(FS_SECTION);
  const lines = doc.splitTextToSize(title, contentWidth - 16) as string[];
  const h = lines.length * FS_SECTION * LINE + 14;
  ensureSpace(ctx, h + 4);
  doc.setFillColor(PRIMARY);
  doc.roundedRect(contentX, ctx.y, contentWidth, h, 3, 3, 'F');
  doc.setTextColor(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.text(lines, contentX + 8, ctx.y + 8 + FS_SECTION * 0.85);
  ctx.y += h + 10;
}

// ── Two-column key/value table (rows never split) ─────────────
function kvTable(ctx: Ctx, rows: Array<[string, string]>): void {
  const { doc, contentX, contentWidth } = ctx;
  const labelW = Math.round(contentWidth * 0.38);
  const valueW = contentWidth - labelW;
  const pad = 6;
  let alt = false;
  for (const [label, rawValue] of rows) {
    const value = clean(rawValue);
    doc.setFontSize(FS_BODY);
    const lines = doc.splitTextToSize(value, valueW - pad * 2) as string[];
    const rowH = Math.max(FS_BODY * LINE + pad * 2, lines.length * FS_BODY * LINE + pad * 2);
    ensureSpace(ctx, rowH);
    if (alt) {
      doc.setFillColor(ROW_ALT);
      doc.rect(contentX, ctx.y, contentWidth, rowH, 'F');
    }
    alt = !alt;
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.rect(contentX, ctx.y, contentWidth, rowH, 'D');
    doc.line(contentX + labelW, ctx.y, contentX + labelW, ctx.y + rowH);
    doc.setTextColor(MUTED);
    doc.setFont('helvetica', 'bold');
    doc.text(label, contentX + pad, ctx.y + pad + FS_BODY * 0.85);
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, contentX + labelW + pad, ctx.y + pad + FS_BODY * 0.85);
    ctx.y += rowH;
  }
  gap(ctx, 4);
}

// ── Status chip colors (subtle) ───────────────────────────────
function chipColors(label: string): { bg: string; fg: [number, number, number] } {
  switch (label) {
    case 'Good':
      return { bg: '#DCFCE7', fg: [22, 101, 52] };
    case 'Fair':
      return { bg: '#FEF9C3', fg: [133, 77, 14] };
    case 'Poor':
      return { bg: '#FEE2E2', fg: [185, 28, 28] };
    case 'Needs Attention':
      return { bg: '#FFEDD5', fg: [154, 52, 18] };
    default:
      return { bg: '#F3F4F6', fg: [75, 85, 99] };
  }
}

// ── Item | Status | Comment table (rows never split) ──────────
function resultsTable(
  ctx: Ctx,
  section: InspectionSectionDef,
  vehicle: Vehicle,
): void {
  const { doc, contentX, contentWidth } = ctx;
  const itemW = Math.round(contentWidth * 0.34);
  const statusW = Math.round(contentWidth * 0.24);
  const commentW = contentWidth - itemW - statusW;
  const pad = 5;

  const headerH = 18;
  const drawHeader = () => {
    ensureSpace(ctx, headerH);
    doc.setFillColor('#1F2937');
    doc.rect(contentX, ctx.y, contentWidth, headerH, 'F');
    doc.setTextColor(WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_SMALL);
    const ty = ctx.y + 12;
    doc.text('Item', contentX + pad, ty);
    doc.text('Status', contentX + itemW + pad, ty);
    doc.text('Comment', contentX + itemW + statusW + pad, ty);
    ctx.y += headerH;
  };
  drawHeader();

  let alt = false;
  for (const item of section.items) {
    const st = (vehicle.sections?.[section.id]?.items?.[item.id] ?? {}) as {
      status?: InspectionItemStatus | null;
      comment?: string;
    };
    const label = statusLabel(st.status);
    const comment = (st.comment ?? '').trim();
    doc.setFontSize(FS_BODY);
    const commentLines =
      comment === ''
        ? ['—']
        : (doc.splitTextToSize(comment, commentW - pad * 2) as string[]);
    const rowH = Math.max(22, commentLines.length * FS_BODY * LINE + pad * 2);
    if (ctx.y + rowH > maxY(ctx)) {
      gap(ctx, 2);
      drawHeader();
      alt = false;
    }
    if (alt) {
      doc.setFillColor(ROW_ALT);
      doc.rect(contentX, ctx.y, contentWidth, rowH, 'F');
    }
    alt = !alt;
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.rect(contentX, ctx.y, contentWidth, rowH, 'D');
    doc.line(contentX + itemW, ctx.y, contentX + itemW, ctx.y + rowH);
    doc.line(contentX + itemW + statusW, ctx.y, contentX + itemW + statusW, ctx.y + rowH);

    doc.setTextColor(INK);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, contentX + pad, ctx.y + pad + FS_BODY * 0.85, {
      maxWidth: itemW - pad * 2,
    });

    // Subtle status chip
    const { bg, fg } = chipColors(label);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FS_SMALL);
    const chipW = Math.min(doc.getTextWidth(label) + 12, statusW - pad * 2);
    const chipH = 13;
    const cx = contentX + itemW + pad;
    const cy = ctx.y + rowH / 2 - chipH / 2;
    doc.setFillColor(bg);
    doc.roundedRect(cx, cy, chipW, chipH, 3, 3, 'F');
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(label, cx + 6, cy + 9.5, { maxWidth: chipW - 12 });

    doc.setTextColor(comment === '' ? MUTED : INK);
    doc.setFont('helvetica', comment === '' ? 'italic' : 'normal');
    doc.setFontSize(FS_BODY);
    doc.text(commentLines, contentX + itemW + statusW + pad, ctx.y + pad + FS_BODY * 0.85);
    ctx.y += rowH;
  }
  gap(ctx, 6);
}

// ── Wrapped comment block (may flow across pages) ─────────────
function commentBlock(ctx: Ctx, heading: string, body: string): void {
  const { doc, contentX, contentWidth } = ctx;
  const trimmed = (body ?? '').trim();
  if (trimmed === '') return;
  doc.setFontSize(FS_BODY);
  doc.setTextColor(MUTED);
  doc.setFont('helvetica', 'bold');
  ensureSpace(ctx, 16);
  doc.text(heading, contentX, ctx.y + 10);
  ctx.y += 16;
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(trimmed, contentWidth - 4) as string[];
  const lh = FS_BODY * LINE;
  let i = 0;
  while (i < lines.length) {
    const room = Math.max(0, Math.floor((maxY(ctx) - ctx.y - 4) / lh));
    if (room <= 0) {
      doc.addPage();
      ctx.y = MARGIN;
      continue;
    }
    const chunk = lines.slice(i, i + room);
    doc.text(chunk, contentX + 2, ctx.y + FS_BODY * 0.85);
    ctx.y += chunk.length * lh + 4;
    i += chunk.length;
  }
  gap(ctx, 4);
}

// ── Photo evidence collection (inspection order; existing only) ─
function collectEvidence(vehicle: Vehicle): EvidencePhoto[] {
  const out: EvidencePhoto[] = [];
  for (const section of INSPECTION_SECTIONS) {
    for (const item of section.items) {
      const st = vehicle.sections?.[section.id]?.items?.[item.id];
      if (!hasValidPhoto(st?.photo)) continue;
      const base64 = st!.photo!.base64 as string;
      out.push({
        sectionTitle: section.title,
        itemLabel: item.label,
        status: statusLabel(st?.status),
        comment: (st?.comment ?? '').trim(),
        base64: asDataUrl(base64),
      });
    }
  }
  // Legacy photos (pre-Phase-3 records) — deterministic key order.
  const legacyKeys = ['front', 'back', 'left', 'right', 'vin', 'registration', 'ownerId', 'location'];
  const photos = (vehicle.photos ?? {}) as Record<string, { name?: string; base64?: string | null } | undefined>;
  for (const key of legacyKeys) {
    const p = photos[key];
    if (!hasValidPhoto(p)) continue;
    out.push({
      sectionTitle: 'Vehicle Photos',
      itemLabel: p?.name || key,
      status: '',
      comment: '',
      base64: asDataUrl(p!.base64 as string),
    });
  }
  return out;
}

// ── 2-column photo grid (a card never splits across pages) ────
async function photoGrid(ctx: Ctx, photos: EvidencePhoto[]): Promise<void> {
  if (photos.length === 0) return;
  const { doc, contentX, contentWidth } = ctx;
  const GAP = 10;
  const colW = (contentWidth - GAP) / 2;
  const imgMaxW = colW - 12;
  const imgMaxH = 190;
  const pad = 6;

  const measure = async (p: EvidencePhoto) => {
    const dims = await photoDimensions(p.base64);
    const ratio = dims ? dims.w / Math.max(1, dims.h) : 4 / 3;
    let w = imgMaxW;
    let h = w / ratio;
    if (h > imgMaxH) {
      h = imgMaxH;
      w = h * ratio;
    }
    doc.setFontSize(FS_CAPTION);
    const capW = colW - 12;
    const l1 = doc.splitTextToSize(`${p.sectionTitle} — ${p.itemLabel}`, capW) as string[];
    const extra: string[] = [];
    if (p.status) extra.push(`Status: ${p.status}`);
    if (p.comment) {
      const cl = doc.splitTextToSize(p.comment, capW) as string[];
      extra.push(...cl.slice(0, 2));
    }
    const capH = (l1.length + extra.length) * FS_CAPTION * 1.25 + 8;
    return { w, h, capH, l1, extra, cardH: pad + h + 6 + capH + pad };
  };

  const drawCard = async (
    p: EvidencePhoto,
    m: Awaited<ReturnType<typeof measure>>,
    x: number,
    y: number,
  ) => {
    doc.setFillColor(WHITE);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, colW, m.cardH, 4, 4, 'FD');
    const ix = x + (colW - m.w) / 2;
    const iy = y + pad;
    try {
      const embedded = await reencodeForPdf(p.base64, Math.round(m.w), Math.round(m.h), {
        format: 'JPEG',
        quality: 0.62,
      });
      doc.addImage(embedded, 'JPEG', ix, iy, m.w, m.h, undefined, 'FAST');
    } catch {
      doc.setFillColor('#F3F4F6');
      doc.rect(ix, iy, m.w, m.h, 'F');
      doc.setTextColor(185, 28, 28);
      doc.setFontSize(FS_SMALL);
      doc.text('Photo unavailable', ix + 4, iy + 12);
    }
    let cy = iy + m.h + 8;
    doc.setFontSize(FS_CAPTION);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    doc.text(m.l1, x + 6, cy);
    cy += m.l1.length * FS_CAPTION * 1.25 + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FS_SMALL);
    doc.setTextColor(MUTED);
    for (const line of m.extra) {
      doc.text(line, x + 6, cy);
      cy += FS_SMALL * 1.25;
    }
  };

  for (let i = 0; i < photos.length; i += 2) {
    const left = photos[i];
    const right = photos[i + 1];
    const lm = await measure(left);
    const rm = right ? await measure(right) : null;
    const rowH = Math.max(lm.cardH, rm ? rm.cardH : 0);
    ensureSpace(ctx, rowH);
    const y = ctx.y;
    await drawCard(left, lm, contentX, y);
    if (right && rm) await drawCard(right, rm, contentX + colW + GAP, y);
    ctx.y = y + rowH + GAP;
  }
  gap(ctx, 4);
}

// ── Footer (two-pass, every page) ─────────────────────────────
const addFooter = (doc: jsPDF, inspection: SavedInspection, page: number, total: number): void => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(PDF_OPTIONS.COLOR_BACKGROUND);
  doc.rect(0, pageHeight - FOOTER_H, pageWidth, FOOTER_H, 'F');
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, pageHeight - FOOTER_H, pageWidth - MARGIN, pageHeight - FOOTER_H);
  doc.setFontSize(PDF_OPTIONS.FONT_SIZE_SMALL);
  doc.setTextColor(PDF_OPTIONS.COLOR_TEXT_SECONDARY);
  doc.setFont('helvetica', 'normal');
  doc.text('AutoInspect', MARGIN, pageHeight - 14);
  const idText = `ID: ${clean(inspection.id, 'N/A').slice(0, 28)}`;
  doc.text(idText, pageWidth / 2, pageHeight - 14, { align: 'center' });
  doc.text(`Page ${page} of ${total}`, pageWidth - MARGIN, pageHeight - 14, { align: 'right' });
};

// ── Per-vehicle rendering ─────────────────────────────────────
async function renderVehicle(
  ctx: Ctx,
  inspection: SavedInspection,
  vehicle: Vehicle,
  index: number,
): Promise<void> {
  if (index > 0) {
    ctx.doc.addPage();
    ctx.y = MARGIN;
  }
  vehicleBanner(ctx, index, vehicle);

  sectionBar(ctx, 'Vehicle Information');
  kvTable(ctx, [
    ['Registration Number', clean(vehicle.registrationNumber || (vehicle as any).licensePlate)],
    ['Make', clean(vehicle.make)],
    ['Model', clean(vehicle.model)],
    ['Variant', clean(vehicle.variant)],
    ['Manufacturing Year', clean(vehicle.manufacturingYear || vehicle.year)],
    ['Registration Year', clean(vehicle.registrationYear)],
    ['Registration Month', clean(vehicle.registrationMonth)],
    ['Number of Owners', clean(vehicle.numberOfOwners)],
    ['Kilometres', clean((vehicle as any).odometerKm)],
    ['Fuel Type', clean(vehicle.fuelType)],
    ['City', clean(vehicle.city)],
    ['RTO', clean(vehicle.rto)],
  ]);

  sectionBar(ctx, 'Document Details');
  kvTable(ctx, [
    ['Insurance Status', clean(vehicle.insuranceStatus)],
    ['Insurance Expiry', clean(vehicle.insuranceExpiry)],
    ['RC Status', clean(vehicle.rcStatus)],
    ['Duplicate Key', clean(vehicle.duplicateKey)],
    ['CNG / LPG', clean(vehicle.cngLpg)],
    ['Road Tax', clean(vehicle.roadTax)],
    ['NOC', clean(vehicle.noc)],
    ['Hypothecation', clean(vehicle.hypothecation)],
    ['Chassis / Embossing', clean(vehicle.chassisEmbossing)],
    ['Fitness', clean(vehicle.fitness)],
    ['RC Condition', clean(vehicle.rcCondition)],
    ['Reg / Chassis Mismatch', clean(vehicle.regChassisMismatch)],
  ]);

  // Inspection result tables (always rendered; missing → Not Inspected)
  for (const section of INSPECTION_SECTIONS) {
    // Keep Exterior + Tyres prominent; the rest flow naturally.
    sectionBar(ctx, section.id === 'engine' ? 'Engine & Transmission' : section.title, section.subtitle);
    resultsTable(ctx, section, vehicle);
  }

  const vComment = (vehicle.generalComment ?? '').trim();
  if (vComment !== '') {
    sectionBar(ctx, `Vehicle ${index + 1} Comments`);
    commentBlock(ctx, 'Inspector notes', vComment);
  }

  const evidence = collectEvidence(vehicle);
  if (evidence.length > 0) {
    sectionBar(
      ctx,
      `Photo Evidence — Vehicle ${index + 1}`,
      `${evidence.length} photo${evidence.length === 1 ? '' : 's'} in inspection order`,
    );
    await photoGrid(ctx, evidence);
  }
}

// ── Main content ──────────────────────────────────────────────
const generatePdfContent = async (doc: jsPDF, inspection: SavedInspection): Promise<void> => {
  try {
    const ctx: Ctx = {
      doc,
      y: MARGIN,
      contentX: MARGIN,
      contentWidth: doc.internal.pageSize.getWidth() - MARGIN * 2,
      pageH: doc.internal.pageSize.getHeight(),
      pageW: doc.internal.pageSize.getWidth(),
    };

    doc.setProperties({
      title: `AutoInspect Report - ${inspection.id || 'New'}`,
      subject: 'Vehicle Inspection Report',
      author: 'AutoInspect',
      keywords: 'inspection, vehicle, report',
      creator: 'AutoInspect',
    });
    doc.setFont('helvetica', 'normal');

    drawCoverHeader(ctx, inspection);
    gap(ctx, 6);

    const vehicles =
      inspection.vehicles && inspection.vehicles.length > 0 ? inspection.vehicles : [];
    if (vehicles.length === 0) {
      doc.setFontSize(FS_BODY);
      doc.setTextColor(MUTED);
      doc.text('No vehicle data recorded.', ctx.contentX, ctx.y + 12);
      ctx.y += 24;
    }
    for (const [index, vehicle] of vehicles.entries()) {
      await renderVehicle(ctx, inspection, vehicle, index);
    }

    const general = (inspection.comments ?? '').trim();
    if (general !== '') {
      sectionBar(ctx, 'General Comments');
      commentBlock(ctx, 'Overall remarks', general);
    }
  } catch (error) {
    console.error('Error generating PDF content:', error);
    doc.setFontSize(PDF_OPTIONS.FONT_SIZE_NORMAL);
    doc.setTextColor(PDF_OPTIONS.COLOR_DANGER);
    doc.text(
      'Error generating the report. Please try again.',
      MARGIN,
      MARGIN * 2,
    );
  }
};

/**
 * Generates a PDF and returns it as a Blob
 * @param inspection The inspection data
 * @returns A promise that resolves to a Blob containing the PDF
 */
export const generatePdfBlob = async (inspection: SavedInspection): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  try {
    await generatePdfContent(doc, inspection);

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      addFooter(doc, inspection, i, pageCount);
    }

    return doc.output('blob');
  } catch (error) {
    console.error('Error generating PDF:', error);
    const errorDoc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    errorDoc.text('Error generating PDF. Please try again.', 40, 40);
    return errorDoc.output('blob');
  }
};

export const generatePdf = async (inspection: SavedInspection): Promise<void> => {
  try {
    const blob = await generatePdfBlob(inspection);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = buildPdfFilename(inspection);
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 0);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const generatePdfBlobUrl = async (inspection: SavedInspection): Promise<string> => {
  const blob = await generatePdfBlob(inspection);
  return URL.createObjectURL(blob);
};
