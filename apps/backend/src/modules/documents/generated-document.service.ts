import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import type { ClientSession, Types } from 'mongoose';
import { Document } from '../../database/models/Document.js';
import { Evidence } from '../../database/models/Evidence.js';
import { AuditService } from '../audit/audit.service.js';
import { hash } from '../onboarding/contract-snapshot.js';

const font = readFileSync(new URL('../../../assets/fonts/DejaVuSans.ttf', import.meta.url));
export interface ArtifactInput {
  organizationId: Types.ObjectId; actorUserId: Types.ObjectId; resourceId: Types.ObjectId;
  kind: 'CONTRACT' | 'SIGNED_CONTRACT' | 'SUBSCRIPTION_INVOICE' | 'SUBSCRIPTION_RECEIPT';
  title: string; text: string; issuedAt: Date; contentHash: string;
}
// Render v1 is fixed; bytes are retained so library upgrades cannot rewrite historical evidence.
export function renderArtifact(input: Pick<ArtifactInput, 'title' | 'text' | 'issuedAt' | 'contentHash'>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: input.title, Author: 'Property Command Center', Creator: 'PMCC document renderer v1', Producer: 'PMCC document renderer v1', CreationDate: input.issuedAt, ModDate: input.issuedAt } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.font(font).fontSize(10).fillColor('#475569').text('PROPERTY COMMAND CENTER', { characterSpacing: 1 });
    doc.moveDown().fontSize(18).fillColor('#0f172a').text(input.title);
    doc.moveDown().fontSize(9.5).text(input.text, { lineGap: 3 });
    doc.moveDown(2).fontSize(8).fillColor('#475569').text(`Snapshot SHA-256: ${input.contentHash}`, { lineGap: 3 });
    doc.end();
  });
}
export async function retainArtifact(input: ArtifactInput, session: ClientSession) {
  const bytes = await renderArtifact(input), sha256 = hash(bytes);
  const [document] = await Document.create([{
    organizationId: input.organizationId, ownerUserId: input.actorUserId, title: input.title.slice(0,240),
    category: input.kind.includes('INVOICE') ? 'INVOICE' : input.kind.includes('RECEIPT') ? 'RECEIPT' : 'LEGAL',
    fileName: `${input.kind.toLowerCase()}-${input.resourceId}.pdf`, mimeType: 'application/pdf', sizeBytes: bytes.length,
    storageProvider: 'OTHER', storageKey: `generated/${input.organizationId}/${input.resourceId}/${input.kind}/v1`,
    sha256, visibility: 'PRIVATE', immutableArtifact: true, artifactBody: bytes, artifactKind: input.kind, renderVersion: 1,
    metadata: { resourceId: String(input.resourceId), snapshotHash: input.contentHash }, createdBy: input.actorUserId, updatedBy: input.actorUserId,
  }], { session });
  await Evidence.create([{
    organizationId: input.organizationId, ownerUserId: input.actorUserId, documentId: document!._id,
    evidenceType: input.kind === 'SIGNED_CONTRACT' ? 'SIGNATURE' : 'DOCUMENT', source: 'SYSTEM', capturedAt: input.issuedAt,
    title: input.title.slice(0,240), sha256, mimeType: 'application/pdf', sizeBytes: bytes.length, storageKey: document!.storageKey,
    relatedResourceType: 'OTHER', relatedResourceId: input.resourceId,
    metadata: { artifactKind: input.kind, snapshotHash: input.contentHash }, createdBy: input.actorUserId,
  }], { session });
  await AuditService.record({ organizationId: input.organizationId, actorUserId: input.actorUserId, action: 'document.artifact.retained', resourceType: 'Document', resourceId: document!._id, metadata: { sha256, kind: input.kind } }, session);
  return document!;
}
