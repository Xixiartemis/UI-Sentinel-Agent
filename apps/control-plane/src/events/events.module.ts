import { Module } from "@nestjs/common";
import { InternalEventsController } from "./internal-events.controller";
import { EventsGateway } from "./events.gateway";
import { EventsService } from "./events.service";

@Module({
  controllers: [InternalEventsController],
  providers: [EventsGateway, EventsService],
  exports: [EventsGateway, EventsService],
})
export class EventsModule {}
