import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto } from "./dto/create-project.dto";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        localPath: dto.local_path,
      },
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} was not found.`);
    }

    return project;
  }
}
