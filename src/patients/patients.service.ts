import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { GoogleDriveService } from '../drive/google-drive.service';
import { RagService } from '../rag/rag.service';
import { N8nService } from '../n8n/n8n.service';
import { AppConfigService } from '../config/app-config.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Medical CRM (Module 4) - Medical Ledger.
 * Tracks patient visits, symptoms, and medical file attachments; combines
 * PostgreSQL records with Drive document lookups and RAG context.
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: GoogleDriveService,
    private readonly rag: RagService,
    private readonly n8n: N8nService,
    private readonly config: AppConfigService,
  ) {}

  async createPatient(dto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: { ...dto, normalizedName: normalizeName(dto.fullName) },
    });
  }

  /** Never returns "all patients" for an empty/whitespace query — the caller must reject that before calling, this is defense in depth. */
  async findByName(fullName: string) {
    const query = fullName?.trim();
    if (!query) {
      throw new BadRequestException('A non-empty patient name is required.');
    }
    return this.prisma.patient.findMany({
      where: { normalizedName: { contains: normalizeName(query) } },
      include: { prescriptions: { orderBy: { visitDate: 'desc' } } },
      take: 20,
    });
  }

  async addPrescription(dto: CreatePrescriptionDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: dto.patientId,
        diagnosis: dto.diagnosis,
        medications: dto.medications as any,
        visitDate: new Date(dto.visitDate),
        driveFileUrl: dto.driveFileUrl,
      },
    });

    void this.n8n.notifyEvent('patient.prescription_created', {
      prescriptionId: prescription.id,
      patientId: patient.id,
      patientName: patient.fullName,
      diagnosis: prescription.diagnosis,
    });

    return prescription;
  }

  /**
   * Tool-callable by the Gemini Agent: get_patient_prescriptions(personName, patientId?).
   * Combines the structured Postgres prescription history with the latest
   * matching Drive document and semantic RAG context.
   *
   * If `patientId` is supplied it's used directly (no ambiguity possible).
   * Otherwise, if the name matches more than one patient, this returns
   * `{ found: false, disambiguation: [...] }` instead of guessing which
   * patient was meant — the caller (agent loop / controller) is expected
   * to ask the user to pick one, per the safety system prompt.
   */
  async getPatientPrescriptions(personName: string, patientId?: string) {
    const patients = patientId
      ? await this.prisma.patient
          .findUnique({ where: { id: patientId }, include: { prescriptions: { orderBy: { visitDate: 'desc' } } } })
          .then((p) => (p ? [p] : []))
      : await this.findByName(personName);

    if (patients.length === 0) {
      return { found: false as const, message: `No patient records found for "${personName}"` };
    }

    if (patients.length > 1) {
      return {
        found: false as const,
        needsDisambiguation: true as const,
        message: `Multiple patients match "${personName}". Please specify which one by ID.`,
        candidates: patients.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          phone: p.phone,
          lastVisit: p.prescriptions[0]?.visitDate ?? null,
        })),
      };
    }

    const patient = patients[0];
    const [latestDriveFile, ragContext] = await Promise.all([
      this.config.moduleFlags.googleDrive
        ? this.drive.findLatestFileByName(patient.fullName).catch(() => null)
        : Promise.resolve(null),
      this.config.moduleFlags.rag
        ? this.rag.query(`Medical history and prescriptions for ${patient.fullName}`).catch(() => [])
        : Promise.resolve([]),
    ]);

    return {
      found: true as const,
      patient: { id: patient.id, fullName: patient.fullName, phone: patient.phone, prescriptions: patient.prescriptions },
      latestDriveFile,
      ragContext,
    };
  }

  /** Renders a patient's history as clean Markdown, per Module 3's RAG Pipeline requirement. */
  async renderPatientHistoryAsMarkdown(personName: string, patientId?: string): Promise<string> {
    const result = await this.getPatientPrescriptions(personName, patientId);

    if (!result.found) {
      if ('needsDisambiguation' in result && result.needsDisambiguation) {
        const list = result.candidates
          .map((c) => `- **${c.fullName}**${c.phone ? ` (${c.phone})` : ''} — id: \`${c.id}\``)
          .join('\n');
        return `Multiple patients match "${personName}". Please specify which one:\n\n${list}`;
      }
      return `# ${personName}\n\nNo records found.`;
    }

    const patient = result.patient;
    let md = `# Medical History: ${patient.fullName}${patient.phone ? ` (${patient.phone})` : ''}\n\n`;
    for (const rx of patient.prescriptions as any[]) {
      md += `### Visit: ${new Date(rx.visitDate).toISOString().slice(0, 10)}\n`;
      md += `- **Diagnosis:** ${rx.diagnosis}\n`;
      md += `- **Medications:** ${JSON.stringify(rx.medications)}\n`;
      if (rx.driveFileUrl) md += `- **Document:** ${rx.driveFileUrl}\n`;
      md += '\n';
    }
    if (result.latestDriveFile) {
      md += `## Latest Drive Document\n[${(result.latestDriveFile as any).name}](${(result.latestDriveFile as any).webViewLink})\n`;
    }
    return md;
  }
}
