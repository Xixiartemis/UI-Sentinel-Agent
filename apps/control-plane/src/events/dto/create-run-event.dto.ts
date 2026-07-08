import {
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsString,
} from "class-validator";

export class CreateRunEventDto {
  @IsString()
  @IsNotEmpty()
  event_id!: string;

  @IsString()
  @IsNotEmpty()
  run_id!: string;

  @IsISO8601()
  timestamp!: string;

  @IsString()
  @IsNotEmpty()
  agent!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
