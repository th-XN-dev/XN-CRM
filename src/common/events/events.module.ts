import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BackgroundTasks } from './background-tasks';
import { DomainEventPublisher } from './domain-event.publisher';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
  providers: [DomainEventPublisher, BackgroundTasks],
  exports: [DomainEventPublisher, BackgroundTasks],
})
export class EventsModule {}
