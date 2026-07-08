import { IsNotEmpty, IsString, IsUrl } from "class-validator";

export class CreateRunDto {
  @IsString()
  @IsNotEmpty()
  project_id!: string;

  @IsUrl({
    require_tld: false,
  })
  target_url!: string;

  @IsString()
  @IsNotEmpty()
  task_goal!: string;
}
