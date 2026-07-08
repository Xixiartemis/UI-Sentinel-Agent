import { Body, Controller, Param, Post } from "@nestjs/common";
import { CreateRunEventDto } from "./dto/create-run-event.dto";
import { EventsService } from "./events.service";

@Controller("internal/runs/:id/events")
export class InternalEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Param("id") id: string, @Body() dto: CreateRunEventDto) {
    return this.eventsService.create(id, dto);
  }
}
