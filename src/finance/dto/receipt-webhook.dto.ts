import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/**
 * Inbound receipt/invoice webhook payload. `@IsNumber()` (class-validator)
 * rejects NaN/Infinity by default, and `@IsPositive()` rejects zero/negative,
 * so together they enforce "amount must be finite and positive" without a
 * custom validator.
 */
export class ReceiptWebhookDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsIn(['INCOME', 'EXPENSE'])
  type: 'INCOME' | 'EXPENSE';

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'date must be a valid ISO 8601 date string' })
  date?: string;
}
