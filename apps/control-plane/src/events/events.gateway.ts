import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { StructuredRunEvent } from "./structured-run-event";

@Injectable()
export class EventsGateway {
  private readonly streams = new Map<string, Subject<StructuredRunEvent>>();

  stream(runId: string): Observable<StructuredRunEvent> {
    return this.subjectFor(runId).asObservable();
  }

  publish(event: StructuredRunEvent): void {
    this.subjectFor(event.run_id).next(event);
  }

  private subjectFor(runId: string): Subject<StructuredRunEvent> {
    const existing = this.streams.get(runId);

    if (existing) {
      return existing;
    }

    const subject = new Subject<StructuredRunEvent>();
    this.streams.set(runId, subject);
    return subject;
  }
}
