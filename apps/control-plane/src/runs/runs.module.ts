import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";

@Module({
  imports: [EventsModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
