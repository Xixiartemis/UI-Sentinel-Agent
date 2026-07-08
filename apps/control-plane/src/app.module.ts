import { Module } from "@nestjs/common";
import { EventsModule } from "./events/events.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { RunsModule } from "./runs/runs.module";

@Module({
  imports: [PrismaModule, EventsModule, ProjectsModule, RunsModule],
})
export class AppModule {}
