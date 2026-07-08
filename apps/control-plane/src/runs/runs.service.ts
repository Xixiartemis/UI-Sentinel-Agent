import { Injectable, NotFoundException } from "@nestjs/common";
import { EventsService } from "../events/events.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRunDto } from "./dto/create-run.dto";

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async create(dto: CreateRunDto) {
    const project = await this.prisma.project.findUnique({
      where: {
        id: dto.project_id,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${dto.project_id} was not found.`);
    }

    return this.prisma.run.create({
      data: {
        projectId: dto.project_id,
        targetUrl: dto.target_url,
        taskGoal: dto.task_goal,
        status: "queued",
      },
    });
  }

  async findOne(id: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: {
        project: true,
        artifacts: {
          orderBy: {
            createdAt: "asc",
          },
        },
        diagnosisReports: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${id} was not found.`);
    }

    return run;
  }

  async findEvents(id: string) {
    return this.eventsService.findByRun(id);
  }
}
