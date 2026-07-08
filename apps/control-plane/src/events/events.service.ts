import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRunEventDto } from "./dto/create-run-event.dto";
import { EventsGateway } from "./events.gateway";
import { StructuredRunEvent } from "./structured-run-event";

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(runId: string, dto: CreateRunEventDto): Promise<StructuredRunEvent> {
    if (dto.run_id !== runId) {
      throw new BadRequestException("Path run id must match event run_id.");
    }

    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} was not found.`);
    }

    const event = this.fromDto(dto);

    const persisted = await this.prisma.runEvent.create({
      data: {
        eventId: event.event_id,
        runId: event.run_id,
        occurredAt: new Date(event.timestamp),
        eventType: event.type,
        agentName: event.agent,
        status: event.status,
        payloadJson: event.payload as Prisma.InputJsonValue,
      },
    });

    const structured = this.fromRecord(persisted);
    this.eventsGateway.publish(structured);
    return structured;
  }

  async findByRun(runId: string): Promise<StructuredRunEvent[]> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} was not found.`);
    }

    const events = await this.prisma.runEvent.findMany({
      where: { runId },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    });

    return events.map((event) => this.fromRecord(event));
  }

  private fromDto(dto: CreateRunEventDto): StructuredRunEvent {
    return {
      event_id: dto.event_id,
      run_id: dto.run_id,
      timestamp: dto.timestamp,
      agent: dto.agent,
      type: dto.type,
      status: dto.status,
      payload: dto.payload,
    };
  }

  private fromRecord(event: {
    eventId: string;
    runId: string;
    occurredAt: Date;
    agentName: string;
    eventType: string;
    status: string;
    payloadJson: Prisma.JsonValue;
  }): StructuredRunEvent {
    return {
      event_id: event.eventId,
      run_id: event.runId,
      timestamp: event.occurredAt.toISOString(),
      agent: event.agentName,
      type: event.eventType,
      status: event.status,
      payload: this.asPayloadObject(event.payloadJson),
    };
  }

  private asPayloadObject(value: Prisma.JsonValue): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }
}
