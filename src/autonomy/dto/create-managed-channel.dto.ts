import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateManagedChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  channelId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;
}
