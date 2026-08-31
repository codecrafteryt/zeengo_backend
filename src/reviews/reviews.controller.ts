import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import {
  createReviewSchema,
  listReviewsQuerySchema,
  reviewsStatsQuerySchema,
} from './reviews.schema';
import type {
  CreateReviewDto,
  ListReviewsQuery,
  ReviewsStatsQuery,
} from './reviews.schema';
import { ReviewsService } from './reviews.service';

const STAFF_READ_ROLES = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.splizer,
] as const;

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @Roles(...STAFF_READ_ROLES)
  list(
    @Query(zodPipe(listReviewsQuerySchema)) query: ListReviewsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.reviewsService.list(query, user);
  }

  @Get('stats')
  @Roles(...STAFF_READ_ROLES, StaffRole.driver)
  stats(
    @Query(zodPipe(reviewsStatsQuerySchema)) query: ReviewsStatsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.reviewsService.stats(query, user);
  }

  @Get('me')
  @Roles('client')
  myReviews(
    @Query(zodPipe(listReviewsQuerySchema)) query: ListReviewsQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.reviewsService.listMineAsClient(user, query);
  }

  @Post()
  @Roles('client')
  create(
    @Body(zodPipe(createReviewSchema)) body: CreateReviewDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.reviewsService.createOrUpdate(body, user);
  }
}
