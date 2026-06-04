import { useToast } from '../Toast';

export type DBOperation = 'create' | 'read' | 'update' | 'delete' | 'query';

export interface DBErrorContext {
  operation: DBOperation;
  table: string;
  identifier?: string | number;
  userMessage?: string;
}

export class DBError extends Error {
  constructor(
    message: string,
    public context: DBErrorContext,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'DBError';
  }
}

export async function safeDB<T>(
  operation: () => Promise<T>,
  context: DBErrorContext
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`DB Error [${context.operation}/${context.table}]:`, error);
    
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const message = 'Storage quota exceeded. Please free up space or export your data.';
      console.error(message);
      return null;
    }
    
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
      const message = 'Database corrupted. Please try refreshing or resetting.';
      console.error(message);
      return null;
    }
    
    throw new DBError(
      context.userMessage || `Database ${context.operation} failed`,
      context,
      error
    );
  }
}

export function withToast<T>(
  operation: () => Promise<T>,
  context: DBErrorContext & { successMessage?: string }
) {
  return async (toast: ReturnType<typeof useToast>) => {
    try {
      const result = await safeDB(operation, context);
      if (result === null) {
        toast.error(context.userMessage || 'Operation failed');
        return null;
      }
      if (context.successMessage) {
        toast.success(context.successMessage);
      }
      return result;
    } catch (error) {
      if (error instanceof DBError) {
        toast.error(error.message);
      } else {
        toast.error('An unexpected error occurred');
      }
      return null;
    }
  };
}

export async function safeBatch<T>(
  operations: Array<() => Promise<T>>,
  context: DBErrorContext
): Promise<T[]> {
  const results: T[] = [];
  const errors: Error[] = [];
  
  for (const op of operations) {
    try {
      const result = await op();
      results.push(result);
    } catch (error) {
      errors.push(error as Error);
      console.error(`Batch operation failed:`, error);
    }
  }
  
  if (errors.length > 0) {
    throw new DBError(
      `${errors.length}/${operations.length} operations failed`,
      context,
      errors
    );
  }
  
  return results;
}
