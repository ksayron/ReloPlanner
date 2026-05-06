import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ProcessingJobDomainEvent } from './jobs.types.js';

@Injectable()
export class JobsEventBusService {
  private readonly eventsSubject = new Subject<ProcessingJobDomainEvent>();
  readonly events$ = this.eventsSubject.asObservable();

  emit(event: ProcessingJobDomainEvent) {
    this.eventsSubject.next(event);
  }
}
