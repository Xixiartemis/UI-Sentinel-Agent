import { IsNotEmpty, IsString } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  local_path!: string;
}
