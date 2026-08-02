import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/roles.decorator';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('stripe')
  stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
    @Headers('x-zeengo-dev-webhook') devHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const event = this.webhooksService.verifyAndParseEvent(
      req.rawBody,
      signature,
      devHeader,
      body,
    );
    return this.webhooksService.handleStripeEvent(event);
  }
}
