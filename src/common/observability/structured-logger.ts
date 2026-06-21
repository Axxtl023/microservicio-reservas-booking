import { ConsoleLogger, LoggerService } from '@nestjs/common';
import { getCorrelationId } from './trace-context';

/**
 * Logger que prefija cada mensaje con el correlationId del AsyncLocalStorage.
 */
export class StructuredLogger extends ConsoleLogger implements LoggerService {
  private withCorrelation(message: unknown): string {
    const correlationId = getCorrelationId();
    const corr = correlationId ? `[corr:${correlationId.slice(0, 8)}] ` : '';
    return `${corr}${typeof message === 'string' ? message : JSON.stringify(message)}`;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(this.withCorrelation(message), ...(optionalParams as never[]));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(this.withCorrelation(message), ...(optionalParams as never[]));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(this.withCorrelation(message), ...(optionalParams as never[]));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(this.withCorrelation(message), ...(optionalParams as never[]));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(this.withCorrelation(message), ...(optionalParams as never[]));
  }
}
