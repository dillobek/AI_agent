import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  telegramId: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RegisterAdminDto {
  @IsString()
  @IsNotEmpty()
  telegramId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  password: string;
}
