import { BadRequestException } from '@nestjs/common';
import { PatientsService } from './patients.service';

function makeService(overrides: { patients?: any[] } = {}) {
  const patients = overrides.patients ?? [];
  const prisma = {
    patient: {
      findMany: jest.fn().mockResolvedValue(patients),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  } as any;
  const drive = { findLatestFileByName: jest.fn().mockResolvedValue(null) } as any;
  const rag = { query: jest.fn().mockResolvedValue([]) } as any;
  const n8n = { notifyEvent: jest.fn() } as any;
  const config = { moduleFlags: { googleDrive: false, rag: false } } as any;
  return { service: new PatientsService(prisma, drive, rag, n8n, config), prisma };
}

describe('PatientsService', () => {
  it('rejects an empty search query instead of returning all patients', async () => {
    const { service } = makeService({ patients: [{ id: '1', fullName: 'Anyone' }] });
    await expect(service.findByName('')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.findByName('   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a single unambiguous match directly', async () => {
    const { service } = makeService({
      patients: [{ id: 'p1', fullName: 'Jane Doe', phone: null, prescriptions: [] }],
    });
    const result = await service.getPatientPrescriptions('Jane Doe');
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.patient.id).toBe('p1');
    }
  });

  it('asks for disambiguation when multiple patients match by name', async () => {
    const { service } = makeService({
      patients: [
        { id: 'p1', fullName: 'John Smith', phone: '+1', prescriptions: [] },
        { id: 'p2', fullName: 'John Smith', phone: '+2', prescriptions: [] },
      ],
    });
    const result = await service.getPatientPrescriptions('John Smith');
    expect(result.found).toBe(false);
    if (!result.found && 'needsDisambiguation' in result) {
      expect(result.needsDisambiguation).toBe(true);
      expect(result.candidates).toHaveLength(2);
    }
  });

  it('reports not-found for a name with zero matches', async () => {
    const { service } = makeService({ patients: [] });
    const result = await service.getPatientPrescriptions('Nobody Here');
    expect(result.found).toBe(false);
  });
});
