import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from './tasks.schema';
import type {
  CreateTaskDto,
  ListTasksQuery,
  UpdateTaskDto,
} from './tasks.schema';
import { TasksService } from './tasks.service';

const TASK_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

const TASK_WRITE_ROLES = [StaffRole.admin, StaffRole.ops_manager] as const;

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles(...TASK_READ_ROLES)
  list(
    @Query(zodPipe(listTasksQuerySchema)) query: ListTasksQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.tasksService.list(query, user);
  }

  @Post()
  @Roles(...TASK_WRITE_ROLES)
  create(
    @Body(zodPipe(createTaskSchema)) body: CreateTaskDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.tasksService.create(body, user);
  }

  @Patch(':id')
  @Roles(...TASK_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body(zodPipe(updateTaskSchema)) body: UpdateTaskDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.tasksService.update(id, body, user);
  }

  @Post(':id/complete')
  @Roles(...TASK_READ_ROLES)
  complete(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.tasksService.complete(id, user);
  }
}
