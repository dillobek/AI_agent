import { IsDateString, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  diagnosis: string;

  @IsObject()
  medications: Record<string, unknown>;

  @IsDateString()
  visitDate: string;

  @IsOptional()
  @IsString()
  driveFileUrl?: string;
}
