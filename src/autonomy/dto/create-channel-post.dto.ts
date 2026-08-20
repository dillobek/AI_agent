import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateChannelPostDto {
  /** Telegram @channelusername or numeric channel ID where the owner is admin. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  channelId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  topic!: string;
}
