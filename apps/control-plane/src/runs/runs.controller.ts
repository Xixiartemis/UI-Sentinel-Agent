import { Body, Controller, Get, MessageEvent, Param, Post, Sse } from "@nestjs/common";
import { map, Observable } from "rxjs";
import { EventsGateway } from "../events/events.gateway";
import { CreateRunDto } from "./dto/create-run.dto";
import { RunsService } from "./runs.service";

@Controller("runs")
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post()
  create(@Body() dto: CreateRunDto) {
    return this.runsService.create(dto);
  }

  @Get(":id/events")
  findEvents(@Param("id") id: string) {
    return this.runsService.findEvents(id);
  }

  @Sse(":id/stream")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    return this.eventsGateway.stream(id).pipe(
      map((event) => ({
        id: event.event_id,
        type: event.type,
        data: event,
      })),
    );
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.runsService.findOne(id);
  }
}
